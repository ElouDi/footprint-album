// 从 Natural Earth populated places 生成内置城市数据 public/data/cities.json
// 元组格式：[名称, 纬度, 经度, 人口]，按人口倒序，供 src/lib/cities.ts 离线就近匹配使用
// 用法：npm run build-cities

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
mkdirSync(outDir, { recursive: true })

console.log(`下载 ${URL} …`)
const res = await fetch(URL)
if (!res.ok) {
  console.error(`下载失败: ${res.status} ${res.statusText}`)
  process.exit(1)
}
const geojson = await res.json()

const tuples = []
for (const feature of geojson.features ?? []) {
  const p = feature.properties ?? {}
  const name = (p.name ?? p.nameascii ?? '').trim()
  const [lng, lat] = feature.geometry?.coordinates ?? []
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') continue
  tuples.push([name, Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000, p.pop_max ?? 0])
}
tuples.sort((a, b) => b[3] - a[3])

// Natural Earth 缺失的日本中型城市补充（含五个重点城市中的奈良、镰仓）
const JP_SUPPLEMENT = [
  ['Saitama', 35.862, 139.648, 1321000],
  ['Chiba', 35.607, 140.106, 975000],
  ['Nara', 34.685, 135.805, 367000],
  ['Yamaguchi', 34.176, 131.472, 193000],
  ['Saga', 33.249, 130.299, 232000],
  ['Naha', 26.212, 127.68, 315000],
  ['Kamakura', 35.319, 139.546, 172000],
]
tuples.push(...JP_SUPPLEMENT)

writeFileSync(join(outDir, 'cities.json'), JSON.stringify(tuples))
console.log(`已生成 ${tuples.length} 个城市 → public/data/cities.json`)
