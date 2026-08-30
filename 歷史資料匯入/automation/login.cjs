/**
 * 前置檢查 #3：headed 開站，請 Rozi 手動完成一次 Google 登入，
 * 成功後把 storageState 存到 .auth/state.json。
 *
 * 用 launchPersistentContext：登入狀態存在 .auth/chrome-profile/，
 * 就算視窗被關掉、腳本重跑，Google session 仍在，不必重登。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'https://tzyutw.github.io/tripay/';
const AUTH_KEY = 'sb-ykdlfdlnmoaxwbywikwe-auth-token';
const ROOT = path.resolve(__dirname, '../../.auth');
const PROFILE = path.join(ROOT, 'chrome-profile');
const OUT = path.join(ROOT, 'state.json');
const WAIT_MS = 20 * 60 * 1000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    locale: 'zh-TW',
    args: ['--start-maximized'],
  });

  let closed = false;
  ctx.on('close', () => { closed = true; });

  const page = ctx.pages()[0] || await ctx.newPage();
  try { await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { console.log('[login] 初次導頁：', e.message); }

  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  請在剛開啟的 Chrome 視窗完成 Google 登入');
  console.log(`  網址：${APP}`);
  console.log('  ⚠️ 登入完成前請不要關視窗；偵測到 session 後會自動存檔並自己關閉');
  console.log('  （就算不小心關了，登入狀態已存在 .auth/chrome-profile/，重跑即可）');
  console.log(`  最長等待 ${WAIT_MS / 60000} 分鐘`);
  console.log('══════════════════════════════════════════════════════════');
  console.log('');

  const started = Date.now();
  let email = null;
  while (Date.now() - started < WAIT_MS) {
    if (closed) { console.log('[login] ⚠️ 視窗已被關閉'); break; }
    try {
      const pages = ctx.pages().filter(p => !p.isClosed());
      for (const p of pages) {
        const url = p.url();
        if (!url.includes('tzyutw.github.io')) continue;
        const v = await p.evaluate((k) => {
          try {
            const raw = localStorage.getItem(k); if (!raw) return null;
            const j = JSON.parse(raw);
            return j && j.access_token ? ((j.user && j.user.email) || 'ok') : null;
          } catch { return null; }
        }, AUTH_KEY).catch(() => null);
        if (v) { email = v; break; }
      }
      if (email) break;
    } catch { /* 導頁中 */ }
    await sleep(2000);
  }

  if (!email) {
    console.log('[login] ❌ 未取得登入 session（逾時或視窗被關）');
    if (!closed) await ctx.close().catch(() => {});
    process.exit(1);
  }

  console.log(`[login] ✅ 偵測到登入 session：${email}`);
  await sleep(3000);
  try {
    await ctx.storageState({ path: OUT });
    const st = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const hasKey = (st.origins || []).some(o => (o.localStorage || []).some(x => x.name === AUTH_KEY));
    console.log(`[login] 已存 ${OUT}`);
    console.log(`[login] cookies ${(st.cookies || []).length}　origins ${(st.origins || []).map(o => o.origin).join(', ')}`);
    console.log(`[login] 內含 ${AUTH_KEY}：${hasKey ? '✅' : '❌'}`);
    await ctx.close().catch(() => {});
    process.exit(hasKey ? 0 : 2);
  } catch (e) {
    console.log('[login] 存檔失敗：', e.message);
    process.exit(3);
  }
})().catch(e => { console.log('[login] 未預期錯誤：', e.message); process.exit(1); });
