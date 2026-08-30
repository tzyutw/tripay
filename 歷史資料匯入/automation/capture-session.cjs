/**
 * 用 CDP 接上「Rozi 自己開的正常 Chrome」，等他完成 Google 登入後，
 * 把 tzyutw.github.io 的 cookies + localStorage（含 Supabase token）
 * 寫成 Playwright 可用的 storageState → .auth/state.json
 *
 * 不啟動任何自動化旗標的瀏覽器；只是旁觀者。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9222;
const ORIGIN = 'https://tzyutw.github.io';
const AUTH_KEY = 'sb-ykdlfdlnmoaxwbywikwe-auth-token';
const ROOT = path.resolve(__dirname, '../../.auth');
const OUT = path.join(ROOT, 'state.json');
const WAIT_MS = 20 * 60 * 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });

  // 等 Chrome 的 debugging port 起來
  let browser = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 3 * 60 * 1000) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); break; }
    catch { process.stdout.write('.'); await sleep(2000); }
  }
  if (!browser) { console.log('\n[cdp] ❌ 連不上 127.0.0.1:' + PORT + '，Chrome 沒開或沒帶 --remote-debugging-port'); process.exit(1); }
  console.log(`\n[cdp] ✅ 已接上 Chrome（port ${PORT}）`);
  console.log('[cdp] 請在該視窗完成 Google 登入，偵測到 session 會自動存檔');

  const started = Date.now();
  let hit = null;
  while (Date.now() - started < WAIT_MS) {
    try {
      for (const ctx of browser.contexts()) {
        for (const p of ctx.pages()) {
          if (p.isClosed() || !p.url().startsWith(ORIGIN)) continue;
          const v = await p.evaluate((k) => {
            try {
              const raw = localStorage.getItem(k); if (!raw) return null;
              const j = JSON.parse(raw);
              if (!j || !j.access_token) return null;
              const dump = {};
              for (let i = 0; i < localStorage.length; i++) { const kk = localStorage.key(i); dump[kk] = localStorage.getItem(kk); }
              return { email: (j.user && j.user.email) || 'ok', expires_at: j.expires_at || null, ls: dump };
            } catch { return null; }
          }, AUTH_KEY).catch(() => null);
          if (v) { hit = { page: p, ctx, ...v }; break; }
        }
        if (hit) break;
      }
      if (hit) break;
    } catch { /* 導頁中 */ }
    await sleep(2000);
  }

  if (!hit) { console.log('[cdp] ❌ 逾時未偵測到登入 session'); await browser.close().catch(() => {}); process.exit(1); }

  console.log(`[cdp] ✅ 偵測到登入：${hit.email}`);
  if (hit.expires_at) console.log(`[cdp]    access_token 到期：${new Date(hit.expires_at * 1000).toISOString()}（supabase-js 會自動 refresh）`);

  // 手動組 storageState：CDP 連線下這樣最穩，且保證帶上 Supabase token
  let cookies = [];
  try { cookies = await hit.ctx.cookies(); } catch (e) { console.log('[cdp] 讀 cookies 失敗（可略過）：', e.message); }
  const state = {
    cookies: cookies.filter(c => c.domain && !c.domain.includes('google')),
    origins: [{ origin: ORIGIN, localStorage: Object.entries(hit.ls).map(([name, value]) => ({ name, value })) }],
  };
  fs.writeFileSync(OUT, JSON.stringify(state, null, 2));

  const ok = state.origins[0].localStorage.some(x => x.name === AUTH_KEY);
  console.log(`[cdp] 已存 ${OUT}`);
  console.log(`[cdp] cookies ${state.cookies.length}　localStorage ${state.origins[0].localStorage.length} 筆`);
  console.log(`[cdp] 內含 ${AUTH_KEY}：${ok ? '✅' : '❌'}`);
  console.log('[cdp] 完成 — 你可以關掉那個 Chrome 視窗了');
  await browser.close().catch(() => {});   // 只切斷 CDP 連線，不會關掉 Rozi 的 Chrome
  process.exit(ok ? 0 : 2);
})().catch(e => { console.log('[cdp] 未預期錯誤：', e.message); process.exit(1); });
