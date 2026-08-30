/**
 * 部署後收尾 a：四筆行程走 UI 改名，拿掉「（Excel重謄）」後綴。
 * 用線上站台（部署完成後）＋ storageState。
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const APP = 'https://tzyutw.github.io/tripay/';
const STATE = path.resolve(__dirname, '../../.auth/state.json');
const ckpt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../checkpoint.json'), 'utf8'));
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ storageState: STATE, locale: 'zh-TW', viewport: { width: 480, height: 900 } });
  const p = await ctx.newPage();

  for (const t of ['fukuoka', 'tokyo', 'hokkaido', 'jeju']) {
    const uuid = ckpt[t].tripUuid;
    await p.goto(`${APP}trips/${uuid}`, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: '編輯行程' }).click();
    const input = p.locator('input[placeholder="例如：沖繩四人行 ☀️"]');
    await input.waitFor({ timeout: 15000 });
    await p.waitForTimeout(1200);                       // 等非同步資料灌入
    const before = await input.inputValue();
    const after = before.replace(/（Excel重謄）\s*$/, '').trim();
    if (before === after) { log(`${t}: 名稱已無後綴（${before}），略過`); await p.getByRole('button', { name: '取消' }).first().click(); continue; }
    await input.fill(after);
    await p.getByRole('button', { name: '儲存' }).click();
    await p.waitForTimeout(2500);
    log(`${t}: 「${before}」→「${after}」`);
  }
  await b.close();

  const trips = await (await fetch(`${URL}/rest/v1/trips?select=name,status&order=created_at`, { headers: H })).json();
  console.log('\n══ 改名後的行程清單');
  for (const t of trips) console.log(`   ${t.status.padEnd(9)} ${t.name}`);
  const left = trips.filter(t => t.name.includes('Excel重謄'));
  console.log(`\n   仍帶後綴：${left.length} 筆 ${left.length ? '❌' : '✅'}`);
})();
