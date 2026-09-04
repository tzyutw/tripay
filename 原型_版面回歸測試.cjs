/* 原型版面回歸測試：不得橫向捲動
 *
 * 起因：2026-09-04 Rozi 回報線上產品的 sheet／modal 可以左右滑動、會跑版。
 * 這組測試在 320／375／414 三種寬度逐一斷言整頁與每個 sheet 容器都不橫向溢出。
 * 用真實 Chrome 量測——jsdom 沒有排版引擎，scrollWidth 恆為 0，測了等於沒測。
 *
 * 用法：
 *   npm i puppeteer-core --prefix /tmp/x
 *   PUPPETEER_PATH=/tmp/x/node_modules/puppeteer-core node 原型_版面回歸測試.cjs [檔案]
 * Chrome 路徑可用 CHROME_PATH 覆寫。
 */
const path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) {
  if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
  else { console.error('需要 puppeteer-core：npm i puppeteer-core --prefix /tmp/x 後用 PUPPETEER_PATH 指過來'); process.exit(2); }
}
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || 'Tripay_原型.html');
const WIDTHS = [320, 375, 414];

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('   ❌ ' + m)); };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();

  for (const w of WIDTHS) {
    console.log(`\n── 寬度 ${w}px ──`);
    await page.setViewport({ width: w, height: 900 });
    await page.goto('file://' + FILE, { waitUntil: 'load' });

    for (const mode of ['anno', 'op']) {
      await page.evaluate(m => document.querySelector(`#modesw button[data-m="${m}"]`).click(), mode);
      const doc = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`   ${mode === 'anno' ? '標註' : '操作'}模式：scrollWidth ${doc.sw} / clientWidth ${doc.cw}`);
      ok(doc.sw <= doc.cw, `${w}px ${mode}：整頁橫向溢出 ${doc.sw - doc.cw}px`);
    }

    // 每個 sheet／手機容器
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.ph, .ui, .sheet, .idx').forEach((el, i) => {
        if (el.scrollWidth > el.clientWidth + 1)
          out.push({ cls: el.className.split(' ')[0], i, over: el.scrollWidth - el.clientWidth });
      });
      return out;
    });
    // .idx 允許自己橫捲（寬表格包在 overflow-x:auto 內），其餘不允許
    const strict = bad.filter(x => x.cls !== 'idx');
    console.log('   容器溢出：', strict.length ? JSON.stringify(strict) : '（無）');
    ok(strict.length === 0, `${w}px：容器橫向溢出 ${JSON.stringify(strict)}`);

    // 展開所有會長出來的狀態，再測一次（含批二）
    await page.evaluate(() => {
      store.s01 = 'empty'; renderS01();
      f = blankForm(store.trips[0].members); f.owner = 0; f.showCur = true; f.adding = true; renderS02();
      fb = null; renderS02b(); fb.tonePick = true; fb.errs.members = '測試訊息'; renderS02b();
      store.expenses.t1 = demoExpenses(); renderS03();
      store.s03bView = 'del'; renderS03b(); store.s07dlg = true; renderS07();
      store.s03Filter = { kind: 'member', memberId: tripOf('t1').members[0].id }; renderS03d();
      store.s05 = 'check'; renderS05();
      const M = tripOf('t1').members.map(m => m.id);
      g = exp({ title:'藥妝店', forAmt:'45000', twdAmt:'1035', pay:'cash', type:'individual',
                parts:M, indiv:{ [M[0]]:'12000' }, payer:M[0], sponsor:true });
      tripOf('t1').rateTwd = undefined; tripOf('t1').rateFor = undefined;
      renderS04(); g._rateOpen = true; paintS04();
    });
    const doc3 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(doc3.sw <= doc3.cw, `${w}px 批二全狀態：整頁橫向溢出 ${doc3.sw - doc3.cw}px`);
    const bad2 = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.ph, .ui, .sheet').forEach(el => {
        if (el.scrollWidth > el.clientWidth + 1) out.push({ cls: el.className.split(' ')[0], over: el.scrollWidth - el.clientWidth });
      });
      return out; });
    console.log('   批二容器溢出：', bad2.length ? JSON.stringify(bad2) : '（無）');
    ok(bad2.length === 0, `${w}px 批二：容器橫向溢出 ${JSON.stringify(bad2)}`);
    const doc2 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    console.log(`   全狀態展開：scrollWidth ${doc2.sw} / clientWidth ${doc2.cw}`);
    ok(doc2.sw <= doc2.cw, `${w}px 全狀態展開：整頁橫向溢出 ${doc2.sw - doc2.cw}px`);
  }

  await browser.close();
  console.log('\n════════════════════════════');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
