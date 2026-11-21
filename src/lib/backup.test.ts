import { describe, expect, it } from 'vitest'
import { base64ToBlob, blobToBase64, buildBackupJson, validateBackup } from './backup'

describe('blob ↔ base64 往返', () => {
  it('任意字节往返无损', async () => {
    const bytes = new Uint8Array(1024)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    const b64 = await blobToBase64(blob)
    const restored = base64ToBlob(b64)
    const restoredBytes = new Uint8Array(await restored.arrayBuffer())
    expect(restoredBytes).toEqual(bytes)
  })

  it('空 blob 往返无损', async () => {
    const b64 = await blobToBase64(new Blob([]))
    const restored = new Uint8Array(await base64ToBlob(b64).arrayBuffer())
    expect(restored.length).toBe(0)
  })
})

describe('buildBackupJson / validateBackup', () => {
  const data = {
    settings: [{ key: 'basemap', value: 'esri-dark' }],
    photos: [{ id: 'p1', fileName: 'a.jpg', dirPath: 'a.jpg', timeSource: 'exif' as const }],
    cityVisits: [],
    thumbs: [{ id: 'p1', data: 'AAAA' }],
  }

  it('构建的备份通过校验并保留数据', () => {
    const json = buildBackupJson(data, new Date('2026-11-22T00:00:00Z'))
    const parsed = JSON.parse(json)
    expect(parsed.app).toBe('footprint-album')
    expect(parsed.version).toBe(1)
    expect(parsed.exportedAt).toBe('2026-11-22T00:00:00.000Z')
    const check = validateBackup(parsed)
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.data.photos[0].id).toBe('p1')
      expect(check.data.settings).toEqual(data.settings)
    }
  })

  it('非本应用的文件被拒绝', () => {
    const check = validateBackup({ app: 'other-app', version: 1, photos: [], thumbs: [] })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('不是足迹相册')
  })

  it('版本不符被拒绝', () => {
    const check = validateBackup({ app: 'footprint-album', version: 99, photos: [], thumbs: [] })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('版本')
  })

  it('缺少照片数组被拒绝', () => {
    const check = validateBackup({ app: 'footprint-album', version: 1 })
    expect(check.ok).toBe(false)
  })

  it('非对象输入被拒绝', () => {
    expect(validateBackup('garbage').ok).toBe(false)
    expect(validateBackup(null).ok).toBe(false)
  })
})
