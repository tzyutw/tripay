/**
 * 東京：套用 Rozi 2026-08-30 的付款人指認，重算基準 A，並做一致性檢核 (b)。
 *
 * 指認規則（Rozi）：
 *  1 標題行「X自付」＝該區塊各筆記在 X 的個人款項（personal）
 *  2 括號「Y自付¥n」＝從主歸屬人拆 ¥n 給 Y；帶 ✅＝旅程中已結清，不進最終結算
 *  3 「X說不用記個人帳」＝不拆分，整筆歸區塊主人
 *  4 「代替X刷卡」＝刷卡者是付款人、款項歸 X
 *  5 「🍋🐱🐟均分」＝三人均分，各記各的個人款項
 *  6 $0／忘記金額＝照 Excel 記 0 或待填，不補數字
 */
const fs = require('fs');
const path = require('path');
const { openSheet, num, round2 } = require('./lib.cjs');
const { TRIPS, MEMBERS } = require('./trips.cjs');
const { parseTokyo } = require('./parse-all.cjs');

const cfg = TRIPS.tokyo;
const M = cfg.members;

// owner＝款項歸屬人；payer＝實際付錢的人（預設同 owner）
// splits: [{ to, jpy, settled }]  settled=true 代表旅程中已結清（✅），不進最終結算
const A = {
   16: { owner: 'ziyu' },
   17: { owner: 'ziyu' },
   18: { owner: 'ziyu' },
   60: { owner: 'ziyu' },
   84: { owner: 'ziyu' },
   85: { owner: 'ziyu', splits: [{ to: 'mei', jpy: 2955, settled: false }] },
   86: { owner: 'ziyu' },
   87: { owner: 'ziyu', splits: [{ to: 'nien', jpy: 5670, settled: true }, { to: 'ning', jpy: 5670, settled: false }] },
  112: { owner: 'ziyu' },
  113: { owner: 'ziyu' },
  114: { owner: 'ziyu' },
  115: { owner: 'ziyu' },
  141: { owner: 'ziyu' },
  142: { owner: 'ziyu' },
  143: { owner: 'ziyu' },
  144: { owner: 'ziyu', splits: [{ to: 'mei', jpy: 4000, settled: false, amended: true }] },
  155: { owner: 'ziyu' },
  156: { owner: 'ziyu' },
  157: { owner: 'ziyu' },

   35: { owner: 'ning', splits: [{ to: 'nien', jpy: 1600, settled: true }, { to: 'ziyu', jpy: 1540, settled: false }] },
   36: { owner: 'ning' },
   37: { owner: 'ning', splits: [{ to: 'mei', jpy: 1078, settled: false }] },
   56: { owner: 'ning', splits: [{ to: 'nien', jpy: 2000, settled: true }] },
   57: { owner: 'ning' },
   58: { owner: 'ning', splits: [{ to: 'ziyu', jpy: 15098, settled: false, amended: true }, { to: 'mei', jpy: 9999, settled: false, amended: true }] },
   77: { owner: 'ning' },
   78: { owner: 'ning' },
   79: { owner: 'ning', rule: '規則3 不拆分' },
   80: { owner: 'ning', splits: [{ to: 'nien', jpy: 1100, settled: true }] },
   81: { owner: 'ning', splits: [{ to: 'ziyu', jpy: 1172, settled: false }] },
   82: { owner: 'ning', splits: [{ to: 'ziyu', jpy: 750, settled: false }, { to: 'mei', jpy: 1600, settled: false }] },
  105: { owner: 'ning', rule: '規則3 不拆分' },
  106: { owner: 'ning', splits: [{ to: 'nien', jpy: 1000, settled: true }, { to: 'mei', jpy: 1000, settled: false }] },
  107: { owner: 'ning' },
  108: { owner: 'ning', splits: [{ to: 'mei', jpy: 2750, settled: false }] },
  109: { owner: 'ning', rule: '規則6 金額 0' },
  110: { owner: 'ning', rule: '規則3 不拆分' },
  128: { owner: 'mei',  payer: 'ning', rule: '規則4 代替 Mei 刷卡', wholeToOwnerUnsettled: true },
  129: { owner: 'ning', rule: '規則6 金額 0' },
  130: { owner: 'mei',  payer: 'ning', rule: '規則4 代替 Mei 刷卡', wholeToOwnerUnsettled: true },
  131: { owner: 'ning', rule: '規則6 金額 0' },
  132: { owner: 'ning', rule: '規則3 不拆分' },
  133: { owner: 'ning' },
  134: { owner: 'ning' },
  135: { owner: 'ning', splits: [{ to: 'nien', jpy: 2250, settled: true }] },
  136: { owner: 'ning', equal3: ['ning', 'mei', 'ziyu'], rule: '規則5 🍋🐱🐟均分' },
  137: { owner: 'ziyu', payer: 'ning', rule: '規則4 代替 Ziyu 刷卡', wholeToOwnerUnsettled: true },
  138: { owner: 'ning', rule: '規則6 金額 0' },
  139: { owner: 'ning', splits: [{ to: 'nien', jpy: 1711, settled: true }, { to: 'ziyu', jpy: 2935, settled: false }] },

   62: { owner: 'xiu' },
   89: { owner: 'xiu', rule: '規則3 不拆分' },
   90: { owner: 'xiu' },
   91: { owner: 'xiu' },

  117: { owner: 'nien', splits: [{ to: 'ziyu', jpy: 1230, settled: true }] },
  153: { owner: 'ning', rule: '規則7 金額 Excel 未記，照規則6' },
};

