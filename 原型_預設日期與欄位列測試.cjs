/* #35：「記一筆」的日期——預設今天 ＋ 改成標籤與值同一列的欄位
 *   BASE=<改動前的截圖目錄>   SHOTS=<改動後的截圖目錄>
 */
const fs = require('fs'), path = require('path');
let puppeteer, PNG, pixelmatch;
try { puppeteer = require('puppeteer-core'); }
catch (e) { if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
            else { console.error('需要 puppeteer-core'); process.exit(2); } }
try { PNG = require('pngjs').PNG;
      pixelmatch = require('pixelmatch');
      if (typeof pixelmatch !== 'function') pixelmatch = pixelmatch.default; } catch (e) {}
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || 'Tripay_原型.html');
const SRC  = fs.readFileSync(FILE, 'utf8');
const BASE = process.env.BASE, SHOTS = process.env.SHOTS;

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('file://' + FILE, { waitUntil: 'load' });
  console.log('\n=== 0　載入 ===');
  console.log('   錯誤', errs.length, errs.slice(0, 2).join(' | '));
  ok(errs.length === 0, `載入時有 ${errs.length} 個錯誤`);

  /* 1　預設日期＝今天，三種情形 */
  console.log('\n=== 1　預設日期 ===');
  const d1 = await pg.evaluate(() => {
    const t = tripOf('t1');
    const orig = today;
    const run = d => { today = () => d; const r = blankExp().date; today = orig; return r; };
    return { start: t.start, end: t.end,
             before: { 今天: '2026-02-10', 得到: run('2026-02-10') },
             during: { 今天: '2026-03-16', 得到: run('2026-03-16') },
             after:  { 今天: '2026-09-05', 得到: run('2026-09-05') },
             同一天: run(t.end) };
  });
  console.log(`   行程 ${d1.start} ～ ${d1.end}`);
  for (const k of ['before', 'during', 'after'])
    console.log(`   ${k.padEnd(6)} 今天=${d1[k].今天} → ${d1[k].得到}`);
  ok(d1.before.得到 === '2026-02-10', `出發前不該夾：機票就是記在出發前的，實際 ${d1.before.得到}`);
  ok(d1.during.得到 === '2026-03-16', `區間內就是今天，實際 ${d1.during.得到}`);
  ok(d1.after.得到 === d1.end, `回程後要夾到回程日（否則會分組成「第 N 天」），實際 ${d1.after.得到}`);
  ok(d1.同一天 === d1.end, '今天正好是回程日時就是回程日');
  ok(!/date:\s*t\.start/.test(SRC), 'blankExp() 不該再用行程出發日當預設');

  /* 回程日留空（當天來回）不得夾 */
  const d2 = await pg.evaluate(() => {
    const t = tripOf('t1'), keep = t.end; t.end = '';
    const orig = today; today = () => '2026-12-25';
    const r = blankExp().date; today = orig; t.end = keep; return r;
  });
  console.log('   回程留空（當天來回）今天=2026-12-25 →', d2);
  ok(d2 === '2026-12-25', '回程日留空時沒有上界，不得夾');

  /* 2　編輯既有消費不得被改成今天 */
  console.log('\n=== 2　編輯既有消費 ===');
  const d3 = await pg.evaluate(() => {
    store.expenses.t1 = demoExpenses();
    const e = expsOf('t1').find(x => x.date);
    const orig = today; today = () => '2026-09-05';
    loadExp(e.id); const got = g.date; today = orig;
    return { 原本: e.date, 載入後: got };
  });
  console.log('   ' + JSON.stringify(d3));
  ok(d3.原本 === d3.載入後, `loadExp() 不得把既有消費的日期改成今天：${d3.原本} → ${d3.載入後}`);

  /* 3–7　日期列的形狀 */
  console.log('\n=== 3　日期列 ===');
  const row = await pg.evaluate(() => {
    setDev(true); store.expenses.t1 = demoExpenses(); devScreen = 's04'; renderDevBar();
    const t = tripOf('t1'), M = t.members.map(m => m.id);
    g = exp({ title: '午餐', twdAmt: '1200', pay: t.pays[0], type: 'shared', parts: M, payer: M[0] });
    renderS04();
    const el = document.getElementById('e-daterow');
    const lbl = el.querySelector('.lbl'), v = el.querySelector('.v'),
          inp = el.querySelector('input[type=date]'), svg = el.querySelector('svg');
    const r = el.getBoundingClientRect();
    const hit = x => { const e = document.elementFromPoint(x, r.top + r.height / 2);
      return (e === inp || inp.contains(e)) ? 'input' : (e ? (e.className || e.tagName) + '' : 'null'); };
    /* S-02 的出發欄位——量之前要切過去，藏起來的元素量到的是 0 */
    f = blankForm(store.trips[0].members); f.start = '2026-03-14'; f.end = ''; renderS02();
    devScreen = 's02'; renderDevBar();
    const s02 = document.querySelector('#scr-s02 input[type=date]').getBoundingClientRect();
    devScreen = 's04'; renderDevBar();
    return { h: +r.height.toFixed(1), s02h: +s02.height.toFixed(1),
             lblTop: +lbl.getBoundingClientRect().top.toFixed(1),
             vTop: +v.getBoundingClientRect().top.toFixed(1),
             lblTxt: lbl.textContent.trim(), vTxt: v.textContent.trim(),
             lblW: +lbl.getBoundingClientRect().width.toFixed(0),
             vFs: getComputedStyle(v).fontSize, lblFs: getComputedStyle(lbl).fontSize,
             fsInput: getComputedStyle(el.closest('.ui')).getPropertyValue('--fs-input').trim(),
             fsBody: getComputedStyle(el.closest('.ui')).getPropertyValue('--fs-body').trim(),
             bg: getComputedStyle(el).backgroundColor, bw: getComputedStyle(el).borderTopWidth,
             br: getComputedStyle(el).borderTopLeftRadius,
             cls: el.className, icon: svg ? svg.getAttribute('width') : null,
             iconIsCal: svg ? /rect|calendar/i.test(svg.innerHTML) : false,
             hits: [hit(r.left + 6), hit(r.left + r.width / 2), hit(r.right - 6)],
             leftOfTitle: (() => { const t2 = document.querySelector('#scr-s04 .shd');
               return t2 ? +(r.top - t2.getBoundingClientRect().bottom).toFixed(0) : null; })(),
             daterow: document.querySelectorAll('.ui .daterow').length };
  });
  console.log('   ' + JSON.stringify(row, null, 0).replace(/","/g, '", "'));
  ok(row.lblTxt === '記在' && /（/.test(row.vTxt), '「記在」與日期值都要在這一列');
  ok(row.lblTop === row.vTop, `標籤與日期值要在同一列，實際 top ${row.lblTop} / ${row.vTop}`);
  ok(row.h === row.s02h, `列高應與 S-02 出發欄位相同，實際 ${row.h} vs ${row.s02h}`);
  ok(row.vFs === row.fsInput, `日期值字級應為 --fs-input（${row.fsInput}），實際 ${row.vFs}`);
  ok(row.lblFs === row.fsBody, `「記在」字級應為 --fs-body（${row.fsBody}），實際 ${row.lblFs}`);
  ok(row.lblW === 68, `「記在」沿用 .fieldrow>.lbl 的 68px 固定寬，實際 ${row.lblW}`);
  ok(row.cls.includes('fieldrow'), `應改成 .fieldrow 同款，實際 class="${row.cls}"`);
  ok(row.bg === 'rgb(255, 255, 255)' && parseFloat(row.bw) === 1 && parseFloat(row.br) > 0,
    `應是白底＋一圈細線＋圓角，實際 ${row.bg} / ${row.bw} / ${row.br}`);
  ok(row.icon === '16' && row.iconIsCal, '右邊應是 16px 的日曆圖示，不是箭頭');
  ok(row.hits.every(x => x === 'input'),
    `左端／中央／右端都要打得到同一顆日期輸入框，實際 ${row.hits.join('、')}`);
  ok(row.leftOfTitle !== null && row.leftOfTitle < 30, `應維持在標題正下方，實際距離 ${row.leftOfTitle}`);
  ok(row.daterow === 0, `.daterow 應該完全不存在了，實際還有 ${row.daterow} 個`);
  ok(!/\.daterow/.test(SRC), 'CSS 裡的 .daterow 樣式也要一起清掉');

  /* 5　iOS 三件修正只有一份、選擇器同時涵蓋 S-02 與 S-04 */
  console.log('\n=== 5　iOS 修正只有一份 ===');
  const ios = await pg.evaluate(() => {
    const want = ['-webkit-appearance', 'height'];
    const out = { heightRules: [], appearRules: [], pseudo: [], covers: null };
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (!r.selectorText || !/input\[type=["']?date["']?\]/.test(r.selectorText)) continue;
        if (/date-and-time-value/.test(r.selectorText)) { out.pseudo.push(r.selectorText); continue; }
        /* ::-webkit-calendar-picker-indicator 的 height:100% 是那顆隱形點擊層，
           不是「日期欄自己的明確高度」，別把它算成第二份 */
        if (r.selectorText.includes('::')) continue;
        if (r.style.height) out.heightRules.push(r.selectorText);
        if (r.style.webkitAppearance || r.style.getPropertyValue('-webkit-appearance'))
          out.appearRules.push(r.selectorText);
      }
    }
    /* 這條選擇器真的同時抓到兩個畫面的欄位嗎 */
    const sel = out.heightRules[0];
    if (sel) {
      const hit = [...document.querySelectorAll(sel)];
      out.covers = { s02: hit.some(e => e.closest('#scr-s02')), s04: hit.some(e => e.closest('#scr-s04')) };
    }
    return out;
  });
  console.log('   明確 height 的規則:', ios.heightRules.join(' ｜ '));
  console.log('   appearance:none 的規則:', ios.appearRules.join(' ｜ '));
  console.log('   ::-webkit-date-and-time-value:', ios.pseudo.join(' ｜ '));
  console.log('   同一條選擇器涵蓋:', JSON.stringify(ios.covers));
  ok(ios.heightRules.length === 1, `明確 height 應該只有一份，實際 ${ios.heightRules.length} 份`);
  ok(ios.appearRules.length === 1, `appearance:none 應該只有一份，實際 ${ios.appearRules.length} 份`);
  ok(ios.pseudo.length === 1, `::-webkit-date-and-time-value 應該只有一份，實際 ${ios.pseudo.length} 份`);
  ok(ios.covers && ios.covers.s02 && ios.covers.s04,
    `同一條規則要同時管到 S-02 與 S-04，實際 ${JSON.stringify(ios.covers)}`);

  /* 8　改 A 壞 B 攔截網 */
  console.log('\n=== 8　改 A 壞 B 攔截網（像素比對）===');
  if (!BASE || !SHOTS || !PNG) console.log('   （缺 BASE／SHOTS 或 pixelmatch，跳過）');
  else {
    const rows = [];
    for (const f of fs.readdirSync(BASE).filter(x => x.endsWith('.png') && !x.startsWith('diff_'))) {
      const a = PNG.sync.read(fs.readFileSync(path.join(BASE, f)));
      const bp = path.join(SHOTS, f);
      if (!fs.existsSync(bp)) { rows.push({ f, note: '（改後沒有這一張）' }); continue; }
      const b = PNG.sync.read(fs.readFileSync(bp));
      const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
      const crop = img => { if (img.width === w && img.height === h) return img;
        const o = new PNG({ width: w, height: h }); PNG.bitblt(img, o, 0, 0, w, h, 0, 0); return o; };
      const diff = new PNG({ width: w, height: h });
      const n = pixelmatch(crop(a).data, crop(b).data, diff.data, w, h, { threshold: 0.12 });
      fs.writeFileSync(path.join(SHOTS, 'diff_' + f), PNG.sync.write(diff));
      rows.push({ f: f.replace('.png', ''), pct: +(n / (w * h) * 100).toFixed(2),
                  size: `${a.width}×${a.height}→${b.width}×${b.height}` });
    }
    rows.forEach(r => console.log(`   ${String(r.f).padEnd(5)} 差異 ${r.pct ?? '—'}%　${r.size || ''}${r.note || ''}`));
    const bad = rows.filter(r => r.f !== 's04' && r.pct > 0);
    console.log('   只允許 s04 有差異；其他十一張必須 0.00%');
    console.log('   範圍外的差異:', bad.length ? bad.map(r => `${r.f} ${r.pct}%`).join('、') : '（無）');
    ok(bad.length === 0, `改 A 壞 B：${bad.map(r => `${r.f} ${r.pct}%`).join('、')}`);
    ok(rows.some(r => r.f === 's04' && r.pct > 0), 's04 應該有差異（這一節就是在改它）');
  }

  /* 9　貼邊與橫向捲動 */
  console.log('\n=== 9　貼邊與橫向捲動 ===');
  for (const w of [320, 375, 414]) {
    await pg.setViewport({ width: w, height: 900 });
    const r = await pg.evaluate(() => {
      document.documentElement.classList.remove('anno');
      setDev(true); store.expenses.t1 = demoExpenses(); devScreen = 's04'; renderDevBar();
      const t = tripOf('t1'), M = t.members.map(m => m.id);
      g = exp({ title: '午餐', twdAmt: '1200', pay: t.pays[0], type: 'shared', parts: M, payer: M[0] });
      renderS04();
      const el = document.getElementById('e-daterow'), ui = el.closest('.ui');
      const a = el.getBoundingClientRect(), u = ui.getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
               left: +(a.left - u.left).toFixed(0), right: +(u.right - a.right).toFixed(0) };
    });
    console.log(`   ${w}px：捲寬 ${r.sw}/${r.cw}　日期列左右留白 ${r.left}/${r.right}`);
    ok(r.sw <= r.cw, `${w}px 有橫向溢出`);
    ok(r.left === 14 && r.right === 14, `${w}px 日期列應在 .fld 的 14px 內距裡，實際 ${r.left}/${r.right}`);
  }

  await pg.close(); await browser.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
