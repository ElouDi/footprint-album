# 足迹相册 Footprint Album

[在线演示](https://eloudi.github.io/footprint-album/) · [GitHub 仓库](https://github.com/ElouDi/footprint-album)

从照片生成足迹地图与旅行相册的开源 Web 应用：**导入照片 → 读取 EXIF 地理位置 → 在地图上点亮你去过的城市 → 按旅行自动聚类成相册**。全程本地运行，照片不上传。

> 灵感来自 Google Play 上的 [Footprint Map](https://play.google.com/store/apps/details?id=com.jcstudio.footprintmap)（闭源），以及 iPhone 相册的地图视图。

## 功能

- **照片与视频导入**：选择文件夹（Chrome/Edge，支持持久句柄）或多选文件 / 拖拽整个文件夹，递归扫描照片（JPEG / PNG / WebP）与视频（MP4 / MOV）
- **视频定位**：自动解析视频容器内的 GPS（iPhone `©xyz` / Android `loci`）与拍摄时间，视频以首帧封面 + ▶ 角标上地图，灯箱内直接播放
- **手动标点**：没有 GPS 的媒体（如经聊天软件传输）在侧栏点击"标点" → 点击地图落点，城市足迹自动重算
- **足迹地图**：基于 MapLibre GL，媒体按位置聚合显示，点击标记查看
- **点亮城市**：内置 Natural Earth 7300+ 城市数据离线就近匹配（50km 半径），到过的城市点亮在侧栏
- **旅行行程**：按"相邻照片间隔 > 36h 或位置跳变 > 100km"自动分段，点击行程地图聚焦
- **本地优先**：EXIF 元数据与缩略图存于浏览器 IndexedDB，重复导入自动去重；无网络也能浏览已导入内容（底图瓦片除外）

### 底图说明

默认底图为 **Esri 卫星影像**（无 API key、中国大陆网络可达，叠加地名注记层）。选型依据（2026-11 实测）：

| 底图 | 状态 |
|---|---|
| OpenStreetMap 官方瓦片 | 中国大陆网络不可达（连接失败） |
| CARTO 免费瓦片 | 已要求 API key，无 key 返回带水印瓦片 |
| Esri 卫星影像 / 暗色 / 街道 | 可达、无 key，MIT 项目可直接使用（保留署名） |

`src/lib/basemaps.ts` 内置四个预设，设置页切换在路线图中。

## 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`，把照片文件夹拖进地图即可。

要求 Node.js ≥ 20。浏览器建议 Chrome / Edge（支持文件夹选择与原图查看）；Firefox / Safari 可用多选或拖拽导入。

## 隐私

- 照片文件不离开你的设备，无任何服务器、无账号、无埋点
- EXIF 中的 GPS 与拍摄时间只保存在本机 IndexedDB
- 底图瓦片按缩放级别向 Esri 瓦片服务器请求地图方块，不传输你的照片信息

## 技术栈

Vite · React 19 · TypeScript · MapLibre GL JS · exifr · Dexie (IndexedDB) · supercluster · Vitest

## 项目结构

```
src/lib/          核心逻辑：EXIF 解析 / 视频元数据 / 缩略图 / 行程聚类 / 城市匹配 / IndexedDB
src/components/   MapView（地图+聚合标记）/ Sidebar（导入·统计·标点）/ Lightbox（查看器）
public/data/      cities.json 内置城市数据（npm run build-cities 重新生成）
public/maplibre-worker-classic.cjs
                  maplibre 经典 worker 包（npm run build:worker 生成，升级 maplibre-gl 后重建）
docs/             产品调研与设计存档
```

## 部署

纯静态产物，`npm run build` 后部署 `dist/` 到任意静态托管即可。推送到 GitHub 后 CI 会自动构建并发布 GitHub Pages（首次需在仓库 Settings → Pages 里把 Source 设为 GitHub Actions）。

## 开发

```bash
npm run lint          # ESLint
npm test              # Vitest 单测
npm run build         # 类型检查 + 构建
npm run build-cities  # 重新生成 public/data/cities.json（Natural Earth + 日本城市补充）
```

## 路线图

- [x] 行程相册页（按天分组浏览 + 行程路径线）
- [ ] 回忆视图："N 年前的今天"、同一城市不同年份对比
- [ ] HEIC 照片支持（wasm 解码）、HEVC 视频播放
- [ ] 自定义底图瓦片源设置
- [ ] 城市中文名显示

## 设计文档

`docs/` 内有产品调研与街景方向的设计存档（项目早期曾探索"照片浮于街景"方向，因 Google 街景缓存条款限制转向 2D 方案）。

## License

[MIT](LICENSE)
