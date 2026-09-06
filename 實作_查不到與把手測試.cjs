/* 實作-M　查不到行程的畫面／拖曳把手可點區／`.rmbtn` 重複定義／「自己的」標記。 */
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
const TITLE = '找不到這趟行程';
const SUB   = '可能已經被刪掉了，或這個連結已經失效。';

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 400)); };

  console.log('\n=== 實作-M　查不到／把手／自己的 ===\n');

  /* ── 1 行程頁查不到 ─────────────────────────────────────────────────── */
  await go('screen=s03&trip=missing');
  const s03 = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '回到我的行程');
    return { txt: document.body.textContent || '', spin: !!document.querySelector('.spin'),
             btnW: btn ? +btn.getBoundingClientRect().width.toFixed(1) : null,
             plane: !!document.querySelector('svg.anim') };
  });
  console.log(`   s03 查不到：spin=${s03.spin}｜「回到我的行程」寬 ${s03.btnW}｜紙飛機 ${s03.plane}`);
  ok(!s03.txt.includes('載入中'), 's03 還停在「載入中」');
  ok(s03.txt.includes(TITLE), `s03 缺「${TITLE}」`);
  ok(s03.txt.includes(SUB), 's03 缺第二行文案');
  ok(!s03.spin, 's03 還有 spinner');
  ok(s03.btnW !== null, 's03 缺「回到我的行程」按鈕');
  ok(s03.btnW !== null && s03.btnW <= 240, `按鈕寬 ${s03.btnW}px，應 ≤240（不滿版）`);
  ok(!s03.plane, '錯誤畫面套了紙飛機動畫——那是「開始記帳吧」的邀請感，語氣不對');

  /* 3 秒後仍不得出現 spinner */
  await new Promise(r => setTimeout(r, 3000));
  const still = await p.evaluate(() => !!document.querySelector('.spin'));
  ok(!still, 's03 過幾秒之後又冒出 spinner');

  /* ── 2 分享頁查不到：只有文案，不放任何按鈕 ─────────────────────────── */
  const normal = await (async () => { await go('screen=s06');
    return p.evaluate(() => document.querySelectorAll('button, a').length); })();
  await go('screen=s06&trip=missing');
  const s06 = await p.evaluate(() => ({
    txt: document.body.textContent || '', spin: !!document.querySelector('.spin'),
    n: document.querySelectorAll('button, a').length,
  }));
  console.log(`   s06 查不到：button/a ${s06.n} 個（正常狀態 ${normal} 個）｜spin=${s06.spin}`);
  ok(s06.txt.includes(TITLE) && s06.txt.includes(SUB), 's06 缺文案');
  ok(!s06.spin, 's06 還有 spinner');
  ok(s06.n === 0, `分享頁的失效畫面有 ${s06.n} 顆按鈕——訪客沒有帳號，任何出口都是假的`);

  /* ── 3 拖曳把手可點區 ──────────────────────────────────────────────── */
  await go('screen=s02b');
  const grip = await p.evaluate(() => {
    const g = document.querySelector('.grip');
    if (!g) return null;
    const r = g.getBoundingClientRect(), a = getComputedStyle(g, '::after');
    const row = g.closest('.rowb');
    const label = [...row.querySelectorAll('span')].find(x => /還沒用到|筆在用/.test(x.textContent));
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1),
             aw: parseFloat(a.width) || 0, ah: parseFloat(a.height) || 0,
             labelLines: label ? label.getClientRects().length : null,
             touch: getComputedStyle(g).touchAction };
  });
  console.log(`   .grip box ${grip.w}×${grip.h}｜::after ${grip.aw}×${grip.ah}｜` +
              `touch-action=${grip.touch}｜同列文字 ${grip.labelLines} 行`);
  ok(grip !== null, '找不到 .grip，這條等於沒驗');
  ok(grip.aw >= 44 && grip.ah >= 44, `把手可點區 ${grip.aw}×${grip.ah}，應 ≥44×44`);
  ok(grip.w <= 24, `把手 border box 寬 ${grip.w}px，應 ≤24（撐大會擠掉同列文字）`);
  ok(grip.labelLines === 1, `同列的「還沒用到／N 筆在用」折成 ${grip.labelLines} 行`);
  ok(grip.touch === 'none', 'touch-action 應為 none（只有把手吃觸控，列本身要能捲）');

  /* ── 4 .rmbtn 合併後行為不變 ───────────────────────────────────────── */
  const rm = await p.evaluate(() => {
    /* 挑一個「還沒用到」的（沒有被 inline style 標成不可刪的灰） */
    const rows = [...document.querySelectorAll('.rowb')];
    const free = rows.find(r => /還沒用到/.test(r.textContent));
    const btn = free && free.querySelector('.rmbtn');
    if (!btn) return null;
    const a = getComputedStyle(btn, '::after');
    return { aw: parseFloat(a.width) || 0, ah: parseFloat(a.height) || 0,
             color: getComputedStyle(btn).color };
  });
  console.log(`   .rmbtn ::after ${rm && rm.aw}×${rm && rm.ah}｜color=${rm && rm.color}`);
  ok(rm !== null, '找不到「還沒用到」那一列的移除鈕，這條等於沒驗');
  ok(rm && rm.aw >= 44 && rm.ah >= 44, `.rmbtn 可點區 ${rm && rm.aw}×${rm && rm.ah}，應 ≥44`);
  ok(rm && rm.color === 'rgb(106, 121, 128)', `.rmbtn color=${rm && rm.color}，應為 var(--gr)`);

  /* ── 5 「自己的」三種情況 ──────────────────────────────────────────── */
  await go('screen=s03');
  const badges = await p.evaluate(() => {
    const out = {};
    for (const row of document.querySelectorAll('.exprow')) {
      const title = row.querySelector('.t') ? row.querySelector('.t').textContent.trim() : '';
      const pills = [...row.querySelectorAll('.pill')].map(x => ({
        t: x.textContent.trim(), bg: getComputedStyle(x).backgroundColor }));
      if (pills.length) out[title] = pills;
    }
    return out;
  });
  for (const [k, v] of Object.entries(badges))
    console.log(`   ${k.padEnd(14)} ${v.map(x => `${x.t}(${x.bg})`).join(' ')}`);

  const own   = badges['紀念品'] || [];
  const lent  = badges['幫小美買的藥'] || [];
  const hist  = badges['阿明的計程車'] || [];
  const spot  = badges['機場接送'] || [];   // 「當場就清了」是 pill gr，拿它當灰色對照
  ok(own.some(x => x.t === '自己的'), '「紀念品」（自己買自己付）應顯示「自己的」');
  ok(!own.some(x => x.t.startsWith('只算')), '「紀念品」不該再顯示「只算」');
  ok(lent.some(x => x.t.startsWith('只算')), '「幫小美買的藥」（別人代墊）應顯示「只算 …」');
  ok(!lent.some(x => x.t === '自己的'), '「幫小美買的藥」不該顯示「自己的」');
  ok(hist.some(x => x.t === '自己的'), '歷史 personal 應顯示「自己的」');
  /* 一律灰（`pill gr`），不得用藍（`pill ind`）。
     ⚠️ 指令寫「與『各付各的』那顆相同（灰，非藍）」——但**「各付各的」實際上是藍的**
     （`pill ind`）。以括號裡的「灰，非藍」為準，對照組改用同為 `pill gr` 的「當場就清了」。 */
  const grey = (spot.find(x => x.t === '當場就清了') || {}).bg;
  const blue = (badges['藥妝店'] || []).find(x => x.t === '各付各的');
  ok(!!grey, '找不到「當場就清了」那顆當灰色對照，這條等於沒驗');
  ok(!!blue && blue.bg !== grey, '「各付各的」竟然與灰色同色？對照組失效');
  for (const [name, arr] of [['紀念品', own], ['阿明的計程車', hist]]) {
    const pill = arr.find(x => x.t === '自己的');
    ok(pill && pill.bg === grey, `${name} 的「自己的」底色 ${pill && pill.bg}，應與「各付各的」相同（灰）`);
  }

  /* ── 6 三寬度不橫向溢出 ────────────────────────────────────────────── */
  for (const q of ['screen=s02b', 'screen=s03', 'screen=s06', 'screen=s03&trip=missing', 'screen=s06&trip=missing']) {
    for (const w of [320, 390, 414]) {
      await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
      await go(q);
      const o = await p.evaluate(() => {
        const bad = []; let n = 0;
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.overflowX === 'visible' || el.clientWidth === 0) continue;
          n++;
          if (el.scrollWidth > el.clientWidth + 1)
            bad.push(`${el.tagName}.${(typeof el.className === 'string' ? el.className : '').slice(0, 18)} ${el.scrollWidth}>${el.clientWidth}`);
        }
        return { n, bad: bad.slice(0, 3), total: bad.length,
                 body: (document.body.textContent || '').trim().length };
      });
      /* 「查不到」那兩頁只有一段文字，沒有捲動容器是正常的——改驗畫面有內容 */
      ok(o.body > 5, `${q} @${w} 畫面幾乎是空的（${o.body} 字），這條等於沒驗`);
      ok(o.total === 0, `${q} @${w} 容器橫向溢出 ${o.total} 處：${o.bad.join('；')}`);
    }
  }

  await b.close(); srv.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
