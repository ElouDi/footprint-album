import { useEffect, useMemo, useState } from 'react'
import type { CityEntry } from '../lib/cities'
import { multiYearCities, onThisDay, type CityYearGroup, type YearGroup } from '../lib/memories'
import type { PhotoRecord } from '../lib/types'
import { thumbUrl } from '../lib/thumbUrls'

interface MemoryViewProps {
  photos: PhotoRecord[]
  cities: CityEntry[] | null
  onClose: () => void
  /** 第二个参数是该板块的照片列表，灯箱在此范围内导航 */
  onOpenPhoto: (photo: PhotoRecord, navList: PhotoRecord[]) => void
}

function Thumb({ photo }: { photo: PhotoRecord }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void thumbUrl(photo.id).then((u) => {
      if (live && u) setUrl(u)
    })
    return () => {
      live = false
    }
  }, [photo.id])
  if (!url) return <div className="thumb-fallback">{photo.kind === 'video' ? '🎬' : '🖼'}</div>
  return <img src={url} alt={photo.fileName} loading="lazy" />
}

function PhotoGrid({ list, onOpenPhoto }: { list: PhotoRecord[]; onOpenPhoto: MemoryViewProps['onOpenPhoto'] }) {
  return (
    <div className="photo-grid memory-grid">
      {list.map((p) => (
        <button key={p.id} className="photo-cell" title={p.dirPath} onClick={() => onOpenPhoto(p, list)}>
          <Thumb photo={p} />
          {p.kind === 'video' && <span className="cell-video">▶</span>}
        </button>
      ))}
    </div>
  )
}

export default function MemoryView({ photos, cities, onClose, onOpenPhoto }: MemoryViewProps) {
  const now = new Date()
  const todayGroups = onThisDay(photos, now)
  const cityGroups = useMemo<CityYearGroup[]>(() => (cities ? multiYearCities(photos, cities) : []), [photos, cities])
  const [selectedCity, setSelectedCity] = useState<CityYearGroup | null>(null)

  // 城市分组随 cities 加载完成后更新默认选中
  useEffect(() => {
    if (!selectedCity && cityGroups.length > 0) setSelectedCity(cityGroups[0])
  }, [cityGroups, selectedCity])

  const todayCount = todayGroups.reduce((s, g) => s + g.photos.length, 0)

  const renderYearSections = (groups: YearGroup[], prefix: (y: number) => string) => (
    <>
      {groups.map((g) => (
        <div key={g.year}>
          <div className="year-header">{prefix(g.year)}</div>
          <PhotoGrid list={g.photos} onOpenPhoto={onOpenPhoto} />
        </div>
      ))}
    </>
  )

  return (
    <div className="memory-view" onClick={onClose}>
      <div className="memory-inner" onClick={(e) => e.stopPropagation()}>
        <header className="memory-head">
          <div>
            <div className="memory-title">回忆</div>
            <div className="memory-sub">
              {now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日
            </div>
          </div>
          <button className="sidebar-close memory-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <section className="panel">
          <h2>✨ {todayCount > 0 ? `${todayCount} 张来自往年的今天` : 'N 年前的今天'}</h2>
          {todayGroups.length > 0 ? (
            renderYearSections(todayGroups, (y) => `${now.getFullYear() - y} 年前 · ${y}`)
          ) : (
            <p className="hint">今天没有往年的回忆——继续走下去，明年这里会有故事。</p>
          )}
        </section>

        {cityGroups.length > 0 && (
          <section className="panel">
            <h2>同一座城市，不同年份</h2>
            <div className="chips">
              {cityGroups.map((c) => (
                <button
                  key={c.cityId}
                  className={`chip chip-btn${selectedCity?.cityId === c.cityId ? ' chip-active' : ''}`}
                  onClick={() => setSelectedCity(c)}
                >
                  {c.name} · {c.years.length} 个年份
                </button>
              ))}
            </div>
            {selectedCity && (
              <div className="memory-city-body">
                {renderYearSections(selectedCity.years, (y) => `${y} 年`)}
              </div>
            )}
          </section>
        )}

        {photos.length === 0 && <p className="hint">先导入一些带定位的照片，回忆会自己长出来。</p>}
      </div>
    </div>
  )
}