const parsed = parseTokyo(cfg);
const byRow = new Map(parsed.rows.map(r => [r.row, r]));
const nonCommon = parsed.rows.filter(r => r.excel_cat !== '共同（在小計範圍內）');

// ── 衝突偵測 ────────────────────────────────────────────────────────────────
const conflicts = [];
for (const r of nonCommon) if (!A[r.row]) conflicts.push({ kind: '清單未涵蓋', row: r.row, title: r.title, jpy: r.foreign_amount, twd: r.twd_amount, note: r.note });
for (const k of Object.keys(A)) if (!byRow.has(+k)) conflicts.push({ kind: '清單有但 Excel 無此消費列', row: +k });

// Excel「給X」欠款 vs 指認清單的未結拆分
const excelDebt = [];
for (const r of parsed.rows) for (const d of (r.debts || [])) excelDebt.push({ row: r.row, ...d });
const listDebt = [];
for (const [rowStr, a] of Object.entries(A)) {
  const row = +rowStr, rec = byRow.get(row); if (!rec) continue;
  const payer = a.payer || a.owner;
  if (a.wholeToOwnerUnsettled) { listDebt.push({ row, creditor: payer, debtor: a.owner, amount: rec.foreign_amount }); continue; }
  if (a.equal3) {
    const n = a.equal3.length, per = Math.floor(rec.foreign_amount / n);
    for (const m of a.equal3) if (m !== payer) listDebt.push({ row, creditor: payer, debtor: m, amount: per });
    continue;
  }
  for (const s of (a.splits || [])) if (!s.settled) listDebt.push({ row, creditor: payer, debtor: s.to, amount: s.jpy });
}

const keyOf = (d) => `${d.row}|${d.creditor}|${d.debtor}`;
const eMap = new Map(excelDebt.map(d => [keyOf(d), d.amount]));
const lMap = new Map(); for (const d of listDebt) lMap.set(keyOf(d), (lMap.get(keyOf(d)) || 0) + d.amount);
const debtDiff = [];
for (const k of new Set([...eMap.keys(), ...lMap.keys()])) {
  const e = eMap.get(k) ?? 0, l = lMap.get(k) ?? 0;
  if (Math.abs(e - l) > 0.5) { const [row, cr, db] = k.split('|'); debtDiff.push({ row: +row, creditor: cr, debtor: db, excel: e, list: l, diff: round2(l - e) }); }
}

// ── 基準 A ──────────────────────────────────────────────────────────────────
const { ws } = openSheet(cfg.file);
const poolJ = num(ws, 'B', 159);
const poolT = num(ws, 'D', 159) + cfg.postTotalTwdRows.reduce((s, r) => s + (num(ws, 'D', r) || 0), 0);
const bJ = Object.fromEntries(M.map(m => [m, poolJ / M.length]));
const bT = Object.fromEntries(M.map(m => [m, poolT / M.length]));

