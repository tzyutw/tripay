/**
 * TC-STATUS-18~20 等效驗證（正式環境臨時行程版）
 *
 * 本機無 Docker／Supabase CLI，`supabase start` 不可行，原 E2E 測試會 skip。
 * 改以「建立臨時行程 → 驗完即刪」跑等效驗證，全程可逆、不留殘料。
 *   TC-STATUS-18：建立行程時 DB status = planned
 *   TC-STATUS-19：confirm-settlement 後 trips.status = settled
 *   TC-STATUS-20：unarchive 後 status = settled（非 active/planned）
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const APP = 'https://tzyutw.github.io/tripay/';
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const stFile = path.resolve(__dirname, '../../.auth/state.json');
const tok = JSON.parse(JSON.parse(fs.readFileSync(stFile, 'utf8')).origins[0].localStorage.find(x => x.name.startsWith('sb-')).value);
const { makeGuard } = require('./guard.cjs');
const guard = makeGuard();
const R = []; const ck = (n, ok, d = '') => { R.push(ok); console.log(`   ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const get = async (q) => (await (await fetch(`${URL}/rest/v1/${q}`, { headers: H })).json());

(async () => {
  let access = tok.access_token;
  if (!(await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } })).ok) {
    const j = await (await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: tok.refresh_token }) })).json();
    access = j.access_token;
  }
  const AH = { apikey: KEY, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const fn = async (name, body) => { const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: AH, body: JSON.stringify(body) }); return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }; };

  // ── 走真實 UI 建立行程（TC-STATUS-18）──────────────────────
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ storageState: stFile, locale: 'zh-TW', viewport: { width: 480, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await p.getByRole('button', { name: '＋ 新增行程' }).click();
  await p.getByText('這趟去哪？').waitFor({ timeout: 15000 });
  await p.locator('input[placeholder="例如：沖繩四人行 ☀️"]').fill('ZZ E2E 狀態測試');
  const d = p.locator('input[type="date"]');
  await d.nth(0).fill('2099-03-01'); await d.nth(1).fill('2099-03-03');
  for (const [emo, nm] of [['🐟', 'A'], ['🍋', 'B']]) {
    await p.getByRole('button', { name: '＋ 新增成員' }).click();
    await p.locator('input[placeholder="叫什麼名字？"]').waitFor({ timeout: 10000 });
    // 成員 emoji 現在走共用 EmojiPicker（本輪改版）：開選擇器 → 選 → 就用這個
    await p.locator('xpath=//p[contains(text(),"點一下換 emoji")]/preceding-sibling::button').click();
    await p.getByPlaceholder('搜尋，或直接貼上').waitFor({ timeout: 10000 });
    await p.locator(`button:text-is("${emo}")`).first().click();
    await p.getByRole('button', { name: '就用這個' }).click();
    await p.waitForTimeout(300);
    await p.locator('input[placeholder="叫什麼名字？"]').fill(nm);
    await p.getByRole('button', { name: '加進來' }).click();
    await p.waitForTimeout(150);
  }
  await p.locator('xpath=//label[normalize-space(text())="誰一起去？"]/parent::div//div[contains(@class,"cursor-pointer")][1]').click();
  await p.getByRole('button', { name: '出發！' }).click();
  await p.waitForURL(/\/trips\/[0-9a-f-]{36}/, { timeout: 30000 });
  const tripId = p.url().match(/\/trips\/([0-9a-f-]{36})/)[1];
  guard.register(tripId, 'ZZ E2E 狀態測試');   // 護欄：登記自己建立的測試資料
  await b.close();

  console.log('\n══ TC-STATUS-18：建立行程時 DB status = planned');
  let t = (await get(`trips?select=status&id=eq.${tripId}`))[0];
  ck('status = planned', t.status === 'planned', `實際 ${t.status}`);

  // ── 記一筆 + splits，才有得結算 ─────────────────────────
  const members = await get(`trip_members?select=id,name&trip_id=eq.${tripId}&order=sort_order`);
  const [exp] = await (await fetch(`${URL}/rest/v1/expenses`, { method: 'POST', headers: AH, body: JSON.stringify({
    trip_id: tripId, payer_member_id: members[0].id, created_by: (await (await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } })).json()).id,
    title: 'E2E 測試消費', category_emoji: '🧪', expense_date: '2099-03-01',
    foreign_amount: null, twd_amount: 1000, exchange_rate: null,
    foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false })})).json();
  await fetch(`${URL}/rest/v1/expense_splits`, { method: 'POST', headers: AH, body: JSON.stringify(
    members.map(m => ({ expense_id: exp.id, member_id: m.id, is_participating: true, split_amount: null, split_pending: false })))});

  console.log('\n══ TC-STATUS-19：confirm-settlement 後 trips.status = settled');
  const calc = await fn('calculate-settlement', { trip_id: tripId });
  ck('calculate-settlement 成功', calc.ok, `HTTP ${calc.status}`);
  const conf = await fn('confirm-settlement', { settlement_id: calc.json.settlement_id });
  ck('confirm-settlement 成功', conf.ok, `HTTP ${conf.status}`);
  t = (await get(`trips?select=status&id=eq.${tripId}`))[0];
  ck('status = settled', t.status === 'settled', `實際 ${t.status}`);

  console.log('\n══ TC-STATUS-20：unarchive 後 status = settled（非 active/planned）');
  await fetch(`${URL}/rest/v1/trips?id=eq.${tripId}`, { method: 'PATCH', headers: AH, body: JSON.stringify({ status: 'archived' }) });
  t = (await get(`trips?select=status&id=eq.${tripId}`))[0];
  ck('先封存成功', t.status === 'archived', `實際 ${t.status}`);
  const re = await fn('reopen-settlement', { trip_id: tripId, mode: 'unarchive' });
  ck('reopen-settlement(unarchive) 成功', re.ok, `HTTP ${re.status}`);
  t = (await get(`trips?select=status&id=eq.${tripId}`))[0];
  ck('unarchive 後 status = settled（非 active/planned）', t.status === 'settled', `實際 ${t.status}`);

  // ── 清理（P9：先刪 settlements 再刪 trip）─────────────────
  console.log('\n══ 清理臨時行程');
  const rows = await guard.deleteTrip(URL, AH, tripId);
  const left = await get(`trips?select=id&id=eq.${tripId}`);
  ck('臨時行程已刪除、不留殘料', rows === 1 && left.length === 0 && guard.remaining().length === 0);

  const bad = R.filter(x => !x).length;
  console.log(`\n════ ${R.length - bad}/${R.length} 通過 ${bad ? '❌' : '✅'}`);
  process.exit(bad ? 1 : 0);
})();
