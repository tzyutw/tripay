/**
 * 上線前自檢（QA）：用謄入計畫跑一次 Tripay 的結算引擎邏輯，
 * 先在本機確認能重現已凍結的基準 A / B，再去碰 UI。
 * 引擎邏輯逐行對齊 supabase/functions/_shared/settlement-engine.ts。
 */
const fs = require('fs');
const path = require('path');
const { round2 } = require('./lib.cjs');
const { TRIPS, MEMBERS } = require('./trips.cjs');

const FIX = path.resolve(__dirname, '../fixtures');
const bTwd = JSON.parse(fs.readFileSync(path.join(FIX, 'baseline-b-twd.json'), 'utf8'));

function runSettlement(members, expenses) {
  const payout = Object.fromEntries(members.map(m => [m, 0]));
  const cost   = Object.fromEntries(members.map(m => [m, 0]));
  // 對齊 Edge Function 查詢條件：排除 personal / twd_pending / settled_on_spot / 軟刪除
  const eligible = expenses.filter(e => e.type !== 'personal' && !e.twdPending && !e.settledOnSpot);
  for (const e of eligible) {
    const twd = e.twd;
    payout[e.payer] += twd;
    if (e.type === 'shared') {
      const parts = e.participants;
      if (!parts.length) continue;
      const per = Math.round(twd / parts.length);
      const rem = twd - per * parts.length;
      for (const m of parts) cost[m] += per + (m === e.payer ? rem : 0);
    } else if (e.type === 'individual') {
      let input = 0;
      for (const [m, v] of Object.entries(e.individualAmts || {})) { input += v; cost[m] += v; }
      cost[e.payer] += twd - input;           // 差額一律歸付款人
    }
  }
  const net = Object.fromEntries(members.map(m => [m, round2(payout[m] - cost[m])]));
  return { payout, cost, net };
}

let allOk = true;
for (const id of ['fukuoka', 'tokyo', 'hokkaido', 'jeju']) {
  const cfg = TRIPS[id];
  const plan = JSON.parse(fs.readFileSync(path.join(FIX, `plan-${id}.json`), 'utf8'));
  const { cost, net } = runSettlement(cfg.members, plan.expenses);
  const sum = round2(cfg.members.reduce((s, m) => s + net[m], 0));
  const tol = cfg.members.length;

  console.log(`\n══ ${cfg.name}（${plan.expenses.length} 筆，容差 ±${tol}）`);
  if (id === 'fukuoka') {
    const exp = JSON.parse(fs.readFileSync(path.join(FIX, 'fukuoka-ruled.json'), 'utf8')).expectedNetTwd;
    console.log('   基準 B 不適用；與「由 Rozi 判讀推出的預期淨額」對照（參考值）：');
    for (const m of cfg.members) {
      const d = round2(net[m] - exp[m]);
      console.log(`   ${MEMBERS[m].emoji} ${MEMBERS[m].name.padEnd(5)} 模擬 ${String(net[m]).padStart(11)}　預期 ${String(round2(exp[m])).padStart(11)}　差 ${String(d).padStart(9)}  ${Math.abs(d) <= tol ? '✅' : '⚠️'}`);
    }
    console.log(`   Σ淨額 = ${sum} ${Math.abs(sum) < 1 ? '✅' : '❌'}`);
  } else {
    const base = bTwd[id].net_twd;
    for (const m of cfg.members) {
      const d = round2(net[m] - base[m]);
      const ok = Math.abs(d) <= tol;
      if (!ok) allOk = false;
      console.log(`   ${MEMBERS[m].emoji} ${MEMBERS[m].name.padEnd(5)} 模擬 ${String(net[m]).padStart(11)}　基準B ${String(base[m]).padStart(11)}　差 ${String(d).padStart(9)}  ${ok ? '✅' : '❌'}`);
    }
    console.log(`   Σ淨額 = ${sum} ${Math.abs(sum) < 1 ? '✅' : '❌'}`);
    if (Math.abs(sum) >= 1) allOk = false;
  }
}
console.log(`\n${allOk ? '✅ 模擬全數通過，可以進 UI 謄入' : '❌ 模擬未過，先修計畫再謄入'}`);

