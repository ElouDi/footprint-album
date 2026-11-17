import type { CityVisit, PhotoRecord } from './types'

/** cities.json 中的紧凑元组：[名称, 纬度, 经度, 人口] */
export type CityTuple = [string, number, number, number]

export interface CityEntry {
  id: number
  name: string
  lat: number
  lng: number
  pop: number
}

/** 城市匹配半径：50km 内的最近城市算作"到过" */
export const CITY_MATCH_RADIUS_KM = 50

let citiesCache: Promise<CityEntry[]> | null = null

/** 加载内置城市数据（Natural Earth populated places，精简为元组数组），模块级缓存 */
export function loadCities(): Promise<CityEntry[]> {
  if (!citiesCache) {
    citiesCache = (async () => {
      const url = `${import.meta.env.BASE_URL}data/cities.json`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`城市数据加载失败: ${res.status}`)
      const tuples: CityTuple[] = await res.json()
      return tuples.map(([name, lat, lng, pop], i) => ({ id: i, name, lat, lng, pop }))
    })()
    citiesCache.catch(() => {
      citiesCache = null // 失败允许重试
    })
  }
  return citiesCache
}

/** 最近城市查找（线性扫描；数据量 ~7k，导入时一次性计算可接受） */
export function findNearestCity(
  cities: CityEntry[],
  lat: number,
  lng: number,
  maxKm = CITY_MATCH_RADIUS_KM,
): CityEntry | null {
  // haversine 局部副本，避免引入 cluster.ts 的依赖方向混乱
  const toRad = (d: number) => (d * Math.PI) / 180
  let best: CityEntry | null = null
  let bestKm = Infinity
  for (const city of cities) {
    const dLat = toRad(city.lat - lat)
    const dLng = toRad(city.lng - lng)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(city.lat)) * Math.sin(dLng / 2) ** 2
    const km = 2 * 6371 * Math.asin(Math.sqrt(a))
    if (km < bestKm) {
      bestKm = km
      best = city
    }
  }
  return bestKm <= maxKm ? best : null
}

/** 由已定位照片聚合出"点亮的城市"列表（按首次到访时间倒序） */
export function computeCityVisits(photos: PhotoRecord[], cities: CityEntry[]): CityVisit[] {
  const byCity = new Map<number, CityVisit>()
  for (const p of photos) {
    if (p.lat === undefined || p.lng === undefined || p.takenAt === undefined) continue
    const city = findNearestCity(cities, p.lat, p.lng)
    if (!city) continue
    const existing = byCity.get(city.id)
    if (existing) {
      existing.count += 1
      existing.lastVisitAt = Math.max(existing.lastVisitAt, p.takenAt)
      existing.firstVisitAt = Math.min(existing.firstVisitAt, p.takenAt)
    } else {
      byCity.set(city.id, {
        cityId: city.id,
        name: city.name,
        lat: city.lat,
        lng: city.lng,
        firstVisitAt: p.takenAt,
        lastVisitAt: p.takenAt,
        count: 1,
      })
    }
  }
  return [...byCity.values()].sort((a, b) => b.firstVisitAt - a.firstVisitAt)
}
