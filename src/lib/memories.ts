import { findNearestCity, type CityEntry } from './cities'
import type { PhotoRecord } from './types'

export interface YearGroup {
  year: number
  photos: PhotoRecord[]
}

export interface CityYearGroup {
  cityId: number
  name: string
  years: YearGroup[]
  /** 该城市最早一张照片的时间，用于排序 */
  firstAt: number
}

/** "N 年前的今天"：取往年同月同日的照片，按年份倒序分组 */
export function onThisDay(photos: PhotoRecord[], now = new Date()): YearGroup[] {
  const month = now.getMonth()
  const day = now.getDate()
  const byYear = new Map<number, PhotoRecord[]>()
  for (const p of photos) {
    if (p.takenAt === undefined) continue
    const dt = new Date(p.takenAt)
    if (dt.getMonth() === month && dt.getDate() === day && dt.getFullYear() < now.getFullYear()) {
      const list = byYear.get(dt.getFullYear()) ?? []
      list.push(p)
      byYear.set(dt.getFullYear(), list)
    }
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, ps]) => ({ year, photos: ps }))
}

/**
 * "同一座城市，不同年份"：取去过 ≥2 个年份的城市，按年份倒序分组。
 * 整组按该城市最早一次到访时间倒序（最近重游的排前面）。
 */
export function multiYearCities(photos: PhotoRecord[], cities: CityEntry[]): CityYearGroup[] {
  const byCity = new Map<number, Map<number, PhotoRecord[]>>()
  const meta = new Map<number, { name: string; lat: number; lng: number }>()
  for (const p of photos) {
    if (p.lat === undefined || p.lng === undefined || p.takenAt === undefined) continue
    const c = findNearestCity(cities, p.lat, p.lng)
    if (!c) continue
    meta.set(c.id, { name: c.name, lat: c.lat, lng: c.lng })
    const year = new Date(p.takenAt).getFullYear()
    const years = byCity.get(c.id) ?? new Map<number, PhotoRecord[]>()
    const list = years.get(year) ?? []
    list.push(p)
    years.set(year, list)
    byCity.set(c.id, years)
  }
  const out: CityYearGroup[] = []
  for (const [cityId, years] of byCity) {
    if (years.size < 2) continue
    const m = meta.get(cityId)!
    const ygs = [...years.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, ps]) => ({ year, photos: ps }))
    out.push({ cityId, name: m.name, years: ygs, firstAt: ygs[ygs.length - 1].photos[0].takenAt ?? 0 })
  }
  return out.sort((a, b) => b.firstAt - a.firstAt)
}