// ── 基準 A 自檢：每人分擔總額 ────────────────────────────────────────────────
console.log('\n\n════════ 基準 A｜每人分擔總額 自檢 ════════');
const FIXD = FIX;
const frozenA = (id, m) => {
  if (id === 'fukuoka') { const b = JSON.parse(fs.readFileSync(path.join(FIXD,'fukuoka-ruled.json'),'utf8')).baselineA[m]; return { foreign: b.jpy, twd: b.twd }; }
  if (id === 'tokyo')   { const b = JSON.parse(fs.readFileSync(path.join(FIXD,'tokyo-assign.json'),'utf8')).baselineA; return { foreign: b.jpy[m], twd: b.twd[m] }; }
  const b = JSON.parse(fs.readFileSync(path.join(FIXD,`${id}.json`),'utf8')).baselines.burden;
  return { foreign: b.foreign[m], twd: b.twd[m] };
};

const ERR = JSON.parse(fs.readFileSync(path.join(FIXD, 'errata-v1.1.json'), 'utf8'));
const applyErrata = (id, m, v) => {
  const c = ERR.corrections.find(x => x.trip === id && x.member === m);
  if (!c) return v;
  return { ...v, [c.field]: c.to };
};
console.log(`（已套用勘誤 v1.1：${ERR.corrections.map(c => c.id).join('／')}；判定幣別＝${ERR.judgeCurrency === 'twd' ? '台幣' : ERR.judgeCurrency}，外幣欄僅參考）`);

let aOk = true;
for (const id of ['fukuoka','tokyo','hokkaido','jeju']) {
  const cfg = TRIPS[id];
  const plan = JSON.parse(fs.readFileSync(path.join(FIXD, `plan-${id}.json`), 'utf8'));
  const bF = Object.fromEntries(cfg.members.map(m => [m, 0]));
  const bT = Object.fromEntries(cfg.members.map(m => [m, 0]));
  for (const e of plan.expenses) {
    const amt = e.baseCur === 'twd' ? e.twd : e.foreign;
    if (amt == null) continue;
    const tgt = e.baseCur === 'twd' ? bT : bF;
    if (e.type === 'personal') { tgt[e.payer] += amt; continue; }
    if (e.type === 'shared')   { for (const m of e.participants) tgt[m] += amt / e.participants.length; continue; }
    const ia = e.individualAmts || {};
    const tot = Object.values(ia).reduce((a, b) => a + b, 0);
    for (const [m, v] of Object.entries(ia)) tgt[m] += tot > 0 ? amt * (v / tot) : 0;
  }
  const fc = cfg.currency === 'KRW' ? '₩' : '¥';
  const tol = cfg.members.length;
  console.log(`\n══ ${cfg.name}（容差 ±${tol}）`);
  for (const m of cfg.members) {
    const f = applyErrata(id, m, frozenA(id, m));
    const dF = round2(bF[m] - (f.foreign || 0)), dT = round2(bT[m] - (f.twd || 0));
    const ok = Math.abs(dT) <= tol;                       // 判定只看台幣（A3 裁示）
    if (!ok) aOk = false;
    const fMark = Math.abs(dF) <= tol ? '' : `　⚠️${fc}差 ${dF}（參考，不判定）`;
    console.log(`   ${MEMBERS[m].emoji} ${MEMBERS[m].name.padEnd(5)} 台幣 模擬 ${String(round2(bT[m])).padStart(10)} / 基準 ${String(round2(f.twd||0)).padStart(10)} (差 ${String(dT).padStart(7)}) ${ok ? '✅' : '❌'}　${fc} 模擬 ${String(round2(bF[m])).padStart(11)} / 基準 ${String(round2(f.foreign||0)).padStart(11)}${fMark}`);
  }
}
console.log(`\n${aOk ? '✅ 基準 A 模擬全數通過' : '❌ 基準 A 模擬未過'}`);
