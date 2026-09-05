import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  // '/tripay/' in production (GitHub Pages); '/' in development
  base: mode === 'production' ? '/tripay/' : '/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Supabase API — NetworkFirst with cache fallback
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 86_400 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Google Fonts — CacheFirst, 30 days
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },

      manifest: {
        name: 'Tripay',
        short_name: 'Tripay',
        theme_color: '#7C2D12',
        background_color: '#FEF9EE',
        display: 'standalone',
        start_url: mode === 'production' ? '/tripay/' : '/',
        scope: mode === 'production' ? '/tripay/' : '/',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },

      devOptions: { enabled: true },
    }),
  ],

  resolve: {
    alias: {
      /* ⚠️ 更精確的 alias 必須排在 `'@'` **前面**——object 形式是照順序比對的，
         排在後面會先被 `'@'` 吃掉，樁靜靜地沒生效（畫面照樣 render，
         只是連去真的 Supabase 拿不到資料，看起來像「元件壞了」）。 */
      ...(mode === 'harness'
        ? { '@/lib/supabaseClient': path.resolve(__dirname, './src/test/harness/supabaseStub.ts') }
        : {}),
      '@': path.resolve(__dirname, './src'),
    },
  },

  /* harness 模式只建置量測靶，不動正式的 index.html */
  ...(mode === 'harness'
    ? {
        /* file:// 開啟，資產路徑必須是相對的——寫成 '/assets/…' 會被解析到
           檔案系統根目錄，頁面靜靜地空白（不報錯，只是什麼都沒有）。 */
        base: './',
        build: { outDir: 'dist-harness', rollupOptions: { input: path.resolve(__dirname, 'harness.html') } },
      }
    : {}),
}));
