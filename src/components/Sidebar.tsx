import { useMemo, useRef, useState } from 'react'
import type { CityEntry } from '../lib/cities'
import { onThisDay } from '../lib/memories'
import type { CityVisit, ImportProgress, ImportSummary, PhotoRecord, Trip } from '../lib/types'
import TripDetail from './TripDetail'

/** 打开时随机展示一句，点击可换 —— 文学家/名人的旅行名句 */
const QUOTES: { text: string; author?: string }[] = [
  { text: '世界是一本书，不旅行的人只读了其中一页。', author: '圣奥古斯丁' },
  { text: '群山在召唤，我必须出发。', author: '约翰·缪尔' },
  { text: '旅行最试验得出一个人的品行；旅行时最劳顿，最麻烦，叫人本相毕现。', author: '钱锺书《围城》' },
  { text: '世之奇伟、瑰怪、非常之观，常在于险远。', author: '王安石《游褒禅山记》' },
  { text: '五岳寻仙不辞远，一生好入名山游。', author: '李白《庐山谣》' },
  { text: '此心安处是吾乡。', author: '苏轼《定风波》' },
  { text: '大丈夫当朝碧海而暮苍梧。', author: '徐霞客' },
  { text: '我们所有探索的终点，是回到出发点，并第一次真正认识它。', author: '艾略特《四个四重奏》' },
  { text: '真正的发现之旅，不在于寻找新的风景，而在于拥有新的眼睛。', author: '普鲁斯特《追忆似水年华》' },
  { text: '旅行是消灭偏见、固执与狭隘的最好方式。', author: '马克·吐温《傻子出国记》' },
  { text: '既然选择了远方，便只顾风雨兼程。', author: '汪国真《热爱生命》' },
  { text: '旅行真正的快乐不在于目的地，而在于它的过程。', author: '三毛' },
]

interface SidebarProps {
  photos: PhotoRecord[]
  cityVisits: CityVisit[]
  trips: Trip[]
  progress: ImportProgress | null
  summary: ImportSummary | null
  importing: boolean
  canPickDirectory: boolean
  placement: { id: string; name: string } | null
  activeTrip: Trip | null
  cities: CityEntry[] | null
  sidebarOpen: boolean
  onCloseSidebar: () => void
  onOpenMemory: () => void
  onImportDirectory: () => void
  onImportFiles: (files: FileList | File[]) => void
  onSelectTrip: (trip: Trip) => void
  onBackFromTrip: () => void
  onOpenPhoto: (photo: PhotoRecord) => void
  onPlaceRequest: (photo: PhotoRecord) => void
  onCancelPlacement: () => void
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function Sidebar({
  photos,
  cityVisits,
  trips,
  progress,
  summary,
  importing,
  canPickDirectory,
  placement,
  activeTrip,
  cities,
  sidebarOpen,
  onCloseSidebar,
  onOpenMemory,
  onImportDirectory,
  onImportFiles,
  onSelectTrip,
  onBackFromTrip,
  onOpenPhoto,
  onPlaceRequest,
  onCancelPlacement,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const located = photos.filter((p) => p.lat !== undefined && p.lng !== undefined)
  const noGps = photos.length - located.length
  const videoCount = photos.filter((p) => p.kind === 'video').length
  const undetermined = photos.filter((p) => p.lat === undefined)

  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length))
  const quote = QUOTES[quoteIndex]

  const welcomeLine = useMemo(() => {
    if (photos.length === 0) return '把手边的照片交给地图，让足迹自己讲故事。'
    const parts = [`已点亮 ${cityVisits.length} 座城市`, `${trips.length} 段旅程`]
    const last = trips.length > 0 ? trips[trips.length - 1].endAt : null
    if (last) {
      const days = Math.max(0, Math.floor((Date.now() - last) / 86400000))
      parts.push(days === 0 ? '最近一次出发就在今天' : `上次出发 · ${days} 天前`)
    }
    return parts.join(' · ')
  }, [photos.length, cityVisits.length, trips])

  const todayMemories = useMemo(() => onThisDay(photos), [photos])

