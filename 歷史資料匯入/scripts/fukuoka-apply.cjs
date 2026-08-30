/**
 * 福岡：套用 Rozi 2026-08-30 判讀。
 * 總原則：每人分擔金額一律以 E/F/G 欄為準（與任何描述衝突時欄位優先）。
 * 基準 B 維持「不適用」，但這些筆會讓 Tripay 算出真實欠款（Ning 為債主）——照實呈現。
 */
const fs = require('fs');
const path = require('path');
const { openSheet, num, str, round2 } = require('./lib.cjs');
const { TRIPS, MEMBERS } = require('./trips.cjs');

const cfg = TRIPS.fukuoka;
const { ws } = openSheet(cfg.file);

// Rozi 判讀：付款人一律 Ning（刷卡）
const RULED = {
   5: { title: 'ORIX租車',    type: 'shared',     payer: 'ning', date: '2023-11-17' },
  58: { title: 'AMANEK住宿',  type: 'shared',     payer: 'ning', date: '2023-11-19' },
  60: { title: '唐吉軻德',     type: 'shared',     payer: 'ning', date: '2023-11-19' },
  76: { title: 'GU',         type: 'shared',     payer: 'ning', date: '2023-11-20' },
  74: { title: 'UQ',         type: 'shared',     payer: 'ning', date: '2023-11-20', note: '付款人未參與（TC-DIFF-03）' },
  52: { title: '由布院之森 龍貓', type: 'individual', payer: 'ning', date: '2023-11-19' },
  55: { title: 'SNOOPY茶屋紀念品', type: 'individual', payer: 'ning', date: '2023-11-19' },
};

// 各日當日匯率（J 欄）
const RATES = {};
for (let r = cfg.firstRow; r < cfg.totalRow; r++) {
  const d = str(ws, 'A', r); const j = num(ws, 'J', r);
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) RATES[d] = j;
}
// 11/20 Excel 未填匯率 → 沿用前一日（待 Rozi 確認）
const RATE_FALLBACK = '2023-11-19';
const rateOf = (d) => RATES[d] ?? RATES[RATE_FALLBACK];

console.log('══ 福岡 各日當日匯率（J 欄）');
for (const [d, r] of Object.entries(RATES)) console.log(`   ${d}  ${r ?? '（Excel 未填 → 沿用 ' + RATES[RATE_FALLBACK] + '，待確認）'}`);

// 基準 A：E/F/G（¥）與 K/L/M（台幣），依 Rozi 總原則
console.log('\n══ 福岡 基準 A（Rozi 總原則：一律以 E/F/G 欄為準）');
// F5（Rozi 2026-08-30 裁示）：台幣分擔只取「純自購」列——
// 同時記在 E/F/G 的列，其金額已用日幣計入分擔，K/L/M 只是「刷誰的卡」的付款紀錄。
const bA = {};
for (const m of cfg.members) {
  const col = cfg.selfCardCols[m];
  let pure = 0, overlap = 0; const ovRows = [];
  for (let r = cfg.firstRow; r < cfg.totalRow; r++) {
    if (cfg.subtotalRows.includes(r)) continue;
    const v = num(ws, col, r); if (!v) continue;
    const hasShare = Object.values(cfg.shareCols).some(c => { const x = num(ws, c, r); return x != null && x !== 0; });
    if (hasShare) { overlap += v; ovRows.push(`r${r} ${str(ws, 'A', r)} ${round2(v)}`); } else pure += v;
  }
  bA[m] = { jpy: num(ws, cfg.shareCols[m], 98), twd: round2(pure), twd_raw_col: round2(num(ws, col, 98)), twd_overlap_excluded: round2(overlap), overlap_rows: ovRows };
  console.log(`   ${MEMBERS[m].emoji} ${MEMBERS[m].name.padEnd(5)} ¥${String(round2(bA[m].jpy)).padStart(11)}（${cfg.shareCols[m]}98）　自刷台幣 ${String(bA[m].twd).padStart(10)}（${col}98 ${bA[m].twd_raw_col} − 重疊 ${bA[m].twd_overlap_excluded}）`);
}
const fukTotalTwd = round2(num(ws, 'E', 98) * num(ws, 'B', 99) + num(ws, 'F', 98) * num(ws, 'B', 99) + num(ws, 'G', 98) * num(ws, 'B', 99)
  + cfg.members.reduce((s, m) => s + bA[m].twd, 0));
console.log(`\n   整趟總花費（F5 修正後）＝ ¥397,450×0.22 ＋ 純自購台幣 ${round2(cfg.members.reduce((s,m)=>s+bA[m].twd,0))} ＝ 台幣 ${fukTotalTwd}`);

// Rozi 判讀諸列所隱含的欠款
console.log('\n══ 由 Rozi 判讀推出的欠款（Tripay 會算出來，基準 B 仍標「不適用」）');
const debtJ = {}, debtT = {};
const add = (from, to, j, rate) => {
  const kj = `${from}->${to}`;
  debtJ[kj] = (debtJ[kj] || 0) + j;
  debtT[kj] = (debtT[kj] || 0) + j * rate;
};
const rows = [];
for (const [rowStr, R] of Object.entries(RULED)) {
  const row = +rowStr, rate = rateOf(R.date);
  const shares = {};
  for (const m of cfg.members) { const v = num(ws, cfg.shareCols[m], row); if (v) shares[m] = v; }
  const total = num(ws, 'B', row) ?? num(ws, 'C', row);
  for (const [m, v] of Object.entries(shares)) if (m !== R.payer) add(m, R.payer, v, rate);
  rows.push({ row, ...R, total, rate, shares });
  const desc = cfg.members.map(m => shares[m] ? `${MEMBERS[m].emoji}${round2(shares[m])}` : null).filter(Boolean).join(' / ');
  console.log(`   r${row} ${R.title.padEnd(14)} ${R.type.padEnd(10)} 總額 ¥${String(total).padStart(6)} 匯率 ${rate}　分擔 ${desc}${R.note ? '　※ ' + R.note : ''}`);
}
console.log('');
for (const [k, j] of Object.entries(debtJ)) {
  const [f, t] = k.split('->');
  console.log(`   ${MEMBERS[f].emoji}${MEMBERS[f].name} → ${MEMBERS[t].emoji}${MEMBERS[t].name}：¥${round2(j).toLocaleString()}　＝ 台幣 ${round2(debtT[k]).toLocaleString()}`);
}
const net = Object.fromEntries(cfg.members.map(m => [m, 0]));
for (const [k, v] of Object.entries(debtT)) { const [f, t] = k.split('->'); net[f] -= v; net[t] += v; }
console.log('\n   → 預期 Tripay 每人淨額（台幣）：');
for (const m of cfg.members) console.log(`      ${MEMBERS[m].emoji} ${MEMBERS[m].name.padEnd(5)} ${String(round2(net[m])).padStart(11)}  ${net[m] > 0 ? '債主' : net[m] < 0 ? '應付' : '打平'}`);
console.log(`      Σ = ${round2(cfg.members.reduce((s, m) => s + net[m], 0))}`);

fs.writeFileSync(path.resolve(__dirname, '../fixtures/fukuoka-ruled.json'),
  JSON.stringify({ ruled: rows, baselineA: bA, totalTwdCorrected: fukTotalTwd, rates: RATES, expectedNetTwd: net, debtJpy: debtJ, debtTwd: debtT }, null, 2));
console.log('\n已寫出 fixtures/fukuoka-ruled.json');
