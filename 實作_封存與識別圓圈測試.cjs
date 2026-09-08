/* 實作-AE　封存不可點（1）／查不到行程（2）／識別圓圈尺寸一致（3）／移除鈕用圖示（4）。 */
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

(async () => {
  const { srv, port } = await serve(DIST);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`http://127.0.0.1:${port}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 400)); };

  console.log('\n=== 實作-AE　封存／查不到／識別圓圈／移除鈕 ===\n');

  /* 1／2　封存不可點、已結算仍可點 */
  for (const [state, wantBtn] of [['archived', false], ['settled', true]]) {
    await go(`screen=s03&state=${state}`);
    const r = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.exprow')];
      return { n: rows.length, btn: rows.filter(x => x.tagName === 'BUTTON').length,
               cursor: rows[0] ? getComputedStyle(rows[0]).cursor : null };
    });
    console.log(`   ${state.padEnd(9)} ${r.n} 列｜button ${r.btn} 個｜cursor ${r.cursor}`);
    ok(r.n > 0, `${state} 一列都沒有，這一組等於沒驗`);
    ok(wantBtn ? r.btn === r.n : r.btn === 0,
      `${state} 的消費列 button 數 ${r.btn}／${r.n}——` +
      (wantBtn ? '已結算要維持可點（畫面地圖 118「點擊仍可編輯」）'
               : '封存要唯讀（畫面地圖 119「列表唯讀」）'));
    /* 真的點下去也不能開表單 */
    if (!wantBtn && r.n > 0) {
      await p.evaluate(() => document.querySelectorAll('.exprow')[0].click());
      await new Promise(x => setTimeout(x, 600));
      const opened = await p.evaluate(() => document.body.innerText.includes('記下來'));
      console.log(`   ${state.padEnd(9)} 點第一列 → 出現編輯表單：${opened}`);
      ok(!opened, `${state} 點消費列竟然開出了編輯表單`);
    }
  }
  /* 已結算點下去要開得起來（反向的另一半） */
  await go('screen=s03&state=settled');
  await p.evaluate(() => document.querySelectorAll('.exprow')[0].click());
  await new Promise(x => setTimeout(x, 700));
  const settledOpened = await p.evaluate(() => document.body.innerText.includes('記下來'));
  console.log(`   settled   點第一列 → 出現編輯表單：${settledOpened}`);
  ok(settledOpened, '已結算的消費列點不開編輯表單——不要順手把它也鎖掉');

  /* 3／4　查不到行程 */
  console.log('');
  await go('screen=s03&trip=missing');
  const nf = await p.evaluate(() => ({
    spin: document.querySelectorAll('.spin').length,
    txt: document.body.innerText,
    btn: [...document.querySelectorAll('button')].map(x => ({
      t: x.textContent.trim(),
      r: (() => { const b2 = x.getBoundingClientRect(), af = getComputedStyle(x, '::after');
        return { w: Math.max(b2.width, parseFloat(af.width) || 0),
                 h: Math.max(b2.height, parseFloat(af.height) || 0) }; })() })),
  }));
  const backBtn = nf.btn.find(x => x.t.includes('回'));
  console.log(`   trip=missing：spinner ${nf.spin} 個｜標題「找不到這趟行程」${nf.txt.includes('找不到這趟行程')}` +
              `｜按鈕「${backBtn && backBtn.t}」${backBtn && Math.round(backBtn.r.w)}×${Math.round(backBtn.r.h)}`);
  ok(nf.spin === 0, `查不到行程時還有 ${nf.spin} 個載入動畫——載入中與找不到不得同時出現`);
  ok(nf.txt.includes('找不到這趟行程'), '沒有出現「找不到這趟行程」');
  ok(!/\b40[0-9]\b|PGRST|error/i.test(nf.txt), '畫面上出現了技術錯誤碼');
  ok(backBtn !== undefined, '沒有可以回首頁的按鈕');
  if (backBtn) ok(backBtn.r.h >= 44 || (backBtn.r.h >= 34 && backBtn.r.w * backBtn.r.h >= 1600),
    `回首頁的按鈕可點區不足（${Math.round(backBtn.r.w)}×${Math.round(backBtn.r.h)}）`);
  await go('screen=s03');
  const okTxt = await p.evaluate(() => document.body.innerText);
  ok(!okTxt.includes('找不到這趟行程'), '正常行程竟然出現「找不到這趟行程」（反向）');

  /* 5／6　識別圓圈尺寸 */
  console.log('');
  await go('screen=s02b');
  const av = await p.evaluate(async () => {
    const rows = [...document.querySelectorAll('.rowb')];
    const row = rows.find(r => r.querySelector('.avatar'));
    if (!row) return null;
    const before = { av: row.querySelector('.avatar').getBoundingClientRect(),
                     row: row.getBoundingClientRect() };
    row.querySelector('.avatar').click();
    await new Promise(r => setTimeout(r, 300));
    const inp = row.querySelector('input[aria-label^="換"]');
    if (!inp) return { noEdit: true, before: { w: before.av.width, h: before.av.height, rh: before.row.height } };
    const after = { inp: inp.getBoundingClientRect(), row: row.getBoundingClientRect() };
    return { before: { w: before.av.width, h: before.av.height, rh: before.row.height },
             after: { w: after.inp.width, h: after.inp.height, rh: after.row.height } };
  });
  console.log(`   成員列：未編輯 ${av && Math.round(av.before.w)}×${Math.round(av.before.h)}（列高 ${av && av.before.rh.toFixed(1)}）` +
              `｜編輯中 ${av && av.after && Math.round(av.after.w)}×${Math.round(av.after.h)}（列高 ${av && av.after && av.after.rh.toFixed(1)}）`);
  ok(av !== null && !av.noEdit, '點不進就地編輯，第 5 條等於沒驗');
  if (av && av.after) {
    ok(av.before.w === 28 && av.before.h === 28, `未編輯不是 28px（${av.before.w}×${av.before.h}）`);
    ok(av.after.w === 28 && av.after.h === 28, `編輯中不是 28px（${av.after.w}×${av.after.h}）——那一列會跳動`);
    ok(Math.abs(av.before.rh - av.after.rh) <= 0.5,
      `列高在編輯前後差 ${(av.after.rh - av.before.rh).toFixed(2)}px`);
  }
  /* 6　全站 .avatar 尺寸集合仍為 {28, 20} */
  const sizes = new Set();
  for (const q of ['s01', 's02', 's02b', 's03', 's03&member=0', 's04', 's05', 's06', 's07']) {
    await go(`screen=${q}`);
    const el = await p.$('.detailtoggle'); if (el) { await p.click('.detailtoggle'); await new Promise(r => setTimeout(r, 260)); }
    for (const w of await p.$$eval('.avatar', ns => ns.map(a => Math.round(a.getBoundingClientRect().width))))
      sizes.add(w);
  }
  console.log(`   全站 .avatar 尺寸集合：{${[...sizes].sort((a, c) => c - a).join(', ')}}`);
  ok(sizes.size > 0, '整站掃不到 .avatar，第 6 條等於沒驗');
  ok([...sizes].every(x => x === 28 || x === 20), `出現了 28／20 以外的尺寸：{${[...sizes].join(', ')}}`);

  /* 7　移除鈕用圖示 */
  console.log('');
  const src = fs.readFileSync('src/components/TripFormSheet.tsx', 'utf8');
  const nCross = (src.match(/✕/g) || []).length;
  console.log(`   TripFormSheet.tsx 裡的 ✕（U+2715）出現 ${nCross} 次`);
  ok(nCross === 0, `原始碼裡還有 ${nCross} 個 ✕（連註解都算——斷言是用出現次數判定的）`);
  await go('screen=s02b');
  const rm = await p.evaluate(() => {
    const row = [...document.querySelectorAll('.rowb')].find(r => r.querySelector('.tap44'));
    if (!row) return null;
    const btn = [...row.querySelectorAll('button')].find(x => x.querySelector('svg'));
    if (!btn) return { noSvg: true };
    const r2 = btn.getBoundingClientRect(), af = getComputedStyle(btn, '::after');
    const w = Math.max(r2.width, parseFloat(af.width) || 0), h = Math.max(r2.height, parseFloat(af.height) || 0);
    const hit = document.elementFromPoint(Math.round(r2.left + r2.width / 2), Math.round(r2.top + r2.height / 2));
    return { w, h, svg: !!btn.querySelector('svg'),
             self: !!hit && (hit === btn || btn.contains(hit)),
             txt: btn.textContent.trim() };
  });
  console.log(`   移除鈕：SVG ${rm && rm.svg}｜可點區 ${rm && Math.round(rm.w)}×${Math.round(rm.h)}` +
              `｜中心命中自己 ${rm && rm.self}｜文字內容「${rm && rm.txt}」`);
  ok(rm !== null && !rm.noSvg, '成員列的移除鈕不是 SVG 圖示');
  if (rm && !rm.noSvg) {
    ok(rm.w >= 44 && rm.h >= 44, `移除鈕可點區 ${Math.round(rm.w)}×${Math.round(rm.h)} 不足 44`);
    ok(rm.self, '移除鈕中心點被蓋住');
    ok(rm.txt === '', `移除鈕裡還有文字「${rm.txt}」`);
  }

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
