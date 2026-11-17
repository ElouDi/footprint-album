export const THUMB_MAX_SIZE = 512
export const THUMB_QUALITY = 0.82
/** 缩略图规格版本：升级分辨率后旧记录重新导入时自动重建 */
export const THUMB_VERSION = 2

export interface ThumbnailResult {
  blob: Blob
  width: number
  height: number
}

/** 生成 ≤512px 的 JPEG 缩略图，并返回原图尺寸。失败返回 null。 */
export async function makeThumbnail(file: File): Promise<ThumbnailResult | null> {
  let bitmap: ImageBitmap | null = null
  try {
    // 按 EXIF 方向解码（iPhone 竖拍照片方向为 6/8）
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      return null
    }
  }

  const { width, height } = bitmap
  const scale = Math.min(1, THUMB_MAX_SIZE / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  bitmap.close()

  try {
    const blob = await drawToBlob(w, h, file)
    return blob ? { blob, width, height } : null
  } catch {
    return null
  }
}

async function drawToBlob(w: number, h: number, source: File): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(await createImageBitmap(source, { imageOrientation: 'from-image' }), 0, 0, w, h)
    return canvas.convertToBlob({ type: 'image/jpeg', quality: THUMB_QUALITY })
  }
  // 兜底：普通 canvas（老 Safari）
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', THUMB_QUALITY))
}

/** 截取视频某一帧作为封面缩略图（≤512px），返回视频原始尺寸。解码失败返回 null。 */
export async function makeVideoThumbnail(file: File): Promise<ThumbnailResult | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  try {
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('video load timeout')), 10000)
      video.onloadeddata = () => {
        clearTimeout(timer)
        resolve()
      }
      video.onerror = () => {
        clearTimeout(timer)
        reject(new Error('video decode failed'))
      }
    })
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
    video.currentTime = Math.min(1, duration / 2)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('video seek timeout')), 5000)
      video.onseeked = () => {
        clearTimeout(timer)
        resolve()
      }
      video.onerror = () => {
        clearTimeout(timer)
        reject(new Error('video seek failed'))
      }
    })
    const w0 = video.videoWidth
    const h0 = video.videoHeight
    if (!w0 || !h0) return null
    const scale = Math.min(1, THUMB_MAX_SIZE / Math.max(w0, h0))
    const w = Math.max(1, Math.round(w0 * scale))
    const h = Math.max(1, Math.round(h0 * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', THUMB_QUALITY),
    )
    return blob ? { blob, width: w0, height: h0 } : null
  } catch {
    return null
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
