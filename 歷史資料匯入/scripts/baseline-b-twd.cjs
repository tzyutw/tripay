/**
 * 基準 B（台幣版）— 依 Rozi 2026-08-30 決策：台幣比對＋放寬容許度。
 * 東京/北海道的「給X」欠款以日幣記，逐筆用「該列自己的有效匯率」換台幣，
 * 而非用單一總表匯率——因為謄入 Tripay 時每筆的台幣就是這樣算的。
 */
const fs = require('fs');
const path = require('path');
const { openSheet, num, round2 } = require('./lib.cjs');
const { TRIPS, MEMBERS } = require('./trips.cjs');
const { parseJejuLike, parseTokyo } = require('./parse-all.cjs');

const FALLBACK_RATE = { tokyo: 0.215, hokkaido: 0.209 };   // B167 / C140
const basisFromNote = (n) => { const m = (n || '').match(/[¥₩]\s*([\d,]+)/); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };

/** 該列「1 單位外幣 = ? 台幣」 */
function effRate(rec, tripId) {
  if (rec.twd_amount != null && rec.foreign_amount) return rec.twd_amount / rec.foreign_amount;
  const b = basisFromNote(rec.note);
  if (rec.twd_amount != null && b) return rec.twd_amount / b;
  return rec.day_rate || FALLBACK_RATE[tripId];
}

const L = [];
const P = (s = '') => L.push(s);
P('# 基準 B（台幣版）— 供 Tripay 結算直接比對');
P();
P('> Rozi 2026-08-30 決策：**台幣比對＋放寬容許度**（容許度 = ±人數 元）。');
P('> 東京／北海道的「給X」欠款欄以日幣記，此處逐筆用該列自己的有效匯率換算為台幣，');
P('> 與謄入 Tripay 時每筆台幣的算法一致（台幣＝外幣×當日匯率）。');
P('> 轉帳路徑不比對，只比每人淨額。');
P();

const jobs = [
  { id: 'tokyo',    parse: parseTokyo },
  { id: 'hokkaido', parse: parseJejuLike },
  { id: 'jeju',     parse: parseJejuLike },
];

const out = {};
for (const j of jobs) {
  const cfg = TRIPS[j.id];
  const parsed = j.parse(cfg);
  const netT = Object.fromEntries(cfg.members.map(m => [m, 0]));
  const detail = [];

  for (const rec of parsed.rows) {
    if (!rec.debts || !rec.debts.length) continue;
    const rate = cfg.debtCurrency === 'twd' ? 1 : effRate(rec, j.id);
    for (const d of rec.debts) {
      const twd = d.amount * rate;
      netT[d.creditor] += twd;
      netT[d.debtor]   -= twd;
      detail.push({ row: rec.row, title: rec.title, ...d, rate: round2(rate * 10000) / 10000, twd: round2(twd) });
    }
  }

  const tol = cfg.members.length;
  const sum = round2(cfg.members.reduce((s, m) => s + netT[m], 0));
  P(`## ${cfg.name}（容許度 ±${tol} 元）`);
  P();
  P('| 成員 | 基準 B 淨額（台幣） | 判定 |');
  P('|------|------------------:|------|');
  for (const m of cfg.members) {
    const v = round2(netT[m]);
    P(`| ${MEMBERS[m].emoji} ${MEMBERS[m].name} | ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} | ${v > 0 ? '債主（應收）' : v < 0 ? '應付' : '打平'} |`);
  }
  P(`| **Σ** | **${sum}** | 必須為 0 |`);
  P();
  P(`欠款明細列數：${detail.length}　（原幣別：${cfg.debtCurrency === 'twd' ? '台幣，未換算' : '日幣，逐列換算'}）`);
  P();
  out[j.id] = { net_twd: Object.fromEntries(cfg.members.map(m => [m, round2(netT[m])])), tolerance: tol, detail };

  console.log(`${cfg.name}：` + cfg.members.map(m => `${MEMBERS[m].emoji}${round2(netT[m])}`).join('  ') + `  Σ=${sum}  (±${tol})`);
}

P('## 2023 福岡');
P();
P('**基準 B 不適用**：該檔無「給X」欠款欄，D 欄「刷卡人」全檔為空，Excel 從未記錄成員之間誰欠誰。');
P('此行程只驗基準 A。');
P();

fs.writeFileSync(path.resolve(__dirname, '../fixtures/baseline-b-twd.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(path.resolve(__dirname, '../基準B_台幣版.md'), L.join('\n'));
console.log('\n已寫出 ../基準B_台幣版.md 與 fixtures/baseline-b-twd.json');
