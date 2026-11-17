import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署到子路径时使用 /仓库名/ 前缀
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
