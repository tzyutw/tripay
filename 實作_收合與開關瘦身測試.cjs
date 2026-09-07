/* 實作-Z　收合條真的變藍（Z-1）＋不靠捲動驅動動畫、高度不隨安全區變（Z-2）＋開關瘦身移位（Z-3）。 */
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
/* 從截圖讀像素。⚠️ **不准用 background-color 判定**——那一層會被 background-image
   蓋住，Z-1 就是這樣被漏掉一整輪的（`verify_Y` 第 7 條驗的是看不見的那一層）。

   ⚠️ PNG **在 Node 裡自己解**，不要開第二個分頁用 canvas 讀：
   Chrome 會把**背景分頁**的 IntersectionObserver 與 rAF 節流掉，
   一開第二個分頁，被量的那一頁就變成背景，`is-compact` 永遠不會切——
   我第一版就是這樣，量到的「沒收合」是分頁被凍住，不是程式壞掉。 */
const zlib = require('zlib');
function decodePng(buf) {
  let i = 8, w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.slice(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`只支援 8-bit RGB/RGBA，拿到 bd=${bd} ct=${ct}`);
  const ch = ct === 6 ? 4 : 3, stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.slice(pos, pos + stride); pos += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0, v = line[x];
      let r;
      if (f === 0) r = v;
      else if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else {                                   // Paeth
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cur[x] = r & 0xff;
    }
  }
  return { w, h, ch, px: out };
}
function at(img, x, y) {
  const X = Math.max(0, Math.min(img.w - 1, Math.round(x))), Y = Math.max(0, Math.min(img.h - 1, Math.round(y)));
  const o = Y * img.w * img.ch + X * img.ch;
  return [img.px[o], img.px[o + 1], img.px[o + 2]];
}

