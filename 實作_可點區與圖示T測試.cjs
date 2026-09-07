/* 實作-R　可點區門檻（C6）、版面沒被撐開、App 圖示的 T、已結算可編輯／封存唯讀。
   ⚠️ 每一條先「守門」（斷言目標存在且數量夠），再驗門檻——
      #29 那條假通過的斷言就是因為量不到目標所以變綠。 */
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

const SCREENS = ['s01','s02','s02b','s03','s04','s05','s06','s07','s03more'];
/* Cowork 改動前在 390×844 量到的基準；改完每一項差距 ≤ 4px */
/* ⚠️ s01 的基準指令上寫 844，**實測改動前就是 1688**（同一支腳本、同一個
   390×844 viewport、改動前的建置量的）。指令那個數字量錯了，這裡用實測值。 */
/* 這些是**目前**的值；每一次變動都要在這裡寫清楚是誰造成的。
   實作-S：s03 +74（`.btnpad`）、s04 +58（備註列）。
   實作-T：
     s01 1688 → **844**　先前那個 1688 是我這支腳本量出來的異常值
       （Cowork 用自己的腳本前後都量到 844）。現在實際渲染是 1 張行程卡、
       內容比視窗短，scrollHeight 等於視窗高 844——**畫面是對的**。
     s02／s02b −19　T-5 把 `.fld` 的雙重內距拿掉（322→350），
       匯率那段的提示句不再折成兩行。
     s03 +28　T-6 把底部距離從 16 改成 30：`.btnrow` 74→88，
       `.btnpad` 跟著 74→88。 */
const HEIGHT_BASE = { s01: 844, s02: 922, s02b: 1182, s03: 1632, s04: 783,
                      s05: 844, s06: 1419, s07: 844, s03more: 844 };
/* B 類「矮但很寬、實際點得到」的元素，改動前實測值。指令寫的是四捨五入後的數字
   （chip 35／分頁鈕 39／rowb 41），這裡用實測值＋1px 容差。 */
