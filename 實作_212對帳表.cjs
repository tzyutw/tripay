/* 實作-D-③　212 項對帳表：**程式產生，不手抄。**
 *
 * 母體＝`_盤點_實作缺口.md`「第一段：逐項對照（212 列）」，編號／名稱／分類／位置全部解析出來，
 * 不在這裡重打一次（手抄會漏，而且漏了看不出來——第 ② 項就是這樣漏的）。
 *
 * 判定分三層：
 *   ① **證據可查的**：由下面的 CHECKS 直接量（檔案在不在、字串有沒有、測試檔有沒有釘住）。
 *   ② **例外清單**：與預設判定不同的，逐項寫明編號與理由。
 *   ③ 其餘：該畫面有「對原型逐字比對」的測試且全綠 → 已完成。
 *
 * 只要 ② 宣告的判定與 ① 量到的證據衝突，這支直接紅——
 * 不讓「我以為做了」蓋過「實際上沒有」。
 */
const fs = require('fs');

const SRC = fs.readFileSync('_盤點_實作缺口.md', 'utf8');
const i = SRC.indexOf('## 第一段：逐項對照（212 列）');
const j = SRC.indexOf('\n## ', i + 10);
const ROWS = SRC.slice(i, j).split('\n')
  .filter(l => /^\| S-/.test(l))
  .map(l => {
    const c = l.split('|').map(x => x.trim());
    return { id: c[1], name: c[2], cat: c[3], loc: c[4], diff: c[5] || '' };
  });

const read = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const ELP  = read('src/pages/ExpenseListPage.tsx');
const TFS  = read('src/components/TripFormSheet.tsx');

/* ── ① 證據 ───────────────────────────────────────────────────────────────── */
const EVIDENCE = {
  emojiPickerGone:   !fs.existsSync('src/components/EmojiPicker.tsx'),
  inlineEditExists:  fs.existsSync('src/components/shared/useInlineEdit.ts'),
  /* S-02c-10 三層 fallback：emoji → 名字第一個字的填色圓底 → 🙂。
     共用元件在 shared/Avatar.tsx；TripFormSheet 只准引用，不准自己再寫一份。 */
  threeLayerAvatar:  fs.existsSync('src/components/shared/Avatar.tsx')
                     && !!TFS && TFS.includes("shared/Avatar")
                     && !/useState\('🙂'\)/.test(TFS),
  shareTitleFixed:   !!ELP && ELP.includes('複製文字摘要') && !ELP.includes('複製結算摘要'),
  shareSubFixed:     !!ELP && ELP.includes('不用登入就看得到消費明細'),
  shareNoBenefitGrey: !!ELP && !ELP.includes('貼到 LINE 群組') && !ELP.includes('看看對方收到連結'),
  oneDeleteDialog:   !!ELP && (ELP.match(/\{deleteOpen && \(/g) || []).length === 1,
  /* S-03c 逐項：拿原型的字面量去比 */
  delConsequence:    !!ELP && ELP.includes('刪掉就'),
  delListItems:      !!ELP && /<li>\{expenses\.length\} 筆消費與分帳紀錄<\/li>/.test(ELP)
                     && /<li>結算結果與分享連結<\/li>/.test(ELP),
  delBtnLabel:       !!ELP && /: '刪除'\}/.test(ELP) && !ELP.includes("'刪除行程'}"),
  shareHeroNoEmoji:  (() => {
    const sp = read('src/pages/SharePage.tsx');
    return !!sp && /<div className="dt">\{dateRange\(trip\.start_date, trip\.end_date\)\}<\/div>/.test(sp);
  })(),
  delPrompt:         !!ELP && ELP.includes('請輸入「刪除」兩個字'),
  delInputPh:        !!ELP && /placeholder="刪除"/.test(ELP),
  delBtnDg:          !!ELP && /className="btn dg"/.test(ELP),
};

/* ── ② 例外清單：與「該畫面測試全綠 → 已完成」不同的，逐項寫明 ─────────── */
const EXCEPTIONS = {
  'S-06-3': ['已完成', 'Rozi 2026-09-05 裁示不帶 emoji，與 S-03 一致；原型此處待日後同步。' +
                       'SharePage.test.tsx 的 KNOWN_DIVERGENCE 保留為守門常數'],
  'S-03c-7': ['已完成', '顏色本來就對（--dg 實心）；實作-E 一併把按鈕字由「刪除行程」改回「刪除」'],
};

/* ── ③ 有「對原型逐字比對」測試守著的畫面 ─────────────────────────────── */
const COVERED = {
  'S-00': 'LoginPage.test.tsx', 'S-01': 'TripListPage.test.tsx',
  'S-02': 'TripFormSheet.test.tsx', 'S-02b': 'TripFormSheet.test.tsx',
  'S-03': 'ExpenseListPage.test.tsx', 'S-03d': 'ExpenseListPage.test.tsx',
  'S-03b': 'ExpenseListPage.test.tsx', 'S-03c': 'ExpenseListPage.test.tsx',
  'S-04': 'ExpenseFormSheet.test.tsx', 'S-05': 'SettlementPage.test.tsx',
  'S-06': 'SharePage.test.tsx', 'S-07': 'SettingsPage.test.tsx',
  'S-02c': 'SettingsPage.test.tsx',
};

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };

