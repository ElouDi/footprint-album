// EXIF 分析脚本：node scripts/analyze-exif.mjs <照片路径...>
// 输出文件容器签名 + 解析器读到的全部字段 + 定位判定
import exifr from 'exifr'
import { readFileSync } from 'node:fs'

const paths = process.argv.slice(2)
if (paths.length === 0) {
  console.error('用法: node scripts/analyze-exif.mjs <照片路径...>')
  process.exit(1)
}

function containerOf(head) {
  if (head[0] === 0xff && head[1] === 0xd8) return 'JPEG'
  if (head[0] === 0x89 && head[1] === 0x50) return 'PNG'
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    return `HEIF/MP4 容器（品牌: ${String.fromCharCode(...head.subarray(8, 12))}）`
  }
  return '未知容器'
}

for (const path of paths) {
  const buf = readFileSync(path)
  const head = buf.subarray(0, 16)
  const hex = [...head].map((b) => b.toString(16).padStart(2, '0')).join(' ')
  console.log(`\n═══ ${path} ═══`)
  console.log(`大小: ${(buf.length / 1024).toFixed(0)} KB | 文件头: ${hex} | 容器: ${containerOf(head)}`)
  try {
    const data = (await exifr.parse(buf)) ?? {}
    const keys = Object.keys(data).sort()
    if (keys.length === 0) {
      console.log('EXIF: 未解析出任何字段——元数据可能已被剥离')
      continue
    }
    for (const k of keys) {
      const v = data[k]
      console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    }
    console.log(`判定: ${typeof data.latitude === 'number' && Number.isFinite(data.latitude) ? '✅ 有 GPS 坐标' : '❌ 无可用 GPS 坐标'}`)
  } catch (e) {
    console.log(`解析失败: ${e.message}`)
  }
}
