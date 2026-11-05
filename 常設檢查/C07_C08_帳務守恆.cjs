/* 常設 C7（帳務三欄一致）＋ C8（守恆式）——對**正式資料庫**，唯讀
 *
 * 資料從哪來：`C78_SNAPSHOT=<檔案>`，由 `C07_C08_唯讀匯出.sql` 匯出（整支只有一個 SELECT）。
 *   快照不含成員名字（成員以「這趟裡的順位」表示），不要放進 repo（這個 repo 是公開的）。
 *   沒給快照 → 這兩條標「跳過」，並印出怎麼取得。
 * 用哪一套算：把 `src/lib/summary.ts` 與 `SettlementPage.tsx` 的 `breakdownFor` **原封不動打包**來跑，
 *   畫面怎麼算這裡就怎麼算。（由來：SQL 複製不了「差額歸付款人」與各付各的比例回推。）
 * 掃哪些行程：快照裡每一趟（含 0 筆的）
 *
 * C8 守恆式（每一趟）：
 *   ① 逐筆：各人 shares 加總 ＝ 該筆台幣總額（±1）。整筆算不出台幣的跳過；
 *      有人的份算不出來的跳過（計數會印出來）
 *   ② 全趟：Σ每人金額（S-03 統計卡那一欄）＋「贊助折抵」那一行 ＋ 算不出來那幾筆的未分配部分 ＝ 總花費（±1）
 *      （決策 75，2026-11-05：「自己的」算進付款人本人、贊助另列一行）。對不上時附上贊助／「自己的」金額供拆差額
 * C7 帳務三欄（每一趟、每個人）：
 *   ③ S-05 卡片的「他幫大家先付的 − 一起分的 − 各付各的 ＋ 贊助折抵 ＋ 代收」＝ 該人淨額（差 < 0.5 元；歷史行程台幣有小數，畫面取整到元）
 *   ④ 全員淨額加總 ＝ 0
 */
const fs = require('fs'), path = require('path');
const H = require('./lib/harness.cjs');

async function loadEngine() {
  const esbuild = require(path.join(H.ROOT, 'node_modules', 'esbuild'));
  /* 放在 node_modules/.cache 底下：打包檔 import 的 react 要找得到 repo 的 node_modules */
  const outfile = path.join(H.ROOT, 'node_modules', '.cache', 'tripay-standing', `engine-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'lib', 'engine-entry.ts')], bundle: true, platform: 'node',
    format: 'esm', outfile, jsx: 'automatic', logLevel: 'error', external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': path.join(H.ROOT, 'src') },
    define: { 'import.meta.env.VITE_SUPABASE_URL': '"http://stub"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"stub"' },
    plugins: [{ name: 'stub', setup(b) {
      b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'sb', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {};', loader: 'js' }));
      b.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'css' }));
      b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: '', loader: 'js' }));
    } }],
    nodePaths: [path.join(H.ROOT, 'node_modules')],
  });
  const mod = await import(require('url').pathToFileURL(outfile).href);
  fs.rmSync(outfile, { force: true });
  return mod;
}

const r2 = v => Math.round(v * 100) / 100;

/** 快照的精簡格式 → 前端拿到的資料形狀 */
function expand(t) {
  const mid = i => (i == null ? null : `m${i}`);
  const members = Array.from({ length: t.n_members }, (_, i) => ({ id: `m${i}`, trip_id: t.id, name: `成員${i + 1}`, emoji: null, sort_order: i }));
  const trip = { id: t.id, name: t.name, status: t.status, start_date: '2000-01-01', settlement_mode: t.mode,
    hub_member_id: mid(t.hub), cash_rate_twd: t.rt, cash_rate_foreign: t.rf, trip_members: members };
  const num = v => (v == null ? null : Number(v));
  const expenses = t.e.map((x, k) => ({
    id: `e${k}`, trip_id: t.id, title: `#${k + 1}`, expense_type: x[0], payer_member_id: mid(x[1]), individual_member_id: mid(x[2]),
    foreign_amount: num(x[3]), twd_amount: num(x[4]), split_fill_currency: x[5], settled_on_spot: !!x[6], is_sponsor: !!x[7],
    created_at: '2000-01-01T00:00:00Z', expense_date: '2000-01-01', deleted_at: null,
    expense_splits: x[8].map(s => ({ member_id: mid(s[0]), is_participating: !!s[1], split_amount: num(s[2]), split_amount_foreign: num(s[3]) })),
  }));
  return { trip, members, expenses };
}

