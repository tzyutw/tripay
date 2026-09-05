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

  for (const id of SCREENS) {
    results[id] = {};
    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true,
                               deviceScaleFactor: 2 });
      await page.goto(`${BASE}/harness.html?screen=${id}`, { waitUntil: 'networkidle0' });
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

        /* ⑤ 溢出容器：sheet／modal 自己也不得橫向捲 */
        const overflow = [];
        for (const sel of ['.sheet', '.dlg', '.statcard', '.detailtable']) {
          for (const el of document.querySelectorAll(sel))
            if (el.scrollWidth > el.clientWidth + 1)
              overflow.push({ sel, scroll: el.scrollWidth, client: el.clientWidth });
        }

        return {
          bodyText, textNodes, iconBtns,
          bodyOverflow, past: past.slice(0, 5), pastCount: past.length,
          clientWidth: de.clientWidth,
          near, small, overflow,
        };
      });

      results[id][w] = { ...m, expanded };
    }
  }

  /* ── 金絲雀：故意製造一次真的溢出，確認上面那兩條抓得到 ────────────────
     這一步就是這份斷言自己的反向驗證。少了它，「量不到」與「沒問題」
     在輸出裡長得一模一樣。 */
  await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/harness.html?screen=s01`, { waitUntil: 'networkidle0' });
  const canary = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'width:900px;height:10px';
    d.textContent = 'ZZ 金絲雀';
    document.body.appendChild(d);
    const de = document.documentElement;
    const past = [...document.querySelectorAll('body *')]
      .filter(e => e.getBoundingClientRect().right > de.clientWidth + 1).length;
    return { bodyOverflow: document.body.scrollWidth - document.body.clientWidth, past };
  });
  console.log(`\n   金絲雀（故意塞 900px 寬的元素）：` +
              `body 溢出 ${canary.bodyOverflow}px、超出右緣的元素 ${canary.past} 個`);
  ok(canary.bodyOverflow > 0, '金絲雀沒被 body 溢出這條抓到——這條斷言是假的');
  ok(canary.past > 0, '金絲雀沒被「超出右緣」這條抓到——這條斷言是假的');

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

  for (const id of SCREENS) {
    const r320 = results[id][320];
    const ex = r320.expanded.length ? `　展開了：${r320.expanded.join('、')}` : '';
    console.log(`   ${id.padEnd(5)} 文字節點 ${String(r320.textNodes).padStart(3)}｜` +
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
      ok(m.overflow.length === 0,
        `${id} @${w} 容器橫向溢出：` +
        m.overflow.map(x => `${x.sel} ${x.scroll}>${x.client}`).join('；'));
    }
  }

  fs.writeFileSync('/tmp/c3-layout.json', JSON.stringify(results, null, 2));
  console.log('\n   量測明細：/tmp/c3-layout.json');
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
