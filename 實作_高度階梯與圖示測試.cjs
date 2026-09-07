/* 實作-P　輸入框高度只剩兩階 ＋ App 圖示底色換成 S-00 那組。
   全部在真實 Chrome 上量——高度是 computed style，圖示是真的畫出來再取像素。 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist-harness');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
               '.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json' };
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

const SCREENS = ['s00','s01','s02','s02b','s03','s03d','s04','s05','s06','s07','s03more'];

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 320)); };

  console.log('\n=== 實作-P　高度階梯（兩階）＋ App 圖示底色 ===\n');

  /* ── 2／3 全站只剩兩種高度 ─────────────────────────────────────────────
     不是「都小於 46」這種鬆的條件——要的是**集合相等**。
     而且要輸出掃到幾個、哪幾個：「查了但沒查到」與「沒有問題」在布林值裡長得一樣。 */
  const measure = () => p.evaluate(() => [...document.querySelectorAll('input,select,textarea')]
    .filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .map(e => ({ k: `${e.type || e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''}`,
                 h: getComputedStyle(e).height, fs: parseFloat(getComputedStyle(e).fontSize) })));

  const all = new Set(); let total = 0; const per = {};
  for (const sc of SCREENS) {
    for (const q of [`screen=${sc}`, `screen=${sc}&members=noemoji`]) {
      await go(q);
      const m = await measure();
      per[q] = m;
      total += m.length;
      for (const x of m) all.add(x.h);
      /* P-4：`input{font-size:16px}` 是 iOS 的硬性下限，被蓋掉會害整頁聚焦時放大 */
      for (const x of m) ok(x.fs >= 16, `${q} 的 ${x.k} 字級 ${x.fs}px < 16（iOS 會自動放大整頁）`);
    }
  }
  console.log(`   掃到 ${total} 個輸入元件，高度集合 = ${JSON.stringify([...all].sort())}`);
  ok(total >= 20, `只掃到 ${total} 個輸入元件，這條等於沒驗`);
  ok([...all].sort().join(',') === ['28px','40px'].sort().join(','),
    `高度集合應恰好 {28px, 40px}，實際 ${JSON.stringify([...all].sort())}`);

  const count = (q, h) => (per[q] || []).filter(x => x.h === h).length;
  console.log(`   s02 40px ${count('screen=s02','40px')} 個｜s02b 40px ${count('screen=s02b','40px')} 個｜` +
              `s04 28px ${count('screen=s04','28px')} 個`);
  ok(count('screen=s02', '40px') >= 4, `s02 的 40px 應 ≥4，實際 ${count('screen=s02','40px')}`);
  ok(count('screen=s02b', '40px') >= 4, `s02b 的 40px 應 ≥4，實際 ${count('screen=s02b','40px')}`);
  /* 實作-S-3 之後多了備註欄，列內嵌入的輸入框從 3 個變 4 個（品項／外幣／台幣／備註） */
  ok(count('screen=s04', '28px') === 4, `s04 的 28px 應恰好 4，實際 ${count('screen=s04','28px')}`);

  /* ── 4 token 化：CSS 與元件裡都不得再有輸入框高度的字面值 ─────────────── */
  const css = fs.readFileSync('src/index.css', 'utf8');
  const bad = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/input|textarea|select|\.rateinput|\.datefield|\.dlginput/.test(sel)) continue;
    /* `::-webkit-…-value` 這種**內部虛擬元素**畫的是值的文字盒，不是欄位高度。
       Safari 上不給它高度與行高，外框固定了裡面的字仍會偏上或偏下（#34-4 的修法）。 */
    if (sel.includes('::')) continue;
    for (const d of body.split(';')) {
      const mm = d.match(/(^|\s)height\s*:\s*(.+)$/);
      if (mm && !/^var\(--h-(field|inline)\)$/.test(mm[2].trim()) && !/^(100%|auto)$/.test(mm[2].trim()))
        bad.push(`${sel.trim()} → height:${mm[2].trim()}`);
    }
  }
  console.log(`   index.css 命中輸入框的 height 字面值：${bad.length ? JSON.stringify(bad) : '無'}`);
  ok(bad.length === 0, `還有寫死的高度：${JSON.stringify(bad)}`);

  const tsx = ['src/components/TripFormSheet.tsx', 'src/components/ExpenseFormSheet.tsx',
               'src/components/shared/PaymentMethods.tsx', 'src/components/shared/CashRate.tsx'];
  const litHits = [];
  for (const f of tsx) {
    const src = fs.readFileSync(f, 'utf8');
    /* 只看**輸入元件**上的高度字面值。按鈕的 h-[50px] 不在這一節的範圍內
       ——它不是欄位，`沒點名的東西不要碰`。 */
    for (const [, tag] of src.matchAll(/<(input|textarea|select)\b([\s\S]*?)\/?>/g)) void tag;
    for (const m2 of src.matchAll(/<(input|textarea|select)\b([\s\S]*?)>/g))
      for (const cls of (m2[2].match(/h-\[\d+px\]/g) || []))
        litHits.push(`${path.basename(f)}: <${m2[1]}> ${cls}`);
  }
  console.log(`   元件裡的 h-[Npx]：${litHits.length ? JSON.stringify(litHits) : '無'}`);
  ok(litHits.length === 0, `元件裡還有輸入框高度字面值：${JSON.stringify(litHits)}`);

  /* ── 6 不准動的兩條，用反向斷言守著 ──────────────────────────────────── */
  ok(/input\s*\{[^}]*font-size:\s*var\(--fs-input\)/.test(css) ||
     /input\s*\{[^}]*font-size:\s*16px/.test(css),
    'input 的 16px 字級規則不見了（iOS 會在聚焦時放大整頁）');
  await go('screen=s02');
  const df = await p.evaluate(() => {
    const e = document.querySelector('.datefield input[type=date]');
    if (!e) return null;
    const cs = getComputedStyle(e);
    return { ap: cs.appearance || cs.webkitAppearance, h: cs.height };
  });
  console.log(`   .datefield input[type=date]：appearance ${df && df.ap}｜height ${df && df.h}`);
  ok(df !== null, '找不到日期欄，這條等於沒驗');
  ok(df.ap === 'none', `appearance 應維持 none（修過三次的那一處），實際 ${df.ap}`);
  ok(/::-webkit-date-and-time-value/.test(css), '::-webkit-date-and-time-value 那條規則不見了');

  /* ── 9／10／11　App 圖示 ─────────────────────────────────────────────── */
  console.log('');
  const roots = ['src', 'public', 'index.html', 'vite.config.ts'];
  let brick = 0;
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, f.name);
    if (f.isDirectory()) walk(fp);
    else if (/\.(ts|tsx|css|html|svg|json)$/.test(f.name) && fs.readFileSync(fp, 'utf8').includes('7C2D12')) {
      brick++; console.log(`      殘留：${fp}`); } } };
  for (const r of roots) fs.statSync(r).isDirectory() ? walk(r)
    : (fs.readFileSync(r, 'utf8').includes('7C2D12') && (brick++, console.log(`      殘留：${r}`)));
  console.log(`   舊磚紅殘留：${brick} 處`);
  ok(brick === 0, `還有 ${brick} 處舊磚紅`);

  const svg = fs.readFileSync('public/pwa-icon.svg', 'utf8');
  for (const t of ['158', '#0B2233', '#0F5E9E', '#1276C4'])
    ok(svg.includes(t), `pwa-icon.svg 少了 ${t}`);

  const vc = fs.readFileSync('vite.config.ts', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const tc1 = (vc.match(/theme_color:\s*'([^']+)'/) || [])[1];
  const tc2 = (html.match(/name="theme-color" content="([^"]+)"/) || [])[1];
  const bg  = (vc.match(/background_color:\s*'([^']+)'/) || [])[1];
  console.log(`   theme_color ${tc1}｜meta theme-color ${tc2}｜background_color ${bg}`);
  ok(tc1 === '#1276C4' && tc2 === '#1276C4', `兩處 theme-color 應同為 #1276C4，實際 ${tc1} / ${tc2}`);
  ok(bg === '#FEF9EE', `background_color 不得改動，應為 #FEF9EE，實際 ${bg}`);

  /* 只比字串不算——真的把 SVG 畫出來取像素，而且對照 158deg 算出的**期望色**，
     不是「大概像深藍」。容差 ±6/通道。 */
  await p.setViewport({ width: 512, height: 512 });
  await p.goto('data:text/html,' + encodeURIComponent(
    `<body style="margin:0"><img id="i" width="512" height="512" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body>`),
    { waitUntil: 'networkidle0' });
  const px = await p.evaluate(async () => {
    const img = document.getElementById('i');
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 512, 512);
    const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
    return { a: at(40, 40), b: at(472, 472), mid: at(256, 40) };
  });
  /* 期望色：把 (x,y) 投影到 158deg 的漸層線上，再在三個色停點之間內插 */
  const expect = (x, y) => {
    const d = [Math.sin(158 * Math.PI / 180), -Math.cos(158 * Math.PI / 180)];
    const len = Math.abs(d[0]) + Math.abs(d[1]);
    const s = [0.5 - d[0] * len / 2, 0.5 - d[1] * len / 2];
    const t = (((x / 512) - s[0]) * d[0] + ((y / 512) - s[1]) * d[1]) / len;
    const stops = [[0, [11, 34, 51]], [0.48, [15, 94, 158]], [1, [18, 118, 196]]];
    let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  };
  for (const [nm, xy, got] of [['(40,40)', [40, 40], px.a], ['(472,472)', [472, 472], px.b],
                               ['(256,40)', [256, 40], px.mid]]) {
    const want = expect(xy[0], xy[1]);
    const diff = got.map((v, i) => Math.abs(v - want[i]));
    console.log(`   ${nm} 實際 rgb(${got}) ／ 158deg 算出的期望 rgb(${want}) ／ 差 ${diff}`);
    ok(Math.max(...diff) <= 6, `${nm} 與期望色差 ${Math.max(...diff)}，超過 ±6`);
  }
  /* 方向也要對：左上角必須比右下角暗 */
  const lum = c => c[0] * .299 + c[1] * .587 + c[2] * .114;
  ok(lum(px.a) < lum(px.b) - 30, `漸層方向反了：左上 ${Math.round(lum(px.a))} 右下 ${Math.round(lum(px.b))}`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
