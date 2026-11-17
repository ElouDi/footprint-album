import { describe, expect, it } from 'vitest'
import { computeCityVisits, findNearestCity, type CityEntry } from './cities'
import type { PhotoRecord } from './types'

const cities: CityEntry[] = [
  { id: 0, name: 'Kyoto', lat: 35.032, lng: 135.748, pop: 1475000 },
  { id: 1, name: 'Kamakura', lat: 35.319, lng: 139.546, pop: 172000 },
  { id: 2, name: 'Osaka', lat: 34.691, lng: 135.504, pop: 2750000 },
]

function photo(id: string, lat: number, lng: number, takenAt: number): PhotoRecord {
  return { id, fileName: id, dirPath: id, lat, lng, takenAt, timeSource: 'exif' }
}

describe('findNearestCity', () => {
  it('清水寺坐标匹配到 Kyoto', () => {
    expect(findNearestCity(cities, 34.995, 135.785)?.name).toBe('Kyoto')
  })

  it('鹤冈八幡宫坐标匹配到 Kamakura', () => {
    expect(findNearestCity(cities, 35.325, 139.552)?.name).toBe('Kamakura')
  })

  it('超出 50km 半径返回 null', () => {
    // 名古屋距三城都超过 100km
    expect(findNearestCity(cities, 35.17, 136.9)).toBeNull()
  })

  it('自定义半径生效', () => {
    expect(findNearestCity(cities, 35.17, 136.9, 200)?.name).toBe('Kyoto')
  })
})

describe('computeCityVisits', () => {
  it('按城市聚合照片并记录首次到访时间', () => {
    const photos = [
      photo('a', 34.995, 135.785, 1000), // Kyoto
      photo('b', 35.325, 139.552, 2000), // Kamakura
      photo('c', 35.03, 135.76, 3000), // Kyoto
      photo('nogps', undefined as unknown as number, undefined as unknown as number, 4000),
    ]
    const visits = computeCityVisits(photos, cities)
    expect(visits).toHaveLength(2)
    const kyoto = visits.find((v) => v.name === 'Kyoto')
    expect(kyoto?.count).toBe(2)
    expect(kyoto?.firstVisitAt).toBe(1000)
    expect(kyoto?.lastVisitAt).toBe(3000)
    // 无 GPS 照片不产生访问记录
    expect(visits.find((v) => v.count === 1 && v.name === 'Kamakura')).toBeTruthy()
  })

  it('按首次到访时间倒序排列', () => {
    const photos = [
      photo('a', 34.995, 135.785, 5000), // Kyoto 后到
      photo('b', 35.325, 139.552, 1000), // Kamakura 先到
    ]
    const visits = computeCityVisits(photos, cities)
    expect(visits.map((v) => v.name)).toEqual(['Kyoto', 'Kamakura'])
  })
})
