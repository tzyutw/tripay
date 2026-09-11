/* 實作-YXW　批 Y（安全區／頂部色）＋ 批 X（只看共同的帳）＋ 批 W（約／320／分享頁）。 */
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
/* 🔴 收尾-AH-3　一個畫面有幾個狀態，掃描清單就要有幾個。
   `s05` 有 pending／partial／done 三態，清單裡只有前兩個進得去，
   「帳算清楚了」那一頁從上線到現在沒有任何機器掃過。 */
const SCREENS = ['s00','s01','s02','s02b','s03','s04','s05','s06','s07',
                 's03&member=0','s03&unsettled=all',
                 's05&state=settled','s05&state=done'];

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 340)); };
  const themeColor = (fs.readFileSync('index.html', 'utf8')
    .match(/name="theme-color"\s+content="(#[0-9A-Fa-f]{6})"/) || [])[1];
  const hex2rgb = h => `rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;

  console.log('\n=== 批 Y　安全區／頂部色 ===\n');

  /* 1　--sat 守門 */
  await go('screen=s01&sat=59');
  const satOn = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sat').trim());
  await go('screen=s01');
  const satOff = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sat').trim());
  console.log(`   --sat：?sat=59 → ${satOn}｜不帶 → ${satOff}`);
  ok(satOn === '59px', `?sat=59 沒生效（${satOn}）——下面全部沒有意義`);
  ok(satOff === '0px', `不帶參數應為 0px，實際 ${satOff}`);

  /* 2　viewport-fit */
  const vp = (fs.readFileSync('index.html', 'utf8').match(/name="viewport"\s+content="([^"]+)"/) || [])[1] || '';
  console.log(`   viewport「${vp}」`);
  ok(vp.includes('viewport-fit=cover'), 'viewport 少了 viewport-fit=cover——安全區永遠是 0');

  /* 3　反向：不得再直接寫 env()（除了 :root 的定義） */
  const css = fs.readFileSync('src/index.css', 'utf8');
  const envs = (css.match(/env\(safe-area-inset-/g) || []).length;
  const defs = (css.match(/--sa[tb]:\s*env\(safe-area-inset-/g) || []).length;
  console.log(`   index.css 的 env() 用了 ${envs} 次（:root 定義 ${defs} 次）`);
  ok(envs === defs && defs === 2, `除了 :root 的兩行定義，不得再直接寫 env()（共 ${envs} 處）`);

  /* 4　每個畫面的第一個文字都不在安全區底下 */
  for (const sc of SCREENS) {
    await go(`screen=${sc}&sat=59`);
    const r = await p.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const n = w.currentNode;
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || !el.getBoundingClientRect().height) continue;
        const rg = document.createRange(); rg.selectNode(n);
        const top = rg.getBoundingClientRect().top;
        let pad = 0;
        for (let x = el; x; x = x.parentElement) pad = Math.max(pad, parseFloat(getComputedStyle(x).paddingTop) || 0);
        return { top, pad, txt: n.textContent.trim().slice(0, 12) };
      }
      return null;
    });
    const okv = r && (r.top >= 59 || r.pad >= 59);
    console.log(`   ${sc.padEnd(20)} 第一段文字「${r && r.txt}」top ${r && Math.round(r.top)}｜最大 padding-top ${r && Math.round(r.pad)}`);
    ok(r !== null, `${sc} 掃不到文字，這條等於沒驗`);
    ok(okv, `${sc} 的第一段文字被瀏海蓋住（top ${r && Math.round(r.top)}）`);
  }

  /* 5～9　hero */
  console.log('');
  await go('screen=s03&sat=59');
  /* ⚠️ 實作-Z 之後，收合條是 `.herowrap`（`.hero` 只是它裡面固定高度的那一層），
     而且**不再用 `::after` 遮罩**——遮罩是給捲動驅動動畫用的，Z-2 換成門檻切換
     之後直接改底色就好。收合態的「畫出來到底是不是藍的」由
     `實作_收合與開關瘦身測試.cjs` **讀像素**驗（`background-color` 會被
     `background-image` 蓋住，只看它就是 Z-1 漏掉一整輪的原因）。
     這裡留下的是安全區那一半：**安全區與 hero／收合條必須是同一塊**。 */
  const hero = await p.evaluate(async () => {
    const wrap = document.querySelector('.herowrap');
    if (!wrap) return null;
    const cs0 = getComputedStyle(wrap);
    const open = { h: wrap.getBoundingClientRect().height,
                   img: cs0.backgroundImage,
                   e1: document.elementFromPoint(195, 4), e2: document.elementFromPoint(195, 79) };
    const openSame = (open.e1 === open.e2) || (wrap.contains(open.e1) && wrap.contains(open.e2));
    window.scrollTo(0, 400); await new Promise(r => setTimeout(r, 450));
    const cs = getComputedStyle(wrap);
    const s1 = document.elementFromPoint(195, 4), s2 = document.elementFromPoint(195, 79);
    return { openH: open.h, openImg: open.img.includes('linear-gradient'), openSame,
             compact: wrap.classList.contains('is-compact'),
             shutBg: cs.backgroundColor, shutImg: cs.backgroundImage,
             shutSame: (s1 === s2) || (wrap.contains(s1) && wrap.contains(s2)) };
  });
  console.log(`   hero 展開 ${hero && Math.round(hero.openH)}（漸層 ${hero && hero.openImg}）｜` +
              `收合 is-compact ${hero && hero.compact}／底色 ${hero && hero.shutBg}` +
              `／background-image ${hero && String(hero.shutImg).slice(0, 12)}｜` +
              `安全區與它同一塊：展開 ${hero && hero.openSame}／收合 ${hero && hero.shutSame}`);
  ok(hero !== null, '找不到 .herowrap，這一段等於沒驗');
  ok(hero.compact, '捲了 400px 還沒收合——下面三條沒有意義');
  ok(hero.openSame, '展開態：安全區與 hero 不是同一塊');
  ok(hero.shutSame, '收合態：安全區與收合條不是同一塊（Rozi 看到的「分兩塊」）');
  ok(hero.shutBg === hex2rgb(themeColor),
    `收合態底色 ${hero.shutBg} 不等於 theme-color ${themeColor}（${hex2rgb(themeColor)}）`);
  ok(hero.shutImg === 'none',
    `收合態還有 background-image（${hero.shutImg}）——它會蓋在底色上面，畫出來還是漸層`);
  ok(hero.shutBg !== 'rgb(15, 94, 158)', '收合態還是舊的 #0F5E9E');
  ok(hero.openImg && hero.openH >= 140, '展開態的行程色漸層被改掉了（反向）');

  /* 10～12　topbar */
  console.log('');
  await go('screen=s01&sat=59');
  const gap = await p.evaluate(async () => {
    document.documentElement.style.minHeight = '2400px';
    /* ⚠️ 實作-Z-2 之後黏住並負責往上塗色的是 `.topbarwrap`（安全區從 `.topbar`
       的 padding 搬出去，那一條的高度才不會隨 iOS 網址列伸縮而跳）。 */
    const bar = document.querySelector('.topbarwrap');
    const bad = [], tops = [];
    for (const y of [300, 300.33, 300.5, 300.67, 301.25]) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120));
      tops.push(bar.getBoundingClientRect().top);
      for (let v = 0; v < 59 + 56; v += 0.25) {
        const el = document.elementFromPoint(195, v);
        if (!el || !(el === bar || bar.contains(el))) { bad.push(`${y}@${v}`); break; }
      }
    }
    const btns = [...bar.querySelectorAll('button')].map(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return !!hit && (hit === el || el.contains(hit));
    });
    document.documentElement.style.minHeight = '';
    return { bad: bad.slice(0, 3), n: bad.length, tops, btns };
  });
  console.log(`   topbarwrap：縫 ${gap.n} 處${gap.n ? '（' + gap.bad.join('、') + '）' : ''}｜` +
              `top ${gap.tops.map(x => x.toFixed(2)).join(',')}｜按鈕命中自己 ${gap.btns.join(',')}`);
  ok(gap.n === 0, `頂部列上方有縫，${gap.n} 個取樣點命中別的東西`);
  ok(gap.tops.every(t => t >= 0 && t <= 4), `topbarwrap 被位移了（top ${gap.tops.join(',')}）——不准用負 margin 解`);
  ok(gap.btns.length > 0 && gap.btns.every(Boolean), '::before 吃掉了按鈕的點擊');
  /* 無頭瀏覽器重現不了那 1px（指令自己也這麼寫），所以直接量「往上塗色」這件事本身，
     否則把 ::before 拿掉這條照樣綠——等於沒驗。 */
  const before = await p.evaluate(() => {
    const bar = document.querySelector('.topbarwrap');
    const b = getComputedStyle(bar, '::before'), s = getComputedStyle(bar);
    return { content: b.content, top: b.top, height: b.height, pos: b.position,
             bg: b.backgroundColor, pe: b.pointerEvents, barBg: s.backgroundColor,
             mt: s.marginTop, tf: s.transform };
  });
  console.log(`   topbarwrap::before content ${before.content}｜top ${before.top}｜高 ${before.height}｜` +
              `${before.pos}｜底色 ${before.bg}（列 ${before.barBg}）｜pointer-events ${before.pe}｜` +
              `列的 margin-top ${before.mt}／transform ${before.tf}`);
  ok(before.content !== 'none' && before.pos === 'absolute',
    'topbarwrap 沒有往上塗色的 ::before');
  ok(parseFloat(before.top) <= -8 && parseFloat(before.height) >= 8,
    `::before 往上塗的高度不足（top ${before.top}／height ${before.height}）`);
  ok(before.bg === before.barBg, `::before 的底色 ${before.bg} 跟頂部列 ${before.barBg} 不同`);
  ok(before.pe === 'none', '::before 沒有 pointer-events:none');
  const tfxy = (before.tf.match(/matrix\(([^)]*)\)/) || [, ''])[1].split(',').map(Number).slice(4);
  ok(before.mt === '0px' && (before.tf === 'none' || (tfxy[0] === 0 && tfxy[1] === 0)),
    `不准用 margin-top／transform 位移解（margin-top ${before.mt}／transform ${before.tf}）`);

  /* 13／14　.bar 與內容同色 */
  console.log('');
  for (const sc of ['s03&member=0', 's03&unsettled=all', 's05', 's07']) {
    await go(`screen=${sc}`);
    const c = await p.evaluate(() => {
      const bar = document.querySelector('.bar');
      if (!bar) return null;
      const r = bar.getBoundingClientRect();
      let el = document.elementFromPoint(195, Math.round(r.bottom + 14)), bg = 'rgba(0, 0, 0, 0)';
      while (el && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
      return { bar: getComputedStyle(bar).backgroundColor, below: bg };
    });
    console.log(`   ${sc.padEnd(20)} .bar ${c && c.bar}｜下方 ${c && c.below}`);
    ok(c !== null, `${sc} 找不到 .bar，這條等於沒驗`);
    ok(c.bar === c.below, `${sc} 標題列與內容區不同色：${c.bar} vs ${c.below}`);
  }
  await go('screen=s03more');
  const more = await p.evaluate(() => {
    const bar = document.querySelector('.bar');
    const card = document.querySelector('.shopt') || document.querySelector('.rowb');
    if (!bar || !card) return null;
    return { bar: getComputedStyle(bar).backgroundColor, card: getComputedStyle(card).backgroundColor,
             line: getComputedStyle(bar).borderBottomColor };
  });
  console.log(`   MoreSheet：.bar ${more && more.bar}｜卡片 ${more && more.card}｜分隔線 ${more && more.line}`);
  ok(more !== null, 'MoreSheet 找不到 .bar 或卡片，這條等於沒驗');
  ok(more.bar !== more.card || (more.line !== more.bar && more.line !== more.card),
    'MoreSheet 的標題列與卡片同色且沒有可見分隔線');

  /* 15　底部安全區：只量三個真的有 --sab 的靶——`.btnrow`（黏底按鈕列）、
        `.s00wrap`（登入頁）、以及 sheet 的內容區。用 class 指名，不用啟發式猜。 */
  console.log('');
  const BOTTOM = [['s00', '.s00wrap'], ['s03', '.btnrow'], ['s04', '.btnrow'],
                  ['s02', '.flex-shrink-0.border-t'], ['s02b', '.flex-shrink-0.border-t'], ['s05', '.btnrow']];
  for (const [sc, sel] of BOTTOM) {
    await go(`screen=${sc}&sab=34`);
    const r = await p.evaluate(q => {
      const el = document.querySelector(q);
      if (!el) return null;
      const H = window.innerHeight, cs = getComputedStyle(el);
      const kids = [...el.querySelectorAll('button, a')].map(k => k.getBoundingClientRect().bottom);
      return { pb: parseFloat(cs.paddingBottom) || 0, pos: cs.position, H,
               low: kids.length ? Math.max(...kids) : null, bottom: el.getBoundingClientRect().bottom };
    }, sel);
    console.log(`   ${sc.padEnd(5)} ${sel.padEnd(9)} padding-bottom ${r ? Math.round(r.pb) : '—'}` +
                (r && r.low !== null ? `｜最低按鈕距視窗底 ${Math.round(r.H - r.low)}` : ''));
    ok(r !== null, `${sc} 找不到 ${sel}，這條等於沒驗`);
    if (!r) continue;
    ok(r.pb >= 34, `${sc} 的 ${sel} padding-bottom ${Math.round(r.pb)} 沒含 --sab 的 34px`);
    if (r.low !== null && Math.abs(r.bottom - r.H) < 2)
      ok(r.H - r.low >= 34, `${sc} 的 ${sel} 最底下的按鈕距視窗底只有 ${Math.round(r.H - r.low)}px`);
  }

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
