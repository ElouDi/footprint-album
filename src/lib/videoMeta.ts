/**
 * MP4 / MOV 容器的拍摄元数据（GPS / 创建时间）解析。
 *
 * 手机视频的位置信息通常写在：
 * - iPhone（QuickTime 风格）：moov/udta/meta/ilst 下的 `©xyz`（ISO6709 字符串）与 `©day`（拍摄时间）
 * - Android（3GPP 风格）：moov/udta/loci（固定点数坐标）
 * 兜底：moov/mvhd 的创建时间（Mac 纪元，无时区信息，仅近似）。
 *
 * 只读取顶层 box 头定位 moov（mdat 可达数 GB，绝不整读文件）。
 */

export interface VideoMeta {
  lat?: number
  lng?: number
  takenAt?: number
}

interface Box {
  type: string
  /** 内容起始（不含 box 头） */
  start: number
  /** box 结束（含头） */
  end: number
}

const MAC_EPOCH_OFFSET_S = 2082844800 // 1904-01-01 → 1970-01-01

function boxType(view: DataView, offset: number): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(offset + i))
  return s
}

/** 顺序读取 [start, end) 区间内的兄弟 box */
function readBoxes(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = []
  let pos = start
  while (pos + 8 <= end) {
    let size = view.getUint32(pos)
    const type = boxType(view, pos + 4)
    let header = 8
    if (size === 1) {
      size = Number(view.getBigUint64(pos + 8))
      header = 16
    } else if (size === 0) {
      size = end - pos
    }
    if (size < header || pos + size > end) break
    boxes.push({ type, start: pos + header, end: pos + size })
    pos += size
  }
  return boxes
}

function decodeText(view: DataView, start: number, end: number): string {
  return new TextDecoder().decode(new Uint8Array(view.buffer, start, end - start))
}

/** 解析 ilst 项：data box 的 payload。返回 key → 文本值 */
function parseIlst(view: DataView, ilst: Box): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const item of readBoxes(view, ilst.start, ilst.end)) {
    const subs = readBoxes(view, item.start, item.end)
    const data = subs.find((b) => b.type === 'data')
    if (!data || data.end - data.start < 8) continue
    // data box：4B version/flags（flags 最低字节标识类型：1=UTF-8 文本）+ 4B locale + payload
    const typeIndicator = view.getUint8(data.start + 3)
    const payloadStart = data.start + 8
    if (typeIndicator === 1) {
      entries[item.type] = decodeText(view, payloadStart, data.end)
    } else if (item.type === '----') {
      // iTunes 长键名风格：mean/name 子 box 携带键名
      const name = subs.find((b) => b.type === 'name')
      if (name) entries[decodeText(view, name.start, name.end)] = decodeText(view, payloadStart, data.end)
    }
    // 其余类型（整数/封面等）与位置、时间无关，跳过
  }
  return entries
}

/**
 * ISO6709 位置字符串 → 十进制度。兼容两种写法：
 * - "+35.7101+139.8107/"（十进制度）
 * - "+3542.6060+13945.6420/"（度分：纬度 4 位整数 = DDMM，经度 5 位 = DDDMM）
 */
export function parseISO6709(s: string): { lat: number; lng: number } | null {
  const tokens = s.match(/[+-]\d+(\.\d+)?/g)
  if (!tokens || tokens.length < 2) return null
  const toDeg = (token: string): number | null => {
    const sign = token[0] === '-' ? -1 : 1
    const body = token.slice(1)
    const dot = body.indexOf('.')
    const intLen = dot === -1 ? body.length : dot
    let deg: number
    let value: number
    if (intLen >= 5) {
      deg = parseInt(body.slice(0, 3), 10)
      value = deg + parseFloat(body.slice(3)) / 60
    } else if (intLen === 4) {
      deg = parseInt(body.slice(0, 2), 10)
      value = deg + parseFloat(body.slice(2)) / 60
    } else {
      value = parseFloat(body)
    }
    return Number.isNaN(value) ? null : sign * value
  }
  const lat = toDeg(tokens[0])
  const lng = toDeg(tokens[1])
  if (lat === null || lng === null) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null
  return { lat, lng }
}

