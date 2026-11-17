import { useEffect, useMemo, useState } from 'react'
import { groupByDay } from '../lib/cluster'
import { findNearestCity, type CityEntry } from '../lib/cities'
import { thumbUrl } from '../lib/thumbUrls'
import type { PhotoRecord, Trip } from '../lib/types'

interface TripDetailProps {
  trip: Trip
  cities: CityEntry[] | null
  onBack: () => void
  onOpenPhoto: (photo: PhotoRecord) => void
}

function fmtRange(startAt: number, endAt: number): string {
  const fmt = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }
  return fmt(startAt) === fmt(endAt) ? fmt(startAt) : `${fmt(startAt)} – ${fmt(endAt)}`
}

function fmtDay(ms: number): string {
  const d = new Date(ms)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`
}

/** 懒加载缩略图的网格单元 */
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
  if (!url) {
    return <div className="thumb-fallback">{photo.kind === 'video' ? '🎬' : '🖼'}</div>
  }
  return <img src={url} alt={photo.fileName} loading="lazy" />
}

export default function TripDetail({ trip, cities, onBack, onOpenPhoto }: TripDetailProps) {
  const days = useMemo(() => groupByDay(trip.photos), [trip])

  // 行程涉及的城市（按坐标就近匹配，去重）
  const cityNames = useMemo(() => {
    if (!cities) return []
    const names = new Set<string>()
    for (const p of trip.photos) {
      if (p.lat !== undefined && p.lng !== undefined) {
        const c = findNearestCity(cities, p.lat, p.lng)
        if (c) names.add(c.name)
      }
    }
    return [...names]
  }, [trip, cities])

  const videoCount = trip.photos.filter((p) => p.kind === 'video').length

  return (
    <div className="trip-detail">
      <button className="trip-back" onClick={onBack}>
        ‹ 返回足迹
      </button>

      <div className="trip-head">
        <div className="trip-title">{fmtRange(trip.startAt, trip.endAt)}</div>
        <div className="trip-meta">
          {days.size} 天 · {trip.photos.length} 张{videoCount > 0 && ` · ${videoCount} 视频`}
          {cityNames.length > 0 && ` · ${cityNames.join(' · ')}`}
        </div>
        <div className="trip-path-hint">地图上的蓝色轨迹按拍摄顺序连接</div>
      </div>

      {[...days.entries()].map(([day, list]) => (
        <section className="panel day-group" key={day}>
          <div className="day-header">
            <span className="day-name">{fmtDay(list[0].takenAt as number)}</span>
            <span className="day-count">{list.length} 项</span>
          </div>
          <div className="photo-grid">
            {list.map((p) => (
              <button
                key={p.id}
                className={`photo-cell${p.lat === undefined ? ' no-locate' : ''}`}
                title={p.dirPath}
                onClick={() => onOpenPhoto(p)}
              >
                <Thumb photo={p} />
                {p.kind === 'video' && <span className="cell-video">▶</span>}
                {p.lat === undefined && <span className="cell-tag">无定位</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
