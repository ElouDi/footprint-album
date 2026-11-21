import { db } from './db'

/**
 * 区级地名解析：打开灯箱时向 OSM Nominatim 发起一次逆地理编码（免费、无需 key），
 * 结果按坐标网格缓存在本地 IndexedDB，同一地点终身只查一次。
 * 这是应用唯一会把坐标发给外部的环节。
 */

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'

/** 从 Nominatim 的 address 对象里拼出「省/都道府 · 市 · 区」级别的地名 */
export function formatAddressParts(address: Record<string, string>): string | null {
  const state = address.state || address.province || address.region || ''
  const city = address.city || address.town || address.county || address.municipality || ''
  const district =
    address.suburb || address.city_district || address.neighbourhood || address.quarter || address.village || ''
  const parts = [...new Set([state, city, district].map((s) => s.trim()).filter(Boolean))]
  return parts.length > 0 ? parts.join(' · ') : null
}

export async function getPlaceName(lat: number, lng: number, fallback: string | undefined): Promise<string | null> {
  const geoKey = `${lat.toFixed(4)},${lng.toFixed(4)}`

  try {
    const cached = await db.geocodes.get(geoKey)
    if (cached) return cached.name || fallback || null
  } catch {
    // 缓存读取失败则继续走网络
  }

  let name = ''
  try {
    const res = await fetch(
      `${NOMINATIM_REVERSE}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=zh-CN&addressdetails=1`,
    )
    if (res.ok) {
      const json = (await res.json()) as { address?: Record<string, string> }
      name = formatAddressParts(json.address ?? {}) ?? ''
    }
  } catch {
    // 离线/被墙：回落到离线城市名
  }

  if (!name) name = fallback ?? ''
  try {
    await db.geocodes.put({ geoKey, name, fetchedAt: Date.now() })
  } catch {
    // 缓存写失败不影响展示
  }
  return name || null
}