(async () => {
  const { srv, port } = await serve(DIST);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`http://127.0.0.1:${port}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 340)); };
  console.log('\n=== 批 Z　收合條／抖動／開關瘦身 ===\n');

  /* 1　Z-1 收合條畫出來真的是藍的（讀像素，不讀 background-color） */
  await go('screen=s03');
  await p.evaluate(() => window.scrollTo(0, 400));
  await new Promise(r => setTimeout(r, 500));
  const bar = await p.evaluate(() => {
    const el = document.querySelector('.herowrap');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             compact: el.classList.contains('is-compact'),
             bgImg: getComputedStyle(el).backgroundImage,
             inline: el.getAttribute('style') || '' };
  });
  console.log(`   收合條 ${Math.round(bar.w)}×${Math.round(bar.h)}｜is-compact ${bar.compact}｜` +
              `background-image ${bar.bgImg.slice(0, 24)}｜inline「${bar.inline.slice(0, 40)}」`);
  ok(bar.compact, '捲了 400px 還沒切成 is-compact——門檻切換沒生效，下面全部沒有意義');
  /* ⚠️ `clip` 用的是**文件座標**，`getBoundingClientRect()` 給的是**視窗座標**——
     捲動之後兩者差一個 scrollY。sticky 元素的 rect.y 是 0，clip y=0 卻會拍到
     文件最上面（早就捲過去了），量到的是頁面底色。整張視窗拍下來再取點，
     座標系就只有一套。 */
  const img = decodePng(await p.screenshot());
  ok(img.h === 844 && img.w === 390, `截圖不是視窗大小（${img.w}×${img.h}），取點座標會錯`);
  /* ⚠️ 指令寫「垂直取該條中線」，但**中線正好穿過置中的行程名**——量到的是
     白字的抗鋸齒，不是底色。取樣改到 navrow 底下那幾列（底色一定露出來的地方），
     並且**另外量整條有多少比例是這個藍**，兩種一起看才分得出
     「底色錯了」與「剛好打到字」。 */
  const TARGET = [18, 118, 196];
  const near = c => c.every((v, k) => Math.abs(v - TARGET[k]) <= 6);
  const mid = Math.round(bar.y + bar.h - 4);
  const got = [0.25, 0.5, 0.75].map(f => at(img, img.w * f, mid));
  console.log(`   收合條像素（左1/4・中・右1/4 @ y=${mid}）：${got.map(c => c.join(',')).join('　')}　目標 18,118,196`);
  for (const [i, c] of got.entries())
    ok(near(c), `第 ${i + 1} 個取樣點是 rgb(${c.join(',')})，離 #1276C4 太遠——漸層還蓋在上面`);
  /* 整條掃一遍，但**把控制項的矩形挖掉**（兩顆 .ic2 與行程名本來就不是底色）。
     挖掉之後剩下的每一個像素都必須是工作色——用固定百分比當門檻是猜的，
     控制項多一顆就會誤判。 */
  const boxes = await p.evaluate(() =>
    [...document.querySelectorAll('.herowrap.is-compact .ic2, .herowrap.is-compact .navttl')]
      .map(el => { const r = el.getBoundingClientRect();
                   return [r.left - 2, r.top - 2, r.right + 2, r.bottom + 2]; }));
  const inBox = (x, y) => boxes.some(([l, t, r2, b2]) => x >= l && x <= r2 && y >= t && y <= b2);
  let bad = 0, tot = 0, sample = null;
  for (let y = Math.round(bar.y); y < Math.round(bar.y + bar.h); y += 2)
    for (let x = 0; x < img.w; x += 2) {
      if (inBox(x, y)) continue;
      tot++;
      if (!near(at(img, x, y))) { bad++; if (!sample) sample = `(${x},${y})=rgb(${at(img, x, y).join(',')})`; }
    }
  console.log(`   收合條扣掉 ${boxes.length} 個控制項之後，${tot} 個取樣點裡有 ${bad} 個不是 #1276C4` +
              (sample ? `（例：${sample}）` : ''));
  ok(boxes.length >= 3, `只找到 ${boxes.length} 個控制項——挖掉的範圍不對，這條可能在放水`);
  ok(tot > 500, `只掃到 ${tot} 個點，樣本太少`);
  ok(bad === 0, `有 ${bad} 個像素不是工作色${sample ? '，例如 ' + sample : ''}`);

  /* 2　Z-1 反向：展開態仍是漸層 */
  await go('screen=s03');
  const open = await p.evaluate(() => {
    const el = document.querySelector('.herowrap'); const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, compact: el.classList.contains('is-compact') };
  });
  const img0 = decodePng(await p.screenshot());
  const g0 = [0.25, 0.5, 0.75].map(f => at(img0, img0.w * f, open.y + open.h / 2));
  const allSame = g0.every(c => c.join() === g0[0].join());
  console.log(`   展開態 高 ${Math.round(open.h)}｜is-compact ${open.compact}｜像素 ${g0.map(c => c.join(',')).join('　')}`);
  ok(!open.compact, '沒捲動就已經是收合態');
  ok(!allSame, '展開態變成純色了——行程色漸層被改掉（這一節明文不准動）');
  ok(open.h >= 140, `展開態只有 ${Math.round(open.h)}px`);

  /* 3　Z-2 收合後行程名看得到 */
  await go('screen=s03');
  await p.evaluate(() => window.scrollTo(0, 400));
  await new Promise(r => setTimeout(r, 500));
  const ttl = await p.evaluate(() => {
    const el = document.querySelector('.navttl'); if (!el) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return { op: Number(getComputedStyle(el).opacity), w: r.width, h: r.height,
             txt: el.textContent.trim(), self: !!hit && (hit === el || el.contains(hit)) };
  });
  console.log(`   收合後行程名「${ttl && ttl.txt}」opacity ${ttl && ttl.op}｜` +
              `${ttl && Math.round(ttl.w)}×${Math.round(ttl.h)}｜中心命中自己 ${ttl && ttl.self}`);
  ok(ttl !== null, '找不到 .navttl，這條等於沒驗');
  ok(ttl.op >= 0.95, `行程名 opacity 只有 ${ttl.op}——停在淡出到一半`);
  ok(ttl.h >= 14 && ttl.w >= 40, `行程名被縮掉了（${Math.round(ttl.w)}×${Math.round(ttl.h)}）`);
  ok(ttl.self, '行程名被別的東西蓋住');

  /* 4　Z-2 反向：不准再用捲動驅動動畫 */
  const css = fs.readFileSync('src/index.css', 'utf8');
  const nAt = (css.match(/animation-timeline/g) || []).length;
  console.log(`   index.css 的 animation-timeline：${nAt} 處`);
  ok(nAt === 0, `還有 ${nAt} 處 animation-timeline——捲動驅動動畫沒拿掉`);

  /* 5　Z-2 高度不隨安全區變 */
  console.log('');
  for (const [sc, sel] of [['s01', '.topbar'], ['s03', '.herowrap.is-compact .hero']]) {
    await go(`screen=${sc}&sat=59`);
    const hs = await p.evaluate(async q => {
      window.scrollTo(0, 300); await new Promise(r => setTimeout(r, 400));
      const H = () => { const el = document.querySelector(q); return el ? el.getBoundingClientRect().height : null; };
      const a = H();
      document.documentElement.style.setProperty('--sat', '0px'); await new Promise(r => setTimeout(r, 250));
      const b = H();
      document.documentElement.style.setProperty('--sat', '59px'); await new Promise(r => setTimeout(r, 250));
      const c = H();
      return [a, b, c];
    }, sel);
    console.log(`   ${sc}　${sel}：--sat 59→0→59 三次高度 ${hs.join(' / ')}`);
    ok(hs.every(x => x !== null), `${sc} 找不到 ${sel}，這條等於沒驗`);
    ok(hs[0] === hs[1] && hs[1] === hs[2],
      `${sc} 的 ${sel} 高度隨安全區變了（${hs.join('/')}）——iOS 網址列一伸縮就會抖`);
  }

  /* 6　Z-2 安全區仍然被填滿（比像素，不比元素——色塊可能是獨立元素）
        ⚠️ 取樣走**最左邊那一欄**（x=4），不是指令寫的畫面中央——中央會打到
        置中的行程名，白字造成 153 的色差，那不是接縫。
        ⚠️ 指令寫「兩點顏色相同」，但**展開態的 hero 是 160deg 漸層**，
        y=4 與 y=79 本來就不會一模一樣。真正要驗的是「**沒有接縫**」：
        整條由上到下相鄰列的色差都很小（漸層），而不是某一列突然跳掉（分兩塊）。
        收合態則要求那兩點**真的相等**——那裡是純色，一有接縫就是分兩塊。 */
  console.log('');
  for (const sc of ['s01', 's03']) {
    for (const scrolled of [false, true]) {
      await go(`screen=${sc}&sat=59`);
      if (scrolled) { await p.evaluate(() => window.scrollTo(0, 400)); await new Promise(r => setTimeout(r, 500)); }
      const strip = decodePng(await p.screenshot());
      let worst = 0, worstY = 0;
      for (let y = 1; y < 100; y++) {
        const a1 = at(strip, 4, y - 1), b1 = at(strip, 4, y);
        const d = Math.max(...a1.map((v, k) => Math.abs(v - b1[k])));
        if (d > worst) { worst = d; worstY = y; }
      }
      const p4 = at(strip, 4, 4), p79 = at(strip, 4, 79);
      const label = `${sc}${scrolled ? '（收合）' : '（展開）'}`;
      console.log(`   ${label.padEnd(12)} (4,4) ${p4.join(',')}｜(4,79) ${p79.join(',')}｜` +
                  `相鄰列最大色差 ${worst}（在 y=${worstY}）`);
      ok(worst <= 6, `${label} 在 y=${worstY} 有明顯接縫（色差 ${worst}）——就是 Rozi 說的「分兩塊」`);
      if (scrolled)
        ok(p4.every((v, k) => Math.abs(v - p79[k]) <= 6),
          `${label} 的安全區與收合條不同色（${p4.join(',')} vs ${p79.join(',')}）`);
    }
  }

  /* 7／8／9／10／11　Z-3 */
  console.log('');
  await go('screen=s03');
  const z3 = await p.evaluate(() => {
    const sw = document.querySelector('.swchip'), hd = document.querySelector('.listhd span');
    const row = document.querySelector('.swrow');
    if (!sw || !hd) return null;
    const a = sw.getBoundingClientRect(), h = hd.getBoundingClientRect();
    const cs = getComputedStyle(sw), hs = getComputedStyle(hd);
    const af = getComputedStyle(sw, '::after');
    const hit = document.elementFromPoint(Math.round(a.left + a.width / 2), Math.round(a.top + a.height / 2));
    return { swrow: !!row, top: a.top, hdTop: h.top,
             fs: cs.fontSize, hdFs: hs.fontSize, fw: Number(cs.fontWeight), hdFw: Number(hs.fontWeight),
             bg: cs.backgroundColor, color: cs.color,
             hitH: Math.max(a.height, parseFloat(af.height) || 0),
             hitW: Math.max(a.width, parseFloat(af.width) || 0),
             self: !!hit && (hit === sw || sw.contains(hit) || hit.parentElement === sw),
             scrollH: document.documentElement.scrollHeight };
  });
  console.log(`   開關：.swrow 存在 ${z3 && z3.swrow}｜top ${z3 && Math.round(z3.top)}（標頭 ${z3 && Math.round(z3.hdTop)}）` +
              `｜${z3 && z3.fs}/${z3 && z3.fw}（標頭 ${z3 && z3.hdFs}/${z3 && z3.hdFw}）｜底 ${z3 && z3.bg}` +
              `｜色 ${z3 && z3.color}｜可點區 ${z3 && Math.round(z3.hitW)}×${Math.round(z3.hitH)}｜頁高 ${z3 && z3.scrollH}`);
  ok(z3 !== null, '找不到 .swchip 或 .listhd，Z-3 全部等於沒驗');
  ok(!z3.swrow, '.swrow 那一列還在');
  ok(Math.abs(z3.top - z3.hdTop) <= 8, `開關沒有跟「消費紀錄」同一行（差 ${Math.round(Math.abs(z3.top - z3.hdTop))}px）`);
  ok(z3.fs === z3.hdFs, `字級不同：開關 ${z3.fs}／標頭 ${z3.hdFs}`);
  ok(z3.fw <= z3.hdFw, `開關比標頭還粗（${z3.fw} > ${z3.hdFw}）`);
  ok(z3.hitH >= 44, `可點區高只有 ${Math.round(z3.hitH)}`);
  ok(z3.self, '開關中心點被蓋住');
  const H_OFF = z3.scrollH;

  await go('screen=s03&onlyshared=1');
  const on = await p.evaluate(() => {
    const sw = document.querySelector('.swchip'); const cs = getComputedStyle(sw);
    const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    const parts = m ? m[1].split(',').map(Number) : [0, 0, 0, 0];
    return { color: cs.color, alpha: parts.length > 3 ? parts[3] : (cs.backgroundColor === 'transparent' ? 0 : 1),
             bg: cs.backgroundColor };
  });
  console.log(`   開啟時：色 ${on.color}｜底 ${on.bg}（alpha ${on.alpha}）`);
  ok(on.alpha <= 0.15, `開啟時整塊填色了（alpha ${on.alpha}）`);
  ok(on.color === 'rgb(18, 118, 196)', `開啟時文字色是 ${on.color}，不是 #1276C4`);
  ok(z3.color !== 'rgb(18, 118, 196)', `關閉時文字色也是工作色（${z3.color}）——看不出開沒開`);

  /* 7 續　頁面因此變矮 60～70px：跟上一節的基準比 */
  const BASE_BEFORE = 1697;   // 實作-X 之後、Z 之前量到的 s03 scrollHeight
  console.log(`   s03 頁高 ${H_OFF}（Z 之前 ${BASE_BEFORE}，差 ${BASE_BEFORE - H_OFF}）`);
  ok(BASE_BEFORE - H_OFF >= 55 && BASE_BEFORE - H_OFF <= 75,
    `移除 .swrow 應該少 60～70px，實際少 ${BASE_BEFORE - H_OFF}`);

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
