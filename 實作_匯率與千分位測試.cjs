/* 實作-Q　匯率一格＋判方向、金額千分位、「先去看一下」去對地方、App 圖示。
   ⚠️ 每一條先斷言「目標存在」再比值；找不到目標必須紅，不是綠。 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist-harness');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
               '.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json',
               '.png':'image/png' };
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

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 340)); };
  const typeIn = async (sel, v) => {
    await p.click(sel); await p.keyboard.press('End');
    for (let i = 0; i < 16; i++) await p.keyboard.press('Backspace');
    if (v) await p.type(sel, v, { delay: 10 });
    await new Promise(r => setTimeout(r, 160));
  };

  console.log('\n=== 實作-Q　匯率一格／千分位／先去看一下／App 圖示 ===\n');

  /* ── 11 只剩一個輸入框 ────────────────────────────────────────────────── */
  await go('screen=s02b&cur=JPY');
  const rateUi = await p.evaluate(() => ({
    n: document.querySelectorAll('.rateinput').length,
    twd: !!document.getElementById('rate-twd'), for: !!document.getElementById('rate-for'),
    one: !!document.getElementById('rate-one'),
    ph: (document.getElementById('rate-one') || {}).placeholder,
  }));
  console.log(`   匯率欄：.rateinput ${rateUi.n} 個｜#rate-one ${rateUi.one}｜舊的兩格 ${rateUi.twd}/${rateUi.for}｜placeholder ${rateUi.ph}`);
  ok(rateUi.one, '找不到 #rate-one，這條等於沒驗');
  ok(rateUi.n === 1, `.rateinput 應只有 1 個，實際 ${rateUi.n}`);
  ok(!rateUi.twd && !rateUi.for, '舊的兩格還在');
  ok(rateUi.ph === '0.22', `JPY 的量級範例應是 0.22，實際 ${rateUi.ph}`);

  /* ── 10 白話那一行 ＋ 換個方向 ────────────────────────────────────────── */
  await typeIn('#rate-one', '0.21');
  const plain1 = await p.evaluate(() => (document.body.textContent || ''));
  console.log(`   填 0.21 → 有「1 日圓 ＝ 0.21 台幣」 ${plain1.includes('1 日圓 ＝ 0.21 台幣')}`);
  ok(plain1.includes('1 日圓 ＝ 0.21 台幣'), '沒有把系統的理解用白話攤開');
  const flipped = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '換個方向');
    if (!btn) return null;
    btn.click(); await new Promise(r => setTimeout(r, 250));
    return document.body.textContent || '';
  });
  console.log(`   按「換個方向」→ 有「1 台幣 ＝ 0.21 日圓」 ${flipped && flipped.includes('1 台幣 ＝ 0.21 日圓')}`);
  ok(flipped !== null, '找不到「換個方向」——判錯就救不回來了');
  ok(flipped.includes('1 台幣 ＝ 0.21 日圓'), '按了「換個方向」白話那行沒跟著變');

  /* ── 2 千分位 ─────────────────────────────────────────────────────────── */
  console.log('');
  await go('screen=s04');
  await typeIn('#e-for', '308500');
  const amt = await p.evaluate(() => ({
    forV: document.getElementById('e-for').value,
    twdPh: document.getElementById('e-twd').placeholder,
  }));
  console.log(`   外幣欄輸入 308500 → 顯示「${amt.forV}」`);
  ok(amt.forV === '308,500', `外幣欄應顯示 308,500，實際 "${amt.forV}"`);
  await typeIn('#e-twd', '1469048');
  const twdV = await p.evaluate(() => document.getElementById('e-twd').value);
  console.log(`   台幣欄輸入 1469048 → 顯示「${twdV}」`);
  ok(twdV === '1,469,048', `台幣欄應顯示 1,469,048，實際 "${twdV}"`);

  /* 9 端到端：行程匯率 JPY 0.21（?cur=JPY&rate=full）→ 台幣欄自動值要有逗號 */
  await go('screen=s04&cur=JPY&rate=full');
  await typeIn('#e-for', '308500');
  const auto = await p.evaluate(() => ({
    ph: document.getElementById('e-twd').placeholder,
    v: document.getElementById('e-twd').value,
  }));
  /* 期望值由**這一趟真正的兩欄**算出來，不寫死——寫死的話改了假資料就變成假通過。
     方向錯的話會是 1,469,048（就是 production 出事的那個數字），差兩個數量級，抓得到。 */
  const want = await p.evaluate(() => {
    const t = window.__TRIP__;
    const rate = Number(t.cash_rate_foreign) / Number(t.cash_rate_twd);
    return { rate, twd: Math.round(308500 / rate),
             wrong: Math.round(308500 / (Number(t.cash_rate_twd) / Number(t.cash_rate_foreign))) };
  });
  console.log(`   ?cur=JPY&rate=full 外幣 308500 → 台幣欄自動值「${auto.ph}」` +
              `（rate ${want.rate.toFixed(3)}，正確 ${want.twd.toLocaleString('en-US')}，` +
              `方向反了會是 ${want.wrong.toLocaleString('en-US')}）`);
  ok(auto.v === '', '台幣欄不該被自動填值（自動值走 placeholder，空白不等於 0）');
  ok(auto.ph === want.twd.toLocaleString('en-US'),
    `自動換算值應為 ${want.twd.toLocaleString('en-US')}（含千分位），實際 "${auto.ph}"`);
  ok(auto.ph !== want.wrong.toLocaleString('en-US'), '換算方向反了——這就是 308500 變成 1,469,048 的那個 bug');
  ok(auto.ph.includes(','), `自動換算值要有千分位，實際 "${auto.ph}"`);
  /* JPY 匯率 0.21 → 64,785 這個具體數字由單元測試守（save-rows / TripFormSheet），
     這裡守的是「畫面上的自動值 == 用這一趟的匯率算出來的值」。 */

  /* 匯率欄**不加**千分位（它是 0.21 這種小數，加了反而怪） */
  await go('screen=s02b&cur=JPY');
  await typeIn('#rate-one', '0.21');
  const rv = await p.evaluate(() => document.getElementById('rate-one').value);
  console.log(`   匯率欄輸入 0.21 → 顯示「${rv}」（不得被千分位動到）`);
  ok(rv === '0.21', `匯率欄應維持 0.21，實際 "${rv}"`);

  /* ── 3 「先去看一下」與警示層那一列去對地方 ──────────────────────────── */
  console.log('');
  await go('screen=s05');
  const warn = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '結算行程');
    if (!btn) return { found: false };
    btn.click(); await new Promise(r => setTimeout(r, 350));
    return { found: true, text: document.body.textContent || '' };
  });
  ok(warn.found, '找不到「結算行程」，下面兩條等於沒驗');
  ok(warn.text.includes('還沒算清楚'), '按了「結算行程」沒有出現結算前檢查層');

  const goSee = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '先去看一下');
    if (!btn) return null;
    btn.click(); await new Promise(r => setTimeout(r, 450));
    return { text: document.body.textContent || '', len: document.getElementById('root').innerHTML.length };
  });
  console.log(`   按「先去看一下」→ 有「還沒算清楚 · N 筆」 ${goSee && /還沒算清楚 · \d+ 筆/.test(goSee.text)}`);
  ok(goSee !== null, '找不到「先去看一下」');
  ok(goSee.len > 0, '按了之後畫面是空的');
  /* ⚠️ 驗**畫面上出現什麼**，不驗網址——harness 是 MemoryRouter */
  ok(/還沒算清楚 · \d+ 筆/.test(goSee.text),
    '「先去看一下」沒有帶到「還沒算清楚」的篩選清單（回到整個消費列表就等於什麼都沒發生）');

  await go('screen=s05');
  const rowOpen = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '結算行程');
    btn.click(); await new Promise(r => setTimeout(r, 350));
    const row = document.querySelector('.fld .rowb');
    if (!row) return null;
    const title = row.textContent;
    row.click(); await new Promise(r => setTimeout(r, 500));
    return { title, text: document.body.textContent || '' };
  });
  console.log(`   點警示層那一列（${rowOpen && rowOpen.title.slice(0, 14)}…）→ 出現「記下來」 ${rowOpen && rowOpen.text.includes('記下來')}`);
  ok(rowOpen !== null, '警示層裡沒有消費列，這條等於沒驗');
  ok(rowOpen.text.includes('記下來'), '點那一列沒有打開那一筆的編輯表單');

  /* ── 4 圖示 ───────────────────────────────────────────────────────────── */
  console.log('');
  const DIST_PROD = path.resolve('dist');
  const mani = JSON.parse(fs.readFileSync(path.join(DIST_PROD, 'manifest.webmanifest'), 'utf8'));
  console.log(`   manifest icons：${mani.icons.map(i => i.src).join('  ')}`);
  ok(mani.icons.length >= 2, `manifest 只有 ${mani.icons.length} 個 icon`);
  for (const ic of mani.icons) {
    /* start_url 是 /tripay/，icon 也必須帶同一個 base——不帶就是 404 */
    ok(ic.src.startsWith(mani.start_url), `${ic.src} 沒有帶 base（${mani.start_url}）`);
    const local = path.join(DIST_PROD, ic.src.replace(mani.start_url, ''));
    ok(fs.existsSync(local), `${ic.src} 在 dist/ 裡不存在（線上就是 404）`);
  }
  ok(mani.icons.some(i => i.type === 'image/png'), 'manifest 沒有任何 PNG——iOS 與部分 Android 不吃 SVG');

  const html = fs.readFileSync(path.join(DIST_PROD, 'index.html'), 'utf8');
  const at = html.match(/<link[^>]*rel="apple-touch-icon"[^>]*>/);
  console.log(`   apple-touch-icon：${at ? at[0] : '（沒有）'}`);
  ok(!!at, 'index.html 沒有 apple-touch-icon——iOS 加入主畫面拿不到 PNG');
  ok(!!at && at[0].includes('sizes="180x180"'), 'apple-touch-icon 沒有 sizes="180x180"');
  const href = at && (at[0].match(/href="([^"]+)"/) || [])[1];
  ok(!!href && fs.existsSync(path.join(DIST_PROD, href.replace('/tripay/', ''))),
    `apple-touch-icon 指到的檔案不存在：${href}`);
  /* 檔名要帶版本，不然 iOS 用 URL 當快取鍵，刪掉重加還是舊圖 */
  ok(!!href && /-v\d+\.png$/.test(href), `apple-touch-icon 檔名沒有版本號：${href}`);

  const png = 'data:image/png;base64,' +
    fs.readFileSync(path.join(DIST_PROD, 'apple-touch-icon-v2.png')).toString('base64');
  await p.goto('data:text/html,' + encodeURIComponent(`<body style="margin:0"><img id="i" src="${png}"></body>`),
    { waitUntil: 'networkidle0' });
  const px = await p.evaluate(async () => {
    const img = document.getElementById('i');
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const at2 = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
    return { w: img.naturalWidth, h: img.naturalHeight,
             tl: at2(14, 14), tr: at2(165, 14), bl: at2(14, 165), br: at2(165, 165) };
  });
  console.log(`   apple-touch-icon 實際 ${px.w}×${px.h}｜左上 rgb(${px.tl}) 右下 rgb(${px.br})`);
  ok(px.w === 180 && px.h === 180, `尺寸應為 180×180，實際 ${px.w}×${px.h}`);
  for (const [nm, c] of [['左上', px.tl], ['右上', px.tr], ['左下', px.bl], ['右下', px.br]])
    ok(c[2] > c[1] && c[1] > c[0], `${nm}角不是藍調（B>G>R），實際 rgb(${c}) —— 又拿到舊的磚紅了？`);
  const lum = c => c[0] * .299 + c[1] * .587 + c[2] * .114;
  ok(lum(px.tl) < lum(px.br) - 20, `漸層方向不對：左上 ${Math.round(lum(px.tl))} 右下 ${Math.round(lum(px.br))}`);

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
