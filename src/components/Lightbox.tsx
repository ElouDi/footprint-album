import { useEffect, useState } from 'react'
import { getPlaceName } from '../lib/geocode'
import { googleStreetViewUrl, osmUrl } from '../lib/links'
import { thumbUrl } from '../lib/thumbUrls'
import type { PhotoRecord } from '../lib/types'

interface LightboxProps {
  /** 可导航的照片列表（地图上已定位的照片，按时间排序） */
  photos: PhotoRecord[]
  entry: { photo: PhotoRecord; cityName?: string }
  onNavigate: (photo: PhotoRecord) => void
  onClose: () => void
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

/** 尝试通过持久化的文件句柄打开原图（Chrome/Edge）；Firefox/Safari 只有缩略图 */
async function loadOriginal(handle: unknown): Promise<string | null> {
  try {
    const h = handle as FileSystemFileHandle
    if (!h.queryPermission || !h.requestPermission) return null
    const perm = await h.queryPermission({ mode: 'read' })
    const granted = perm === 'granted' || (await h.requestPermission({ mode: 'read' })) === 'granted'
    if (!granted) return null
    const file = await h.getFile()
    return URL.createObjectURL(file)
  } catch {
    return null
  }
}

export default function Lightbox({ photos, entry, onNavigate, onClose }: LightboxProps) {
  const { photo, cityName } = entry
  const [src, setSrc] = useState<string | null>(null)
  const [showingOriginal, setShowingOriginal] = useState(false)
  const [placeName, setPlaceName] = useState<string | null>(cityName ?? null)
  const [zoomed, setZoomed] = useState(false)

  const index = photos.findIndex((p) => p.id === photo.id)
  const hasPrev = index > 0
  const hasNext = index >= 0 && index < photos.length - 1
  const lat = photo.lat
  const lng = photo.lng

  // 切换照片时重置图片来源与缩放：先出缩略图，句柄可用再换原图
  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    setSrc(null)
    setShowingOriginal(false)
    setZoomed(false)

    void (async () => {
      const thumb = await thumbUrl(photo.id)
      if (!cancelled && thumb) setSrc((s) => s ?? thumb)

      if (photo.handle) {
        const original = await loadOriginal(photo.handle)
        if (!cancelled && original) {
          setSrc((current) => {
            if (current && current !== thumb) URL.revokeObjectURL(current)
            return original
          })
          setShowingOriginal(true)
          revoked = original
        }
      }
    })()

    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [photo, onClose])

  // 区级地名：先显示离线城市名兜底，再用 Nominatim 反查覆盖（结果按坐标缓存）
  useEffect(() => {
    let cancelled = false
    setPlaceName(cityName ?? null)
    if (lat === undefined || lng === undefined) return

    void (async () => {
      const name = await getPlaceName(lat, lng, cityName)
      if (!cancelled && name) setPlaceName(name)
    })()

    return () => {
      cancelled = true
    }
  }, [lat, lng, cityName])

  // 键盘操作：Esc 关闭，← → 切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(photos[index - 1])
      if (e.key === 'ArrowRight' && hasNext) onNavigate(photos[index + 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photo, photos, index, hasPrev, hasNext, onNavigate, onClose])

  const coords =
    photo.lat !== undefined && photo.lng !== undefined
      ? `${photo.lat.toFixed(6)}, ${photo.lng.toFixed(6)}`
      : null

  return (
    <div className="lightbox" onClick={onClose}>
      <div
        className={`lightbox-body${zoomed ? ' zoomed' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {hasPrev && (
          <button
            className="lightbox-nav left"
            onClick={() => onNavigate(photos[index - 1])}
            aria-label="上一张"
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            className="lightbox-nav right"
            onClick={() => onNavigate(photos[index + 1])}
            aria-label="下一张"
          >
            ›
          </button>
        )}

        <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
          {photo.kind === 'video' && showingOriginal ? (
            <video
              key={photo.id}
              src={src ?? undefined}
              controls
              playsInline
              className="lightbox-video"
              onClick={(e) => e.stopPropagation()}
            />
          ) : src ? (
            <img
              key={photo.id}
              src={src}
              alt={photo.fileName}
              onClick={(e) => {
                e.stopPropagation()
                setZoomed((z) => !z) // 点击图片：网页内放大到 90% / 还原
              }}
              title={zoomed ? '点击还原' : '点击放大'}
            />
          ) : (
            <div className="lightbox-placeholder" onClick={(e) => e.stopPropagation()}>
              无法加载图片
            </div>
          )}
          <div className="lightbox-hud" onClick={(e) => e.stopPropagation()}>
            {index >= 0 && (
              <span className="lightbox-counter">
                {index + 1} / {photos.length}
              </span>
            )}
            <button className="lightbox-close" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
        </div>

        <div className="lightbox-meta" onClick={(e) => e.stopPropagation()}>
          <div className={`lightbox-location${placeName ? '' : ' muted-line'}`}>
            📍 {placeName ?? '位置未记录'}
          </div>
          <div className="lightbox-tags">
            {photo.takenAt !== undefined && <span className="lightbox-tag">{fmtDateTime(photo.takenAt)}</span>}
            {coords && <span className="lightbox-tag">{coords}</span>}
            {coords && (
              <a
                className="lightbox-tag link"
                href={googleStreetViewUrl(photo.lat as number, photo.lng as number)}
                target="_blank"
                rel="noreferrer"
                title="在 Google 街景中打开这个位置"
              >
                街景 ↗
              </a>
            )}
            {coords && (
              <a
                className="lightbox-tag link"
                href={osmUrl(photo.lat as number, photo.lng as number)}
                target="_blank"
                rel="noreferrer"
                title="在 OpenStreetMap 中查看"
              >
                OSM ↗
              </a>
            )}
            {photo.gpsImgDirection !== undefined && (
              <span className="lightbox-tag">朝向 {Math.round(photo.gpsImgDirection)}°</span>
            )}
            {photo.width && photo.height && (
              <span className="lightbox-tag">
                {photo.width}×{photo.height}
              </span>
            )}
            {!showingOriginal && (
              <span className="lightbox-tag soft">
                {photo.kind === 'video' ? '封面预览（重新导入后可播放）' : '缩略图（重新导入后可看原图）'}
              </span>
            )}
          </div>
          <div className="lightbox-file" title={photo.dirPath}>
            {photo.dirPath}
          </div>
        </div>
      </div>
    </div>
  )
}
