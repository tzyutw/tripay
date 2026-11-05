#!/usr/bin/env node
/* 一個指令跑完全部常設檢查：
 *
 *     node 常設檢查/run-all.cjs                # 全部
 *     node 常設檢查/run-all.cjs --only C4,C6   # 只跑某幾條
 *
 * 環境變數：
 *   STANDING_SKIP_BUILD=1   用現有的 dist-harness，不重建
 *   STANDING_OUT=<資料夾>   報告輸出位置（預設系統暫存區 tripay-standing/）
 *   C78_SNAPSHOT=<檔案>     C7／C8 用的正式資料唯讀快照（見 C07_C08_唯讀匯出.sql）；沒給就標「跳過」
 *   C14_BASELINE=<檔案>     C14 的上一輪文案基準；沒給就用 STANDING_OUT 裡上一次的
 *   CHROME_PATH             Chrome 執行檔（沒給會自動找）
 *
 * 結束碼：有任何一條紅或執行錯誤 → 1；全部綠（跳過的不算紅） → 0
 * 報告：STANDING_OUT/report.json（逐列明細）與 report.md（表格）
 */
const fs = require('fs'), path = require('path');
const H = require('./lib/harness.cjs');

const ORDER = ['C01_成員識別', 'C02_宣告與渲染尺寸', 'C03_檔案白名單', 'C04_不橫向捲動', 'C05_輸入框16px',
  'C06_可點區', 'C07_C08_帳務守恆', 'C09_切換來回', 'C10_假資料涵蓋分岔', 'C11_同版金絲雀',
  'C12_錯誤路徑', 'C13_按鈕去處', 'C14_文案盤點'];

(async () => {
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',').map(s => s.trim().toUpperCase()) : null;
  const mods = ORDER.map(f => ({ f, m: require(`./${f}.cjs`) }))
    .filter(({ m }) => !only || only.some(o => (m.ids || [m.id]).includes(o)));

  const needBrowser = mods.some(({ m }) => m.browser !== false);
  let srv, browser, page, base, adminStop;
  if (needBrowser) {
    H.buildHarness();
    ({ srv } = await H.serve(path.join(H.ROOT, 'dist-harness')).then(x => { base = `http://127.0.0.1:${x.port}`; return x; }));
    /* 後台另一個量測靶：開發伺服器（起不來就讓後台那幾列報錯，前台照跑） */
    try { const a = await H.startAdminServer(); H.adminBase = a.base; adminStop = a.stop; }
    catch (e) { console.log('⚠️ 後台量測靶沒起來：' + e.message); }
    browser = await H.launch();
    page = await browser.newPage();
  }
  const out = H.outDir();
  const report = [];
  for (const { f, m } of mods) {
    const t0 = Date.now();
    process.stdout.write(`▶ ${m.id} ${m.title} … `);
    let r;
    try { r = await m.run({ page, browser, base, out }); }
    catch (e) { r = { rows: [{ where: '—', element: '—', measured: '執行錯誤：' + String(e && e.stack || e).slice(0, 400), limit: '—', ok: false }] }; }
    const status = r.status || (r.rows.every(x => x.ok) ? '過' : '沒過');
    const nBad = r.rows.filter(x => !x.ok).length;
    console.log(`${status}（${r.rows.length} 列，紅 ${nBad}，${((Date.now() - t0) / 1000).toFixed(1)}s）`);
    for (const x of r.rows.filter(x => !x.ok).slice(0, 40)) console.log(`   ✗ ${x.where}｜${x.element}｜${x.measured}｜門檻 ${x.limit}`);
    report.push({ id: m.id, ids: m.ids, file: f + '.cjs', title: m.title, status, note: r.note, rows: r.rows });
  }
  if (browser) await browser.close();
  if (srv) srv.close();
  if (adminStop) adminStop();

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const md = ['| # | 檢查 | 結果 | 紅幾列 |', '|---|---|---|---|',
    ...report.map(r => `| ${r.id} | ${r.title} | ${r.status} | ${r.rows.filter(x => !x.ok).length} / ${r.rows.length} |`), '',
    ...report.flatMap(r => [`## ${r.id} ${r.title}（${r.status}）`, r.note ? `> ${r.note}` : '', '',
      '| 在哪 | 元素 | 量到 | 門檻 | |', '|---|---|---|---|---|',
      ...r.rows.map(x => `| ${x.where} | ${x.element} | ${String(x.measured).replace(/\|/g, '/')} | ${x.limit} | ${x.ok ? '✅' : '❌'} |`), ''])];
  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n'));
  console.log('\n' + md.slice(0, report.length + 2).join('\n'));
  console.log(`\n報告：${path.join(out, 'report.md')}`);
  process.exit(report.some(r => r.status === '沒過') ? 1 : 0);
})();
