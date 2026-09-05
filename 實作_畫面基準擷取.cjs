/* 實作-B　從 Tripay_原型.html 的**操作模式**擷取十個畫面該有的文字。
 *
 * 這是實作-B 的驗收基準：App 每個畫面 render 出來的字串集合，
 * 必須等於原型同一畫面的字串集合。原型是規格，所以比對對象是原型，
 * 不是「上一版的自己」。
 *
 * 不列入比對的（都是原型的鷹架，不是產品內容）：
 *   .bdg 編號徽章、右側稿註清單 .idx、原型控制列 #devbar、遮罩說明字
 */
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve('Tripay_原型.html');
const OUT = 'src/test/fixtures/screens.json';

/* 原型的畫面 id → 我們的代號 */
const SCREENS = ['s00', 's01', 's02', 's02b', 's03', 's03d', 's04', 's05', 's06', 's07'];

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto('file://' + FILE, { waitUntil: 'load' });

  const out = await p.evaluate(screens => {
    /* 操作模式：關掉標註 */
    document.documentElement.classList.remove('anno');
    setDev(true);

    /* 每個畫面都先鋪好一組有代表性的資料，跟共用元件那份 fixture 同源 */
    store.expenses.t1 = demoExpenses();
    store.s03Trip = 't1';
    store.s03Cur = 'TWD';
    f = blankForm(store.trips[0].members); f.start = '2026-03-14'; f.end = ''; renderS02();
    fb = null; renderS02b();
    store.s03Tab = 'exp'; store.s03StatOpen = true; renderS03();
    store.s03Filter = { kind: 'all' }; renderS03d();
    store.s03bView = 'share'; renderS03b();
    store.s06StatOpen = true; renderS06();
    store.s07dlg = false; renderS07();
    const t = tripOf('t1'), M = t.members.map(m => m.id);
    g = exp({ title: '午餐', twdAmt: '1200', pay: t.pays[0], type: 'shared', parts: M, payer: M[0] });
    renderS04();
    store.s05 = 'partial'; store.s05open = true; renderS05();

    const grab = id => {
      const el = document.getElementById('scr-' + id);
      if (!el) return null;
      const c = el.cloneNode(true);
      c.querySelectorAll('.bdg, .idx, #devbar, .scrim').forEach(x => x.remove());
      /* 字串集合：每個文字節點一段，順序保留（順序也是規格的一部分）*/
      const list = [];
      const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { const s = n.textContent.replace(/\s+/g, ' ').trim(); if (s) list.push(s); }
      return { list, text: (c.textContent || '').replace(/\s+/g, '') };
    };

    const res = {};
    for (const id of screens) res[id] = grab(id);
    return res;
  }, SCREENS);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  await b.close();
  console.log('已寫出', OUT);
  for (const id of SCREENS)
    console.log(`   ${id.padEnd(5)} ${out[id] ? String(out[id].list.length).padStart(3) + ' 段文字' : '（原型沒有這個畫面）'}`);
})();