module.exports = {
  id: 'C7', ids: ['C7', 'C8'], title: '帳務三欄一致（C7）＋守恆式（C8），正式資料唯讀', browser: false,
  async run() {
    const snap = process.env.C78_SNAPSHOT;
    if (!snap || !fs.existsSync(snap))
      return { status: '跳過', note: '沒有正式資料快照。用 Supabase MCP execute_sql 跑 常設檢查/C07_C08_唯讀匯出.sql，存成檔案後設 C78_SNAPSHOT。',
               rows: [{ where: '—', element: '—', measured: '沒有快照，未執行', limit: '—', ok: true }] };
    const E = await loadEngine();
    const data = JSON.parse(fs.readFileSync(snap, 'utf8'));
    const rows = [];
    for (const t of data.trips) {
      const { trip, members, expenses } = expand(t);
      const where = `${t.name}（${expenses.length} 筆、${members.length} 人）`;
      /* ① 逐筆 */
      let checked = 0, skipPending = 0, skipPartial = 0; const badE = [];
      let unalloc = 0, personal = 0, sponsorShares = 0;
      for (const e of expenses) {
        const c = E.calc(e, trip, members);
        const ids = Object.keys(c.shares);
        const vals = ids.map(id => c.shares[id]);
        if (c.twdPending) { skipPending++; continue; }
        if (e.expense_type === 'personal') { if (!e.is_sponsor) personal += c.twdTotal; continue; }
        const known = vals.filter(v => v != null).reduce((a, b) => a + b, 0);
        if (e.is_sponsor) { sponsorShares += known; }
        if (vals.some(v => v == null) || !ids.length) { skipPartial++; if (!e.is_sponsor) unalloc += c.twdTotal - known; continue; }
        checked++;
        if (Math.abs(known - c.twdTotal) > 1) badE.push(`第 ${e.title.slice(1)} 筆：分攤加總 ${known}，台幣總額 ${c.twdTotal}，差 ${known - c.twdTotal}`);
      }
      rows.push({ where, element: 'C8① 每一筆：各人分攤加總＝該筆台幣總額',
        measured: `驗了 ${checked} 筆（整筆算不出台幣 ${skipPending}、有人的份算不出來 ${skipPartial}）` + (badE.length ? `；${badE.length} 筆不守恆：` + badE.slice(0, 3).join('；') : '；全部守恆'),
        limit: '每筆差 ≤ 1', ok: badE.length === 0 });
      /* ② 全趟 */
      const S = E.tripSummary(trip, expenses, t.status);
      const sumPer = Object.values(S.per).reduce((a, b) => a + b, 0);
      /* 規格允許的差只有一種：算不出來的那幾筆（C8 定義：Σ各成員 ＋ Σ算不出來 ＝ 總花費）。
         贊助、「自己的」造成的差**照樣算沒過**，但拆開列出來，看得出是哪一類。 */
      /* 決策 75（2026-11-05）：統計卡多一行「贊助折抵」＝ S.sponsorAdj，算進加總 */
      const adj = S.sponsorAdj || 0;
      const gap = sumPer + adj + unalloc - S.total;
      rows.push({ where, element: 'C8② 全趟：Σ每人金額＋贊助折抵＋算不出來的 ＝ 總花費',
        measured: `總花費 ${r2(S.total)}，Σ每人 ${r2(sumPer)}，贊助折抵 ${r2(adj)}，算不出來 ${r2(unalloc)}，差 ${r2(gap)}` +
          (Math.abs(gap) > 1 ? `（參考：這趟贊助負額 ${r2(sponsorShares)}、「自己的」合計 ${r2(personal)}）` : ''),
        limit: '差 ≤ 1', ok: Math.abs(gap) <= 1 });
      /* ③④ */
      const { net } = E.settleTrip(S, expenses, trip);
      const badM = []; let sumNet = 0;
      for (const m of members) {
        const b = E.breakdownFor(expenses, trip, m.id);
        const diff = b.fronted - b.shared - b.each + b.sponsor + b.sponsorHeld;
        sumNet += net[m.id];
        /* 歷史行程的台幣有小數；畫面上取整到元，差 < 0.5 元在畫面上看起來一樣 */
        if (Math.abs(diff - net[m.id]) >= 0.5) badM.push(`${m.name}：卡片三欄算出 ${r2(diff)}，淨額 ${r2(net[m.id])}，差 ${r2(diff - net[m.id])}`);
      }
      rows.push({ where, element: 'C7③ 每人卡片：先付的−一起分−各付各的＋贊助＋代收＝淨額',
        measured: badM.length ? `${badM.length} 人對不上：` + badM.join('；') : `${members.length} 人全部對得上`, limit: '差 < 0.5 元', ok: badM.length === 0 });
      rows.push({ where, element: 'C7④ 全員淨額加總', measured: `${r2(sumNet)}`, limit: '＝ 0（< 0.5 元）', ok: Math.abs(sumNet) < 0.5 });
    }
    return { rows, note: `快照時間 ${data.exported_at}` };
  },
};
