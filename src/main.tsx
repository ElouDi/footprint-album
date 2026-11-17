import React from 'react'
import ReactDOM from 'react-dom/client'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App'

// 使用自包含的经典 worker（.cjs 后缀触发 maplibre 的 classic Worker 路径），
// 规避模块 Worker 在部分环境（Vite dev 预打包 / 内嵌浏览器）下静默失败导致瓦片不渲染。
// 文件由 npm run build:worker 生成；升级 maplibre-gl 后需重新生成。
maplibregl.setWorkerUrl(`${import.meta.env.BASE_URL}maplibre-worker-classic.cjs`)
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__fpWorkerUrl = maplibregl.getWorkerUrl()
}

// dev-only 测试钩子：浏览器冒烟测试用它直接驱动导入管线（生产构建不含）
if (import.meta.env.DEV) {
  void import('./lib/importer').then((m) => {
    ;(window as unknown as Record<string, unknown>).__fp = {
      importPhotoFiles: m.importPhotoFiles,
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
