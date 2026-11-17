import { readPhotoExif } from './exif'
import { makeThumbnail, makeVideoThumbnail, THUMB_VERSION } from './thumbnails'
import { invalidateThumbUrl } from './thumbUrls'
import { readVideoMeta } from './videoMeta'
import { db } from './db'
import { computeCityVisits, loadCities } from './cities'
import type { ImportProgress, ImportSummary, PhotoRecord } from './types'

export const VIDEO_EXT_RE = /\.(mp4|mov|m4v)$/i
const MEDIA_EXT_RE = /\.(jpe?g|png|webp|mp4|mov|m4v)$/i
const MAX_DEPTH = 8
const DB_CHUNK = 50

// --- 浏览器能力类型补充 ---
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle>
  }
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null
  try {
    return await window.showDirectoryPicker!({ mode: 'read' })
  } catch {
    return null // 用户取消
  }
}

interface CollectedItem {
  file: File
  path: string
  handle?: FileSystemFileHandle
}

async function collectFromDirectory(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: CollectedItem[],
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) return
  // @ts-expect-error values() 迭代器联合类型较宽，运行时行为正确
  for await (const handle of dir.values()) {
    if (handle.kind === 'file') {
      if (!MEDIA_EXT_RE.test(handle.name)) continue
      const fileHandle = handle as FileSystemFileHandle
      out.push({ file: await fileHandle.getFile(), path: `${prefix}${handle.name}`, handle: fileHandle })
    } else if (handle.kind === 'directory') {
      await collectFromDirectory(handle as FileSystemDirectoryHandle, `${prefix}${handle.name}/`, out, depth + 1)
    }
  }
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

async function collectFromEntries(
  entry: FileSystemEntry,
  prefix: string,
  out: CollectedItem[],
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) return
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    if (!MEDIA_EXT_RE.test(fileEntry.name)) return
    out.push({ file: await entryFile(fileEntry), path: `${prefix}${fileEntry.name}` })
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    // readEntries 每次最多返回 100 条，需循环读完
    for (;;) {
      const entries = await readAllEntries(reader)
      if (entries.length === 0) break
      for (const e of entries) await collectFromEntries(e, `${prefix}${dirEntry.name}/`, out, depth + 1)
    }
  }
}

/** 拖拽导入：优先走 webkitGetAsEntry（保留目录结构），失败则回退到文件列表 */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<CollectedItem[]> {
  const out: CollectedItem[] = []
  let usedEntries = false
  for (const item of dt.items) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      usedEntries = true
      await collectFromEntries(entry, '', out, 0)
    }
  }
  if (!usedEntries) {
    for (const file of dt.files) {
      if (!MEDIA_EXT_RE.test(file.name)) continue
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      out.push({ file, path: rel })
    }
  }
  return out
}

async function hashId(input: string): Promise<string> {
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input))
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // 非安全上下文兜底：djb2
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
  return `d${h.toString(16)}`
}

/**
 * 导入管线核心：去重 → EXIF → 缩略图 → 分批入库 → 重建城市足迹。
 * photos 表已有记录的 id 直接跳过，重复导入同一目录安全。
 */
