import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.INSPECTION_DESK_API_PORT ?? 4100);
const uiPort = Number(process.env.INSPECTION_DESK_UI_PORT ?? 5173);
const host = process.env.INSPECTION_DESK_HOST ?? '127.0.0.1';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    host,
    port: uiPort,
    strictPort: true,
    proxy: { '/api': { target: `http://${host}:${apiPort}`, changeOrigin: false } },
  },
  preview: { host, port: uiPort, strictPort: true },
});
