/** 產出「驗收基準表」（唯二人工核對點 ①）。 */
const fs = require('fs');
const path = require('path');
const { openSheet, num, round2 } = require('./lib.cjs');
const { TRIPS, MEMBERS } = require('./trips.cjs');
const { parseJejuLike, parseTokyo, parseFukuoka } = require('./parse-all.cjs');

const FIX = path.resolve(__dirname, '../fixtures');
const n = (v) => v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const who = (m) => `${MEMBERS[m].emoji} ${MEMBERS[m].name}`;
const L = [];
const P = (s = '') => L.push(s);

P('# 驗收基準表（Stage 0 產出・待 Rozi 確認後凍結）');
P();
P('> 由 `歷史資料匯入/scripts/` 解析四份 Excel 產出，逐項標註依據儲存格。');
P('> 確認後基準凍結，後續謄入／驗證迴圈不得再更動。');
P();
P('## 鐵律檢查：解析 vs Excel 自己的合計');
P();
P('| 行程 | 小計公式重算 | 全量加總 vs Excel 總計 | 說明 |');
P('|------|------------|----------------------|------|');
P('| 2023 福岡 | ✅ 一致 | ✅ 6 欄全對 | E/F/G/K/L/M 皆 0 差異 |');
P('| 2024 東京 | ✅ 一致 | ⚠️ 差額 100% 由 Excel 公式未涵蓋列構成 | 小計只算「共同池」，個人購物列本就在池外 |');
P('| 2025 北海道 | ✅ 一致 | ⚠️ 同上 | 另發現 Excel 自身漏加（見下） |');
P('| 2026 濟州島 | ✅ 一致 | ⚠️ 同上 | 另發現 Excel 自身漏加（見下） |');
P();
P('## 整趟總花費錨點交叉驗證（台幣）');
P();
P('| 行程 | 解析結果 | 2026-08-11 錨點 | 差 | 判定 |');
P('|------|---------|----------------|----|------|');
P('| 2023 福岡 | 194,835.91 | 194,837 | −1.09 | ✅ |');
P('| 2024 東京 | 141,757.89 | 141,758 | −0.11 | ✅ |');
P('| 2025 北海道 | 76,794.15 | 76,796 | −1.85 | ✅ |');
P('| 2026 濟州島 | 111,319.78 | 111,320 | −0.22 | ✅ |');
P();

const runners = { fukuoka: parseFukuoka, tokyo: parseTokyo, hokkaido: parseJejuLike, jeju: parseJejuLike };

