/**
 * Stage 3：唯讀取 Tripay 數字，與已凍結的驗收基準對照。
 * 只用 anon key 做 SELECT，不做任何寫入（護欄 #2）。
 *
 * 用法：node verify.cjs <trip> [--day YYYY-MM-DD]
 */
const fs = require('fs');
const path = require('path');

const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const FIX = path.resolve(__dirname, '../fixtures');
const CKPT = path.resolve(__dirname, '../checkpoint.json');
const r2 = (n) => Math.round(n * 100) / 100;
const nm = (plan, key) => (plan.trip.members.find(m => m.key === key) || {}).name;
const keyOf = (plan, name) => (plan.trip.members.find(m => m.name === name) || {}).key;

async function all(table, query) {
  let out = [], from = 0;
  for (;;) {
    const res = await fetch(`${URL}/rest/v1/${table}?${query}&limit=1000&offset=${from}`, { headers: H });
    const j = await res.json();
    if (!Array.isArray(j)) throw new Error(`${table}: ${JSON.stringify(j).slice(0, 200)}`);
    out = out.concat(j); if (j.length < 1000) break; from += 1000;
  }
  return out;
}

async function fetchTrip(tripUuid) {
  const members = await all('trip_members', `select=id,name,emoji,sort_order&trip_id=eq.${tripUuid}`);
  members.sort((a, b) => a.sort_order - b.sort_order);
  const expenses = await all('expenses', `select=id,payer_member_id,title,expense_date,foreign_amount,twd_amount,twd_pending,foreign_pending,expense_type,settled_on_spot,is_sponsor,deleted_at&trip_id=eq.${tripUuid}`);
  const live = expenses.filter(e => !e.deleted_at);
  let splits = [];
  for (let i = 0; i < live.length; i += 100) {
    const ids = live.slice(i, i + 100).map(e => e.id).join(',');
    splits = splits.concat(await all('expense_splits', `select=expense_id,member_id,is_participating,split_amount,split_pending&expense_id=in.(${ids})`));
  }
  return { members, expenses: live, splits };
}

/** 與 supabase/functions/_shared/settlement-engine.ts 同邏輯 */
function settle(members, expenses, splits) {
  const payout = {}, cost = {};
  for (const m of members) { payout[m.id] = 0; cost[m.id] = 0; }
  const byExp = new Map();
  for (const s of splits) { if (!byExp.has(s.expense_id)) byExp.set(s.expense_id, []); byExp.get(s.expense_id).push(s); }
  const elig = expenses.filter(e => e.expense_type !== 'personal' && !e.twd_pending && !e.settled_on_spot);
  for (const e of elig) {
    const amt = Number(e.twd_amount);
    payout[e.payer_member_id] += amt;
    const parts = (byExp.get(e.id) || []).filter(s => s.is_participating);
    if (e.expense_type === 'shared') {
      if (!parts.length) continue;
      const per = Math.round(amt / parts.length), rem = amt - per * parts.length;
      for (const s of parts) cost[s.member_id] += per + (s.member_id === e.payer_member_id ? rem : 0);
    } else {
      let input = 0;
      for (const s of parts) if (!s.split_pending && s.split_amount !== null) { input += Number(s.split_amount); cost[s.member_id] += Number(s.split_amount); }
      cost[e.payer_member_id] += amt - input;
    }
  }
  const net = {};
  for (const m of members) net[m.id] = r2(payout[m.id] - cost[m.id]);
  return net;
}

/** 基準 A：每人分擔總額，一列只用一種幣別（有台幣用台幣） */
function burden(members, expenses, splits) {
  const bF = {}, bT = {};
  for (const m of members) { bF[m.id] = 0; bT[m.id] = 0; }
  const byExp = new Map();
  for (const s of splits) { if (!byExp.has(s.expense_id)) byExp.set(s.expense_id, []); byExp.get(s.expense_id).push(s); }
  for (const e of expenses) {
    const useTwd = e.twd_amount !== null && !e.twd_pending;
    const amt = useTwd ? Number(e.twd_amount) : (e.foreign_amount !== null ? Number(e.foreign_amount) : null);
    if (amt == null) continue;
    const tgt = useTwd ? bT : bF;
    if (e.expense_type === 'personal') { tgt[e.payer_member_id] += amt; continue; }
    const parts = (byExp.get(e.id) || []).filter(s => s.is_participating);
    if (!parts.length) continue;
    if (e.expense_type === 'shared') { for (const s of parts) tgt[s.member_id] += amt / parts.length; continue; }
    const tot = parts.reduce((a, s) => a + Number(s.split_amount || 0), 0);
    for (const s of parts) tgt[s.member_id] += tot > 0 ? amt * (Number(s.split_amount || 0) / tot) : 0;
  }
  return { bF, bT };
}

