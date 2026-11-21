import Dexie, { type Table } from 'dexie'
import type { CityVisit, PhotoRecord, ThumbRecord } from './types'

export interface SettingRecord {
  key: string
  value: unknown
}

/** 逆地理编码缓存：按坐标（4 位小数 ≈11m 网格）缓存区级地名 */
export interface GeocodeRecord {
  geoKey: string
  name: string
  fetchedAt: number
}

export class FootprintDB extends Dexie {
  photos!: Table<PhotoRecord, string>
  thumbs!: Table<ThumbRecord, string>
  cityVisits!: Table<CityVisit, number>
  settings!: Table<SettingRecord, string>
  geocodes!: Table<GeocodeRecord, string>

  constructor() {
    super('footprint-album')
    this.version(1).stores({
      photos: 'id, takenAt, dirPath',
      thumbs: 'id',
      cityVisits: 'cityId',
      settings: 'key',
    })
    this.version(2).stores({
      geocodes: 'geoKey',
    })
  }
}

export const db = new FootprintDB()
