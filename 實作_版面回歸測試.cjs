/* 實作-C-3　版面回歸：**真實瀏覽器量測**（jsdom 量不出這些）。
 *
 * 靶是 `harness.html`：十個畫面用真實元件 ＋ 真實 CSS ＋ 真實資料形狀掛起來，
 * supabase 由 vite alias 換成樁。正式 bundle 碰不到量測用的東西。
 *
 * 兩個既有陷阱，這份刻意避開：
 *   ① **「查了但沒查到」與「沒有問題」在輸出裡長得一樣**
 *      → 每一條都輸出「掃到幾個、哪幾個」，而且有數量下限。
 *   ② **比較式在目標消失時會假通過**（`null < 54` 在 JS 裡是 true）
 *      → 一律先斷言目標存在，再比數值。
 *
 * 掃描前**先把所有可收合面板展開**，展開了哪幾個會列在輸出裡。
 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SCREENS = ['s00', 's01', 's02', 's02b', 's03', 's03d', 's04', 's05', 's06', 's07'];
const WIDTHS  = [320, 375, 414];

/* 實作-K　資料形狀的組合。**預設那一組是原本的基準，不要動它。**
   後三組是 Rozi 每天真的會打開的樣子——她自己建的三趟：
   成員全部沒 emoji、0 筆消費、其中一趟匯率只填了外幣那一邊、有一趟沒設支付方式。
   原本的假資料一項都不符合，所以那幾條路徑從來沒被量過。 */
