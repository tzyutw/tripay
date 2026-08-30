/**
 * DELETE 完整性回歸測試（P9）
 *
 * 這個坑已經咬了三次：
 *   2026-07-22 Bug #4  expense_splits 缺 DELETE 政策 → 編輯消費重複建 splits
 *   2026-08-30 P9-a    settlements 缺 DELETE 政策   → 刪不掉、且回 200 不報錯
 *   2026-08-30 P9-b    settlement_items FK 無 CASCADE → 刪 trip 撞 23503
 *
 * 共同根因：**RLS 會把 DELETE 靜默過濾成「影響 0 列」，HTTP 仍回 200。**
 * 所以本測試的核心斷言是：**每一個 DELETE 都必須斷言實際影響列數**，
 * 不能只看 HTTP status。
 *
 * 用法：node delete-integrity-check.cjs        （建臨時資料 → 驗 → 清乾淨）
 * 套用 migration 005 前後各跑一次，前應紅、後應全綠。
 */
const fs = require('fs'); const path = require('path');
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const stFile = path.resolve(__dirname, '../../.auth/state.json');
const tok = JSON.parse(JSON.parse(fs.readFileSync(stFile, 'utf8')).origins[0].localStorage.find(x => x.name.startsWith('sb-')).value);
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const { makeGuard } = require('./guard.cjs');
const guard = makeGuard();
const R = []; const ck = (n, ok, d = '') => { R.push({ n, ok }); console.log(`   ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

(async () => {
  let access = tok.access_token;
  if (!(await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } })).ok) {
    const j = await (await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: tok.refresh_token }) })).json();
    access = j.access_token;
  }
  const AH = { apikey: KEY, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const uid = (await (await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } })).json()).id;
  const post = async (t, body) => (await (await fetch(`${URL}/rest/v1/${t}`, { method: 'POST', headers: AH, body: JSON.stringify(body) })).json());
  const get  = async (q) => (await (await fetch(`${URL}/rest/v1/${q}`, { headers: H })).json());
  /** DELETE 並回傳「實際影響列數」——這正是 RLS 靜默過濾唯一擋得住的地方 */
  const del = async (q) => { const r = await fetch(`${URL}/rest/v1/${q}`, { method: 'DELETE', headers: AH }); const b = await r.text(); return { status: r.status, rows: r.ok ? (JSON.parse(b || '[]')).length : -1, body: b }; };

  // ── 建臨時資料 ────────────────────────────────────────────
  console.log('\n══ 建立臨時測試資料');
  const [trip] = await post('trips', { owner_id: uid, name: 'ZZ DELETE 完整性測試', emoji: '🧪', currency: 'TWD',
    start_date: '2099-06-01', end_date: '2099-06-02', status: 'planned', share_token: crypto.randomUUID() });
  guard.register(trip.id, trip.name);
  const members = await post('trip_members', [
    { trip_id: trip.id, name: 'A', emoji: '🐟', sort_order: 0 },
    { trip_id: trip.id, name: 'B', emoji: '🍋', sort_order: 1 }]);
  const [exp] = await post('expenses', { trip_id: trip.id, payer_member_id: members[0].id, created_by: uid,
    title: 'DELETE 測試', category_emoji: '🧪', expense_date: '2099-06-01',
    foreign_amount: null, twd_amount: 1000, exchange_rate: null, foreign_pending: false, twd_pending: false,
    payment_method: 'cash', expense_type: 'shared', settled_on_spot: false, is_sponsor: false });
  await post('expense_splits', members.map(m => ({ expense_id: exp.id, member_id: m.id, is_participating: true, split_amount: null, split_pending: false })));
  const calc = await (await fetch(`${URL}/functions/v1/calculate-settlement`, { method: 'POST', headers: AH, body: JSON.stringify({ trip_id: trip.id }) })).json();
  await fetch(`${URL}/functions/v1/confirm-settlement`, { method: 'POST', headers: AH, body: JSON.stringify({ settlement_id: calc.settlement_id }) });
  const items = await get(`settlement_items?select=id&settlement_id=eq.${calc.settlement_id}`);
  console.log(`   行程 1／成員 ${members.length}／消費 1／分帳 2／結算 1（items ${items.length}）`);

  // ── 逐表斷言 DELETE 影響列數 ──────────────────────────────
  console.log('\n══ 每張表都必須「DELETE 得動」且影響列數 > 0');
  const t2 = await post('trips', { owner_id: uid, name: 'ZZ DELETE 子表測試', emoji: '🧪', currency: 'TWD',
    start_date: '2099-06-01', end_date: '2099-06-02', status: 'planned', share_token: crypto.randomUUID() });
  guard.register(t2[0].id, t2[0].name);
  const m2 = await post('trip_members', [{ trip_id: t2[0].id, name: 'C', emoji: '🐵', sort_order: 0 }]);
  const [e2] = await post('expenses', { trip_id: t2[0].id, payer_member_id: m2[0].id, created_by: uid,
    title: '子表測試', category_emoji: '🧪', expense_date: '2099-06-01', foreign_amount: null, twd_amount: 500,
    exchange_rate: null, foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false });
  const sp2 = await post('expense_splits', [{ expense_id: e2.id, member_id: m2[0].id, is_participating: true, split_amount: null, split_pending: false }]);

  let r = await del(`expense_splits?expense_id=eq.${e2.id}`);
  ck('expense_splits DELETE 影響列數 > 0（hotfix_2）', r.rows > 0, `HTTP ${r.status}／${r.rows} 列`);
  r = await del(`expenses?id=eq.${e2.id}`);
  ck('expenses DELETE 影響列數 > 0', r.rows > 0, `HTTP ${r.status}／${r.rows} 列`);
  r = await del(`settlement_items?settlement_id=eq.${calc.settlement_id}`);
  ck('settlement_items DELETE 影響列數 > 0', r.rows > 0, `HTTP ${r.status}／${r.rows} 列`);
  r = await del(`settlements?trip_id=eq.${trip.id}`);
  ck('settlements DELETE 影響列數 > 0（004）', r.rows > 0, `HTTP ${r.status}／${r.rows} 列`);
  r = await del(`trip_members?id=eq.${m2[0].id}`);
  ck('trip_members DELETE 影響列數 > 0', r.rows > 0, `HTTP ${r.status}／${r.rows} 列`);

  // ── 核心：有結算紀錄的行程能不能一刀刪掉 ──────────────────
  console.log('\n══ 核心情境：有結算紀錄的行程，直接刪 trip（不先手動刪 settlements）');
  const [t3] = await post('trips', { owner_id: uid, name: 'ZZ 有結算的行程', emoji: '🧪', currency: 'TWD',
    start_date: '2099-06-01', end_date: '2099-06-02', status: 'planned', share_token: crypto.randomUUID() });
  guard.register(t3.id, t3.name);
  const m3 = await post('trip_members', [{ trip_id: t3.id, name: 'D', emoji: '🐱', sort_order: 0 }, { trip_id: t3.id, name: 'E', emoji: '🐶', sort_order: 1 }]);
  const [e3] = await post('expenses', { trip_id: t3.id, payer_member_id: m3[0].id, created_by: uid,
    title: '結算測試', category_emoji: '🧪', expense_date: '2099-06-01', foreign_amount: null, twd_amount: 800,
    exchange_rate: null, foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false });
  await post('expense_splits', m3.map(m => ({ expense_id: e3.id, member_id: m.id, is_participating: true, split_amount: null, split_pending: false })));
  const c3 = await (await fetch(`${URL}/functions/v1/calculate-settlement`, { method: 'POST', headers: AH, body: JSON.stringify({ trip_id: t3.id }) })).json();
  await fetch(`${URL}/functions/v1/confirm-settlement`, { method: 'POST', headers: AH, body: JSON.stringify({ settlement_id: c3.settlement_id }) });
  r = await del(`trips?id=eq.${t3.id}`);
  ck('有結算紀錄的 trip 可一刀刪除（P9 核心）', r.rows === 1, r.rows === -1 ? `HTTP ${r.status} ${r.body.slice(0,140)}` : `${r.rows} 列`);

  // ── 孤兒檢查 ──────────────────────────────────────────────
  console.log('\n══ 孤兒檢查');
  const tids = new Set((await get('trips?select=id')).map(x => x.id));
  const mem  = await get('trip_members?select=id,trip_id');
  const mids = new Set(mem.map(x => x.id));
  const exps = await get('expenses?select=id,trip_id'); const eids = new Set(exps.map(x => x.id));
  const stl  = await get('settlements?select=id,trip_id'); const sids = new Set(stl.map(x => x.id));
  const spl  = await get('expense_splits?select=expense_id,member_id');
  const sit  = await get('settlement_items?select=settlement_id,from_member_id,to_member_id');
  const orphans = [
    ['trip_members→trip', mem.filter(x => !tids.has(x.trip_id)).length],
    ['expenses→trip', exps.filter(x => !tids.has(x.trip_id)).length],
    ['settlements→trip', stl.filter(x => !tids.has(x.trip_id)).length],
    ['expense_splits', spl.filter(x => !eids.has(x.expense_id) || !mids.has(x.member_id)).length],
    ['settlement_items', sit.filter(x => !sids.has(x.settlement_id) || !mids.has(x.from_member_id) || !mids.has(x.to_member_id)).length],
  ];
  for (const [k, v] of orphans) ck(`無孤兒：${k}`, v === 0, `${v} 列`);

  // ── 清理 ──────────────────────────────────────────────────
  console.log('\n══ 清理臨時資料');
  for (const id of [trip.id, t2[0].id, t3.id]) {
    if (guard.remaining().some(([k]) => k === id)) await guard.deleteTrip(URL, AH, id);
  }
  const left = await get(`trips?select=id,name&name=like.ZZ%20*`);
  ck('臨時資料已清乾淨', left.length === 0, left.map(x => x.name).join(', ') || '無殘留');

  const bad = R.filter(x => !x.ok);
  console.log(`\n════ ${R.length - bad.length}/${R.length} 通過 ${bad.length ? '❌ ' + bad.map(x => x.n).join('；') : '✅'}`);
  process.exit(bad.length ? 1 : 0);
})();