const unassignedJ = {}, unassignedT = {};
for (const r of nonCommon) {
  const a = A[r.row];
  const J = r.foreign_amount ?? 0, T = r.twd_amount ?? 0;
  if (!a) { unassignedJ[r.row] = J; unassignedT[r.row] = T; continue; }
  const alloc = {};
  if (a.equal3) { for (const m of a.equal3) alloc[m] = (alloc[m] || 0) + J / a.equal3.length; }
  else {
    let rest = J;
    for (const s of (a.splits || [])) { alloc[s.to] = (alloc[s.to] || 0) + s.jpy; rest -= s.jpy; }
    alloc[a.owner] = (alloc[a.owner] || 0) + rest;
  }
  // Excel 東京版型：一列有 D（台幣）＝刷卡付，B 只是日幣參考值，不可與 D 相加。
  // 這與 Excel 自己的小計一致（B 小計只加沒有 D 的列）。
  const hasTwd = r.twd_amount != null;
  for (const [m, j] of Object.entries(alloc)) {
    if (hasTwd) bT[m] += J > 0 ? T * (j / J) : (m === a.owner ? T : 0);
    else        bJ[m] += j;
  }
}

// ── 輸出 ────────────────────────────────────────────────────────────────────
console.log('══ 東京 基準 A（套用 Rozi 指認後）');
console.log(`   共同池：¥${poolJ.toLocaleString()} ÷5 = ¥${round2(poolJ / 5)}　台幣 ${round2(poolT)} ÷5 = ${round2(poolT / 5)}`);
for (const m of M) console.log(`   ${MEMBERS[m].emoji} ${MEMBERS[m].name.padEnd(5)} ¥${String(round2(bJ[m])).padStart(11)}   台幣 ${String(round2(bT[m])).padStart(10)}`);
console.log(`   合計    ¥${round2(M.reduce((s, m) => s + bJ[m], 0))}   台幣 ${round2(M.reduce((s, m) => s + bT[m], 0))}`);

console.log('\n══ 一致性檢核 (b0)：若「不」補回 r58／r144（純照 Rozi 清單字面）');
for (const g of cfg.debtGroups) for (const [debtor, col] of Object.entries(g.debtors)) {
  const e = num(ws, col, 159) || 0;
  let l = 0;
  for (const d of listDebt) { const a = A[d.row]; const amended = (a.splits||[]).some(s=>s.amended);
    if (amended && ((d.row===58)||(d.row===144))) continue;
    if (d.creditor===g.creditor && d.debtor===debtor) l += d.amount; }
  const df = round2(l - e);
  console.log(`   ${g.label} ← ${MEMBERS[debtor].emoji}${MEMBERS[debtor].name.padEnd(5)} Excel ${String(e).padStart(7)}　清單字面 ${String(round2(l)).padStart(7)}　差 ${String(df).padStart(8)}  ${df===0?'✅':'❌ 缺'}`);
}

console.log('\n══ 一致性檢核 (b)：指認清單的「未結」拆分 vs 已凍結的基準 B');
const agg = {}; for (const d of listDebt) { const k = `${d.creditor}<${d.debtor}`; agg[k] = (agg[k] || 0) + d.amount; }
for (const g of cfg.debtGroups) for (const [debtor, col] of Object.entries(g.debtors)) {
  const e = num(ws, col, 159) || 0, l = agg[`${g.creditor}<${debtor}`] || 0;
  const d = round2(l - e);
  console.log(`   ${g.label} ← ${MEMBERS[debtor].emoji}${MEMBERS[debtor].name.padEnd(5)} Excel ${String(e).padStart(7)}　指認清單 ${String(round2(l)).padStart(7)}　差 ${String(d).padStart(8)}  ${d === 0 ? '✅' : '❌'}`);
}
if (debtDiff.length) { console.log('\n   逐列差異：'); for (const d of debtDiff) console.log(`     r${d.row} ${MEMBERS[d.debtor].emoji}→${MEMBERS[d.creditor].emoji} Excel ${d.excel} / 清單 ${d.list} (差 ${d.diff})`); }
else console.log('\n   ✅ 逐列完全吻合');

console.log('\n══ 衝突列 (c)');
if (!conflicts.length) console.log('   （無）');
for (const c of conflicts) console.log(`   ${c.kind}：r${c.row} ${c.title ?? ''} ¥${c.jpy ?? '—'} / $${c.twd != null ? round2(c.twd) : '—'}　備註「${c.note ?? ''}」`);

fs.writeFileSync(path.resolve(__dirname, '../fixtures/tokyo-assign.json'),
  JSON.stringify({ assignments: A, baselineA: { jpy: bJ, twd: bT }, poolJ, poolT, conflicts, debtDiff, listDebt }, null, 2));
console.log('\n已寫出 fixtures/tokyo-assign.json');
