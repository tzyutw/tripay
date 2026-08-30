/**
 * 收尾（全部走真實 UI）：
 *  1) 四筆（Excel重謄）行程 → 結算頁按「算清楚」確認為 settled
 *  2) 四筆舊的單筆展示行程 → 按「封存行程」（不刪除）；「2024 慢遊首爾」不在範圍
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'https://tzyutw.github.io/tripay/';
const STATE = path.resolve(__dirname, '../../.auth/state.json');
const ckpt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../checkpoint.json'), 'utf8'));
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const ARCHIVE_NAMES = ['2023 福岡', '2024 東京富士山五寶團', '2025 北海道四寶團', '2026 濟州島四寶團'];

(async () => {
  const trips = await (await fetch(`${URL}/rest/v1/trips?select=id,name,status`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
  const toArchive = trips.filter(t => ARCHIVE_NAMES.includes(t.name) && !t.name.includes('Excel重謄'));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE, locale: 'zh-TW', viewport: { width: 480, height: 900 } });
  const page = await ctx.newPage();

  // ── 1) 結算確認 ──────────────────────────────────────────────
  for (const t of ['fukuoka', 'tokyo', 'hokkaido', 'jeju']) {
    const uuid = ckpt[t].tripUuid;
    log(`結算 ${t} …`);
    await page.goto(`${APP}trips/${uuid}/settlement`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);

    const calcBtn = page.getByRole('button', { name: '算清楚' });
    if (await calcBtn.count()) {
      await calcBtn.click();
      // 有待填筆數時會先跳警告頁
      const warn = page.getByRole('button', { name: '先這樣算' });
      try { await warn.waitFor({ timeout: 4000 }); log('   （有待填筆數，選「先這樣算」）'); await warn.click(); } catch { /* 沒有警告頁 */ }
    } else {
      log('   （沒有「算清楚」按鈕，可能已結算過）');
    }
    await page.waitForTimeout(4000);
    const body = await page.locator('body').innerText();
    const done = /已確認|全員付清|封存行程|結算完成/.test(body) || (await page.getByRole('button', { name: '封存行程' }).count()) > 0;
    log(`   ${done ? '✅ 已確認結算' : '⚠️ 狀態待查'}`);
  }

  // ── 2) 舊展示行程封存 ────────────────────────────────────────
  for (const t of toArchive) {
    log(`封存舊展示行程「${t.name}」（${t.status}）…`);
    await page.goto(`${APP}trips/${t.id}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    const btn = page.getByRole('button', { name: '封存行程' });
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(2500); log('   ✅ 已封存'); }
    else log('   ⚠️ 找不到「封存行程」按鈕');
  }

  await browser.close();

  // ── 結果核對 ────────────────────────────────────────────────
  const after = await (await fetch(`${URL}/rest/v1/trips?select=id,name,status&order=created_at`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
  console.log('\n══ 最終行程狀態');
  for (const t of after) console.log(`   ${t.status.padEnd(9)} ${t.name}`);
})();
