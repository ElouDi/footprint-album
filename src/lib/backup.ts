import { db } from './db'
import type { CityVisit, PhotoRecord } from './types'

/**
 * 本地备份：把媒体记录、缩略图（base64）、设置、城市足迹打包成单个 JSON。
 * 原照片/视频文件本体不入备份（它们在用户自己的磁盘上），重新导入即可恢复关联。
 */

export const BACKUP_APP_ID = 'footprint-album'
export const BACKUP_VERSION = 1

export interface BackupThumb {
  id: string
  data: string // base64
}

export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  settings: { key: string; value: unknown }[]
  photos: PhotoRecord[]
  thumbs: BackupThumb[]
  cityVisits: CityVisit[]
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buf.length; i += CHUNK) {
    s += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

export function base64ToBlob(data: string, type = 'image/jpeg'): Blob {
  const bin = atob(data)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type })
}

export function buildBackupJson(
  data: Omit<BackupFile, 'app' | 'version' | 'exportedAt'>,
  now = new Date(),
): string {
  const file: BackupFile = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    ...data,
  }
  return JSON.stringify(file)
}

/** 校验备份文件结构，返回解析结果或失败原因 */
export function validateBackup(json: unknown): { ok: true; data: BackupFile } | { ok: false; reason: string } {
  if (typeof json !== 'object' || json === null) return { ok: false, reason: '文件不是有效的 JSON 对象' }
  const b = json as Partial<BackupFile>
  if (b.app !== BACKUP_APP_ID) return { ok: false, reason: '不是足迹相册的备份文件' }
  if (b.version !== BACKUP_VERSION) return { ok: false, reason: `备份版本不受支持（${String(b.version)}）` }
  if (!Array.isArray(b.photos)) return { ok: false, reason: '备份缺少照片数据' }
  if (!Array.isArray(b.thumbs)) return { ok: false, reason: '备份缺少缩略图数据' }
  return { ok: true, data: b as BackupFile }
}

/** 从备份恢复：覆盖当前所有数据 */
export async function restoreBackup(data: BackupFile): Promise<{ photos: number; thumbs: number }> {
  await Promise.all([
    db.photos.clear(),
    db.thumbs.clear(),
    db.cityVisits.clear(),
    db.geocodes.clear(),
    db.settings.clear(),
  ])
  await db.settings.bulkPut(data.settings.filter((s) => typeof s?.key === 'string'))
  await db.photos.bulkPut(
    data.photos
      .filter((p) => typeof p?.id === 'string' && typeof p?.fileName === 'string')
      .map((p) => ({ ...p, handle: undefined })),
  )
  const validThumbs = data.thumbs.filter((t) => typeof t?.id === 'string' && typeof t?.data === 'string')
  await db.thumbs.bulkPut(validThumbs.map((t) => ({ id: t.id, blob: base64ToBlob(t.data) })))
  await db.cityVisits.bulkPut(data.cityVisits ?? [])
  return { photos: data.photos.length, thumbs: validThumbs.length }
}

export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 收集当前全部数据并触发浏览器下载 */
export async function downloadBackup(): Promise<void> {
  const [settings, photos, thumbs, cityVisits] = await Promise.all([
    db.settings.toArray(),
    db.photos.toArray(),
    db.thumbs.toArray(),
    db.cityVisits.toArray(),
  ])
  const json = buildBackupJson({
    settings,
    photos,
    cityVisits,
    thumbs: await Promise.all(
      thumbs.map(async (t) => ({ id: t.id, data: await blobToBase64(t.blob) })),
    ),
  })
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  downloadJson(`footprint-album-backup-${stamp}.json`, json)
}