for (const key of ['fukuoka', 'tokyo', 'hokkaido', 'jeju']) {
  const cfg = TRIPS[key];
  const fx = JSON.parse(fs.readFileSync(path.join(FIX, `${key}.json`), 'utf8'));
  const b = fx.baselines;
  const fc = cfg.currency === 'KRW' ? '₩' : '¥';
  const parsed = runners[key](cfg);

  P('---');
  P();
  P(`## ${cfg.name}`);
  P();
  P(`- 檔案：\`${cfg.file}\`　成員：${cfg.members.map(who).join('、')}　主幣別：${cfg.currency}`);
  P(`- 期間：${cfg.start} ～ ${cfg.end}　解析出 **${fx.rowCount} 筆**消費`);
  const byType = {};
  for (const r of parsed.rows) { const k = r.expense_type + (r.settled_on_spot ? '（當場分）' : ''); byType[k] = (byType[k] || 0) + 1; }
  P(`- 型態分佈：${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join('、')}`);
  P();
  P('### 基準 A｜每人分擔總額');
  P();
  if (key === 'fukuoka') {
    P('依據：`E98/F98/G98`（各人日幣分擔）與 `K98/L98/M98`（各人刷自己卡台幣）。');
    P('⚠️ 兩欄是**同一趟的不同錢**：E/F/G 是拆帳用的日幣分擔，K/L/M 是各自刷卡的台幣支出，不可相加成單一數字。');
  } else if (key === 'tokyo') {
    P('依據：逐列分配（共同池均分 5 人 ＋ 各人「給X」欠款 ＋ 可歸屬的個人消費）。');
  } else {
    P('依據：逐列分配（共同無欠款→均分；有欠款→依欠款額；分開結算→各人欠款額；自付→本人）。');
  }
  P();
  P(`| 成員 | ${fc} | 台幣 | 依據 |`);
  P('|------|------:|-----:|------|');
  for (const m of cfg.members) {
    const src = key === 'fukuoka'
      ? `${cfg.shareCols[m]}98 / ${cfg.selfCardCols[m]}98`
      : '逐列分配加總';
    P(`| ${who(m)} | ${n(b.burden.foreign[m])} | ${n(b.burden.twd[m])} | ${src} |`);
  }
  const sF = round2(cfg.members.reduce((s, m) => s + b.burden.foreign[m], 0));
  const sT = round2(cfg.members.reduce((s, m) => s + b.burden.twd[m], 0));
  P(`| **合計** | **${n(sF)}** | **${n(sT)}** | |`);
  P();
  P('### 基準 B｜每人結算淨額');
  P();
  if (!b.net) {
    P('**不適用。** 此檔沒有「給X」欠款欄，Excel 從未記錄成員之間誰欠誰；');
    P('E/F/G 只記「各人分擔多少」，不記「誰代墊」。故本行程僅驗基準 A。');
    P('（D 欄「刷卡人」全檔為空，無法回推代墊人。）');
  } else {
    const cur = b.net.currency === 'twd' ? '台幣' : fc;
    const t = b.net.currency === 'twd' ? b.net.twd : b.net.foreign;
    P(`來源：\`${cfg.debtGroups.map(g => g.label).join('／')}\` 欄位在總計列（第 ${cfg.totalRow} 列）的合計，幣別＝**${cur}**。`);
    P('轉帳「路徑」不比對（Minimum Transactions 可與 Excel 不同），只比每人淨額。');
    P();
    P(`| 成員 | 淨額（${cur}） | 判定 | 依據儲存格 |`);
    P('|------|------------:|------|-----------|');
    for (const m of cfg.members) {
      const v = t[m];
      const cells = [];
      for (const g of cfg.debtGroups) {
        if (g.creditor === m) for (const c of Object.values(g.debtors)) cells.push(`${c}${cfg.totalRow}`);
        else if (g.debtors[m]) cells.push(`−${g.debtors[m]}${cfg.totalRow}`);
      }
      P(`| ${who(m)} | ${n(v)} | ${v > 0 ? '債主（應收）' : v < 0 ? '應付' : '打平'} | ${cells.join(', ')} |`);
    }
    P(`| **Σ** | **${n(round2(cfg.members.reduce((s, m) => s + t[m], 0)))}** | 必須為 0 | |`);
  }
  P();
  const flagged = parsed.rows.filter(r => r.flags && r.flags.length);
  const issues = parsed.issues;
  if (flagged.length || issues.length) {
    P('### 需 Rozi 判讀的疑義');
    P();
    const seen = new Map();
    for (const r of flagged) for (const f of r.flags) {
      if (!seen.has(f)) seen.set(f, []);
      seen.get(f).push(`r${r.row} ${r.title}`);
    }
    for (const [f, rows] of seen) {
      P(`- **${f}**（${rows.length} 筆）：${rows.slice(0, 5).join('、')}${rows.length > 5 ? ` …另 ${rows.length - 5} 筆` : ''}`);
    }
    if (issues.length) P(`- **無法歸類/無付款人**：${issues.length} 筆（見 fixtures/${key}.json 的 \`issues\`）`);
    P();
  }
}

P('---');
P();
P('## Excel 自身的合計漏加（照實揭露，未手調）');
P();
P('| 行程 | 儲存格 | 漏加的列 | 金額 | 性質 |');
P('|------|--------|---------|------|------|');
P('| 2025 北海道 | `C17` =SUM(C14:C16) | r13 全家水 | ¥926 | 共同消費，被排除在六天總計外 |');
P('| 2026 濟州島 | `E9` =SUM(E4:E7) | r8 國泰旅平險 | $3,748 | 行前共同，被排除在九天總計外 |');
P('| 2026 濟州島 | `E47` =SUM(E34:E45) | r46 CU飲料 | $231 | 共同消費（WOWPASS） |');
P('| 2026 濟州島 | `E150` =SUM(E143:E148) | r149 炒年糕 | $341 | 共同消費 |');
P('| 2026 濟州島 | `E174` =SUM(E161,E164,E166:E171) | r162/163/165/172/173 | $644.67 | 共同消費（含 3 筆 WOWPASS） |');
P();
P('> 這些列在 Excel 的「總計」中不存在，但確實是該趟的共同消費。');
P('> 若謄入 Tripay 時照實記入，Tripay 的總額會比 Excel 總計高出上述金額——這是 **Excel 的漏加**，不是謄入錯誤。');
P('> **待 Rozi 決定**：(a) 照實謄入（Tripay 較 Excel 正確），或 (b) 為對齊 Excel 而略過。建議 (a)。');
P();

const outPath = path.resolve(__dirname, '../驗收基準表.md');
fs.writeFileSync(outPath, L.join('\n'));
console.log('已寫出 ' + outPath);
