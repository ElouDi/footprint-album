import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import { DEFAULT_BASEMAP } from './lib/basemaps'
import {
  importFromFileList,
  importFromDirectoryPicker,
  importPhotoFiles,
  filesFromDataTransfer,
  refreshCityVisits,
  supportsDirectoryPicker,
} from './lib/importer'
import { segmentTrips, nearestNeighborChain } from './lib/cluster'
import { findNearestCity, loadCities, type CityEntry } from './lib/cities'
import { normalizeSidebarOrder } from './lib/sidebarOrder'
import type { CityVisit, ImportProgress, ImportSummary, PhotoRecord, Trip } from './lib/types'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import Lightbox from './components/Lightbox'
import MemoryView from './components/MemoryView'
import SettingsPage from './components/SettingsPage'

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

  // 响应式：手机（<900px）默认收起侧栏，桌面默认弹出；打开页面时判定一次
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 899px)').matches)
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 899px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // 设置（持久化在 settings 表）
  const browseByTime = useLiveQuery(async () => (await db.settings.get('browseByTime'))?.value === true, [], false)
  const basemapSetting = useLiveQuery(async () => (await db.settings.get('basemap'))?.value as string | undefined, [])
  const basemapId = basemapSetting ?? DEFAULT_BASEMAP.id
  const sidebarOrderSetting = useLiveQuery(async () => (await db.settings.get('sidebarOrder'))?.value, [])
  const sidebarOrder = useMemo(() => normalizeSidebarOrder(sidebarOrderSetting), [sidebarOrderSetting])

  const handleBrowseByTimeChange = useCallback((v: boolean) => {
    void db.settings.put({ key: 'browseByTime', value: v })
  }, [])

  const handleBasemapChange = useCallback((id: string) => {
    void db.settings.put({ key: 'basemap', value: id })
  }, [])

  const handleSidebarOrderChange = useCallback((ids: string[]) => {
    void db.settings.put({ key: 'sidebarOrder', value: ids })
  }, [])

  // 窄屏下需要看到地图的交互（选行程/标点/看图）自动收起侧栏
  const closeSidebarOnMobile = useCallback(() => {
    if (window.matchMedia('(max-width: 899px)').matches) setSidebarOpen(false)
  }, [])

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
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** 灯箱导航范围：由打开入口决定（回忆板块 / 行程 / 全部已定位） */
  const [lightboxNav, setLightboxNav] = useState<PhotoRecord[] | null>(null)
  /** 地理就近链的起点 = 打开灯箱时的那张照片（浏览期间保持稳定，避免互为最近的往返死循环） */
  const [navStart, setNavStart] = useState<PhotoRecord | null>(null)

  // 灯箱导航范围：回忆板块显式列表 > 行程（时间序）> 全部已定位媒体（受"浏览顺序"设置控制）
  const lightboxPhotos = useMemo(() => {
    if (lightboxNav) return lightboxNav
    if (activeTrip) return activeTrip.photos
    if (!browseByTime && navStart) return nearestNeighborChain(locatedPhotos, navStart)
    return locatedPhotos
  }, [lightboxNav, activeTrip, locatedPhotos, browseByTime, navStart])

  // 行程轨迹：已定位照片按拍摄顺序连线
  const tripPath = useMemo<[number, number][] | null>(() => {
    if (!activeTrip) return null
    return activeTrip.photos
      .filter((p) => p.lat !== undefined && p.lng !== undefined)
      .map((p) => [p.lng as number, p.lat as number])
  }, [activeTrip])

  const cityFor = useCallback(
    (photo: PhotoRecord): string | undefined =>
      photo.lat !== undefined && photo.lng !== undefined && citiesRef.current
        ? findNearestCity(citiesRef.current, photo.lat, photo.lng)?.name
        : undefined,
    [],
  )

  /** 打开灯箱（真正的"新打开"）：重置导航范围与就近链起点 */
  const openLightbox = useCallback(
    (photo: PhotoRecord, navList?: PhotoRecord[]) => {
      closeSidebarOnMobile()
      setLightboxNav(navList ?? null)
      setNavStart(photo)
      setLightbox({ photo, cityName: cityFor(photo) })
    },
    [closeSidebarOnMobile, cityFor],
  )

  /** 灯箱内翻页：只换当前照片，不重置就近链起点（否则互为最近的 photos 会往返死循环） */
  const navigateLightbox = useCallback(
    (photo: PhotoRecord) => {
      setLightbox({ photo, cityName: cityFor(photo) })
    },
    [cityFor],
  )

  // 手动标点：侧栏选中 → 点击地图落点 → 写库并重算城市足迹
  const handlePlaceRequest = useCallback(
    (photo: PhotoRecord) => {
      closeSidebarOnMobile()
      setLightbox(null)
      setPlacement({ id: photo.id, name: photo.fileName })
    },
    [closeSidebarOnMobile],
  )

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

  const handleSelectTrip = useCallback(
    (trip: Trip) => {
      closeSidebarOnMobile()
      setActiveTrip(trip)
      const points = trip.photos
        .filter((p) => p.lat !== undefined && p.lng !== undefined)
        .map((p) => [p.lng as number, p.lat as number] as [number, number])
      if (points.length > 0) setFocus({ points, key: Date.now() })
    },
    [closeSidebarOnMobile],
  )

  const handleBackFromTrip = useCallback(() => setActiveTrip(null), [])

  const handleOpenMemory = useCallback(() => {
    setLightbox(null)
    closeSidebarOnMobile()
    setMemoryOpen(true)
  }, [closeSidebarOnMobile])

  const handleOpenSettings = useCallback(() => {
    setLightbox(null)
    closeSidebarOnMobile()
    setSettingsOpen(true)
  }, [closeSidebarOnMobile])

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
        sidebarOpen={sidebarOpen}
        sidebarOrder={sidebarOrder}
        onOpenMemory={handleOpenMemory}
        onOpenSettings={handleOpenSettings}
        onCloseSidebar={() => setSidebarOpen(false)}
        onImportDirectory={handleImportDirectory}
        onImportFiles={handleImportFiles}
        onSelectTrip={handleSelectTrip}
        onBackFromTrip={handleBackFromTrip}
        onOpenPhoto={openLightbox}
        onPlaceRequest={handlePlaceRequest}
        onCancelPlacement={handleCancelPlacement}
      />
      {!sidebarOpen && (
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开足迹面板"
          title="打开足迹面板"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="15" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      )}
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
          basemapId={basemapId}
        />
        {placement && (
          <div className="placement-banner">
            点击地图为「{placement.name}」选择位置 · Esc 取消
          </div>
        )}
        {photos.length === 0 && !dragging && (
          <div className="empty-hint">
            <p className="empty-title">{isNarrow ? '点击左上角的 ☰ 开始' : '把旅行照片文件夹拖到这里'}</p>
            <p className="empty-sub">照片不会上传——EXIF 里的位置和时间只保存在你自己的浏览器里</p>
          </div>
        )}
        {dragging && <div className="drop-hint">松手开始导入</div>}
      </main>
      {memoryOpen && (
        <MemoryView photos={photos} cities={cities} onClose={() => setMemoryOpen(false)} onOpenPhoto={openLightbox} />
      )}
      {settingsOpen && (
        <SettingsPage
          browseByTime={browseByTime}
          onBrowseByTimeChange={handleBrowseByTimeChange}
          basemapId={basemapId}
          onBasemapChange={handleBasemapChange}
          sidebarOrder={sidebarOrder}
          onSidebarOrderChange={handleSidebarOrderChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
        {lightbox && (
          <Lightbox
            photos={lightboxPhotos}
            entry={lightbox}
            onNavigate={navigateLightbox}
            onClose={() => setLightbox(null)}
          />
        )}
    </div>
  )
}
