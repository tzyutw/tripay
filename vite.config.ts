import path from 'path';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/* 畫面上要看得到自己在跑哪一版。沒有這一行，「部署成功了但使用者拿到舊 bundle」
   這件事下一次又要花一輪才查得出來（Rozi 2026-09-06 連續兩輪被它誤導）。 */
const BUILD_SHA = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();

export default defineConfig(({ mode }) => {
const BASE = mode === 'production' ? '/tripay/' : '/';
return ({
  define: { __BUILD_SHA__: JSON.stringify(BUILD_SHA) },

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
        theme_color: '#1276C4',
        background_color: '#FEF9EE',
        display: 'standalone',
        start_url: mode === 'production' ? '/tripay/' : '/',
        scope: mode === 'production' ? '/tripay/' : '/',
        /* 🔴 路徑必須帶 base。原本寫死 `/pwa-icon.svg`，但網站掛在 `/tripay/` 底下，
           所以 manifest 裡那兩個 icon **一直都是 404**（舊有的錯，不是換色造成的）。
           跟 start_url／scope 用同一個 base。 */
        icons: [
          /* iOS 與部分 Android 不吃 SVG，PNG 排前面。
             檔名帶 `-v2`：**檔名不變裝置就不會重抓**，Rozi 刪掉主畫面圖示重加
             也還是拿到快取裡的舊圖。 */
          { src: `${BASE}pwa-icon-192-v2.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}pwa-icon-512-v2.png`, sizes: '512x512', type: 'image/png',
            purpose: 'any maskable' },
          { src: `${BASE}pwa-icon.svg`, sizes: '192x192', type: 'image/svg+xml' },
          { src: `${BASE}pwa-icon.svg`, sizes: '512x512', type: 'image/svg+xml',
            purpose: 'any maskable' },
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
});
});
