/** 最終驗收基準表（含 Rozi 核對點 ① 全部決策與判讀）。 */
const fs = require('fs');
const path = require('path');
const { openSheet, num, round2 } = require('./lib.cjs');
const { TRIPS, MEMBERS } = require('./trips.cjs');

const FIX = path.resolve(__dirname, '../fixtures');
const J = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const n = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const who = (m) => `${MEMBERS[m].emoji} ${MEMBERS[m].name}`;
const L = []; const P = (s = '') => L.push(s);

const bTwd = J('baseline-b-twd.json');
const tok  = J('tokyo-assign.json');
const fuk  = J('fukuoka-ruled.json');
const fx   = { fukuoka: J('fukuoka.json'), tokyo: J('tokyo.json'), hokkaido: J('hokkaido.json'), jeju: J('jeju.json') };
const ERR  = J('errata-v1.1.json');
const corr = (trip, member, field, v) => {
  const c = ERR.corrections.find(x => x.trip === trip && x.member === member && x.field === field);
  return c ? c.to : v;
};
const mark = (trip, member, field) => ERR.corrections.some(x => x.trip === trip && x.member === member && x.field === field) ? ' ⟨v1.1⟩' : '';

P('# 驗收基準表 v1.1（🔒 已凍結 2026-08-30）');
P();
P('> **狀態：已凍結（v1.1）。** Rozi 於 2026-08-30 關閉核對點 ① 全部 11 項疑義後凍結為 v1.0；');
P('> 同日 Stage 1–3 驗證發現 v1.0 有 4 處格值錯誤，經 Rozi 裁示修正為 **v1.1**，勘誤逐項見文末附錄。');
P('> v1.1 起基準不得再動。後續驗證若與本表不符，一律修謄入或修解析，**不修基準**。');
P('>');
P('> **基準 A 判定幣別＝台幣**（與基準 B 一致）；外幣欄僅供參考，不作判定。');
P('> 產生日期：2026-08-30　來源：`歷史資料匯入/scripts/`（全唯讀，不碰資料庫）');
P();
P('## 已關閉的決策（不再是待決事項）');
P();
P('| # | 議題 | 決策 |');
P('|---|------|------|');
P('| 1 | 幣別／匯率謄法 | **兩欄都填**：外幣＝Excel 當地貨幣金額；台幣＝外幣 × Excel 當日匯率。UI 衍生顯示的「匯率 ≈」即等於 Excel 當日匯率 |');
P('| 2 | 基準 B 比對基準 | **台幣比對＋容許度 ±(人數) 元**。日幣欠款逐列以該列自己的有效匯率換算 |');
P('| 3 | Excel 自身漏加 5 處 | **照實謄入**。Tripay 總額將高於 Excel 總計 ¥926 ＋ 台幣 $4,964，屬「Excel 錯、Tripay 對」，驗收時不算謄入錯誤 |');
P('| 4 | 東京 32＋筆無主個人消費 | **Rozi 已逐筆指認**（2026-08-30），見下方東京段 |');
P('| 5 | 福岡 7 筆判讀 | **Rozi 已裁定**：r5/r58/r60/r76 shared 付款人 Ning；r74 shared 付款人 Ning 且未參與（TC-DIFF-03）；r52/r55 individual 付款人 Ning |');
P('| 6 | 福岡基準 B | **不適用**（Excel 無可比對的欠款紀錄），只驗基準 A |');
P('| 7 | 福岡台幣基準 A（F5）| **取「純自購」77,281.24**（Ning）。與 E/F/G 重疊的 6 列不計入台幣分擔 |');
P('| 8 | 東京 T2／T3 | **已追認**：r35 Nien ¥1,600 按 ✅ 已結；r58／r144 依規則 2 補回欠款 |');
P('| 9 | 其餘 F1–F4／F6／T1／H1／J1 | **照建議辦理**，見 `剩餘疑義清單.md`（已全部關閉）|');
P();
P('**福岡總原則（Rozi）**：每人分擔金額一律以 E/F/G 欄為準，與任何描述衝突時欄位優先。');
P();
P('## 一列只用一種幣別計入基準 A');
P();
P('四份 Excel 都有「同一列同時出現外幣與台幣」的情形，兩者是**同一筆錢的兩種表述**，不可相加。');
P('本表一律採：**該列有台幣就用台幣，外幣僅作參考；沒有台幣才用外幣**。');
P('這與 Excel 自己的小計邏輯一致（東京／北海道的外幣小計只加沒有台幣的列）。');
P();
P('## 鐵律檢查');
P();
P('| 項目 | 結果 |');
P('|------|------|');
P('| 小計格公式重算 vs 快取值 | ✅ 四檔全部一致（證明格子讀取正確）|');
P('| 全量加總 vs Excel 總計 | ✅ 差額 100% 由 Excel 自身 SUM 公式未涵蓋的列構成，逐列可列出 |');
P('| 整趟總花費錨點 | ✅ 東京 141,757.89／北海道 76,794.15／濟州島 111,319.78（vs 錨點差 ≤ 1.85）|');
P('| 福岡總花費（F5 修正後）| **173,025.53**，與 8/11 錨點 194,837 差 **−21,811.47** — 見下方說明，非解析錯誤 |');
P('| 濟州島基準 B 自我驗證 | ✅ 推得 Ziyu +3,632.25，與 2026-07-22 已驗證錨點一致 |');
P('| 東京一致性檢核 (b) | ✅ 逐列完全吻合（差 0）— 前提是補回 r58／r144，見下 |');
P();

