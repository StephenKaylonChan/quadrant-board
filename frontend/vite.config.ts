import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // 浏览器请求 /api、/uploads 时,Vite 帮忙转发给后端容器
    // (backend 是 docker compose 里的服务名,容器之间可以用它当域名)
    proxy: {
      '/api': 'http://backend:8000',
      '/uploads': 'http://backend:8000',
    },
    // Docker 挂载目录下文件变动通知不可靠,改用轮询保证热更新生效
    watch: { usePolling: true },
  },
})
