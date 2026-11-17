import exifr from 'exifr'

export interface PhotoExif {
  lat?: number
  lng?: number
  takenAt?: number
  gpsImgDirection?: number
}

/**
 * 把 exifr.parse 的结果映射为 PhotoExif。
 * 拆成纯函数方便单测；坐标合法性（范围、(0,0) 空值岛）在这里统一把关。
 */
export function exifToPhotoExif(data: Record<string, unknown> | undefined | null): PhotoExif | null {
  if (!data) return null

  const lat = typeof data.latitude === 'number' ? data.latitude : undefined
  const lng = typeof data.longitude === 'number' ? data.longitude : undefined
  const validCoord =
    lat !== undefined &&
    lng !== undefined &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0) // (0,0) 通常是"空值岛"

  let takenAt: number | undefined
  for (const key of ['DateTimeOriginal', 'CreateDate', 'DateTime']) {
    const v = data[key]
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      takenAt = v.getTime()
      break
    }
  }

  const dirRaw = data.GPSImgDirection
  let gpsImgDirection: number | undefined
  if (typeof dirRaw === 'number' && Number.isFinite(dirRaw)) {
    gpsImgDirection = dirRaw
  } else if (typeof dirRaw === 'string' && dirRaw.trim() !== '') {
    // 相机常以有理数字符串存储（如 "90/1"）
    const [num, den] = dirRaw.split('/').map(Number)
    if (den !== undefined && Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      gpsImgDirection = num / den
    } else if (Number.isFinite(num) && den === undefined) {
      gpsImgDirection = num
    }
  }

  if (!validCoord && takenAt === undefined) return null

  return {
    lat: validCoord ? lat : undefined,
    lng: validCoord ? lng : undefined,
    takenAt,
    gpsImgDirection:
      gpsImgDirection !== undefined && Number.isFinite(gpsImgDirection) ? gpsImgDirection : undefined,
  }
}

/** 读取单个照片文件的 EXIF（GPS / 拍摄时间 / 朝向）。解析失败返回 null。 */
export async function readPhotoExif(file: File): Promise<PhotoExif | null> {
  try {
    const data = await exifr.parse(file)
    return exifToPhotoExif(data as Record<string, unknown> | undefined)
  } catch {
    return null
  }
}