// ── 各行程 ──────────────────────────────────────────────────────────────────
const TRIP_ORDER = ['fukuoka', 'tokyo', 'hokkaido', 'jeju'];
for (const key of TRIP_ORDER) {
  const cfg = TRIPS[key];
  const fc = cfg.currency === 'KRW' ? '₩' : '¥';
  P('---'); P(); P(`## ${cfg.name}`); P();
  P(`- 檔案：\`${cfg.file}\`　成員：${cfg.members.map(who).join('、')}　期間：${cfg.start} ～ ${cfg.end}`);

  P(); P('### 基準 A｜每人分擔總額'); P();
  if (key === 'fukuoka') {
    P('依據：`E98/F98/G98`（各人日幣分擔）與 `K98/L98/M98`（各人刷自己卡台幣）。');
    P();
    P(`| 成員 | ¥（分擔）| 台幣（自刷卡）| 依據 |`);
    P('|------|---------:|-------------:|------|');
    for (const m of cfg.members) {
      const b = fuk.baselineA[m];
      const src = b.twd_overlap_excluded ? `${cfg.shareCols[m]}98 / ${cfg.selfCardCols[m]}98 − 重疊 ${n(b.twd_overlap_excluded)}` : `${cfg.shareCols[m]}98 / ${cfg.selfCardCols[m]}98`;
      P(`| ${who(m)} | ${n(corr('fukuoka', m, 'foreign', b.jpy))}${mark('fukuoka', m, 'foreign')} | ${n(corr('fukuoka', m, 'twd', b.twd))}${mark('fukuoka', m, 'twd')} | ${src} |`);
    }
    P(`| **合計** | **${n(cfg.members.reduce((s, m) => s + fuk.baselineA[m].jpy, 0))}** | **${n(cfg.members.reduce((s, m) => s + fuk.baselineA[m].twd, 0))}** | |`);
    P();
    P('> **F5 已裁示（採 77,281.24）**：`L98` 原值 99,091.62 內含 6 列同時也記在 E/F/G 的金額');
    P('> （r30 2,361.59／r38 3,403.57／r43 7,618.45／r60 4,374.07／r74 2,124.30／r76 1,928.41，合計 21,810.38）。');
    P('> 那 6 列的錢已用日幣計入 E/F/G 分擔，L 只是「刷 Ning 的卡」的付款紀錄，不再計入台幣分擔。');
    P('> Ziyu（K98）與 Mei（M98）全部是純自購，不受影響。');
  } else if (key === 'tokyo') {
    P('依據：共同池均分 5 人 ＋ Rozi 指認的個人款項（含拆分）。');
    P(`共同池：¥${n(tok.poolJ)}（B159，現金）÷5 ＝ ¥${n(tok.poolJ / 5)}；台幣 ${n(tok.poolT)}（D159 ＋ D160:D162）÷5 ＝ ${n(tok.poolT / 5)}`);
    P();
    P(`| 成員 | ¥ | 台幣 |`);
    P('|------|--:|-----:|');
    for (const m of cfg.members) P(`| ${who(m)} | ${n(corr('tokyo', m, 'foreign', tok.baselineA.jpy[m]))}${mark('tokyo', m, 'foreign')} | ${n(corr('tokyo', m, 'twd', tok.baselineA.twd[m]))}${mark('tokyo', m, 'twd')} |`);
    P(`| **合計** | **${n(cfg.members.reduce((s, m) => s + tok.baselineA.jpy[m], 0))}** | **${n(cfg.members.reduce((s, m) => s + tok.baselineA.twd[m], 0))}** |`);
  } else {
    const b = fx[key].baselines.burden;
    P('依據：逐列分配（共同無欠款→均分；有欠款→依欠款額；分開/各自結算→各人欠款額；自付→本人）。');
    P();
    P(`| 成員 | ${fc} | 台幣 |`);
    P('|------|--:|-----:|');
    for (const m of cfg.members) P(`| ${who(m)} | ${n(corr(key, m, 'foreign', b.foreign[m]))}${mark(key, m, 'foreign')} | ${n(corr(key, m, 'twd', b.twd[m]))}${mark(key, m, 'twd')} |`);
    P(`| **合計** | **${n(cfg.members.reduce((s, m) => s + b.foreign[m], 0))}** | **${n(cfg.members.reduce((s, m) => s + b.twd[m], 0))}** |`);
    if (key === 'jeju') { P(); P('> ₩ 欄只剩 15 筆「Excel 未記台幣」的個人購物（全是 personal，不進結算）。其餘 110 筆以台幣計。'); }
  }

  P(); P('### 基準 B｜每人結算淨額（台幣，容許度 ±' + cfg.members.length + ' 元）'); P();
  if (key === 'fukuoka') {
    P('**不適用。** 該檔無「給X」欠款欄，`D` 欄「刷卡人」全檔為空，Excel 從未記錄成員之間誰欠誰。');
    P();
    P('但 Rozi 判讀的 7 筆會讓 Tripay 算出**真實欠款**——照實呈現，這是補記不是錯誤，**不得為了讓結算歸零而改動**：');
    P();
    P('| 成員 | 預期 Tripay 淨額（台幣）| 判定 |');
    P('|------|----------------------:|------|');
    for (const m of cfg.members) { const v = fuk.expectedNetTwd[m]; P(`| ${who(m)} | ${n(v)} | ${v > 0 ? '債主' : v < 0 ? '應付' : '打平'} |`); }
    P(`| **Σ** | **${n(cfg.members.reduce((s, m) => s + fuk.expectedNetTwd[m], 0))}** | |`);
    P();
    P('> 這是**參考值不是驗收基準**（基準 B 不適用），且尚未含疑義 F1–F4 那 4 列。');
  } else {
    const t = bTwd[key].net_twd;
    P(`來源：\`${cfg.debtGroups.map(g => g.label).join('／')}\` 在總計列（第 ${cfg.totalRow} 列）的合計` +
      (cfg.debtCurrency === 'foreign' ? '，日幣逐列以該列有效匯率換算為台幣。' : '（原本即為台幣）。'));
    P('轉帳路徑不比對，只比每人淨額。');
    P();
    P('| 成員 | 淨額（台幣）| 判定 |');
    P('|------|----------:|------|');
    for (const m of cfg.members) { const v = t[m]; P(`| ${who(m)} | ${n(v)} | ${v > 0 ? '債主（應收）' : v < 0 ? '應付' : '打平'} |`); }
    P(`| **Σ** | **${n(round2(cfg.members.reduce((s, m) => s + t[m], 0)))}** | 必須為 0 |`);
  }
  P();
}

