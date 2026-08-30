/**
 * QA 驗收清單（本地 dev server）：編輯行程入口 ＋ 自訂成員 emoji
 *  1 已有消費／分帳紀錄的成員不可被移除（擋下並給提示）
 *  2 行程狀態規則：planned/active/settled 可編輯；archived 只讀
 *  3 自訂 emoji：12 預設以外字元的儲存與顯示、組合 emoji（ZWJ）不被截斷
 *  4 編輯行程後結算數字不變
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const state = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../.auth/state.json'), 'utf8'));
const authEntry = state.origins[0].localStorage.find(x => x.name.startsWith('sb-'));
const ckpt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../checkpoint.json'), 'utf8'));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`   ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const ZWJ = '👨‍👩‍👧';      // ZWJ 組合序列（3 人家庭）
const FLAG = '🇹🇼';         // 國旗（2 個 regional indicator）
const TULIP = '🌷';         // 不在 12 預設內

(async () => {
  const trips = await (await fetch(`${URL}/rest/v1/trips?select=id,name,status`, { headers: H })).json();
  const tokyo = trips.find(t => t.name.includes('東京') && t.name.includes('Excel重謄'));
  const archived = trips.find(t => t.status === 'archived');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 480, height: 900 } });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* noop */ } }, [authEntry.name, authEntry.value]);
  const page = await ctx.newPage();

  // ── 前置：記下東京結算數字 ──────────────────────────────
  const settleBefore = await (await fetch(`${URL}/rest/v1/settlement_items?select=amount,from_member_id,to_member_id&settlement_id=in.(${
    (await (await fetch(`${URL}/rest/v1/settlements?select=id&trip_id=eq.${tokyo.id}&status=eq.confirmed`, { headers: H })).json()).map(x => x.id).join(',')
  })`, { headers: H })).json();

  console.log('\n══ 1／2 編輯入口與狀態規則');
  await page.goto(`${BASE}/trips/${tokyo.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('settled 行程有「編輯行程」入口', await page.getByRole('button', { name: '編輯行程' }).count() > 0);

  await page.goto(`${BASE}/trips/${archived.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('archived 行程沒有編輯入口（只讀）', await page.getByRole('button', { name: '編輯行程' }).count() === 0, archived.name);
  await page.goto(`${BASE}/trips/${archived.id}/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('archived 直接開 /edit 也不會出現編輯表單', await page.getByText('編輯行程', { exact: true }).count() === 0);

  console.log('\n══ 3 編輯表單載入既有資料（原本 useState 抓不到非同步資料的 bug）');
  await page.goto(`${BASE}/trips/${tokyo.id}/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const nameVal = await page.locator('input[placeholder="例如：沖繩四人行 ☀️"]').inputValue();
  check('編輯表單有帶入行程名稱', nameVal.includes('東京'), `讀到「${nameVal}」`);
  const memberCount = await page.locator('xpath=//label[normalize-space(text())="誰一起去？"]/parent::div//div[contains(@class,"cursor-pointer")]').count();
  check('編輯表單有帶入 5 位成員', memberCount === 5, `讀到 ${memberCount} 位`);

  console.log('\n══ 4 已有消費紀錄的成員不可移除');
  const firstRemove = page.locator('xpath=//label[normalize-space(text())="誰一起去？"]/parent::div//div[contains(@class,"cursor-pointer")][1]//button[last()]');
  check('移除鈕已被停用（disabled）', await firstRemove.isDisabled());
  const title = await firstRemove.getAttribute('title');
  check('停用時有提示文字', /有消費紀錄/.test(title || ''), title || '');

  console.log('\n══ 5 自訂 emoji：貼上 12 預設以外字元');
  const nienRow = page.locator('xpath=//label[normalize-space(text())="誰一起去？"]/parent::div//div[contains(@class,"cursor-pointer")][2]');
  await nienRow.locator('button').first().click();          // 開 emoji 選擇器
  await page.getByPlaceholder('搜尋，或直接貼上').waitFor({ timeout: 8000 });
  check('選擇器有「搜尋，或直接貼上」欄位', true);
  check('有「直接貼上」按鈕', await page.getByRole('button', { name: '直接貼上' }).count() > 0);

  await page.getByPlaceholder('搜尋，或直接貼上').fill(ZWJ);
  await page.waitForTimeout(300);
  const prevZwj = await page.locator('xpath=//span[text()="選的是"]/following-sibling::span').innerText();
  check('ZWJ 組合 emoji 未被截斷', prevZwj === ZWJ, `預覽「${prevZwj}」(${[...prevZwj].length} code points，期望 ${[...ZWJ].length})`);

  await page.getByPlaceholder('搜尋，或直接貼上').fill(FLAG);
  await page.waitForTimeout(300);
  const prevFlag = await page.locator('xpath=//span[text()="選的是"]/following-sibling::span').innerText();
  check('國旗 emoji（2 個 regional indicator）未被截斷', prevFlag === FLAG, `預覽「${prevFlag}」`);

  await page.getByPlaceholder('搜尋，或直接貼上').fill('abc');
  await page.waitForTimeout(300);
  check('純文字被擋下並給提示', await page.getByText('這看起來不是 emoji，換一個試試').count() > 0);

  // 真的存 🌷
  await page.getByPlaceholder('搜尋，或直接貼上').fill(TULIP);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '就用這個' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '儲存' }).click();
  await page.waitForTimeout(3000);

  const mem = await (await fetch(`${URL}/rest/v1/trip_members?select=name,emoji,sort_order&trip_id=eq.${tokyo.id}&order=sort_order`, { headers: H })).json();
  const nien = mem.find(m => m.name === 'Nien');
  check('🌷 已寫入資料庫', nien && nien.emoji === TULIP, `Nien 的 emoji = ${nien && nien.emoji}`);

  console.log('\n══ 6 顯示：列表／統計卡／分享唯讀頁');
  await page.goto(`${BASE}/trips/${tokyo.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const body = await page.locator('body').innerText();
  check('行程詳情頁顯示 🌷', body.includes(TULIP));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  check('行程列表卡片顯示 🌷', (await page.locator('body').innerText()).includes(TULIP));
  const share = await (await fetch(`${URL}/rest/v1/trips?select=share_token&id=eq.${tokyo.id}`, { headers: H })).json();
  await page.goto(`${BASE}/share/${share[0].share_token}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  check('分享唯讀頁顯示 🌷', (await page.locator('body').innerText()).includes(TULIP));

  console.log('\n══ 7 回歸：編輯行程後結算數字不變');
  const settleAfter = await (await fetch(`${URL}/rest/v1/settlement_items?select=amount,from_member_id,to_member_id&settlement_id=in.(${
    (await (await fetch(`${URL}/rest/v1/settlements?select=id&trip_id=eq.${tokyo.id}&status=eq.confirmed`, { headers: H })).json()).map(x => x.id).join(',')
  })`, { headers: H })).json();
  const norm = (rows) => rows.map(r => `${r.from_member_id}>${r.to_member_id}:${r.amount}`).sort().join('|');
  check('已確認的結算項目完全未變', norm(settleBefore) === norm(settleAfter), `${settleBefore.length} 筆`);

  await browser.close();
  const fail = results.filter(r => !r.ok);
  console.log(`\n════ ${results.length - fail.length}/${results.length} 通過 ${fail.length ? '❌ 有失敗項' : '✅ 全數通過'}`);
  process.exit(fail.length ? 1 : 0);
})();
