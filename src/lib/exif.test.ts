import { describe, expect, it } from 'vitest'
import { exifToPhotoExif } from './exif'

describe('exifToPhotoExif', () => {
  it('提取 GPS、拍摄时间与朝向', () => {
    const result = exifToPhotoExif({
      latitude: 34.9949,
      longitude: 135.785,
      DateTimeOriginal: new Date('2024-04-03T10:30:00Z'),
      GPSImgDirection: 178.5,
    })
    expect(result?.lat).toBe(34.9949)
    expect(result?.lng).toBe(135.785)
    expect(result?.takenAt).toBe(Date.UTC(2024, 3, 3, 10, 30, 0))
    expect(result?.gpsImgDirection).toBe(178.5)
  })

  it('无效坐标（空值岛 0,0）被过滤但保留时间', () => {
    const result = exifToPhotoExif({
      latitude: 0,
      longitude: 0,
      DateTimeOriginal: new Date('2024-04-03T10:30:00Z'),
    })
    expect(result?.lat).toBeUndefined()
    expect(result?.lng).toBeUndefined()
    expect(result?.takenAt).toBeDefined()
  })

  it('越界坐标被过滤', () => {
    const result = exifToPhotoExif({ latitude: 123, longitude: 456 })
    expect(result?.lat).toBeUndefined()
    expect(result?.lng).toBeUndefined()
  })

  it('只有时间没有 GPS 也能返回记录', () => {
    const result = exifToPhotoExif({ DateTimeOriginal: new Date('2024-04-03T10:30:00Z') })
    expect(result?.takenAt).toBeDefined()
    expect(result?.lat).toBeUndefined()
  })

  it('回退到 CreateDate，字符串朝向可解析', () => {
    const result = exifToPhotoExif({
      CreateDate: new Date('2023-01-02T08:00:00Z'),
      GPSImgDirection: '90/1',
    })
    expect(result?.takenAt).toBe(Date.UTC(2023, 0, 2, 8, 0, 0))
    expect(result?.gpsImgDirection).toBe(90)
  })

  it('空数据与无有效字段返回 null', () => {
    expect(exifToPhotoExif(undefined)).toBeNull()
    expect(exifToPhotoExif({ someRandomField: 1 })).toBeNull()
  })
})
