/* 修-2 重現腳本（暫用，不進版控用途也可留著）：
   ?screen=s03 載入後在執行期切 window.__FAIL__='offline'，
   點一筆消費開編輯 → 改標題 → 按「記下來」，看畫面說了什麼。 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist-harness');
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
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mode = process.argv[2] || 'runtime-offline';   // runtime-offline | write | hang
  const { srv, port } = await serve(DIST);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const logs = [];
  p.on('console', m => logs.push('[console.' + m.type() + '] ' + m.text().slice(0, 200)));
  p.on('pageerror', e => logs.push('[pageerror] ' + String(e).slice(0, 200)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  const q = mode === 'write' ? 'screen=s03&fail=write'
          : mode === 'hang'  ? 'screen=s03&fail=hang'
          : 'screen=s03';
  await p.goto(`http://127.0.0.1:${port}/harness.html?${q}`, { waitUntil: 'networkidle0' });
  await wait(500);

  if (mode === 'runtime-offline' || mode === 'no-cache')
    await p.evaluate(() => { window.__FAIL__ = 'offline'; });
  if (mode === 'offline-after-open') await wait(1);   // 開表單之後才切（見下）

  // 點第一筆消費（列上有標題文字的可點列）
  const opened = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-expense-id], .exprow, li, button, div')]
      .filter(e => e.getAttribute && e.getAttribute('data-expense-id'));
    if (rows[0]) { rows[0].click(); return 'data-expense-id'; }
    return null;
  });
  await wait(600);
  let how = opened;
  if (!how) {
    // 後備：用第一筆假資料的標題字串找可點祖先
    how = await p.evaluate(() => {
      const t = (window.__SERVED__.expenses[0] || {}).title;
      const el = [...document.querySelectorAll('*')].reverse()
        .find(e => e.children.length === 0 && e.textContent.trim() === t);
      if (!el) return 'not-found:' + t;
      let n = el;
      for (let i = 0; i < 6 && n; i++, n = n.parentElement)
        if (n.tagName === 'BUTTON' || n.getAttribute('role') === 'button' || n.onclick) { n.click(); return 'ancestor:' + n.tagName; }
      el.click(); return 'leaf-click';
    });
    await wait(600);
  }

  if (mode === 'offline-after-open') { await p.evaluate(() => { window.__FAIL__ = 'offline'; }); await wait(200); }
  if (mode === 'hang-runtime') { await p.evaluate(() => { window.__FAIL__ = 'hang'; }); await wait(200); }
  /* 快取裡也沒有那一筆（例：直接從連結進來又離線）——驗最後一道守門 */
  if (mode === 'no-cache') {
    await p.evaluate(() => {
      const k = window.__QC__.getQueryCache().getAll().map(q => q.queryKey)
        .find(k => k[0] === 'expenses');
      if (k) window.__QC__.setQueryData(k, []);
    });
    await wait(300);
  }

  const before = await p.evaluate(() => ({
    sheetOpen: !!document.querySelector('.sheet, [role=dialog]'),
    titleVal: (document.querySelector('input[placeholder], .sheet input[type=text]') || {}).value ?? null,
    buttons: [...document.querySelectorAll('button')].map(x => x.textContent.trim()).filter(Boolean).slice(0, 20),
  }));

  // 改標題
  const typed = await p.evaluate(() => {
    const inp = [...document.querySelectorAll('input[type=text]')][0];
    if (!inp) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'ZZ改過的標題');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return inp.value;
  });
  await wait(200);

  const clicked = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '記下來');
    if (!btn) return false;
    btn.click(); return true;
  });

  const snap = async () => p.evaluate(() => {
    const sheet = [...document.querySelectorAll('h3')].find(h => /編輯消費|記一筆/.test(h.textContent));
    const root = sheet && sheet.closest('.fixed.inset-0');
    return {
      sheetOpen: !!root,
      sheetTitle: sheet ? sheet.textContent : null,
      titleVal: ([...document.querySelectorAll('input[type=text]')][0] || {}).value ?? null,
      saveBtn: ([...document.querySelectorAll('button')].find(x => /記下來|存檔中/.test(x.textContent)) || {}).textContent ?? null,
      sheetText: root ? root.innerText.replace(/\s+/g, ' ').slice(0, 500) : null,
      toast: [...document.querySelectorAll('*')].filter(e => e.children.length === 0 &&
               /連不上網路|存不起來|記下來了|先記著|先選這筆/.test(e.textContent)).map(e => e.textContent.trim()),
      writes: window.__WRITES__ ? window.__WRITES__.slice(-6) : null,
    };
  });

  const at1 = await (wait(900).then(snap));
  const at3 = await (wait(2200).then(snap));
  const at17 = mode === 'hang-runtime' ? await (wait(14000).then(snap)) : null;

  console.log('mode        :', mode);
  console.log('openedVia   :', how);
  console.log('beforeTyping:', JSON.stringify(before));
  console.log('typed       :', typed);
  console.log('clickedSave :', clicked);
  console.log('@0.9s       :', JSON.stringify(at1, null, 1));
  console.log('@3.1s       :', JSON.stringify(at3, null, 1));
  if (at17) console.log('@17s        :', JSON.stringify(at17, null, 1));
  console.log('logs        :', logs.slice(0, 12).join('\n               '));

  await b.close(); srv.close();
})();
