import type { StyleSpecification } from 'maplibre-gl'

/**
 * 底图预设：默认 Esri 卫星影像（无 key、大陆可达、观感真实），叠加地名注记层。
 * 注：OSM 官方瓦片在大陆不可达；CARTO 免费瓦片已要求 API key（返回水印图）。
 */
export interface BasemapPreset {
  id: string
  name: string
  tiles: string[]
  maxzoom: number
  attribution: string
}

const ESRI_ATTR = 'Tiles © Esri — Source: US National Park Service'

export const BASEMAPS: BasemapPreset[] = [
  {
    id: 'esri-satellite',
    name: 'Esri 卫星影像',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'esri-dark',
    name: 'Esri 暗色',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 16,
    attribution: ESRI_ATTR,
  },
  {
    id: 'esri-street',
    name: 'Esri 街道',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
    attribution: 'Tiles © Esri',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
]

/** 注记层（城市/街道名），叠加在卫星/暗色底图之上 */
export const REFERENCE_TILES: Record<string, string[]> = {
  'esri-satellite': [
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  ],
  'esri-dark': [
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  ],
}

export const DEFAULT_BASEMAP = BASEMAPS[0]

export function buildStyle(basemap: BasemapPreset): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    basemap: {
      type: 'raster',
      tiles: basemap.tiles,
      tileSize: 256,
      maxzoom: basemap.maxzoom,
      attribution: basemap.attribution,
    },
  }
  const layers: StyleSpecification['layers'] = [{ id: 'basemap', type: 'raster', source: 'basemap' }]
  const referenceTiles = REFERENCE_TILES[basemap.id]
  if (referenceTiles) {
    // 低缩放级别下 Esri 注记的城市点标记会变成大号白圈光晕，很突兀；
    // 放大到城市级别（z7+）才显示地名
    sources.reference = { type: 'raster', tiles: referenceTiles, tileSize: 256, maxzoom: 16, minzoom: 7 }
    layers.push({ id: 'reference', type: 'raster', source: 'reference' })
  }
  return { version: 8, sources, layers }
}
