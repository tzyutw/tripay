/** 產出東京 32 筆「Excel 未記付款人」的個人消費清單，供 Rozi 逐筆指認。 */
const fs = require('fs');
const path = require('path');
const { round2 } = require('./lib.cjs');
const { TRIPS } = require('./trips.cjs');
const { parseTokyo } = require('./parse-all.cjs');

const t = parseTokyo(TRIPS.tokyo);
const orphan = t.rows.filter(r => r.expense_type === 'personal' && !r.payer);

const L = [];
const P = (s = '') => L.push(s);
P('# 2024 東京：待指認付款人的個人消費（32 筆）');
P();
P('> Excel 在「小計」之後列出這些個人購物，但只寫「自付」或品名，沒寫是誰買的。');
P('> 不影響結算（personal 不進結算），但影響每人「分擔總額」與「我的花費」。');
P();
P('**填法**：在「誰的？」欄填 emoji（🍋 Ning／🌷 Nien／🐟 Ziyu／🐵 Xiu／🐱 Mei）。');
P('一筆多人共買就寫多個 emoji 並註明金額；真的想不起來就填 `?`，該筆基準 A 標為不可歸屬。');
P();
P('| # | Excel 列 | 日期 | 品項 | 日幣 | 台幣 | Excel 備註 | **誰的？** |');
P('|---|---------|------|------|-----:|-----:|-----------|-----------|');
orphan.forEach((r, i) => {
  P(`| ${i + 1} | r${r.row} | ${r.date} | ${r.title} | ${r.foreign_amount != null ? r.foreign_amount.toLocaleString() : '—'} | ${r.twd_amount != null ? round2(r.twd_amount).toLocaleString() : '—'} | ${r.note || ''} | |`);
});
P();
const oF = orphan.reduce((s, r) => s + (r.foreign_amount || 0), 0);
const oT = orphan.reduce((s, r) => s + (r.twd_amount || 0), 0);
P(`**合計：¥${oF.toLocaleString()} ／ 台幣 $${round2(oT).toLocaleString()}**`);
P();
P('## 參考：Excel 有寫的線索');
P();
P('備註裡出現 ✅ 表示「已結」、未結的會另記在「給X」欄。以下是備註帶 emoji 但被歸為個人的列，');
P('若你確認就是那個 emoji 的人買的，直接照抄即可：');
P();
const hinted = orphan.filter(r => /[🍋🐟🐵🐱🌷]/u.test(r.note || ''));
if (hinted.length) for (const r of hinted) P(`- r${r.row} ${r.title} — 備註「${r.note}」`);
else P('（無：這 32 筆的備註都沒有成員 emoji）');

const out = path.resolve(__dirname, '../東京_待指認付款人.md');
fs.writeFileSync(out, L.join('\n'));
console.log('已寫出 ' + out + `（${orphan.length} 筆）`);
