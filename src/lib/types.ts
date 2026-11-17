/** 媒体记录（照片或视频）：缩略图与原图句柄分开存储，见 db.ts */
export interface PhotoRecord {
  /** 由 文件名+大小+修改时间+相对路径 哈希而来，用于去重 */
  id: string
  fileName: string
  /** 相对导入根目录的路径，如 `京都/IMG_001.jpg` */
  dirPath: string
  /** 媒体类型；旧记录缺省视为照片 */
  kind?: 'photo' | 'video'
  lat?: number
  lng?: number
  /** 拍摄时间（epoch ms），无 EXIF 时间时回退文件修改时间 */
  takenAt?: number
  timeSource: 'exif' | 'file'
  /** EXIF GPSImgDirection（度），用于未来的视角对齐 */
  gpsImgDirection?: number
  width?: number
  height?: number
  /** 缩略图规格版本，低于 THUMB_VERSION 的记录重新导入时自动重建 */
  thumbVersion?: number
  /** Chrome/Edge 下持久化的文件句柄，可用于查看原图 */
  handle?: unknown
}

/** 缩略图单独存表，避免列表查询把 Blob 一起载入内存 */
export interface ThumbRecord {
  id: string
  blob: Blob
}

/** 城市访问记录（点亮足迹） */
export interface CityVisit {
  cityId: number
  name: string
  lat: number
  lng: number
  firstVisitAt: number
  lastVisitAt: number
  count: number
}

/** 由照片按时间/距离分段聚合出的行程（实时计算，不持久化） */
export interface Trip {
  id: string
  startAt: number
  endAt: number
  photos: PhotoRecord[]
}

export interface ImportProgress {
  phase: 'scanning' | 'processing'
  current: number
  total: number
  fileName?: string
}

export interface ImportSummary {
  scanned: number
  imported: number
  skippedExisting: number
  noGps: number
  failed: number
  /** 重新生成缩略图的已存在记录数（缩略图版本升级时） */
  thumbRefreshed: number
}
