import type { PhotoRecord, Trip } from './types'

/** 行程分段阈值：与上一张照片间隔超过 36 小时，或位置跳变超过 100km，视为新行程 */
export const TRIP_TIME_GAP_MS = 36 * 3600 * 1000
export const TRIP_DISTANCE_GAP_KM = 100

const EARTH_RADIUS_KM = 6371

/** 球面两点大圆距离（km） */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/**
 * 把有拍摄时间的照片按时间轴分段成行程：
 * - 相邻照片时间间隔 > 36h，或
 * - 相邻两张都已定位且距离 > 100km（同一天的长途飞行）
 * 无拍摄时间的照片不参与分段（仍在地图上展示）。
 */
export function segmentTrips(photos: PhotoRecord[]): Trip[] {
  const timed = photos
    .filter((p) => p.takenAt !== undefined)
    .sort((a, b) => (a.takenAt as number) - (b.takenAt as number))

  const trips: Trip[] = []
  let current: PhotoRecord[] = []

  const flush = () => {
    if (current.length === 0) return
    const startAt = current[0].takenAt as number
    const endAt = current[current.length - 1].takenAt as number
    trips.push({
      id: `${startAt}-${endAt}`,
      startAt,
      endAt,
      photos: current,
    })
    current = []
  }

  for (const photo of timed) {
    if (current.length > 0) {
      const prev = current[current.length - 1]
      const timeGap = (photo.takenAt as number) - (prev.takenAt as number)
      let newTrip = timeGap > TRIP_TIME_GAP_MS
      if (!newTrip && prev.lat !== undefined && prev.lng !== undefined && photo.lat !== undefined && photo.lng !== undefined) {
        newTrip = haversineKm(prev.lat, prev.lng, photo.lat, photo.lng) > TRIP_DISTANCE_GAP_KM
      }
      if (newTrip) flush()
    }
    current.push(photo)
  }
  flush()

  return trips
}

/** 按自然日分组（行程详情页用） */
export function groupByDay(photos: PhotoRecord[]): Map<string, PhotoRecord[]> {
  const groups = new Map<string, PhotoRecord[]>()
  for (const p of photos) {
    if (p.takenAt === undefined) continue
    const d = new Date(p.takenAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }
  return groups
}

/**
 * 地理就近浏览链：从 start 出发，每一步走向尚未访问的照片中最近的一张（贪心最近邻）。
 * 链在打开灯箱时生成并保持稳定——若每步都重算，两张互为最近的照片会无限往返。
 * start 未定位时回退为按拍摄时间排序。
 */
export function nearestNeighborChain(photos: PhotoRecord[], start: PhotoRecord): PhotoRecord[] {
  const located = photos.filter((p) => p.lat !== undefined && p.lng !== undefined)
  const byTime = [...located].sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0))
  if (start.lat === undefined || start.lng === undefined) return byTime
  if (!located.some((p) => p.id === start.id)) return byTime

  const rest = located.filter((p) => p.id !== start.id)
  const chain: PhotoRecord[] = [start]
  let cur = start
  while (rest.length > 0) {
    let bestIdx = 0
    let bestKm = Infinity
    for (let i = 0; i < rest.length; i++) {
      const km = haversineKm(cur.lat as number, cur.lng as number, rest[i].lat as number, rest[i].lng as number)
      if (km < bestKm) {
        bestKm = km
        bestIdx = i
      }
    }
    cur = rest.splice(bestIdx, 1)[0]
    chain.push(cur)
  }
  return chain
}