/** 3GPP loci box → 十进制度坐标 */
export function parseLoci(
  view: DataView,
  box: { start: number; end: number },
): { lat: number; lng: number } | null {
  try {
    let p = box.start + 4 // version/flags
    p += 2 // 语言码（3×5bit 打包）
    while (p < box.end && view.getUint8(p) !== 0) p++ // 位置名（null 结尾）
    p += 1
    p += 1 // role
    const lat = view.getInt32(p) / 65536
    const lng = view.getInt32(p + 4) / 65536
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

/** mvhd 创建时间（Mac 纪元秒，1904 起）→ epoch ms */
export function mvhdCreationToMs(creationSeconds: number): number | undefined {
  if (creationSeconds <= 0) return undefined
  const ms = (creationSeconds - MAC_EPOCH_OFFSET_S) * 1000
  // 合理性：1980–2100 之间
  if (ms < 315532800000 || ms > 4102444800000) return undefined
  return ms
}

export function mvhdTime(view: DataView, mvhd: { start: number; end: number }): number | undefined {
  try {
    const version = view.getUint8(mvhd.start)
    if (version === 1) {
      const creation = Number(view.getBigUint64(mvhd.start + 4))
      return mvhdCreationToMs(creation)
    }
    return mvhdCreationToMs(view.getUint32(mvhd.start + 4))
  } catch {
    return undefined
  }
}

export async function readVideoMeta(file: File): Promise<VideoMeta | null> {
  try {
    // 1) 顺序读顶层 box 头，定位 moov
    const topBoxes: { type: string; offset: number; size: number }[] = []
    let pos = 0
    while (pos + 8 <= file.size) {
      const head = new DataView(await file.slice(pos, pos + 16).arrayBuffer())
      let boxSize = head.getUint32(0)
      const type = boxType(head, 4)
      let header = 8
      if (boxSize === 1) {
        boxSize = Number(head.getBigUint64(8))
        header = 16
      } else if (boxSize === 0) {
        boxSize = file.size - pos
      }
      if (boxSize < header) break
      topBoxes.push({ type, offset: pos, size: boxSize })
      pos += boxSize
    }
    const moovTop = topBoxes.find((b) => b.type === 'moov')
    if (!moovTop || moovTop.size > 64 * 1024 * 1024) return null

    // 2) 读入 moov（通常 < 数 MB）
    const buf = await file.slice(moovTop.offset, moovTop.offset + moovTop.size).arrayBuffer()
    const view = new DataView(buf)
    const moovBox = readBoxes(view, 0, buf.byteLength).find((b) => b.type === 'moov')
    if (!moovBox) return null
    const moovChildren = readBoxes(view, moovBox.start, moovBox.end)
    const udta = moovChildren.find((b) => b.type === 'udta')

    const meta: VideoMeta = {}

    // 3) QuickTime 风格 ilst（udta/meta 或 moov/meta 下）
    const metaBoxes = [
      ...(udta ? readBoxes(view, udta.start, udta.end) : []),
      ...moovChildren,
    ].filter((b) => b.type === 'meta')
    for (const mb of metaBoxes) {
      const ilst = readBoxes(view, mb.start + 4, mb.end).find((b) => b.type === 'ilst')
      if (!ilst) continue
      const entries = parseIlst(view, ilst)
      if (meta.lat === undefined) {
        const loc = entries['©xyz'] ?? Object.entries(entries).find(([k]) => k.includes('location.ISO6709'))?.[1]
        const parsed = loc ? parseISO6709(loc) : null
        if (parsed) {
          meta.lat = parsed.lat
          meta.lng = parsed.lng
        }
      }
      if (meta.takenAt === undefined) {
        const dateStr =
          entries['©day'] ?? Object.entries(entries).find(([k]) => k.toLowerCase().includes('creationdate'))?.[1]
        if (dateStr) {
          const t = Date.parse(dateStr)
          if (!Number.isNaN(t)) meta.takenAt = t
        }
      }
    }

    // 4) 3GPP loci（Android 风格）
    if (meta.lat === undefined && udta) {
      const loci = readBoxes(view, udta.start, udta.end).find((b) => b.type === 'loci')
      const parsed = loci ? parseLoci(view, loci) : null
      if (parsed) {
        meta.lat = parsed.lat
        meta.lng = parsed.lng
      }
    }

    // 5) mvhd 创建时间兜底
    if (meta.takenAt === undefined) {
      const mvhd = moovChildren.find((b) => b.type === 'mvhd')
      if (mvhd) meta.takenAt = mvhdTime(view, mvhd)
    }

    if (meta.lat === undefined && meta.takenAt === undefined) return null
    return meta
  } catch {
    return null
  }
}