  return (
    <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
      <header className="brand">
        <div className="brand-top">
          <div className="brand-mark">FOOTPRINT ALBUM</div>
          <button className="sidebar-close" onClick={onCloseSidebar} aria-label="收起面板" title="收起面板">
            ×
          </button>
        </div>
        <button
          className="brand-quote"
          onClick={() => setQuoteIndex((i) => (i + 1) % QUOTES.length)}
          title="换一句"
        >
          <span className="brand-quote-text">“{quote.text}”</span>
          {quote.author && <span className="brand-quote-author">—— {quote.author}</span>}
        </button>
        <div className="brand-line">{welcomeLine}</div>
      </header>

      <section className="panel">
        <div className="btn-row">
          {canPickDirectory && (
            <button className="btn primary" disabled={importing} onClick={onImportDirectory}>
              选择文件夹导入
            </button>
          )}
          <button className="btn" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            选择照片
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onImportFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <p className="hint">也可以把整个文件夹拖进右侧地图。照片 JPEG / PNG / WebP · 视频 MP4 / MOV。</p>

        {progress && (
          <div className="progress-block">
            <div className="progress-line">
              {progress.phase === 'scanning' ? '正在扫描文件夹…' : `正在处理 ${progress.current} / ${progress.total}`}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '10%' }}
              />
            </div>
            {progress.fileName && <div className="progress-file">{progress.fileName}</div>}
          </div>
        )}

        {summary && !importing && (
          <p className="import-summary">
            扫描 {summary.scanned} 张 · 新增 {summary.imported} · 已存在 {summary.skippedExisting}
            {summary.thumbRefreshed > 0 && ` · 升级缩略图 ${summary.thumbRefreshed}`} · 无定位 {summary.noGps} · 失败{' '}
            {summary.failed}
          </p>
        )}
      </section>

      <section className="panel">
        <div className="stats">
          <div className="stat">
            <span className="stat-num">{photos.length}</span>
            <span className="stat-label">媒体</span>
          </div>
          <div className="stat">
            <span className="stat-num">{located.length}</span>
            <span className="stat-label">已定位</span>
          </div>
          <div className="stat">
            <span className="stat-num">{cityVisits.length}</span>
            <span className="stat-label">城市</span>
          </div>
          <div className="stat">
            <span className="stat-num">{trips.length}</span>
            <span className="stat-label">行程</span>
          </div>
        </div>
        <p className="hint">
          {videoCount > 0 && `含 ${videoCount} 个视频 · `}
          {noGps > 0 ? `${noGps} 个媒体没有 GPS，可在下方手动标点` : '全部媒体已定位'}
        </p>
      </section>

      {activeTrip ? (
        <TripDetail trip={activeTrip} cities={cities} onBack={onBackFromTrip} onOpenPhoto={onOpenPhoto} />
      ) : (
        <>
          {photos.length > 0 && (
            <section className="panel">
              <h2>回忆</h2>
              {todayMemories.length > 0 ? (
                <button className="memory-highlight" onClick={onOpenMemory}>
                  ✨ {todayMemories.reduce((s, g) => s + g.photos.length, 0)} 张照片来自{' '}
                  {todayMemories.length} 年前的今天 · 点开看看
                </button>
              ) : (
                <button className="btn memory-open-btn" onClick={onOpenMemory}>
                  打开回忆视图
                </button>
              )}
            </section>
          )}
          {undetermined.length > 0 && (
            <section className="panel">
              <h2>手动标点</h2>
          <ul className="place-list">
            {undetermined.map((p) => {
              const active = placement?.id === p.id
              return (
                <li key={p.id}>
                  <button
                    className={`place-item${active ? ' active' : ''}`}
                    onClick={() => (active ? onCancelPlacement() : onPlaceRequest(p))}
                  >
                    <span>{p.kind === 'video' ? '🎬' : '🖼'}</span>
                    <span className="place-name" title={p.dirPath}>
                      {p.fileName}
                    </span>
                    <span className="place-action">{active ? '取消' : '标点'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {cityVisits.length > 0 && (
        <section className="panel">
          <h2>点亮的城市</h2>
          <div className="chips">
            {cityVisits.map((c) => (
              <span key={c.cityId} className="chip" title={`首次到访 ${fmtDate(c.firstVisitAt)} · ${c.count} 张照片`}>
                {c.name}
                {c.count > 1 && <em> ×{c.count}</em>}
              </span>
            ))}
          </div>
        </section>
      )}

          {trips.length > 0 && (
            <section className="panel">
              <h2>旅行行程</h2>
              <ul className="trip-list">
                {trips.map((t) => (
                  <li key={t.id}>
                    <button className="trip-item" onClick={() => onSelectTrip(t)}>
                      <span className="trip-date">
                        {fmtDate(t.startAt)}
                        {fmtDate(t.startAt) !== fmtDate(t.endAt) && ` – ${fmtDate(t.endAt)}`}
                      </span>
                      <span className="trip-count">{t.photos.length} 张</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <footer className="sidebar-footer">
        数据保存在本机浏览器 IndexedDB ·{' '}
        <a href="https://github.com/ElouDi/footprint-album" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </aside>
  )
}
