import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import exifr from 'exifr'
import { db } from '../lib/db'
import { BASEMAPS } from '../lib/basemaps'
import { readPhotoExif } from '../lib/exif'
import { downloadBackup, validateBackup, type BackupFile } from '../lib/backup'
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
  const [exporting, setExporting] = useState(false)
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [diagFields, setDiagFields] = useState<[string, string][] | null>(null)
  const [diagLocated, setDiagLocated] = useState<boolean | null>(null)
  const diagInputRef = useRef<HTMLInputElement>(null)

  // EXIF 诊断：展示解析器从文件里实际读到的原始字段，用于定位"读不到位置"的问题
  const handleDiagFile = (file: File) => {
    setDiagFields(null)
    setDiagLocated(null)
    void (async () => {
      const fields: [string, string][] = [['文件名', file.name]]
      try {
        const data = (await exifr.parse(file)) as Record<string, unknown> | undefined
        const keys = [
          'Make',
          'Model',
          'latitude',
          'longitude',
          'GPSLatitude',
          'GPSLongitude',
          'GPSLatitudeRef',
          'GPSLongitudeRef',
          'GPSImgDirection',
          'DateTimeOriginal',
          'CreateDate',
        ]
        for (const k of keys) {
          const v = data?.[k]
          if (v !== undefined) {
            fields.push([k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
          }
        }
        if (fields.length === 1) fields.push(['EXIF', '整个文件里没有任何 EXIF 字段——GPS 大概率在传输时被抹掉了'])
        const exif = await readPhotoExif(file)
        setDiagLocated(!!exif?.lat)
      } catch (e) {
        fields.push(['解析失败', String(e)])
        setDiagLocated(false)
      }
      setDiagFields(fields)
    })()
  }

  const handleImportFile = (file: File) => {
    setPendingImport(null)
    setImportError(null)
    void (async () => {
      try {
        const json = JSON.parse(await file.text())
        const check = validateBackup(json)
        if (!check.ok) {
          setImportError(check.reason)
          return
        }
        setPendingImport(check.data)
      } catch {
        setImportError('文件读取失败')
      }
    })()
  }

  const handleRestore = async () => {
    if (!pendingImport) return
    await import('../lib/backup').then((m) => m.restoreBackup(pendingImport))
    window.location.reload()
  }

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
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button
              className="btn"
              disabled={exporting || mediaCount === 0}
              onClick={() => {
                setExporting(true)
                void downloadBackup().finally(() => setExporting(false))
              }}
            >
              {exporting ? '正在导出…' : '导出备份（JSON）'}
            </button>
            <button className="btn" onClick={() => importInputRef.current?.click()}>
              导入备份…
            </button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImportFile(f)
              e.target.value = ''
            }}
          />
          {importError && <p className="import-error">{importError}</p>}
          {pendingImport && (
            <div className="import-confirm">
              <p className="hint">
                已读取备份：{pendingImport.photos.length} 张媒体 · {pendingImport.thumbs.length} 张缩略图 · 导出于{' '}
                {new Date(pendingImport.exportedAt).toLocaleString('zh-CN')}
              </p>
              <button className="danger-btn armed" onClick={() => void handleRestore()}>
                确认导入（覆盖当前数据）
              </button>
            </div>
          )}
          <button
            className={`danger-btn${clearArmed ? ' armed' : ''}`}
            onClick={() => void handleClearData()}
            style={{ marginTop: 10 }}
          >
            {clearArmed ? '再次点击确认清除（不可恢复）' : '清除所有数据…'}
          </button>
          <p className="hint">备份与清除只影响本机浏览器里的数据；照片原文件始终在你的磁盘上，可重新导入。</p>
        </section>

        <section className="panel">
          <h2>EXIF 诊断</h2>
          <p className="hint" style={{ margin: '0 0 8px' }}>
            选一张照片，看看解析器实际读到了什么——用来排查"谷歌相册能识别位置，这里读不到"的问题
          </p>
          <button className="btn" onClick={() => diagInputRef.current?.click()}>
            选择照片诊断
          </button>
          <input
            ref={diagInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,image/heic,image/heif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleDiagFile(f)
              e.target.value = ''
            }}
          />
          {diagLocated !== null && (
            <p className="hint" style={{ marginTop: 8 }}>
              {diagLocated
                ? '✅ 成功读到 GPS 坐标——这张照片的地点信息是完好的'
                : '❌ 没有读到可用的 GPS 坐标——这张文件的定位信息已被抹除或缺失'}
            </p>
          )}
          {diagFields && (
            <div className="diag-table">
              {diagFields.map(([k, v]) => (
                <div key={k} className="diag-row">
                  <span className="diag-key">{k}</span>
                  <span className="diag-value">{v}</span>
                </div>
              ))}
            </div>
          )}
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
