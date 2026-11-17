import { describe, expect, it } from 'vitest'
import { mvhdTime, parseISO6709, parseLoci } from './videoMeta'

describe('parseISO6709', () => {
  it('解析 iPhone 十进制度格式', () => {
    const r = parseISO6709('+35.7101+139.8107/')
    expect(r?.lat).toBeCloseTo(35.7101, 4)
    expect(r?.lng).toBeCloseTo(139.8107, 4)
  })

  it('解析度分格式（纬度 4 位整数 = DDMM，经度 5 位 = DDDMM）', () => {
    const r = parseISO6709('+3542.6060+13945.6420/')
    expect(r?.lat).toBeCloseTo(35 + 42.606 / 60, 4)
    expect(r?.lng).toBeCloseTo(139 + 45.642 / 60, 4)
  })

  it('解析负坐标（南半球/西半球）', () => {
    const r = parseISO6709('-33.8688-151.2093/')
    expect(r?.lat).toBeCloseTo(-33.8688, 4)
    expect(r?.lng).toBeCloseTo(-151.2093, 4)
  })

  it('(0,0) 空值岛返回 null', () => {
    expect(parseISO6709('+0.0+0.0/')).toBeNull()
  })

  it('越界坐标返回 null', () => {
    expect(parseISO6709('+95.0+200.0/')).toBeNull()
  })

  it('残缺字符串返回 null', () => {
    expect(parseISO6709('no-coords')).toBeNull()
    expect(parseISO6709('+35.1')).toBeNull()
  })
})

describe('parseLoci', () => {
  function buildLociBytes(lat: number, lng: number): ArrayBuffer {
    const buf = new ArrayBuffer(64)
    const view = new DataView(buf)
    // version/flags
    view.setUint32(0, 0)
    // 语言码 2 字节
    view.setUint16(4, 0x55c4)
    // 位置名 "Kyoto\0"
    const name = 'Kyoto'
    for (let i = 0; i < name.length; i++) view.setUint8(6 + i, name.charCodeAt(i))
    let p = 6 + name.length
    view.setUint8(p, 0) // \0
    p += 1
    view.setUint8(p, 0) // role
    p += 1
    view.setInt32(p, Math.round(lat * 65536))
    view.setInt32(p + 4, Math.round(lng * 65536))
    view.setInt32(p + 8, 0) // altitude
    return buf
  }

  it('解析固定点数坐标（Android 风格）', () => {
    const buf = buildLociBytes(35.7101, 139.8107)
    const r = parseLoci(new DataView(buf), { start: 0, end: buf.byteLength })
    expect(r?.lat).toBeCloseTo(35.7101, 3)
    expect(r?.lng).toBeCloseTo(139.8107, 3)
  })

  it('空值岛返回 null', () => {
    const buf = buildLociBytes(0, 0)
    expect(parseLoci(new DataView(buf), { start: 0, end: buf.byteLength })).toBeNull()
  })
})

describe('mvhdTime', () => {
  it('解析 version 0 的 Mac 纪元创建时间', () => {
    const unixSeconds = 1712101800 // 2024-04-03T02:30:00Z
    const creation = unixSeconds + 2082844800 // Mac 纪元秒
    const buf = new ArrayBuffer(32)
    const view = new DataView(buf)
    view.setUint8(0, 0) // version 0
    view.setUint32(4, creation)
    const ms = mvhdTime(view, { start: 0, end: 32 })
    expect(ms).toBe(unixSeconds * 1000)
  })

  it('creation 为 0 返回 undefined', () => {
    const buf = new ArrayBuffer(32)
    const view = new DataView(buf)
    view.setUint8(0, 0)
    view.setUint32(4, 0)
    expect(mvhdTime(view, { start: 0, end: 32 })).toBeUndefined()
  })
})