export async function importPhotoFiles(
  items: CollectedItem[],
  onProgress: (p: ImportProgress) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    scanned: items.length,
    imported: 0,
    skippedExisting: 0,
    noGps: 0,
    failed: 0,
    thumbRefreshed: 0,
  }

  const existingIds = new Set(await db.photos.toCollection().primaryKeys())
  const pendingPhotos: PhotoRecord[] = []
  const pendingThumbs: { id: string; blob: Blob }[] = []
  let locatedCount = 0

  onProgress({ phase: 'processing', current: 0, total: items.length })
  for (let i = 0; i < items.length; i++) {
    const { file, path, handle } = items[i]
    onProgress({ phase: 'processing', current: i + 1, total: items.length, fileName: path })
    try {
      const id = await hashId(`${path}|${file.name}|${file.size}|${file.lastModified}`)
      if (existingIds.has(id)) {
        summary.skippedExisting++
        // 缩略图版本升级：旧记录的缩略图重建为当前规格
        const existing = await db.photos.get(id)
        if (existing && (existing.thumbVersion ?? 0) < THUMB_VERSION) {
          const thumb = await makeThumbnail(file)
          if (thumb) {
            await db.thumbs.put({ id, blob: thumb.blob })
            await db.photos.put({ ...existing, thumbVersion: THUMB_VERSION, width: thumb.width, height: thumb.height })
            invalidateThumbUrl(id)
            summary.thumbRefreshed++
          }
        }
        continue
      }

      const isVideo = VIDEO_EXT_RE.test(file.name)
      let lat: number | undefined
      let lng: number | undefined
      let takenAt: number | undefined
      let hasExifTime = false
      let gpsImgDirection: number | undefined
      let thumb: { blob: Blob; width: number; height: number } | null = null

      if (isVideo) {
        const meta = await readVideoMeta(file)
        lat = meta?.lat
        lng = meta?.lng
        takenAt = meta?.takenAt
        hasExifTime = meta?.takenAt !== undefined
        thumb = await makeVideoThumbnail(file)
      } else {
        const exif = await readPhotoExif(file)
        lat = exif?.lat
        lng = exif?.lng
        takenAt = exif?.takenAt
        hasExifTime = exif?.takenAt !== undefined
        gpsImgDirection = exif?.gpsImgDirection
        thumb = await makeThumbnail(file)
      }

      const record: PhotoRecord = {
        id,
        fileName: file.name,
        dirPath: path,
        kind: isVideo ? 'video' : 'photo',
        lat,
        lng,
        takenAt: takenAt ?? file.lastModified,
        timeSource: hasExifTime ? 'exif' : 'file',
        gpsImgDirection,
        width: thumb?.width,
        height: thumb?.height,
        thumbVersion: THUMB_VERSION,
        handle,
      }
      if (lat !== undefined) locatedCount++
      if (lat === undefined) summary.noGps++

      pendingPhotos.push(record)
      if (thumb) pendingThumbs.push({ id, blob: thumb.blob })

      if (pendingPhotos.length >= DB_CHUNK) {
        await flush(pendingPhotos, pendingThumbs)
      }
      summary.imported++
    } catch {
      summary.failed++
    }
  }
  await flush(pendingPhotos, pendingThumbs)

  // 重新计算城市足迹（幂等：全量重建）
  if (locatedCount > 0) {
    await refreshCityVisits()
  }

  return summary
}

/** 全量重建城市足迹（导入与手动标点后共用，幂等） */
export async function refreshCityVisits(): Promise<void> {
  try {
    const cities = await loadCities()
    const located = await db.photos.filter((p) => p.lat !== undefined && p.lng !== undefined).toArray()
    await db.cityVisits.clear()
    await db.cityVisits.bulkPut(computeCityVisits(located, cities))
  } catch {
    // 城市数据加载失败不影响媒体导入结果
  }
}

async function flush(photos: PhotoRecord[], thumbs: { id: string; blob: Blob }[]): Promise<void> {
  if (photos.length > 0) await db.photos.bulkPut(photos)
  if (thumbs.length > 0) await db.thumbs.bulkPut(thumbs)
  photos.length = 0
  thumbs.length = 0
}

/** Chrome/Edge：选择文件夹导入（持久化文件句柄） */
export async function importFromDirectoryPicker(
  onProgress: (p: ImportProgress) => void,
): Promise<ImportSummary | null> {
  const dir = await pickDirectory()
  if (!dir) return null
  onProgress({ phase: 'scanning', current: 0, total: 0 })
  const items: CollectedItem[] = []
  await collectFromDirectory(dir, '', items, 0)
  return importPhotoFiles(items, onProgress)
}

/** 文件选择器导入（多选，Firefox/Safari 兜底） */
export async function importFromFileList(files: FileList | File[], onProgress: (p: ImportProgress) => void): Promise<ImportSummary> {
  const items: CollectedItem[] = []
  for (const file of Array.from(files)) {
    if (!MEDIA_EXT_RE.test(file.name)) continue
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    items.push({ file, path: rel })
  }
  return importPhotoFiles(items, onProgress)
}
