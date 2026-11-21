import { describe, expect, it } from 'vitest'
import { multiYearCities, onThisDay } from './memories'
import type { CityEntry } from './cities'
import type { PhotoRecord } from './types'

function photo(id: string, takenAt: number, lat?: number, lng?: number): PhotoRecord {
  return { id, fileName: id, dirPath: id, takenAt, lat, lng, timeSource: 'exif' }
}

describe('onThisDay', () => {
  const now = new Date(2026, 3, 3, 12, 0) // 2026-04-03

  it('取往年同月同日的照片，按年份倒序', () => {
    const photos = [
      photo('a', new Date(2025, 3, 3, 9).getTime()),
      photo('b', new Date(2024, 3, 3, 10).getTime()),
      photo('c', new Date(2025, 3, 4).getTime()), // 日期不同
      photo('d', new Date(2026, 3, 3).getTime()), // 今年，不算回忆
    ]
    const groups = onThisDay(photos, now)
    expect(groups.map((g) => g.year)).toEqual([2025, 2024])
    expect(groups[0].photos.map((p) => p.id)).toEqual(['a'])
    expect(groups[1].photos.map((p) => p.id)).toEqual(['b'])
  })

  it('没有往年回忆返回空', () => {
    expect(onThisDay([photo('a', new Date(2026, 3, 3).getTime())], now)).toEqual([])
  })
})

describe('multiYearCities', () => {
  const cities: CityEntry[] = [{ id: 0, name: 'Kyoto', lat: 35.032, lng: 135.748, pop: 1475000 }]

  it('同一城市跨多年才入选，年份倒序', () => {
    const photos = [
      photo('a', new Date(2024, 3, 3).getTime(), 34.995, 135.785),
      photo('b', new Date(2026, 3, 3).getTime(), 35.03, 135.76),
      photo('c', new Date(2025, 3, 3).getTime(), 34.995, 135.785), // 同城市不同年份
    ]
    const groups = multiYearCities(photos, cities)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Kyoto')
    expect(groups[0].years.map((y) => y.year)).toEqual([2026, 2025, 2024])
    expect(groups[0].firstAt).toBe(new Date(2024, 3, 3).getTime())
  })

  it('只去过一年的城市不入选', () => {
    const photos = [photo('a', new Date(2024, 3, 3).getTime(), 34.995, 135.785)]
    expect(multiYearCities(photos, cities)).toEqual([])
  })

  it('未定位照片不参与', () => {
    const photos = [photo('a', new Date(2024, 3, 3).getTime()), photo('b', new Date(2026, 3, 3).getTime())]
    expect(multiYearCities(photos, cities)).toEqual([])
  })
})
