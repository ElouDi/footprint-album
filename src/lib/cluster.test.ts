import { describe, expect, it } from 'vitest'
import { groupByDay, haversineKm, nearestNeighborChain, segmentTrips, TRIP_DISTANCE_GAP_KM, TRIP_TIME_GAP_MS } from './cluster'
import type { PhotoRecord } from './types'

function photo(partial: Partial<PhotoRecord> & { id: string }): PhotoRecord {
  return {
    fileName: `${partial.id}.jpg`,
    dirPath: partial.id,
    timeSource: 'exif',
    ...partial,
  }
}

describe('haversineKm', () => {
  it('东京—大阪约 390-400km', () => {
    const km = haversineKm(35.687, 139.749, 34.691, 135.504)
    expect(km).toBeGreaterThan(350)
    expect(km).toBeLessThan(430)
  })

  it('同一点距离为 0', () => {
    expect(haversineKm(35.0, 135.0, 35.0, 135.0)).toBe(0)
  })
})

describe('segmentTrips', () => {
  const day = 24 * 3600 * 1000

  it('同一时段连续拍摄的照片聚成一个行程', () => {
    const photos = [
      photo({ id: 'a', takenAt: 1000 * day, lat: 34.68, lng: 135.83 }),
      photo({ id: 'b', takenAt: 1000 * day + 3600 * 1000, lat: 34.685, lng: 135.8 }),
      photo({ id: 'c', takenAt: 1000 * day + 7200 * 1000, lat: 34.69, lng: 135.84 }),
    ]
    const trips = segmentTrips(photos)
    expect(trips).toHaveLength(1)
    expect(trips[0].photos.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('时间间隔超过 36h 分成两个行程', () => {
    const photos = [
      photo({ id: 'a', takenAt: 1000 * day, lat: 34.68, lng: 135.83 }),
      photo({ id: 'b', takenAt: 1000 * day + TRIP_TIME_GAP_MS + 1, lat: 34.685, lng: 135.8 }),
    ]
    expect(segmentTrips(photos)).toHaveLength(2)
  })

  it('同一天内位置跳变超过 100km 分成两个行程（模拟飞行）', () => {
    // 京都 → 东京直线约 370km，拍摄时间只差 3 小时
    const photos = [
      photo({ id: 'kyoto', takenAt: 1000 * day, lat: 35.032, lng: 135.748 }),
      photo({ id: 'tokyo', takenAt: 1000 * day + 3 * 3600 * 1000, lat: 35.687, lng: 139.749 }),
    ]
    const trips = segmentTrips(photos)
    expect(trips).toHaveLength(2)
    expect(TRIP_DISTANCE_GAP_KM).toBe(100)
  })

  it('无拍摄时间的照片不参与分段', () => {
    const photos = [
      photo({ id: 'a', takenAt: 1000 * day, lat: 34.68, lng: 135.83 }),
      photo({ id: 'notime' }),
    ]
    const trips = segmentTrips(photos)
    expect(trips).toHaveLength(1)
    expect(trips[0].photos.map((p) => p.id)).toEqual(['a'])
  })

  it('空列表返回空行程', () => {
    expect(segmentTrips([])).toEqual([])
  })
})

describe('nearestNeighborChain', () => {
  // 四个点：A 与 B 相邻约 2.6km，C 距 B 约 25km，D 距 A 约 135km
  const a = photo({ id: 'A', lat: 35.0, lng: 135.0, takenAt: 1000 })
  const b = photo({ id: 'B', lat: 35.02, lng: 135.01, takenAt: 4000 })
  const c = photo({ id: 'C', lat: 35.2, lng: 135.3, takenAt: 3000 })
  const d = photo({ id: 'D', lat: 36.0, lng: 136.0, takenAt: 2000 })

  it('从 A 出发按贪心最近邻连线', () => {
    const chain = nearestNeighborChain([a, b, c, d], a)
    expect(chain.map((p) => p.id)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('从 C 出发同样稳定，不产生往返死循环', () => {
    const chain = nearestNeighborChain([a, b, c, d], c)
    expect(chain.map((p) => p.id)).toEqual(['C', 'B', 'A', 'D'])
  })

  it('起点未定位时回退为按拍摄时间排序', () => {
    const noGps = photo({ id: 'N', takenAt: 500 })
    const chain = nearestNeighborChain([d, a, noGps, b, c], noGps)
    expect(chain.map((p) => p.id)).toEqual(['A', 'D', 'C', 'B']) // takenAt 升序
  })
})

describe('groupByDay', () => {
  it('按自然日分组并保持顺序', () => {
    // 本地时区构造，分组键与本地日历一致，跨时区稳定
    const d1 = new Date(2024, 3, 3, 10, 30).getTime() // 2024-04-03
    const d2 = new Date(2024, 3, 4, 9, 0).getTime() // 2024-04-04
    const photos = [
      photo({ id: 'a', takenAt: d1 + 3600 * 1000 }),
      photo({ id: 'b', takenAt: d1 + 7200 * 1000 }),
      photo({ id: 'c', takenAt: d2 }),
    ]
    const groups = groupByDay(photos)
    expect(groups.size).toBe(2)
    const keys = [...groups.keys()]
    expect(keys[0]).toBe('2024-04-03')
    expect(groups.get('2024-04-03')?.map((p) => p.id)).toEqual(['a', 'b'])
    expect(groups.get('2024-04-04')?.map((p) => p.id)).toEqual(['c'])
  })

  it('无拍摄时间的照片不参与分组', () => {
    const groups = groupByDay([photo({ id: 'x' })])
    expect(groups.size).toBe(0)
  })
})