(async () => {
  const trip = process.argv[2];
  const dayArg = process.argv.indexOf('--day');
  const day = dayArg > -1 ? process.argv[dayArg + 1] : null;
  const ckpt = JSON.parse(fs.readFileSync(CKPT, 'utf8'));
  const uuid = ckpt[trip] && ckpt[trip].tripUuid;
  if (!uuid) { console.log(`checkpoint 沒有 ${trip} 的 tripUuid`); process.exit(1); }
  const plan = JSON.parse(fs.readFileSync(path.join(FIX, `plan-${trip}.json`), 'utf8'));
  const { members, expenses, splits } = await fetchTrip(uuid);
  const nameOf = Object.fromEntries(members.map(m => [m.id, m.name]));
  const idOf = Object.fromEntries(members.map(m => [m.name, m.id]));

  if (day) {
    const dbDay = expenses.filter(e => e.expense_date === day);
    const planDay = plan.expenses.filter(e => e.date === day);
    const sum = (rows, f) => r2(rows.reduce((s, x) => s + (Number(f(x)) || 0), 0));
    console.log(`\n══ ${trip} 第一天 ${day} 小計比對`);
    console.log(`   筆數    Tripay ${dbDay.length}　計畫 ${planDay.length}　${dbDay.length === planDay.length ? '✅' : '❌'}`);
    const a = sum(dbDay, x => x.twd_amount), b = sum(planDay, x => x.twd);
    const c = sum(dbDay, x => x.foreign_amount), d = sum(planDay, x => x.foreign);
    console.log(`   台幣合計 Tripay ${a}　計畫 ${b}　差 ${r2(a - b)} ${Math.abs(a - b) < 1 ? '✅' : '❌'}`);
    console.log(`   外幣合計 Tripay ${c}　計畫 ${d}　差 ${r2(c - d)} ${Math.abs(c - d) < 1 ? '✅' : '❌'}`);
    const types = (rows, f) => JSON.stringify(rows.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {}));
    console.log(`   型態    Tripay ${types(dbDay, x => x.expense_type + (x.settled_on_spot ? '(當場分)' : ''))}`);
    console.log(`           計畫   ${types(planDay, x => x.type + (x.settledOnSpot ? '(當場分)' : ''))}`);
    process.exit(0);
  }

  const net = settle(members, expenses, splits);
  const { bF, bT } = burden(members, expenses, splits);

  // 計畫端的期望值（全部以台幣計，與 Tripay 實際儲存一致）
  const expT = {}, expNet = {};
  for (const m of members) { expT[m.name] = 0; }
  for (const e of plan.expenses) {
    const amt = e.twdPending ? null : e.twd;
    if (amt == null) continue;
    if (e.type === 'personal') { expT[nm(plan, e.payer)] += amt; continue; }
    if (e.type === 'shared') { for (const k of e.participants) expT[nm(plan, k)] += amt / e.participants.length; continue; }
    const ia = e.individualAmts || {};
    for (const [k, v] of Object.entries(ia)) expT[nm(plan, k)] += v;
  }
  const bTwd = JSON.parse(fs.readFileSync(path.join(FIX, 'baseline-b-twd.json'), 'utf8'));
  const frozenB = bTwd[trip] ? bTwd[trip].net_twd : null;
  const tol = members.length;

  console.log(`\n══ ${trip}：Tripay ${expenses.length} 筆（計畫 ${plan.expenses.length} 筆）${expenses.length === plan.expenses.length ? '✅' : '❌ 筆數不符'}`);
  console.log('\n   基準 A｜每人分擔總額（台幣，容差 ±' + tol + '）');
  console.log('   成員      Tripay 實際      計畫期望        差');
  let aOk = true;
  for (const m of members) {
    const d = r2(bT[m.id] - (expT[m.name] || 0));
    if (Math.abs(d) > tol) aOk = false;
    console.log(`   ${m.emoji} ${m.name.padEnd(6)} ${String(r2(bT[m.id])).padStart(13)} ${String(r2(expT[m.name] || 0)).padStart(14)} ${String(d).padStart(9)}  ${Math.abs(d) <= tol ? '✅' : '❌'}`);
  }
  console.log('\n   基準 B｜每人結算淨額（台幣，容差 ±' + tol + '）');
  console.log('   成員      Tripay 實際      凍結基準B       差');
  let bOk = true;
  for (const m of members) {
    const base = frozenB ? frozenB[keyOf(plan, m.name)] : null;
    if (base == null) { console.log(`   ${m.emoji} ${m.name.padEnd(6)} ${String(net[m.id]).padStart(13)}          （基準 B 不適用）`); continue; }
    const d = r2(net[m.id] - base);
    if (Math.abs(d) > tol) bOk = false;
    console.log(`   ${m.emoji} ${m.name.padEnd(6)} ${String(net[m.id]).padStart(13)} ${String(r2(base)).padStart(14)} ${String(d).padStart(9)}  ${Math.abs(d) <= tol ? '✅' : '❌'}`);
  }
  const sum = r2(members.reduce((s, m) => s + net[m.id], 0));
  console.log(`   Σ淨額 = ${sum} ${Math.abs(sum) < 1 ? '✅' : '❌'}`);
  console.log(`\n   判定：基準 A ${aOk ? '✅' : '❌'}　基準 B ${frozenB ? (bOk ? '✅' : '❌') : '（不適用）'}`);
  fs.writeFileSync(path.join(FIX, `actual-${trip}.json`), JSON.stringify({ uuid, count: expenses.length, burdenForeign: bF, burdenTwd: bT, expectedTwd: expT, net, frozenB, aOk, bOk, nameOf }, null, 2));
})();
