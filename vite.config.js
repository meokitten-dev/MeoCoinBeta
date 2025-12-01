import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Tăng giới hạn cảnh báo từ 500kB lên 1600kB (đủ cho Firebase)
    chunkSizeWarningLimit: 1600, 
    rollupOptions: {
      output: {
        // Tùy chọn: Chia nhỏ các thư viện lớn ra để tải nhanh hơn
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
})