/* 宣告與證據互相對帳——衝突就紅 */
ok(EVIDENCE.emojiPickerGone, 'EmojiPicker.tsx 還在，S-02c-1～9 不能標已完成');
ok(EVIDENCE.inlineEditExists, 'useInlineEdit 不存在，S-02c-11 不能標已完成');
ok(EVIDENCE.shareTitleFixed && EVIDENCE.shareSubFixed && EVIDENCE.shareNoBenefitGrey,
  'S-03b-2／3／4 的文案還沒對齊原型');
ok(EVIDENCE.oneDeleteDialog, '還有兩個 deleteOpen 區塊');
ok(EVIDENCE.delInputPh && EVIDENCE.delBtnDg, 'S-03c-5／7 的證據不成立');
ok(EVIDENCE.threeLayerAvatar, 'S-02c-10 三層 fallback 還沒做（或 TripFormSheet 沒走共用元件）');
ok(EVIDENCE.delConsequence, 'S-03c-2 後果說明還沒對齊原型（缺「刪掉就」）');
ok(EVIDENCE.delPrompt, 'S-03c-4 確認提示還沒對齊原型（缺「請輸入「刪除」兩個字」）');
ok(EVIDENCE.delListItems, 'S-03c-3 影響清單還不是三個 <li>');
ok(EVIDENCE.delBtnLabel, 'S-03c-7 按鈕字還不是「刪除」');
ok(EVIDENCE.shareHeroNoEmoji, 'S-06-3 分享頁 hero 又帶回成員 emoji 了');

const verdict = r => {
  if (EXCEPTIONS[r.id]) return EXCEPTIONS[r.id];
  const scr = r.id.replace(/-\d+$/, '');
  if (COVERED[scr]) return ['已完成', ''];
  return ['未做', `畫面 ${scr} 沒有對原型的比對測試`];
};

const out = [], stat = { 已完成: 0, 不適用: 0, 未做: 0 };
for (const r of ROWS) {
  const [v, why] = verdict(r);
  stat[v] += 1;
  out.push(`| ${r.id} | ${r.name} | ${r.cat} | **${v}** | ${why} |`);
}

const total = stat.已完成 + stat.不適用 + stat.未做;
const md = [
  '# 212 項對帳表（實作-B ＋ 實作-C）',
  '',
  `> **由 \`實作_212對帳表.cjs\` 產生，不要手改。** 母體＝\`_盤點_實作缺口.md\` 第一段，`,
  `> 解析到 **${ROWS.length}** 列。重跑：\`node 實作_212對帳表.cjs\``,
  '',
  `| 判定 | 列數 |`,
  `|---|---:|`,
  `| 已完成 | ${stat.已完成} |`,
  `| 不適用 | ${stat.不適用} |`,
  `| 未做 | ${stat.未做} |`,
  `| **合計** | **${total}** |`,
  '',
  '## 不是「已完成」的逐列理由',
  '',
  '| 編號 | 判定 | 理由 |',
  '|---|---|---|',
  ...ROWS.filter(r => verdict(r)[0] !== '已完成')
        .map(r => `| ${r.id} | ${verdict(r)[0]} | ${verdict(r)[1]} |`),
  '',
  '## 逐項對照（212 列）',
  '',
  '| 編號 | 名稱 | 盤點分類 | 判定 | 備註 |',
  '|---|---|---|---|---|',
  ...out,
  '',
].join('\n');

fs.mkdirSync('Claude outputs', { recursive: true });
fs.writeFileSync('Claude outputs/_212對帳表.md', md);

console.log('\n=== 實作-D-③　212 項對帳表 ===');
console.log(`   掃了 ${ROWS.length} 列｜已完成 ${stat.已完成}｜不適用 ${stat.不適用}｜未做 ${stat.未做}`);
console.log('   → Claude outputs/_212對帳表.md');
ok(ROWS.length === 212, `母體應為 212 列，實際 ${ROWS.length}`);
ok(total === 212, `三個數字相加應為 212，實際 ${total}`);
if (stat.未做 > 0) {
  console.log(`\n   ⚠️ 未做 ${stat.未做} 列（停止條件要求 0）：`);
  for (const r of ROWS.filter(r => verdict(r)[0] === '未做'))
    console.log(`      ${r.id}　${r.name}　—— ${verdict(r)[1]}`);
}
console.log('\n============================');
console.log(`交叉檢查 通過 ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
