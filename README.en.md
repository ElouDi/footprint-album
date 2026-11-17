# Footprint Album 足迹相册

An open-source web app that turns your photos into a footprint map and travel albums: **import photos → read EXIF GPS → light up the cities you've visited on a map → auto-cluster trips into albums**. Fully local — your photos never leave your device.

See the [Chinese README](README.md) for the full description.

## Quick start

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` and drop a photo folder onto the map.

Node.js ≥ 20 required. Chrome/Edge recommended (directory picker + original photo viewing); Firefox/Safari work via multi-select or drag & drop.

## Tech stack

Vite · React 19 · TypeScript · MapLibre GL JS · exifr · Dexie (IndexedDB) · supercluster · Vitest

## Privacy

No servers, no accounts, no analytics. EXIF GPS and timestamps are stored only in your browser's IndexedDB. Map tiles come from OpenStreetMap; only tile requests are made, never your photos.

## License

[MIT](LICENSE)
