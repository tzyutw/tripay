/* 修-8　「帳算清楚了」那一頁的「分享給大家」要真的開出分享 sheet。
   由來：Rozi 2026-09-12 手機實測「這個按鈕不能按」——按得到，但按下去只是
   跳回行程詳情頁，分享畫面從來沒開過（`SettlementPage` 導的是 `/trips/:id`）。
   原型 `Tripay_原型.html:3137` S-05-29 的規格就是「把結果傳給大家」＝分享。

   ⚠️ 為什麼一定要真實瀏覽器：分享 sheet 是 `createPortal` 到 body 的彈層，
   「按了之後畫面上真的有東西彈出來」jsdom 量不到（沒有版面、沒有 portal 疊層行為）。
   單元測試那一條只驗「導到 /share 這條 route」，不等於使用者看得到 sheet。 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist-harness');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
               '.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png' };
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

/* 分享 sheet 的識別特徵＝它那三個選項（`ExpenseListPage` 的 `ShareSheet`）。
   **不要用「有 .fixed 彈層」當判準**——那會被任何別的彈層蒙混過去。 */
const SHEET_OPTS = ['複製文字摘要', '複製分享連結', '預覽分享頁面'];
const sheetProbe = () => {
  const t = document.body.innerText;
  return {
    hits: ['複製文字摘要', '複製分享連結', '預覽分享頁面'].filter(s => t.includes(s)),
    route: window.__ROUTE__,
  };
};

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  const go = async (q, w = 390) => {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => !document.querySelector('.spin'), { timeout: 8000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 250));
  };
  /* 按鈕一律靠文字找，並且**先滾到畫面中間再按**——底部按鈕列會蓋住它，
     直接 click 有機會點到蓋在上面的東西（2026-09-07 的假紅就是這樣來的）。 */
  const clickByText = async (sel, text) => p.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find(x => x.textContent.trim() === text);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, sel, text);

  console.log('\n修-8　「分享給大家」接回既有的分享 sheet\n');

  // ── 守門　done 這一頁開得起來，而且那顆按鈕在 ─────────────────────────────
  await go('screen=s05&state=done');
  const doneTxt = await p.evaluate(() => document.body.innerText);
  ok(doneTxt.includes('帳算清楚了'),
     `守門沒過：?state=done 進不到「帳算清楚了」（實際開頭：${doneTxt.slice(0, 40).replace(/\n/g, '⏎')}）`);
  if (!doneTxt.includes('帳算清楚了')) {
    console.log('\n   守門條件沒過，後面全部不算數。\n');
    await b.close(); srv.close(); process.exit(1);
  }
  const routeBefore = await p.evaluate(() => window.__ROUTE__);
  ok(/\/settlement$/.test(routeBefore || ''), `起點不是 S-05：__ROUTE__=${routeBefore}`);
  /* 按之前 sheet 不能已經在——不然「按了才出現」這件事驗不到 */
  const before = await p.evaluate(sheetProbe);
  ok(before.hits.length === 0, `按之前分享 sheet 就已經在了（掃到 ${before.hits.join('／')}），這一條等於沒驗`);

  // ── 停止條件 1　按下去 1.2 秒內畫面上有分享 sheet，且 pathname 以 /share 結尾 ──
  ok(await clickByText('.btn', '分享給大家'), '找不到「分享給大家」這顆按鈕');
  await new Promise(r => setTimeout(r, 1200));
  const after = await p.evaluate(sheetProbe);
  ok(after.hits.length === SHEET_OPTS.length,
     `分享 sheet 沒有完整出現：掃到 ${after.hits.length}／${SHEET_OPTS.length} 個選項（${after.hits.join('／') || '一個都沒有'}）`);
  ok(/\/share$/.test(after.route || ''),
     `pathname 沒有以 /share 結尾：__ROUTE__=${after.route}`);
  /* 分享連結那一列是既有 ShareSheet 的東西——**沒有另寫一個分享畫面**的證據 */
  const sub = await p.evaluate(() => document.body.innerText.includes('不用登入就看得到消費明細'));
  ok(sub, '找不到既有 ShareSheet 的那句灰字——可能是另外做了一個分享畫面');

  // ── 停止條件 2　關掉之後不准再多跳一層 ───────────────────────────────────
  ok(await clickByText('button', '取消'), 'sheet 上找不到「取消」');
  await new Promise(r => setTimeout(r, 600));
  const closed = await p.evaluate(sheetProbe);
  ok(closed.hits.length === 0, `按了取消 sheet 沒關掉（還掃到 ${closed.hits.join('／')}）`);
  /* 落在 `/trips/:id`（S-03）就是剛好一層；再深一層或帶著 /share 都算沒收好 */
  ok(/^\/trips\/[^/]+$/.test(closed.route || ''),
     `關掉之後跳到奇怪的地方：__ROUTE__=${closed.route}（該是 /trips/<id>）`);

  // ── 停止條件 4　反向回歸：S-03 原本的分享入口還在、還能開 ─────────────────
  await go('screen=s03more');
  ok((await p.evaluate(() => document.body.innerText)).includes('分享'), 'S-03 的「⋯」頁不見了「分享」');
  ok(await clickByText('button', '分享'), 'S-03 的「⋯」頁點不到「分享」');
  await new Promise(r => setTimeout(r, 1200));
  const s03 = await p.evaluate(sheetProbe);
  ok(s03.hits.length === SHEET_OPTS.length,
     `S-03 的分享入口被弄壞了：掃到 ${s03.hits.length}／${SHEET_OPTS.length}（${s03.hits.join('／') || '一個都沒有'}）`);
  ok(/\/share$/.test(s03.route || ''), `S-03 分享入口的 route 不對：__ROUTE__=${s03.route}`);

  ok(errs.length === 0, `主控台有 error：${errs.join(' | ')}`);

  await b.close(); srv.close();
  console.log(`\n${fail === 0 ? '全過' : '有失敗'}：${pass} 過、${fail} 失敗\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
