import { describe, expect, it } from 'vitest'
import { googleStreetViewUrl, osmUrl } from './links'

describe('googleStreetViewUrl', () => {
  it('生成官方 Maps URL API 的街景跳转链接', () => {
    expect(googleStreetViewUrl(35.6586, 139.7454)).toBe(
      'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.658600,139.745400',
    )
  })

  it('负坐标正常', () => {
    const url = googleStreetViewUrl(-33.8688, -151.2093)
    expect(url).toContain('viewpoint=-33.868800,-151.209300')
  })
})

describe('osmUrl', () => {
  it('生成 OSM 定位链接', () => {
    expect(osmUrl(34.9949, 135.785)).toBe(
      'https://www.openstreetmap.org/?mlat=34.994900&mlon=135.785000#map=17/34.994900/135.785000',
    )
  })
})
