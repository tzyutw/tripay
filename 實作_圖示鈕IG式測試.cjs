/* 收尾-AI-6　`.ic2` 改成 IG 式：純色列純線條、有圖時毛玻璃。
   ⚠️ 對比度**讀真實像素**，不用「應該有過」——`_規則由來.md`「視覺細節不准憑印象」。 */
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
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

/* 最小 PNG 解碼：只處理 puppeteer 產出的 8-bit RGBA、非隔行。
   為什麼自己寫：開第二個分頁去 canvas 解碼會讓被量的分頁被瀏覽器降頻，
   量到的是凍住的背景分頁（2026-09-06 踩過，`is-compact` 因此永遠沒翻）。 */
function decodePNG(buf) {
  let i = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.slice(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2))
    throw new Error(`只支援 8-bit RGB/RGBA，拿到 depth=${bitDepth} colorType=${colorType}`);
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * ch);
  const stride = w * ch;
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, ch, px: out };
}
const lum = (r, g, b) => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  const go = async (q, w = 390) => {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => !document.querySelector('.spin'), { timeout: 8000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
  };
  /* 量之前一定要 scrollIntoView({block:'center'})——被別的東西蓋住會量到假紅。 */
  const readIc2 = () => p.evaluate(() => {
    const el = document.querySelector('button.ic2');
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const af = getComputedStyle(el, '::after');
    return {
      bg: cs.backgroundColor, bw: cs.borderTopWidth,
      blur: cs.backdropFilter || cs.webkitBackdropFilter, fg: cs.color,
      w: Math.round(r.width), h: Math.round(r.height),
      tapW: parseFloat(af.width), tapH: parseFloat(af.height),
      x: Math.round(r.x), y: Math.round(r.y),
    };
  });

  console.log('\n收尾-AI-6　圖示鈕改 IG 式\n');

  // ── 停止條件 9　純色列：透明、無邊框、無模糊 ─────────────────────────
  await go('screen=s05');
  const plain = await readIc2();
  ok(plain !== null, 's05 找不到 button.ic2——這幾條等於沒驗');
  if (plain) {
    console.log(`   s05 純色列：bg=${plain.bg}｜border=${plain.bw}｜blur=${plain.blur}｜icon 色=${plain.fg}`);
    ok(plain.bg === 'rgba(0, 0, 0, 0)', `s05 圓底應為透明，實際 ${plain.bg}`);
    ok(plain.bw === '0px', `s05 不該有邊框，實際 ${plain.bw}`);
    ok(plain.blur === 'none', `s05 不該有模糊，實際 ${plain.blur}`);
  }

  // ── 停止條件 10／11　封面與捲動後的藍列：黑 22%、無框、blur(14px) ──────
  for (const [scroll, label] of [[0, 's03 封面'], [400, 's03 捲動後藍列']]) {
    await go('screen=s03');
    if (scroll) {
      await p.evaluate(y => { (document.scrollingElement || document.documentElement).scrollTop = y; }, scroll);
      await new Promise(r => setTimeout(r, 500));
      const compact = await p.evaluate(() =>
        !!document.querySelector('.herowrap.is-compact'));
      ok(compact, '捲了 400px 但 .herowrap 沒有變成 is-compact——這一組等於量錯了目標');
    }
    const hero = await readIc2();
    ok(hero !== null, `${label} 找不到 button.ic2——這幾條等於沒驗`);
    if (hero) {
      console.log(`   ${label}：bg=${hero.bg}｜border=${hero.bw}｜blur=${hero.blur}`);
      ok(hero.bg === 'rgba(0, 0, 0, 0.22)', `${label} 圓底應為 rgba(0, 0, 0, 0.22)，實際 ${hero.bg}`);
      ok(hero.bw === '0px', `${label} 不該有邊框，實際 ${hero.bw}`);
      ok(/blur\(14px\)/.test(hero.blur || ''), `${label} 應有 blur(14px)，實際 ${hero.blur}`);
    }
  }

  // ── 停止條件 12　三個位置可點區 ≥44×44 ────────────────────────────────
  for (const [q, scroll, label] of [['screen=s05', 0, 's05 純色'],
                                    ['screen=s03', 0, 's03 封面'],
                                    ['screen=s03', 400, 's03 捲動後']]) {
    await go(q);
    if (scroll) {
      await p.evaluate(y => { (document.scrollingElement || document.documentElement).scrollTop = y; }, scroll);
      await new Promise(r => setTimeout(r, 500));
    }
    const m = await readIc2();
    ok(m !== null, `${label} 量不到可點區——這條等於沒驗`);
    if (m) {
      ok(m.tapW >= 44 && m.tapH >= 44,
         `${label} 可點區 ${m.tapW}×${m.tapH}，應 ≥44×44（看得見的圖形維持 ${m.w}×${m.h}）`);
      console.log(`   ${label}：圖形 ${m.w}×${m.h}／可點區 ${m.tapW}×${m.tapH}`);
    }
  }

  // ── 停止條件 13　線條對比度（讀像素，不用推算） ────────────────────────
  for (const [q, label, floor] of [['screen=s03', 's03 封面（線 vs 圓內）', 4.5],
                                   ['screen=s05', 's05 純色（線 vs 底）', 4.5]]) {
    await go(q);
    const box = await p.evaluate(() => {
      const el = document.querySelector('button.ic2');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), color: getComputedStyle(el).color,
               width: Math.round(r.width), height: Math.round(r.height) };
    });
    if (!box) { ok(false, `${label} 找不到按鈕，對比度這條等於沒驗`); continue; }
    /* ⚠️ **截整個視窗再自己裁**，不要用 `screenshot({clip})`。
       clip 吃的是文件座標而不是 rect 給的視窗座標，而且在這個專案上量到的
       40×40 區塊是均勻色塊（PNG 只有 223 bytes）——對比度會算出 1.0 這種假紅。
       整窗截圖沒有這個問題，裁切自己算就準。 */
    const full = decodePNG(await p.screenshot());
    const cx = box.width / 2, cy = box.height / 2, rad = Math.min(box.width, box.height) / 2 - 1;
    const inside = [];
    for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
      const gx = box.x + x, gy = box.y + y;
      if (gx < 0 || gy < 0 || gx >= full.w || gy >= full.h) continue;
      const o = (gy * full.w + gx) * full.ch;
      inside.push(lum(full.px[o], full.px[o + 1], full.px[o + 2]));
    }
    ok(inside.length > 500, `${label} 只取到 ${inside.length} 個像素，圓內取樣太少——這條等於沒驗`);
    inside.sort((a, c) => a - c);
    /* ⚠️ **不要用百分位抓線**：1.7px 的 Feather 線在 40×40 裡只有 10 個純色像素
       （實測 1600 分之 10＝0.6%），連第 3 百分位都碰不到，抓出來的還是底色，
       對比會算成 1.0 這種假紅。
       線色是**確定值**（computed color），不必量；真正需要量的是**底**——
       封面上那圈是「黑 22% ＋ blur」疊在照片上合成出來的，只有讀像素才知道。 */
    const mid = inside[Math.floor(inside.length / 2)];
    const m = (box.color.match(/[\d.]+/g) || []).map(Number);
    const stroke = lum(m[0], m[1], m[2]);
    const r13 = ratio(stroke, mid);
    console.log(`   ${label}：線 ${box.color} L=${stroke.toFixed(3)}／圓內實測 L=${mid.toFixed(3)} → 對比 ${r13.toFixed(1)}`);
    ok(r13 >= floor, `${label} 對比 ${r13.toFixed(1)}，應 ≥${floor}`);
  }

  // ── 停止條件 14　三個寬度不橫向捲動 ───────────────────────────────────
  for (const q of ['screen=s03', 'screen=s05']) {
    for (const w of [320, 390, 430]) {
      await go(q, w);
      const bad = await p.evaluate(() => {
        const out = [], de = document.documentElement;
        if (de.scrollWidth > de.clientWidth) out.push(`document ${de.scrollWidth}>${de.clientWidth}`);
        for (const el of document.querySelectorAll('*')) {
          const st = getComputedStyle(el);
          if (!/auto|scroll/.test(st.overflowX + st.overflow)) continue;
          if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className || el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
        }
        return out;
      });
      ok(bad.length === 0, `${q} @${w}px 橫向捲動：${bad.join('｜')}`);
    }
  }

  ok(errs.length === 0, `主控台有例外：${errs.join('｜')}`);
  await b.close(); srv.close();

  // ── 停止條件 15　原型與 index.css 的 .ic2 一致（程式抽，不手抄） ────────
  const grab = (src, re) => { const m = src.match(re); return m ? m[1].replace(/\s+/g, '') : null; };
  const proto = fs.readFileSync('Tripay_原型.html', 'utf8');
  const css = fs.readFileSync('src/index.css', 'utf8');
  const pIc2 = grab(proto, /\.ui \.ic2\{([\s\S]*?)\}/);
  const cIc2 = grab(css, /^\.ic2 \{([\s\S]*?)\}/m);
  const pHero = grab(proto, /\.ui \.hero\{(--ic2[\s\S]*?)\}/);
  const cHero = grab(css, /^\.hero \{\s*(--ic2[\s\S]*?)\}/m);
  const pick = s => s === null ? null
    : (s.match(/(background|border|-webkit-backdrop-filter|backdrop-filter|--ic2-[a-z]+):[^;]*/g) || []).sort().join('|');
  ok(pIc2 !== null && cIc2 !== null, `抽不到 .ic2（原型 ${pIc2 !== null}／index.css ${cIc2 !== null}）——這條等於沒驗`);
  ok(pHero !== null && cHero !== null, `抽不到 .hero 的變數（原型 ${pHero !== null}／index.css ${cHero !== null}）——這條等於沒驗`);
  console.log(`   .ic2   原型：${pick(pIc2)}`);
  console.log(`   .ic2 index：${pick(cIc2)}`);
  ok(pick(pIc2) === pick(cIc2), '原型與 index.css 的 .ic2 外觀屬性不一致');
  ok(pick(pHero) === pick(cHero), `原型與 index.css 的 .hero 變數不一致：${pick(pHero)} vs ${pick(cHero)}`);

  console.log(`\n   通過 ${pass}／失敗 ${fail}\n`);
  process.exit(fail ? 1 : 0);
})();
