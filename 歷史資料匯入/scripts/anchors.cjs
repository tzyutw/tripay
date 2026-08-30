/** 校準：與 2026-08-11「整趟總花費」錨點交叉驗證，並量化東京無主列。 */
const { openSheet, num, str, round2 } = require('./lib.cjs');
const { TRIPS } = require('./trips.cjs');
const { parseTokyo } = require('./parse-all.cjs');

// 福岡錨點依 F5 裁示改為修正值（原 194,837 含 21,810.38 雙幣重疊，見驗收基準表）
const ANCHORS = { fukuoka: 173025.53, tokyo: 141758, hokkaido: 76796, jeju: 111320 };

function show(id, twd, parts) {
  const a = ANCHORS[id], d = round2(twd - a);
  console.log(`  ${TRIPS[id].name.padEnd(22)} 解析=${String(round2(twd)).padStart(11)}  錨點=${String(a).padStart(9)}  差=${String(d).padStart(8)}  ${Math.abs(d) <= 3 ? '✅' : '❌'}`);
  console.log(`      ${parts}`);
}

console.log('\n══ 整趟總花費錨點交叉驗證（台幣）');
{ const { ws } = openSheet(TRIPS.fukuoka.file);
  const jpy = ['E','F','G'].reduce((s,c)=>s+num(ws,c,98),0), rate = num(ws,'B',99);
  // F5：台幣只取「純自購」列（與 E/F/G 重疊的列不計）
  let twdSelf = 0;
  for (const col of ['K','L','M']) for (let r=TRIPS.fukuoka.firstRow; r<98; r++) {
    if (TRIPS.fukuoka.subtotalRows.includes(r)) continue;
    const v = num(ws,col,r); if(!v) continue;
    const hasShare = ['E','F','G'].some(c=>{const x=num(ws,c,r); return x!=null&&x!==0;});
    if (!hasShare) twdSelf += v;
  }
  show('fukuoka', jpy*rate + twdSelf, `¥${round2(jpy)}（E/F/G98）×${rate} ＝ ${round2(jpy*rate)}　＋　純自購台幣 ${round2(twdSelf)}（K/L/M 扣除與 E/F/G 重疊的 6 列）`); }

{ const { ws } = openSheet(TRIPS.tokyo.file);
  const jpy = num(ws,'B',159), rate = num(ws,'B',167), twd = num(ws,'D',159);
  const post = TRIPS.tokyo.postTotalTwdRows.reduce((s,r)=>s+(num(ws,'D',r)||0),0);
  show('tokyo', jpy*rate + twd + post, `¥${jpy}（B159）×${rate} ＝ ${round2(jpy*rate)}　＋　台幣 ${round2(twd)}（D159）　＋　總計後台幣 ${post}（D160:D162）`); }

{ const { ws } = openSheet(TRIPS.hokkaido.file);
  const jpy = num(ws,'C',137), rate = num(ws,'C',140), twd = num(ws,'E',137);
  show('hokkaido', jpy*rate + twd, `¥${jpy}（C137）×${rate} ＝ ${round2(jpy*rate)}　＋　台幣 ${twd}（E137）`); }

{ const { ws } = openSheet(TRIPS.jeju.file);
  const twd = num(ws,'E',194);
  show('jeju', twd, `台幣 ${round2(twd)}（E194，₩ 已逐列換算）`); }

console.log('\n══ 東京：Excel 未記付款人的個人消費列（無法歸屬到任何人）');
const t = parseTokyo(TRIPS.tokyo);
const orphan = t.rows.filter(r => r.expense_type === 'personal' && !r.payer);
const oF = orphan.reduce((s,r)=>s+(r.foreign_amount||0),0);
const oT = orphan.reduce((s,r)=>s+(r.twd_amount||0),0);
console.log(`  ${orphan.length} 筆，合計 ¥${round2(oF)} / 台幣 ${round2(oT)}`);
console.log('  （這些是「小計」之後的個人購物列，Excel 只寫「自付」或品名，沒寫是誰的）');
for (const r of orphan.slice(0,10)) console.log(`    r${r.row} ${String(r.title).slice(0,22).padEnd(24)} ¥${r.foreign_amount ?? '-'} / $${r.twd_amount ?? '-'}  註記「${r.note}」`);
if (orphan.length > 10) console.log(`    …另 ${orphan.length-10} 筆`);
