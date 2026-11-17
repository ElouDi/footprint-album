import { defineConfig } from 'vite'

// 把 maplibre 的模块 worker 打包成自包含的经典 worker（.cjs 触发 maplibre 走 classic Worker 路径），
// 解决部分环境（如内嵌浏览器）模块 Worker 静默失败导致瓦片不渲染的问题。
// 产物提交到 public/，maplibre 版本变更后需重新执行：npm run build:worker
export default defineConfig({
  build: {
    lib: {
      name: 'maplibreWorker',
      entry: 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
      formats: ['iife'],
      fileName: () => 'maplibre-worker-classic.cjs',
    },
    outDir: 'public',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
  },
})
