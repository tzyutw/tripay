/**
 * 007 cards ＋ trips.kind 回歸測試（套用前後各跑一次）
 * 套用前：cards 404、trips.kind 400 → 前段紅
 * 套用後：應全綠
 */
const fs = require('fs'); const path = require('path');
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const stFile = path.resolve(__dirname, '../../.auth/state.json');
const tok = JSON.parse(JSON.parse(fs.readFileSync(stFile, 'utf8')).origins[0].localStorage.find(x => x.name.startsWith('sb-')).value);
const { makeGuard } = require('./guard.cjs');
const guard = makeGuard();
const R = []; const ck = (n, ok, d = '') => { R.push({ n, ok }); console.log(`   ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

(async () => {
  let access = tok.access_token;
  if (!(await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } })).ok) {
    const j = await (await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: tok.refresh_token }) })).json();
    access = j.access_token;
  }
  const H  = { apikey: KEY, Authorization: `Bearer ${access}` };
  const AH = { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const uid = (await (await fetch(`${URL}/auth/v1/user`, { headers: H })).json()).id;
  const get = async (q) => { const r = await fetch(`${URL}/rest/v1/${q}`, { headers: H }); return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) }; };

  console.log('\n══ 1 cards 表與 RLS');
  const c = await get('cards?select=id');
  ck('cards 表存在且可讀', c.ok, c.ok ? `${c.json.length} 筆` : `HTTP ${c.status}`);
  const anon = await (await fetch(`${URL}/rest/v1/cards?select=id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
  ck('anon key 讀不到 cards（卡片隱私）', Array.isArray(anon) && anon.length === 0, `${Array.isArray(anon) ? anon.length : '?'} 筆`);

  console.log('\n══ 2 trips.kind：既有四趟不受影響');
  const t = await get('trips?select=id,name,kind,card_id');
  ck('trips.kind 欄位存在', t.ok, t.ok ? `${t.json.length} 筆` : `HTTP ${t.status}`);
  if (t.ok) {
    ck('既有四趟 kind 皆為 trip', t.json.every(x => x.kind === 'trip'), t.json.map(x => x.kind).join(','));
    ck('既有四趟 card_id 皆為 null', t.json.every(x => x.card_id === null));
  }

  console.log('\n══ 3 check constraint：statement 必須有卡');
  const bad = await fetch(`${URL}/rest/v1/trips`, { method: 'POST', headers: AH, body: JSON.stringify({
    owner_id: uid, name: 'ZZ 違規帳單', emoji: '💳', currency: 'TWD',
    start_date: '2099-08-01', end_date: '2099-08-31', status: 'planned',
    share_token: crypto.randomUUID(), kind: 'statement' }) });
  ck('statement 沒帶 card_id 會被擋下', !bad.ok, `HTTP ${bad.status}`);

  console.log('\n══ 4 端到端：建卡 → 建帳單週期 → 記一筆 → 刪乾淨');
  let cardId = null, stmtId = null;
  if (c.ok) {
    const [card] = await (await fetch(`${URL}/rest/v1/cards`, { method: 'POST', headers: AH, body: JSON.stringify({
      owner_id: uid, nickname: 'ZZ 測試主卡', last4: '9999', is_primary: true }) })).json();
    cardId = card && card.id;
    ck('可建立主卡', !!cardId);

    const people = await get('people?select=id,name&limit=1');
    const [sub] = await (await fetch(`${URL}/rest/v1/cards`, { method: 'POST', headers: AH, body: JSON.stringify({
      owner_id: uid, nickname: 'ZZ 測試副卡', last4: '8888', is_primary: false,
      parent_card_id: cardId, holder_person_id: people.ok && people.json[0] ? people.json[0].id : null }) })).json();
    ck('可建立副卡並指向主卡與持卡人', !!(sub && sub.parent_card_id === cardId), sub && sub.holder_person_id ? '已綁 people' : '未綁 people');

    const [stmt] = await (await fetch(`${URL}/rest/v1/trips`, { method: 'POST', headers: AH, body: JSON.stringify({
      owner_id: uid, name: 'ZZ 2099 年 8 月帳單', emoji: '💳', currency: 'TWD',
      start_date: '2099-08-01', end_date: '2099-08-31', status: 'planned',
      share_token: crypto.randomUUID(), kind: 'statement', card_id: cardId }) })).json();
    stmtId = stmt && stmt.id;
    ck('可建立 kind=statement 的週期', !!stmtId && stmt.kind === 'statement');
    if (stmtId) guard.register(stmtId, 'ZZ 2099 年 8 月帳單');

    if (stmtId) {
      const [mem] = await (await fetch(`${URL}/rest/v1/trip_members`, { method: 'POST', headers: AH, body: JSON.stringify({
        trip_id: stmtId, name: 'ZZ持卡人', emoji: '💳', sort_order: 0 }) })).json();
      const [exp] = await (await fetch(`${URL}/rest/v1/expenses`, { method: 'POST', headers: AH, body: JSON.stringify({
        trip_id: stmtId, payer_member_id: mem.id, created_by: uid, title: 'ZZ 帳單消費',
        category_emoji: '💳', expense_date: '2099-08-15', foreign_amount: null, twd_amount: 1280,
        exchange_rate: null, foreign_pending: false, twd_pending: false, payment_method: 'credit_card',
        expense_type: 'personal', settled_on_spot: false, is_sponsor: false, card_id: sub ? sub.id : cardId }) })).json();
      ck('消費可掛 card_id（FK 生效）', !!(exp && exp.card_id));
    }

    // 清理
    if (stmtId) await guard.deleteTrip(URL, AH, stmtId);
    for (const id of [sub && sub.id, cardId].filter(Boolean)) {
      await fetch(`${URL}/rest/v1/cards?id=eq.${id}`, { method: 'DELETE', headers: AH });
    }
    const leftCards = await get(`cards?select=id&nickname=like.ZZ%20*`);
    ck('測試卡片與帳單週期已清乾淨', leftCards.ok && leftCards.json.length === 0 && guard.remaining().length === 0);
  }

  console.log('\n══ 5 Phase 1 結算不受影響');
  const si = await get('settlement_items?select=from_member_id,to_member_id');
  const tm = await get('trip_members?select=id');
  if (si.ok && tm.ok) {
    const ids = new Set(tm.json.map(x => x.id));
    ck('無指向不存在成員的結算項', si.json.every(x => ids.has(x.from_member_id) && ids.has(x.to_member_id)));
  }

  const bad2 = R.filter(x => !x.ok);
  console.log(`\n════ ${R.length - bad2.length}/${R.length} 通過 ${bad2.length ? '❌ ' + bad2.map(x => x.n).join('；') : '✅'}`);
  process.exit(bad2.length ? 1 : 0);
})();