const B_BASE = { 's04 .chip': 34.5, 's04 .seg button': 38.5,
                 's02b [data-payrow]': 46.5, 's02b .rowb': 46 };

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 340)); };
  /* 「換個方向」要先填了匯率才會出現——不填的話這條會因為量不到目標而假通過 */
  const fillRate = () => p.evaluate(async () => {
    const el = document.getElementById('rate-one');
    if (!el) return false;
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, '0.21');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    return true;
  });

  console.log('\n=== 實作-R　可點區／版面沒被撐開／圖示的 T／已結算可編輯 ===\n');

  /* ── 2／3 可點區門檻 ＋ 不得偷別人的點擊 ─────────────────────────────── */
  const tapOf = () => p.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const out = [];
    for (const el of document.querySelectorAll('button')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      let l = r.left, t = r.top, rr = r.right, bb = r.bottom;
      /* 有效可點區＝自身 rect 與 ::after／::before 擴張的**聯集** */
      for (const pe of ['::after', '::before']) {
        const cs = getComputedStyle(el, pe);
        if (cs.content === 'none') continue;
        const w = parseFloat(cs.width) || 0, h = parseFloat(cs.height) || 0;
        if (!w || !h) continue;
        /* 置中擴張（transform: translate(-50%,-50%) + left/top 50%）與 inset 兩種寫法都涵蓋 */
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        l = Math.min(l, cx - w / 2); rr = Math.max(rr, cx + w / 2);
        t = Math.min(t, cy - h / 2); bb = Math.max(bb, cy + h / 2);
      }
      /* 🔴 擴張區會被**任何 overflow 不是 visible 的祖先**裁掉。
         這一輪 `.avatar` 就是這樣：`overflow:hidden` 給 `<img>` 頭像裁圓角用，
         把 44×44 整個吃掉——**擴了等於沒擴，而且量 computed style 完全看不出來**。
         所以有效可點區要取「擴張後的矩形 ∩ 每一層裁切祖先的可視框」。
         （捲動容器只在邊緣裁，元素在中間時交集不會變小，不會誤報。） */
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        if (getComputedStyle(n).overflow === 'visible') continue;
        const cr = n.getBoundingClientRect();
        l = Math.max(l, cr.left); t = Math.max(t, cr.top);
        rr = Math.min(rr, cr.right); bb = Math.min(bb, cr.bottom);
      }
      const label = (el.getAttribute('aria-label') || el.className || el.textContent || '').toString().trim().slice(0, 22);
      /* 先捲進畫面再問「這個點打下去會打到誰」——**使用者本來就會先捲**。
         不捲的話，落在摺線以下的鈕會拿到 null 或底部工具列，那不是「被偷走」。 */
      el.scrollIntoView({ block: 'center' });
      const r2 = el.getBoundingClientRect();
      const cx0 = Math.round(r2.left + r2.width / 2), cy0 = Math.round(r2.top + r2.height / 2);
      const inView = cy0 >= 0 && cy0 <= window.innerHeight && cx0 >= 0 && cx0 <= window.innerWidth;
      const hit = inView ? document.elementFromPoint(cx0, cy0) : null;
      out.push({ label, cls: String(el.className || ''), w: +(rr - l).toFixed(1), h: +(bb - t).toFixed(1),
                 rw: +r.width.toFixed(1), rh: +r.height.toFixed(1),
                 /* 捲進來還是進不了畫面的（例如被 fixed 工具列完全蓋住）才算沒過 */
                 own: !inView ? true : (!!hit && (hit === el || el.contains(hit))),
                 hitLabel: hit ? String(hit.className || hit.tagName) : 'null' });
    }
    return out;
  });

  let scanned = 0;
  const small = [], stolen = [];
  for (const sc of SCREENS) {
    await go(`screen=${sc}`);
    if (sc === 's02' || sc === 's02b') await fillRate();
    const btns = await tapOf();
    scanned += btns.length;
    if (sc === 's02b') {
      const rl = btns.filter(x => x.cls.includes('ratelink')).length;
      const rm = btns.filter(x => x.cls.includes('tap44') && x.cls.includes('w-6')).length;
      console.log(`   s02b 守門：.ratelink ${rl} 顆｜成員移除鈕 ${rm} 顆`);
      ok(rl >= 1, `s02b 掃不到 .ratelink（沒填匯率？）——門檻那條會假通過`);
      ok(rm >= 4, `s02b 掃不到成員移除鈕（實際 ${rm}）——門檻那條會假通過`);
    }
    for (const x of btns) {
      if (!(x.h >= 44 || (x.h >= 34 && x.w * x.h >= 1600))) small.push(`${sc}:${x.label}(${x.w}×${x.h})`);
      if (!x.own) stolen.push(`${sc}:${x.label} → ${x.hitLabel}`);
    }
  }
  console.log(`   掃了 ${scanned} 顆按鈕｜低於門檻 ${small.length} 顆｜中心點被別人吃掉 ${stolen.length} 顆`);
  if (small.length) console.log(`      ${small.slice(0, 12).join('  ')}`);
  if (stolen.length) console.log(`      ${stolen.slice(0, 8).join('  ')}`);
  ok(scanned >= 60, `只掃到 ${scanned} 顆按鈕，這條等於沒驗`);
  ok(small.length === 0, `${small.length} 顆按鈕的可點區不足`);
  ok(stolen.length === 0, `${stolen.length} 顆按鈕的中心點被別的元素吃掉了（擴張區偷到別人的點擊）`);


  /* ── 4 版面沒有被撐開 ────────────────────────────────────────────────── */
  console.log('');
  for (const sc of SCREENS) {
    await go(`screen=${sc}`);
    const h = await p.evaluate((s2) => {
      if (s2 === 's02' || s2 === 's02b') {
        const el = document.querySelector('.flex-1.overflow-y-auto');
        return el ? el.scrollHeight : null;
      }
      if (s2 === 's04') { const el = document.querySelector('.sheetbody'); return el ? el.scrollHeight : null; }
      return document.documentElement.scrollHeight;
    }, sc);
    const base = HEIGHT_BASE[sc];
    console.log(`   ${sc.padEnd(8)} 高 ${h}（基準 ${base}，差 ${h == null ? '—' : Math.abs(h - base)}）`);
    ok(h !== null, `${sc} 量不到那個容器，這條等於沒驗`);
    ok(Math.abs(h - base) <= 4, `${sc} 版面被撐開了：${h}，基準 ${base}`);
  }

  /* ── 5 功能沒被改壞：「換個方向」真的 click 得動 ─────────────────────── */
  console.log('');
  await go('screen=s02b&cur=JPY');
  await fillRate();
  const before = await p.evaluate(() => document.body.textContent || '');
  const after = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '換個方向');
    if (!btn) return null;
    btn.click(); await new Promise(r => setTimeout(r, 250));
    return document.body.textContent || '';
  });
  console.log(`   換個方向：按之前有「1 日圓 ＝ 0.21 台幣」 ${before.includes('1 日圓 ＝ 0.21 台幣')}｜` +
              `按之後有「1 台幣 ＝ 0.21 日圓」 ${after && after.includes('1 台幣 ＝ 0.21 日圓')}`);
  ok(before.includes('1 日圓 ＝ 0.21 台幣'), '填了匯率卻沒有白話那一行');
  ok(after !== null, '找不到「換個方向」');
  ok(after.includes('1 台幣 ＝ 0.21 日圓'), '真的 click 之後方向沒有換');

  /* ── 6 B 類沒有被順手拉高（反向斷言）────────────────────────────────── */
  for (const [key, base] of Object.entries(B_BASE)) {
    const [sc, sel] = [key.split(' ')[0], key.slice(key.indexOf(' ') + 1)];
    await go(`screen=${sc}`);
    const h = await p.evaluate(s2 => {
      const e = document.querySelector(s2); return e ? parseFloat(getComputedStyle(e).height) : null;
    }, sel);
    console.log(`   B 類 ${key.padEnd(20)} ${h}px（改動前 ${base}px）`);
    ok(h !== null, `${key} 找不到，這條等於沒驗`);
    ok(Math.abs(h - base) <= 1, `${key} 被動到了：${h}px，改動前 ${base}px（B 類不准順手拉高）`);
  }

  /* ── 10 已結算可編輯／封存唯讀 ───────────────────────────────────────── */
  console.log('');
  const rowsOf = () => p.evaluate(() => ({
    total: document.querySelectorAll('.exprow').length,
    btn: document.querySelectorAll('button.exprow').length,
    div: document.querySelectorAll('div.exprow').length,
  }));
  const tapFirstRow = () => p.evaluate(async () => {
    const r = document.querySelector('.exprow');
    if (!r) return null;
    r.click(); await new Promise(x => setTimeout(x, 450));
    return document.body.textContent || '';
  });

  for (const [state, q, wantBtn, wantForm] of [
    ['正常', 'screen=s03', true, true],
    ['已結算', 'screen=s03&state=settled', true, true],
    ['封存', 'screen=s03&state=archived', true, false],
  ]) {
    await go(q);
    const r = await rowsOf();
    ok(r.total > 0, `${state}態掃不到 .exprow，這條等於沒驗`);
    const txt = await tapFirstRow();
    const hasForm = !!txt && txt.includes('記下來');
    console.log(`   ${state.padEnd(4)}：.exprow ${r.total}（button ${r.btn} / div ${r.div}）｜點下去出現編輯表單 ${hasForm}`);
    ok(r.btn === r.total, `${state}態的列應該都是 <button>，實際 ${r.btn}/${r.total}`);
    ok(hasForm === wantForm,
      wantForm ? `${state}態點列應該開得了編輯表單` : `${state}態不該開編輯表單（封存維持唯讀）`);
    if (!wantForm)
      ok(!!txt && txt.includes('重新開啟行程'), '封存態點下去沒有講話（跟壞掉分不出來）');
    void wantBtn;
  }

  /* 已結算態存檔一筆 → 要跳「重新計算」提示；正常態不得出現那句 */
  await go('screen=s03&state=settled');
  const stale = await p.evaluate(async () => {
    document.querySelector('.exprow').click();
    await new Promise(r => setTimeout(r, 450));
    const save = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '記下來');
    if (!save) return null;
    save.click(); await new Promise(r => setTimeout(r, 700));
    return document.body.textContent || '';
  });
  console.log(`   已結算存檔後有「重新計算」提示 ${stale && stale.includes('重新計算')}`);
  ok(stale !== null, '已結算態找不到「記下來」，這條等於沒驗');
  ok(stale.includes('重新計算'), '已結算改了帳卻沒說結算數字過期了');

  await go('screen=s03');
  const normal = await p.evaluate(() => (document.body.textContent || '').includes('重新計算'));
  console.log(`   正常態出現「重新計算」 ${normal}（反向斷言，應為 false）`);
  ok(!normal, '正常態不該出現「重新計算」那句提示');

  /* 分享頁不得受影響（反向斷言） */
  await go('screen=s06');
  const share = await rowsOf();
  console.log(`   分享頁：.exprow ${share.total}（button ${share.btn} / div ${share.div}）`);
  ok(share.total > 0, '分享頁掃不到 .exprow，這條等於沒驗');
  ok(share.btn === 0 && share.div === share.total,
    `分享頁的列必須維持 <div>（沒傳 onReadonlyTap），實際 button ${share.btn}`);

  /* ── 9 App 圖示的 T ─────────────────────────────────────────────────── */
  console.log('');
  const inkOf = async (file, n) => {
    const d = 'data:image/png;base64,' + fs.readFileSync(path.join('public', file)).toString('base64');
    await p.setViewport({ width: n, height: n });
    await p.goto('data:text/html,' + encodeURIComponent(`<body style="margin:0"><img id="i" src="${d}"></body>`),
      { waitUntil: 'load' });
    return p.evaluate(async (nn) => {
      const img = document.getElementById('i'); await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = nn;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const dd = g.getImageData(0, 0, nn, nn).data;
      /* 外圈 12% 排掉：圓角外面是白的，會被當成米白的字 */
      const m = Math.round(nn * 0.12);
      let x0 = nn, y0 = nn, x1 = -1, y1 = -1;
      for (let y = m; y < nn - m; y++) for (let x = m; x < nn - m; x++) {
        const i = (y * nn + x) * 4;
        if (dd[i] > 235 && dd[i + 1] > 230 && dd[i + 2] >= 220 && dd[i + 2] <= 250) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return x1 < 0 ? null : { size: nn, h: (y1 - y0 + 1) / nn,
        cy: ((y0 + y1 + 1) / 2 - nn / 2) / nn, cx: ((x0 + x1 + 1) / 2 - nn / 2) / nn };
    }, n);
  };
  for (const [f, n] of [['apple-touch-icon-v2.png', 180], ['pwa-icon-192-v2.png', 192], ['pwa-icon-512-v2.png', 512]]) {
    const r = await inkOf(f, n);
    console.log(`   ${f.padEnd(24)} T 高 ${r && (r.h * 100).toFixed(1)}%｜垂直偏 ${r && (r.cy * 100).toFixed(2)}%｜水平偏 ${r && (r.cx * 100).toFixed(2)}%`);
    ok(r !== null, `${f} 量不到 T，這條等於沒驗`);
    ok(r.h >= 0.48 && r.h <= 0.56, `${f} 的 T 高 ${(r.h * 100).toFixed(1)}%，應在 48～56%`);
    ok(Math.abs(r.cy) <= 0.02, `${f} 的 T 垂直偏 ${(r.cy * 100).toFixed(2)}%，應 ≤ 2%（Rozi：「浮在上方沒有置中」）`);
    ok(Math.abs(r.cx) <= 0.02, `${f} 的 T 水平偏 ${(r.cx * 100).toFixed(2)}%，應 ≤ 2%`);
  }

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
