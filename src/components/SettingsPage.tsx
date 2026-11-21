import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { BASEMAPS } from '../lib/basemaps'
import { SIDEBAR_SECTION_NAMES, type SidebarSectionId } from '../lib/sidebarOrder'

interface SettingsPageProps {
  browseByTime: boolean
  onBrowseByTimeChange: (v: boolean) => void
  basemapId: string
  onBasemapChange: (id: string) => void
  sidebarOrder: string[]
  onSidebarOrderChange: (ids: string[]) => void
  onClose: () => void
}

const VERSION = '0.1.0'
const REPO_URL = 'https://github.com/ElouDi/footprint-album'

export default function SettingsPage({
  browseByTime,
  onBrowseByTimeChange,
  basemapId,
  onBasemapChange,
  sidebarOrder,
  onSidebarOrderChange,
  onClose,
}: SettingsPageProps) {
  const mediaCount = useLiveQuery(() => db.photos.count(), [], 0)
  const thumbCount = useLiveQuery(() => db.thumbs.count(), [], 0)
  const [clearArmed, setClearArmed] = useState(false)

  // 进入页面后 5 秒未确认，解除"清除"武装状态
  useEffect(() => {
    if (!clearArmed) return
    const timer = setTimeout(() => setClearArmed(false), 5000)
    return () => clearTimeout(timer)
  }, [clearArmed])

  const move = (index: number, delta: number) => {
    const next = [...sidebarOrder]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onSidebarOrderChange(next)
  }

  const handleClearData = async () => {
    if (!clearArmed) {
      setClearArmed(true)
      return
    }
    await Promise.all([
      db.photos.clear(),
      db.thumbs.clear(),
      db.cityVisits.clear(),
      db.geocodes.clear(),
      db.settings.clear(),
    ])
    window.location.reload()
  }

  return (
    <div className="settings-view" onClick={onClose}>
      <div className="settings-inner" onClick={(e) => e.stopPropagation()}>
        <header className="memory-head">
          <div>
            <div className="memory-title">设置</div>
            <div className="memory-sub">所有调整保存在本机浏览器</div>
          </div>
          <button className="sidebar-close memory-close" onClick={onClose} aria-label="关闭设置">
            ×
          </button>
        </header>

        <section className="panel">
          <h2>浏览</h2>
          <label className="setting-row">
            <div>
              <div className="setting-name">按拍摄时间浏览</div>
              <div className="setting-desc">
                开启后"下一张"按拍摄时间顺序；关闭时跳到地理位置最近的照片（行程内始终按时间）
              </div>
            </div>
            <span className="switch">
              <input
                type="checkbox"
                checked={browseByTime}
                onChange={(e) => onBrowseByTimeChange(e.target.checked)}
              />
              <span className="track" />
              <span className="thumb" />
            </span>
          </label>
        </section>

        <section className="panel">
          <h2>地图</h2>
          <label className="setting-row">
            <div>
              <div className="setting-name">底图</div>
              <div className="setting-desc">默认 Esri 卫星影像（无 key、可达）；OSM 在大陆网络不可达</div>
            </div>
            <select className="setting-select" value={basemapId} onChange={(e) => onBasemapChange(e.target.value)}>
              {BASEMAPS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel">
          <h2>侧栏栏目顺序</h2>
          <p className="hint" style={{ margin: '0 0 8px' }}>
            上下调整侧栏里各栏的出现顺序
          </p>
          <ul className="order-list">
            {sidebarOrder.map((id, i) => (
              <li key={id} className="order-row">
                <span className="order-name">{SIDEBAR_SECTION_NAMES[id as SidebarSectionId] ?? id}</span>
                <span className="order-btns">
                  <button
                    className="order-btn"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="上移"
                  >
                    ↑
                  </button>
                  <button
                    className="order-btn"
                    disabled={i === sidebarOrder.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="下移"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button
            className="order-reset"
            onClick={() =>
              onSidebarOrderChange(
                Object.keys(SIDEBAR_SECTION_NAMES) as SidebarSectionId[],
              )
            }
          >
            恢复默认顺序
          </button>
        </section>

        <section className="panel">
          <h2>数据</h2>
          <div className="setting-row" style={{ paddingTop: 0 }}>
            <div>
              <div className="setting-name">本机占用</div>
              <div className="setting-desc">
                {mediaCount} 条媒体记录 · {thumbCount} 张缩略图 · 另有城市足迹与地名缓存
              </div>
            </div>
          </div>
          <button
            className={`danger-btn${clearArmed ? ' armed' : ''}`}
            onClick={() => void handleClearData()}
          >
            {clearArmed ? '再次点击确认清除（不可恢复）' : '清除所有数据…'}
          </button>
          <p className="hint">清除后回到首次打开的状态；照片原文件不受影响，可重新导入。</p>
        </section>

        <section className="panel">
          <h2>关于</h2>
          <div className="about-row">
            <span>足迹相册 Footprint Album</span>
            <span className="about-version">v{VERSION}</span>
          </div>
          <div className="about-row">
            <a className="about-link" href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub 仓库 ↗
            </a>
          </div>
          <p className="hint">
            地图与地名数据来自 Esri、OpenStreetMap 社区与 Natural Earth，感谢所有贡献者。
            打开媒体详情时会向 OSM Nominatim 发送一次坐标做逆地理解析。
          </p>
        </section>
      </div>
    </div>
  )
}
