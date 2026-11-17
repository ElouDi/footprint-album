# 贡献指南 Contributing

欢迎 Issue 与 PR！

## 开发流程

1. Fork / 建分支
2. `npm install`
3. 开发：`npm run dev`
4. 提交前确保：`npm run lint && npm test && npm run build` 全绿

## 约定

- TypeScript strict 模式，不要用 `any` 关闭类型检查
- 提交信息用英文祈使句（`Add xxx` / `Fix xxx`）
- 核心纯函数（`src/lib/cluster.ts`、`cities.ts`、`exif.ts`）改动的 PR 需要附带测试

## 城市数据

`public/data/cities.json` 由 `npm run build-cities` 从 Natural Earth 生成，请勿手改；缺城市请改 `scripts/build-cities.mjs` 里的 `JP_SUPPLEMENT`（或提 Issue）。
