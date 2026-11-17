import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import {
  importFromFileList,
  importFromDirectoryPicker,
  importPhotoFiles,
  filesFromDataTransfer,
  refreshCityVisits,
  supportsDirectoryPicker,
} from './lib/importer'
import { segmentTrips } from './lib/cluster'
import { findNearestCity, loadCities, type CityEntry } from './lib/cities'
import type { CityVisit, ImportProgress, ImportSummary, PhotoRecord, Trip } from './lib/types'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import Lightbox from './components/Lightbox'

// useLiveQuery 尚未返回时的稳定空数组，避免下游 useMemo 依赖抖动
const EMPTY_PHOTOS: PhotoRecord[] = []
const EMPTY_VISITS: CityVisit[] = []

interface LightboxEntry {
  photo: PhotoRecord
  cityName?: string
}

export default function App() {
  const photos = useLiveQuery(() => db.photos.toArray(), []) ?? EMPTY_PHOTOS
  const cityVisits = useLiveQuery(() => db.cityVisits.toArray(), []) ?? EMPTY_VISITS

  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [importing, setImporting] = useState(false)
  const [lightbox, setLightbox] = useState<LightboxEntry | null>(null)
  const [dragging, setDragging] = useState(false)
  const [focus, setFocus] = useState<{ points: [number, number][]; key: number } | null>(null)
  const [placement, setPlacement] = useState<{ id: string; name: string } | null>(null)

  // 城市数据只加载一次：状态供组件使用，ref 供回调即时读取
  const [cities, setCities] = useState<CityEntry[] | null>(null)
  const citiesRef = useRef<CityEntry[] | null>(null)
  citiesRef.current = cities
  useEffect(() => {
    void loadCities().then(setCities).catch(() => {})
  }, [])

  const trips = useMemo(() => segmentTrips(photos), [photos])
  const locatedPhotos = useMemo(
    () =>
      photos
        .filter((p) => p.lat !== undefined && p.lng !== undefined)
        .sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0)),
    [photos],
  )

  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)

  // 灯箱导航范围：行程详情内翻行程照片，否则翻全部已定位媒体
  const lightboxPhotos = useMemo(() => (activeTrip ? activeTrip.photos : locatedPhotos), [activeTrip, locatedPhotos])

  // 行程轨迹：已定位照片按拍摄顺序连线
  const tripPath = useMemo<[number, number][] | null>(() => {
    if (!activeTrip) return null
    return activeTrip.photos
      .filter((p) => p.lat !== undefined && p.lng !== undefined)
      .map((p) => [p.lng as number, p.lat as number])
  }, [activeTrip])

  const openLightbox = useCallback((photo: PhotoRecord) => {
    const city =
      photo.lat !== undefined && photo.lng !== undefined && citiesRef.current
        ? findNearestCity(citiesRef.current, photo.lat, photo.lng)
        : null
    setLightbox({ photo, cityName: city?.name })
  }, [])

  // 手动标点：侧栏选中 → 点击地图落点 → 写库并重算城市足迹
  const handlePlaceRequest = useCallback((photo: PhotoRecord) => {
    setLightbox(null)
    setPlacement({ id: photo.id, name: photo.fileName })
  }, [])

  const handleCancelPlacement = useCallback(() => setPlacement(null), [])

  const handleMapClick = useCallback(
    async (lng: number, lat: number) => {
      if (!placement) return
      await db.photos.update(placement.id, { lat, lng })
      await refreshCityVisits()
      setPlacement(null)
    },
    [placement],
  )

  // 标点模式下 Esc 取消
  useEffect(() => {
    if (!placement) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacement(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placement])

  const handleImportDirectory = useCallback(async () => {
    setImporting(true)
    setSummary(null)
    try {
      const result = await importFromDirectoryPicker(setProgress)
      if (result) setSummary(result)
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }, [])

  const handleImportFiles = useCallback(async (files: FileList | File[]) => {
    setImporting(true)
    setSummary(null)
    try {
      setSummary(await importFromFileList(files, setProgress))
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }, [])

  const handleDrop = useCallback(
    async (dt: DataTransfer) => {
      setImporting(true)
      setSummary(null)
      try {
        const items = await filesFromDataTransfer(dt)
        setSummary(await importPhotoFiles(items, setProgress))
      } finally {
        setImporting(false)
        setProgress(null)
      }
    },
    [],
  )

  const handleSelectTrip = useCallback((trip: Trip) => {
    setActiveTrip(trip)
    const points = trip.photos
      .filter((p) => p.lat !== undefined && p.lng !== undefined)
      .map((p) => [p.lng as number, p.lat as number] as [number, number])
    if (points.length > 0) setFocus({ points, key: Date.now() })
  }, [])

  const handleBackFromTrip = useCallback(() => setActiveTrip(null), [])

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <Sidebar
        photos={photos}
        cityVisits={cityVisits}
        trips={trips}
        progress={progress}
        summary={summary}
        importing={importing}
        canPickDirectory={supportsDirectoryPicker()}
        placement={placement}
        activeTrip={activeTrip}
        cities={cities}
        onImportDirectory={handleImportDirectory}
        onImportFiles={handleImportFiles}
        onSelectTrip={handleSelectTrip}
        onBackFromTrip={handleBackFromTrip}
        onOpenPhoto={openLightbox}
        onPlaceRequest={handlePlaceRequest}
        onCancelPlacement={handleCancelPlacement}
      />
      <main
        className={`map-area${placement ? ' placement-mode' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void handleDrop(e.dataTransfer)
        }}
      >
        <MapView
          photos={locatedPhotos}
          focus={focus}
          onOpenPhoto={openLightbox}
          placement={placement}
          onMapClick={handleMapClick}
          tripPath={tripPath}
        />
        {placement && (
          <div className="placement-banner">
            点击地图为「{placement.name}」选择位置 · Esc 取消
          </div>
        )}
        {photos.length === 0 && !dragging && (
          <div className="empty-hint">
            <p className="empty-title">把旅行照片文件夹拖到这里</p>
            <p className="empty-sub">照片不会上传——EXIF 里的位置和时间只保存在你自己的浏览器里</p>
          </div>
        )}
        {dragging && <div className="drop-hint">松手开始导入</div>}
      </main>
      {lightbox && (
        <Lightbox
          photos={lightboxPhotos}
          entry={lightbox}
          onNavigate={openLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