P('---'); P();
P('## 福岡總花費：為何與 2026-08-11 的錨點 $194,837 不同'); P();
P('F5 裁示後，福岡整趟總花費為 **台幣 173,025.53**：');
P();
P('```');
P('  ¥397,450（E/F/G98 日幣分擔）× 0.22          ＝  87,439.00');
P('  ＋ 純自購台幣 3,836.87 ＋ 77,281.24 ＋ 4,468.42 ＝  85,586.53');
P('                                        總計 ＝ 173,025.53');
P('```');
P();
P('與錨點 194,837 的差 **21,811.47**，就是 2026-08-11 當初把 `L98` 整欄當成 Ning 的自購');
P('所造成的**雙幣重疊**（6 列合計 21,810.38，餘 1.09 為四捨五入）。');
P('那 6 列的錢已經用日幣計入 E/F/G，再用台幣算一次就是重複。');
P();
P('- **錨點驗證改用修正後的 173,025.53。**');
P('- 線上 5 筆展示行程中「2023 福岡」目前仍顯示 **194,837**，本次**先不動**；');
P('  是否更正列入完成報告的「待 Rozi 決定」。');
P();
P('---'); P();
P('## Excel 自身的合計漏加（已決策：照實謄入）'); P();
P('| 行程 | 儲存格 | 漏加的列 | 金額 |');
P('|------|--------|---------|------|');
P('| 2025 北海道 | `C17` =SUM(C14:C16) | r13 全家水 | ¥926 |');
P('| 2026 濟州島 | `E9` =SUM(E4:E7) | r8 國泰旅平險 | $3,748 |');
P('| 2026 濟州島 | `E47` =SUM(E34:E45) | r46 CU飲料 | $231 |');
P('| 2026 濟州島 | `E150` =SUM(E143:E148) | r149 炒年糕 | $341 |');
P('| 2026 濟州島 | `E174` =SUM(E161,E164,E166:E171) | r162／163／165／172／173 | $644.67 |');
P();
P('**決策（Rozi 2026-08-30）：照實謄入。** 這些是真實的共同消費，只是沒被算進 Excel 總計。');
P('謄入後 Tripay 總額會高於 Excel 總計 ¥926 ＋ 台幣 $4,964；驗收時視為「Excel 錯、Tripay 對」，不算謄入錯誤。');
P('本決策已關閉，不再是待決事項。');
P();

