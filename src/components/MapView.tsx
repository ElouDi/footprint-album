import { useCallback, useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import Supercluster from 'supercluster'
import { thumbUrl } from '../lib/thumbUrls'
import { BASEMAPS, DEFAULT_BASEMAP, buildStyle } from '../lib/basemaps'
import type { PhotoRecord } from '../lib/types'

interface MapViewProps {
  photos: PhotoRecord[]
  focus: { points: [number, number][]; key: number } | null
  onOpenPhoto: (photo: PhotoRecord) => void
  /** 手动标点模式：点击地图落点 */
  placement?: { name: string } | null
  onMapClick?: (lng: number, lat: number) => void
  /** 行程轨迹：按拍摄顺序连接的坐标（null 清除） */
  tripPath?: [number, number][] | null
  /** 底图预设 id（设置面板切换） */
  basemapId?: string
}

type ClusterFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    cluster?: boolean
    cluster_id?: number
    point_count?: number
    point_count_abbreviated?: string
    id?: string
  }
}

export default function MapView({ photos, focus, onOpenPhoto, placement, onMapClick, tripPath, basemapId }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const indexRef = useRef<Supercluster<{ id: string }> | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const didFitRef = useRef(false)
  const onOpenPhotoRef = useRef(onOpenPhoto)
  onOpenPhotoRef.current = onOpenPhoto

  // photosRef 让点击回调始终拿到最新列表，而不触发重建索引
  const photosRef = useRef(photos)
  photosRef.current = photos
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  // 初始化只读一次，后续切换走 setStyle（避免 init 依赖抖动）
  const basemapIdRef = useRef(basemapId)
  basemapIdRef.current = basemapId

  const updateMarkers = useCallback(() => {
    const map = mapRef.current
    const index = indexRef.current
    if (!map || !index) return

    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    const bbox = map.getBounds().toArray().flat() as [number, number, number, number]
    const zoom = Math.round(map.getZoom())
    const clusters = index.getClusters(bbox, zoom) as unknown as ClusterFeature[]

    for (const feature of clusters) {
      const [lng, lat] = feature.geometry.coordinates
      const props = feature.properties
      const el = document.createElement('div')

      if (props.cluster) {
        el.className = 'cluster-marker'
        el.textContent = props.point_count_abbreviated ?? String(props.point_count ?? '')
        el.addEventListener('click', () => {
          const expansionZoom = Math.min(index.getClusterExpansionZoom(props.cluster_id ?? 0), 18)
          map.easeTo({ center: [lng, lat], zoom: expansionZoom })
        })
      } else {
        el.className = 'photo-marker'
        el.title = '查看照片'
        const img = document.createElement('img')
        img.alt = ''
        img.loading = 'lazy'
        el.appendChild(img)
        // 从索引反查完整记录：悬停提示 + 点击回调
        const photo = photosRef.current.find((p) => p.id === props.id)
        if (photo) {
          const date = photo.takenAt ? new Date(photo.takenAt).toLocaleDateString('zh-CN') : '时间未知'
          const name = photo.fileName.length > 26 ? `${photo.fileName.slice(0, 23)}…` : photo.fileName
          el.dataset.tip = `${date} · ${name}`
          el.addEventListener('click', () => onOpenPhotoRef.current(photo))
          if (photo.kind === 'video') {
            el.classList.add('video')
            const badge = document.createElement('span')
            badge.className = 'video-badge'
            badge.textContent = '▶'
            el.appendChild(badge)
          }
        }
        void thumbUrl(props.id ?? '').then((url) => {
          if (url) img.src = url
          else el.classList.add('no-thumb')
        })
      }

      const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
      markersRef.current.push(marker)
    }
  }, [])

  // 初始化地图（仅一次）
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(BASEMAPS.find((b) => b.id === basemapIdRef.current) ?? DEFAULT_BASEMAP),
      center: [130, 35],
      zoom: 3.2,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    mapRef.current = map
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__fpMap = map
    }
    // 注意：不等待 'load' 事件（它需要第一帧瓦片渲染完成）。
    // 瓦片不可达（离线/网络受限）时标记与照片功能仍然可用，只是底图黑屏。
    map.on('error', (e) => {
      if (import.meta.env.DEV) {
        const w = window as unknown as Record<string, unknown[]>
        ;(w.__mapErrors ||= []).push(String(e.error?.message ?? e))
        console.warn('[maplibre]', e.error?.message ?? e)
      }
    })
    if (import.meta.env.DEV) {
      for (const evt of ['load', 'style.load', 'styledata', 'sourcedata', 'data'] as const) {
        map.on(evt, () => {
          const w = window as unknown as Record<string, unknown[]>
          ;(w.__mapEvents ||= []).push(evt)
        })
      }
    }
    map.on('moveend', updateMarkers)
    map.on('click', (e) => {
      onMapClickRef.current?.(e.lngLat.lng, e.lngLat.lat)
    })
    // 构造完成后立即做一次渲染（此时 photos 可能已从 IndexedDB 就绪）
    updateMarkers()
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [updateMarkers])

  // 照片变化 → 重建聚合索引
  useEffect(() => {
    if (!mapRef.current) return
    const index = new Supercluster<{ id: string }>({ radius: 70, maxZoom: 15 })
    index.load(
      photos.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng as number, p.lat as number] },
        properties: { id: p.id },
      })),
    )
    indexRef.current = index
    updateMarkers()

    if (photos.length > 0 && !didFitRef.current) {
      didFitRef.current = true
      const bounds = new maplibregl.LngLatBounds()
      for (const p of photos) bounds.extend([p.lng as number, p.lat as number])
      mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 })
    }
  }, [photos, updateMarkers])

  // 侧栏选中行程 → 视角聚焦
  useEffect(() => {
    if (!mapRef.current || !focus || focus.points.length === 0) return
    const bounds = new maplibregl.LngLatBounds(focus.points[0], focus.points[0])
    for (const pt of focus.points) bounds.extend(pt)
    mapRef.current.fitBounds(bounds, { padding: 100, maxZoom: 14, duration: 800 })
  }, [focus])

  // 手动标点模式：十字光标
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = placement ? 'crosshair' : ''
  }, [placement])

  // 底图切换：setStyle 会清空自定义图层，轨迹线随依赖重建
  useEffect(() => {
    const map = mapRef.current
    if (!map || !basemapId) return
    map.setStyle(buildStyle(BASEMAPS.find((b) => b.id === basemapId) ?? DEFAULT_BASEMAP))
  }, [basemapId])

  // 行程轨迹线（光晕 + 实线两层，按拍摄顺序连接）
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const ensureLayers = () => {
      if (map.getSource('trip-path')) return
      map.addSource('trip-path', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'trip-path-glow',
        type: 'line',
        source: 'trip-path',
        paint: { 'line-color': '#4f8cff', 'line-width': 10, 'line-opacity': 0.22, 'line-blur': 5 },
      })
      map.addLayer({
        id: 'trip-path-line',
        type: 'line',
        source: 'trip-path',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#9dbdff', 'line-width': 2.5, 'line-opacity': 0.95 },
      })
    }

    const applyData = () => {
      const source = map.getSource('trip-path') as maplibregl.GeoJSONSource | undefined
      if (!source) return
      source.setData(
        tripPath && tripPath.length > 1
          ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: tripPath } }
          : { type: 'FeatureCollection', features: [] },
      )
    }

    if (map.isStyleLoaded()) {
      ensureLayers()
      applyData()
    } else {
      map.once('style.load', () => {
        ensureLayers()
        applyData()
      })
    }
  }, [tripPath, basemapId])

  return <div ref={containerRef} className="map-container" />
}
