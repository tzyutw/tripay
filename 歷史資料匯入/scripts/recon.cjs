/**
 * 鐵律驗證：解析出的列，加總後必須對得上 Excel 自己的 小計／總計。
 *
 * 做法：直接讀 Excel 的 SUM 公式範圍（不是自己猜區塊），
 *   (a) 用公式範圍加總 → 必須等於該格快取值（證明我讀對了格子）
 *   (b) 用「我抽出的消費列」全量加總 → 與 Excel 總計比對；
 *       差額必然來自 Excel 公式自己漏加的列，逐列列出，不手調。
 */
const { openSheet, num, str, round2 } = require('./lib.cjs');
const { TRIPS } = require('./trips.cjs');

function evalSumFormula(ws, f) {
  // 支援 SUM(A1:A9) / SUM(A1,A3,A5:A7)
  const m = f.match(/^SUM\((.*)\)$/i);
  if (!m) return null;
  const cells = [];
  for (const part of m[1].split(',')) {
    const rng = part.trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    const one = part.trim().match(/^([A-Z]+)(\d+)$/);
    if (rng) { for (let r = +rng[2]; r <= +rng[4]; r++) cells.push([rng[1], r]); }
    else if (one) cells.push([one[1], +one[2]]);
    else return null;
  }
  let s = 0;
  for (const [c, r] of cells) { const v = num(ws, c, r); if (v != null) s += v; }
  return { sum: s, cells };
}

function checkTrip(cfg, cols) {
  const { ws } = openSheet(cfg.file);
  console.log(`\n══ ${cfg.name}（${cfg.file}）`);
  let ok = true;
  const covered = {};              // col → Set(row)  Excel 公式實際涵蓋到的列

  for (const sr of cfg.subtotalRows) {
    for (const col of cols) {
      const c = ws[`${col}${sr}`];
      if (!c) continue;
      const cached = typeof c.v === 'number' ? c.v : null;
      if (!c.f) continue;
      const r = evalSumFormula(ws, c.f);
      if (!r) { console.log(`   ⚠️ 無法解析公式 ${col}${sr} = ${c.f}`); continue; }
      covered[col] = covered[col] || new Set();
      for (const [cc, rr] of r.cells) if (cc === col) covered[col].add(rr);
      const d = round2(r.sum - (cached ?? 0));
      if (Math.abs(d) > 0.01) { ok = false; console.log(`   ❌ ${col}${sr} 公式重算=${round2(r.sum)} 快取=${round2(cached)} 差=${d}`); }
    }
  }
  console.log(`   ${ok ? '✅' : '❌'} 小計格公式重算與快取值一致（證明格子讀取正確）`);

  // 全量 vs 總計：差額＝Excel 公式漏加的列
  const totalRow = cfg.totalRow;
  for (const col of cols) {
    const tc = ws[`${col}${totalRow}`];
    if (!tc || typeof tc.v !== 'number') continue;
    let all = 0; const missed = [];
    for (let r = cfg.firstRow; r < totalRow; r++) {
      if (cfg.subtotalRows.includes(r)) continue;
      const v = num(ws, col, r);
      if (v == null) continue;
      all += v;
      if (!(covered[col] && covered[col].has(r))) missed.push({ r, v });
    }
    const d = round2(all - tc.v);
    if (Math.abs(d) <= 0.01) {
      console.log(`   ✅ ${col} 欄：全部消費列加總 ${round2(all)} ＝ Excel 總計 ${round2(tc.v)}`);
    } else {
      const missedSum = round2(missed.reduce((a, b) => a + b.v, 0));
      console.log(`   ⚠️ ${col} 欄：全部消費列加總 ${round2(all)} vs Excel 總計 ${round2(tc.v)}（差 ${d}）`);
      console.log(`      └ Excel 自己的 SUM 公式未涵蓋 ${missed.length} 列，合計 ${missedSum}${Math.abs(missedSum - d) < 0.02 ? ' ← 差額完全由此而來 ✅' : ''}`);
      for (const m of missed) {
        const title = str(ws, cfg.cols.item, m.r) || str(ws, 'B', m.r) || '';
        console.log(`         r${m.r} ${String(title).slice(0, 26).padEnd(26)} ${col}=${m.v}`);
      }
    }
  }
}

checkTrip(TRIPS.fukuoka,  ['B', 'C', 'E', 'F', 'G', 'K', 'L', 'M']);
checkTrip(TRIPS.tokyo,    ['B', 'D']);
checkTrip(TRIPS.hokkaido, ['C', 'E']);
checkTrip(TRIPS.jeju,     ['C', 'E']);