P('---'); P();
P('# 附錄：v1.0 → v1.1 勘誤'); P();
P(`> ${ERR.ruling}`);
P('> 標記 ⟨v1.1⟩ 的格子即為本次修正後的值。');
P();
for (const c of ERR.corrections) {
  P(`### ${c.id}　${TRIPS[c.trip].name}・${who(c.member)}・${c.field === 'foreign' ? '外幣欄' : '台幣欄'}`);
  P();
  P(`- **改哪一格**：${c.cell}`);
  P(`- **改成什麼**：${n(c.from)} → **${n(c.to)}**（${c.delta > 0 ? '+' : ''}${n(c.delta)}）`);
  P(`- **理由**：${c.reason}`);
  P(`- **依據**：${c.basis}`);
  P();
}
for (const nt of ERR.notes) {
  P(`### ${nt.id}　${TRIPS[nt.trip].name}・${nt.type}`);
  P();
  P(nt.detail);
  P();
  P('**判定規則（本次明定）**：基準 A 的判定幣別＝**台幣**，與基準 B 一致；外幣欄僅供參考。');
  P('上述外幣差異記錄於此，**不算失敗**。');
  P();
}
fs.writeFileSync(path.resolve(__dirname, '../驗收基準表.md'), L.join('\n'));
console.log('已寫出 ../驗收基準表.md');
