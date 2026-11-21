/**
 * 坐标 → 外部地图服务的跳转链接。
 * 用 Google 官方 Maps URL API（免费、无需 key）：map_action=pano 打开对应位置最近的全景街景。
 */

export function googleStreetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}`
}

export function osmUrl(lat: number, lng: number): string {
  const la = lat.toFixed(6)
  const lo = lng.toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`
}
