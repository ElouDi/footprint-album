import { db } from './db'

const cache = new Map<string, string>()

/** 取缩略图的 objectURL（懒加载 + 缓存）。无缩略图返回 null。 */
export async function thumbUrl(id: string): Promise<string | null> {
  const cached = cache.get(id)
  if (cached) return cached
  const record = await db.thumbs.get(id)
  if (!record) return null
  const url = URL.createObjectURL(record.blob)
  cache.set(id, url)
  return url
}

/** 缩略图被重建后失效旧缓存，下次读取拿到新图 */
export function invalidateThumbUrl(id: string): void {
  const url = cache.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    cache.delete(id)
  }
}
