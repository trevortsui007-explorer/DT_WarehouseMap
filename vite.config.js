import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/wms-api': {
        target: process.env.WMS_PROXY_TARGET || 'http://localhost:31175',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wms-api/, ''),
      },
    },
  },
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
});
