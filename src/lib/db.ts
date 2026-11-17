import Dexie, { type Table } from 'dexie'
import type { CityVisit, PhotoRecord, ThumbRecord } from './types'

export interface SettingRecord {
  key: string
  value: unknown
}

export class FootprintDB extends Dexie {
  photos!: Table<PhotoRecord, string>
  thumbs!: Table<ThumbRecord, string>
  cityVisits!: Table<CityVisit, number>
  settings!: Table<SettingRecord, string>

  constructor() {
    super('footprint-album')
    this.version(1).stores({
      photos: 'id, takenAt, dirPath',
      thumbs: 'id',
      cityVisits: 'cityId',
      settings: 'key',
    })
  }
}

export const db = new FootprintDB()