const MODES = [
  { q: '',                                          name: '預設（有 emoji、8 筆消費）' },
  { q: '&members=noemoji&expenses=none',            name: '兩人行程（無 emoji、0 筆）' },
  { q: '&members=noemoji&expenses=none&rate=half',  name: '四人行程（無 emoji、0 筆、半匯率）' },
  { q: '&members=noemoji&pays=none',                name: '沒設支付方式' },
];
const DIST    = path.resolve('dist-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };

/* 每個畫面要先點開哪些面板才掃得到全部內容。展開清單會印出來。 */
const EXPAND = {
  s03:  ['總花費', '要排除誰？'],
  s03d: ['有 3 筆還沒算清楚'],
  s04:  ['各付各的', '要排除誰？'],
  s05:  ['查看計算依據'],
  s06:  ['總花費'],
};

/* ⚠️ 不能用 `file://` 開：ES module 與 CSS 在 file:// 下會被 CORS 擋掉
   （origin 是 'null'），頁面**靜靜地空白**、只在 console 留錯誤。
   起一個最小的本機 http server 才量得到東西。 */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rq.writeHead(404); return rq.end();
      }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await b.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));

  const results = {};

  for (const mode of MODES) {
  for (const id of SCREENS) {
    const key = mode.q ? `${id}${mode.q}` : id;
    results[key] = {};
    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true,
                               deviceScaleFactor: 2 });
      await page.goto(`${BASE}/harness.html?screen=${id}${mode.q}`, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 250));

      /* 展開可收合面板 */
      const expanded = await page.evaluate(labels => {
        const done = [];
        for (const t of labels || []) {
          const el = [...document.querySelectorAll('button,[role=tab]')]
            .find(x => (x.textContent || '').replace(/\s+/g, '').includes(t.replace(/\s+/g, '')));
          if (el) { el.click(); done.push(t); }
        }
        return done;
      }, EXPAND[id] || []);
      await new Promise(r => setTimeout(r, 200));

      const m = await page.evaluate(() => {
        const de = document.documentElement;

        /* ② 橫向捲動——先確認頁面真的有內容，空白頁當然不會捲 */
        const bodyText = (document.body.textContent || '').trim().length;

        /* ⚠️ 不能用 `documentElement.scrollWidth`：Chrome 開 `isMobile` 模擬時
           它會回報 **innerWidth（640）** 而不是版面寬度，clientWidth 卻是 320，
           於是每一頁都「橫向捲動」——那是量測假象，不是版面壞了
           （body.scrollWidth 是 320，也沒有任何元素超出右緣）。
           改量 body，並額外掃「有沒有元素真的超出右緣」，兩條都要過。 */
        const bodyOverflow = document.body.scrollWidth - document.body.clientWidth;
        const past = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.right > de.clientWidth + 1)
            past.push(`${el.tagName}.${(typeof el.className === 'string' ? el.className : '').slice(0, 40)} right=${Math.round(r.right)}`);
        }

        /* ③ 文字不貼邊：用 Range 量**文字本身**的位置，不是元素的盒子。
              量盒子會漏掉「容器有內距但文字被絕對定位推出去」那一類。 */
        const near = [];
        let textNodes = 0;
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          if (!(n.textContent || '').trim()) continue;
          const el = n.parentElement;
          if (!el) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          const box = r.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          textNodes++;
          if (box.left < 8 || box.right > de.clientWidth - 8)
            near.push({ t: (n.textContent || '').trim().slice(0, 18),
                        left: Math.round(box.left), right: Math.round(box.right) });
        }

        /* ④ 可點區：只有 svg、沒有文字的按鈕，有效可點區 ≥44×44
              （看得見的圖形可以小，::after 的透明擴張區要夠大） */
        const small = [];
        let iconBtns = 0;
        for (const btn of document.querySelectorAll('button')) {
          if ((btn.textContent || '').trim()) continue;
          if (!btn.querySelector('svg')) continue;
          const cs = getComputedStyle(btn);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          iconBtns++;
          const r = btn.getBoundingClientRect();
          const a = getComputedStyle(btn, '::after');
          const aw = parseFloat(a.width) || 0, ah = parseFloat(a.height) || 0;
          const w = Math.max(r.width, aw), h = Math.max(r.height, ah);
          if (w < 44 || h < 44)
            small.push({ label: btn.getAttribute('aria-label') || '(無 aria-label)',
                         w: Math.round(w), h: Math.round(h) });
        }

        /* ⑤ 溢出容器：**哪個元素會捲動就量哪個**。
           2026-09-05 的教訓：原本只量 `document.documentElement`，
           但跑版發生在**底部 sheet 自己的捲動容器裡**——document 沒溢出，
           172 條全綠，Rozi 一開手機就看到整個 sheet 左右跑掉。
           所以除了固定清單，還要掃「所有 scrollWidth > clientWidth 的元素」。 */
        const overflow = [];
        for (const sel of ['.sheet', '.dlg', '.dlgwrap', '.statcard', '.detailtable']) {
          for (const el of document.querySelectorAll(sel))
            if (el.scrollWidth > el.clientWidth + 1)
              overflow.push({ sel, scroll: el.scrollWidth, client: el.clientWidth });
        }
        /* 全域掃一遍，抓固定清單以外的**捲動**容器。
           ⚠️ 只算 `overflow-x` 是 auto／scroll／hidden 的——`visible` 的元素不會捲，
           內容溢出只是視覺上跑出去，那由上面的「超出右緣」那條負責。
           不加這層過濾會誤判 `.rmbtn`：它的 `::after` 是**故意**撐出 44×44 的透明可點區，
           scrollWidth 本來就比 clientWidth 大，但它一輩子不會捲。 */
        let scrollables = 0;
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (el.clientWidth === 0) continue;
          if (cs.overflowX === 'visible') continue;
          scrollables++;
          if (el.scrollWidth > el.clientWidth + 1)
            overflow.push({
              sel: `${el.tagName}.${(typeof el.className === 'string' ? el.className : '').slice(0, 36)}`,
              scroll: el.scrollWidth, client: el.clientWidth,
            });
        }

        /* ⑥ 實作-I：**sheet 的 footer 按鈕必須在 viewport 內**。
           只量 scrollWidth 抓不到這一類——Rozi 的手機上「記下來」是被**垂直**切掉的。 */
        const offscreen = [];
        for (const b of document.querySelectorAll('.btnrow button, .dlgrow button')) {
          /* **只管彈層裡的 footer**。頁面正常流程底部的按鈕（S-03 的「記一筆」）
             本來就在摺線以下，捲下去就看得到，那不是 bug。
             彈層的判準：祖先有 position:fixed。 */
          let inOverlay = false;
          for (let e = b.parentElement; e; e = e.parentElement)
            if (getComputedStyle(e).position === 'fixed') { inOverlay = true; break; }
          if (!inOverlay) continue;
          const r = b.getBoundingClientRect();
          if (r.height === 0) continue;
          if (r.bottom > innerHeight + 1 || r.top < -1)
            offscreen.push(`${(b.textContent || '').trim().slice(0, 8)} top=${Math.round(r.top)} bottom=${Math.round(r.bottom)}`);
        }
        /* ⑦ 「＋ 文字」型的按鈕：icon 與文字的垂直中心要對齊（≤2px） */
        const misaligned = [];
        for (const b of document.querySelectorAll('button')) {
          const svg = b.querySelector(':scope > svg');
          const txt = (b.textContent || '').trim();
          if (!svg || !txt) continue;
          const sr = svg.getBoundingClientRect(), br = b.getBoundingClientRect();
          if (sr.height === 0) continue;
          const d = Math.abs((sr.top + sr.bottom) / 2 - (br.top + br.bottom) / 2);
          if (d > 2) misaligned.push(`${txt.slice(0, 8)} 差 ${d.toFixed(1)}px`);
        }

        /* 實作-J 停止條件 2：🙂 是 Avatar 的**第三層**（emoji 空 ＋ 名字空），
           產品流程已擋住空名字，所以它不該出現在任何畫面上。
           這裡跑的是**有 emoji** 的預設模式；無 emoji 模式由 實作_成員識別測試.cjs 驗。 */
        const smiley = (document.body.textContent || '').includes('🙂');

        return {
          bodyText, textNodes, iconBtns, offscreen, misaligned, smiley,
          bodyOverflow, past: past.slice(0, 5), pastCount: past.length, scrollables,
          clientWidth: de.clientWidth,
          near, small, overflow,
        };
      });

      results[key][w] = { ...m, expanded, mode: mode.name };
    }
  }
  }

  /* ── 金絲雀：故意製造一次真的溢出，確認上面那兩條抓得到 ────────────────
     這一步就是這份斷言自己的反向驗證。少了它，「量不到」與「沒問題」
     在輸出裡長得一模一樣。 */
  /* 金絲雀跑在 **s04**——那頁才有底部 sheet（`.sheet` 有 overflow-y:auto，
     所以 overflow-x 的計算值是 auto，會捲）。跑 s01 的話 box 是 null，
     第二隻金絲雀等於沒放出去。 */
  await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/harness.html?screen=s04`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const canary = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'width:900px;height:10px';
    d.textContent = 'ZZ 金絲雀';
    document.body.appendChild(d);
    const de = document.documentElement;
    const past = [...document.querySelectorAll('body *')]
      .filter(e => e.getBoundingClientRect().right > de.clientWidth + 1).length;
    /* 第一隻金絲雀量完就撤掉——留著會把整頁撐寬，干擾第二隻的量測 */
    const bodyOverflow = document.body.scrollWidth - document.body.clientWidth;
    d.remove();

    /* 第二隻金絲雀：塞進**某個捲動容器裡**，document 不會溢出，
       只有「量容器」那條抓得到。這正是 2026-09-05 漏掉的那一類。 */
    let inContainer = 0;
    let boxName = '(找不到捲動容器)';
    /* 找**真的會捲**的那個容器，不要寫死 class 名——
       實作-I 把記帳 sheet 的捲動層從 `.sheet` 換成 `.sheetbody`，
       寫死的話金絲雀就靜靜地放不出去（這一次就是這樣被抓到的）。 */
    const box = [...document.querySelectorAll('body *')].find(e => {
      const cs = getComputedStyle(e);
      return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.clientHeight > 100;
    });
    if (box) {
      const w = document.createElement('div');
      /* `flex:none` 不能省——`.sheet` 是 flex 容器，flex-shrink 預設 1，
         沒關掉的話 900px 會被縮回 320，金絲雀等於沒放出去（第一版就是這樣）。 */
      w.style.cssText = 'width:900px;height:8px;flex:none';
      box.appendChild(w);
      if (box.scrollWidth > box.clientWidth + 1) inContainer = box.scrollWidth - box.clientWidth;
      w.remove();
      boxName = `${box.tagName}.${(typeof box.className === 'string' ? box.className : '').slice(0, 24)}`;
    }
    return { bodyOverflow, past, inContainer, boxName };
  });
  console.log(`\n   金絲雀（故意塞 900px 寬的元素）：body 溢出 ${canary.bodyOverflow}px、` +
              `超出右緣 ${canary.past} 個、捲動容器（${canary.boxName}）溢出 ${canary.inContainer}px`);
  ok(canary.bodyOverflow > 0, '金絲雀沒被 body 溢出這條抓到——這條斷言是假的');
  ok(canary.past > 0, '金絲雀沒被「超出右緣」這條抓到——這條斷言是假的');
  ok(canary.inContainer > 0,
    '金絲雀塞進 sheet 之後沒被「容器溢出」抓到——那條斷言是假的');

  await b.close();
  srv.close();

  /* 頁面層級的錯誤要浮上來——不然畫面空白只會被當成「元件沒東西」 */
  if (errors.length) {
    console.log('\n   ⚠️ 頁面錯誤：');
    for (const e of [...new Set(errors)].slice(0, 5)) console.log('      ' + e);
  }

  /* ── 報告 ─────────────────────────────────────────────────────────────── */
  console.log('\n=== 實作-C-3　版面回歸（真實 Chrome）===');
  console.log(`   ${SCREENS.length} 個畫面 × ${WIDTHS.join('／')} 三個寬度\n`);

  for (const id of Object.keys(results)) {
    const r320 = results[id][320];
    const ex = r320.expanded.length ? `　展開了：${r320.expanded.join('、')}` : '';
    console.log(`   ${id.padEnd(46)} 文字節點 ${String(r320.textNodes).padStart(3)}｜` +
                `純 icon 鈕 ${String(r320.iconBtns).padStart(2)}${ex}`);

    /* ① 目標存在：畫面沒 render 出來的話下面全部都是假通過 */
    ok(r320.bodyText > 20, `${id} 幾乎沒有內容（${r320.bodyText} 字）——後面每一條都會假通過`);
    ok(r320.textNodes >= 3, `${id} 只掃到 ${r320.textNodes} 個文字節點，下限 3`);

    for (const w of WIDTHS) {
      const m = results[id][w];
      ok(m.bodyOverflow <= 0,
        `${id} @${w} 橫向捲動：body 比視窗寬 ${m.bodyOverflow}px`);
      ok(m.pastCount === 0,
        `${id} @${w} 有 ${m.pastCount} 個元素超出右緣（clientWidth ${m.clientWidth}）：` +
        m.past.join('；'));
      ok(m.near.length === 0,
        `${id} @${w} 文字貼邊 ${m.near.length} 處：` +
        m.near.map(x => `「${x.t}」left=${x.left} right=${x.right}`).join('；'));
      ok(m.small.length === 0,
        `${id} @${w} 可點區不足 44 的 icon 鈕 ${m.small.length} 個：` +
        m.small.map(x => `${x.label} ${x.w}×${x.h}`).join('；'));
      ok(m.scrollables >= 1, `${id} @${w} 一個捲動容器都沒掃到，這條等於沒驗`);
      ok(!m.smiley, `${id} @${w} 出現了 🙂——那是「沒 emoji 也沒名字」才該有的第三層`);
      ok(m.offscreen.length === 0,
        `${id} @${w} 有 ${m.offscreen.length} 顆主要按鈕在畫面外：${m.offscreen.join('；')}`);
      ok(m.misaligned.length === 0,
        `${id} @${w} icon 與文字沒對齊：${m.misaligned.join('；')}`);
      ok(m.overflow.length === 0,
        `${id} @${w} 容器橫向溢出 ${m.overflow.length} 處：` +
        [...new Set(m.overflow.map(x => `${x.sel} ${x.scroll}>${x.client}`))].slice(0, 4).join('；'));
    }
  }

  fs.writeFileSync('/tmp/c3-layout.json', JSON.stringify(results, null, 2));
  console.log('\n   量測明細：/tmp/c3-layout.json');
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
