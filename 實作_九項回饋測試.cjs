/* 實作-T　九項。⚠️ 每一條先守門（斷言目標存在／數量夠），再驗。 */
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
function contrast(rgb) {
  const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 1.05 / (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] + 0.05);
}
const parseRgb = s => (s.match(/\d+/g) || []).slice(0, 3).map(Number);

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 340)); };
  const text = () => p.evaluate(() => document.body.textContent || '');

  console.log('\n=== 實作-T　九項 ===\n');

  /* ── 2 還沒算清楚可以點 ──────────────────────────────────────────────── */
  await go('screen=s03&unsettled=all');
  const un = await p.evaluate(() => ({
    title: (document.querySelector('.sec') || {}).textContent || '',
    n: document.querySelectorAll('.exprow').length,
    btn: document.querySelectorAll('button.exprow').length }));
  console.log(`   還沒算清楚：標題「${un.title}」｜列 ${un.n}（button ${un.btn}）`);
  ok(/還沒算清楚/.test(un.title), `沒有進到那一頁（標題「${un.title}」）——下面全部會假通過`);
  ok(un.n > 0, '那一頁一筆都沒有，這條等於沒驗');
  ok(un.btn === un.n, `列應該都是 <button>，實際 ${un.btn}/${un.n}`);
  const opened = await p.evaluate(async () => {
    document.querySelector('.exprow').click(); await new Promise(r => setTimeout(r, 450));
    return document.body.textContent || ''; });
  console.log(`   點下去出現編輯表單 ${opened.includes('記下來')}`);
  ok(opened.includes('記下來'), '點下去沒有開編輯表單——這一頁本來就是要她去補資料的');

  await go('screen=s03&unsettled=all&state=archived');
  const unA = await p.evaluate(async () => {
    const r = document.querySelector('.exprow');
    if (!r) return null;
    r.click(); await new Promise(z => setTimeout(z, 400));
    return document.body.textContent || ''; });
  console.log(`   封存態同一頁：開表單 ${unA && unA.includes('記下來')}｜有 toast ${unA && unA.includes('重新開啟行程')}`);
  ok(unA !== null, '封存態那一頁沒有列，這條等於沒驗');
  ok(!unA.includes('記下來'), '封存態不該開編輯表單');
  ok(unA.includes('重新開啟行程'), '封存態點下去沒講話');

  /* ── 3 游標對齊 ──────────────────────────────────────────────────────── */
  console.log('');
  await go('screen=s04');
  const lh = await p.evaluate(() => [...document.querySelectorAll('.fieldrow > input, .amtline input')]
    .map(e => { const cs = getComputedStyle(e);
      return { k: e.id || e.getAttribute('aria-label') || '?', h: cs.height, lh: cs.lineHeight }; }));
  console.log(`   行盒 vs 框：${lh.map(x => `${x.k} ${x.h}/${x.lh}`).join('｜')}`);
  ok(lh.length >= 4, `只掃到 ${lh.length} 個輸入框，這條等於沒驗`);
  for (const x of lh) ok(x.h === x.lh, `${x.k} 的 line-height ${x.lh} 不等於 height ${x.h}（iOS 游標會偏）`);

  /* ── 4 emoji 就地編輯框 ──────────────────────────────────────────────── */
  const emo = await p.evaluate(async () => {
    const btn = document.querySelector('[aria-label="類別 emoji"]');
    const svgWhenEmpty = !!btn && !!btn.querySelector('svg');
    btn.click(); await new Promise(r => setTimeout(r, 350));
    const input = document.querySelector('input[aria-label="類別 emoji"]');
    if (!input) return null;
    const box = input.closest('.tap44') || input;
    const r = box.getBoundingClientRect();
    const cs = getComputedStyle(box, '::after');
    const w = Math.max(r.width, parseFloat(cs.width) || 0);
    const h = Math.max(r.height, parseFloat(cs.height) || 0);
    /* 真的點擴張區的角落，看焦點會不會落到那個框裡 */
    const rr = box.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(rr.left + rr.width / 2), Math.round(rr.top - 6));
    if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 120));
    return { w, h, vis: `${Math.round(input.getBoundingClientRect().width)}×${Math.round(input.getBoundingClientRect().height)}`,
             focused: document.activeElement === input, svgWhenEmpty };
  });
  console.log(`   emoji 編輯框：可點區 ${emo && emo.w}×${emo && emo.h}｜看得見 ${emo && emo.vis}｜` +
              `點擴張區之後焦點在框裡 ${emo && emo.focused}｜空值時有 svg ${emo && emo.svgWhenEmpty}`);
  ok(emo !== null, '點不開 emoji 編輯，這條等於沒驗');
  ok(emo.w >= 44 && emo.h >= 44, `可點區只有 ${emo.w}×${emo.h}，應 ≥44×44`);
  ok(emo.vis === '26×26', `看得見的框應維持 26×26，實際 ${emo.vis}`);
  ok(emo.focused, '點擴張區沒有把焦點交還給那個框');

  await go('screen=s04');
  const emptyIcon = await p.evaluate(() => {
    const btn = document.querySelector('[aria-label="類別 emoji"]');
    return { txt: (btn.textContent || '').trim(), svg: !!btn.querySelector('svg') }; });
  console.log(`   空值時那顆鈕：文字「${emptyIcon.txt}」｜有 svg ${emptyIcon.svg}`);
  ok(emptyIcon.svg || emptyIcon.txt !== '', '空值時是一個空圓圈，看不出可以點');

  /* ── 5 結算明細三段 ──────────────────────────────────────────────────── */
  console.log('');
  await go('screen=s05&state=settled');
  const st = await p.evaluate(async () => {
    const t = [...document.querySelectorAll('button')].find(x => x.textContent.includes('查看計算依據'));
    if (!t) return null;
    t.click(); await new Promise(r => setTimeout(r, 350));
    return { rows: [...document.querySelectorAll('[data-settle-row]')].map(e => ({
        /* ⚠️ 實作-AB-2 把「指名算他的」拆成「自己買給自己的」＋「各付各的」
           （Rozi 2026-09-08 拍板）。`data-named` 不存在了，改讀拆開後的兩個。 */
        m: e.dataset.member, shared: +e.dataset.shared,
        self: +e.dataset.self, each: +e.dataset.each,
        /* ⚠️ 實作-AC 把四欄表整張拿掉、改成每人一張卡（Rozi 2026-09-08 拍板）。
           `data-due` 不再輸出（「應分攤」那一欄不存在了），改用卡片上真的印出來的
           `data-fronted`。恆等式改成卡片自己的那一條：
           **幫大家先付的 − 一起分的 − 各付各的 ＝ 差額**。 */
        fronted: +e.dataset.fronted, sponsor: +(e.dataset.sponsor ?? 0),
        paid: +e.dataset.paid, diff: +e.dataset.diff,
        parts: (e.querySelector('.detailparts') || {}).textContent || '' })),
      txt: document.body.textContent || '' };
  });
  console.log(`   結算列 ${st && st.rows.length} 人｜四行：` +
              ['他幫大家先付的', '一起分的', '各付各的', '自己買給自己的']
                .map(x => `${x} ${st && st.txt.includes(x)}`).join('｜'));
  ok(st !== null, '找不到「查看計算依據」，這條等於沒驗');
  ok(st.rows.length >= 3, `只有 ${st.rows.length} 列，這條等於沒驗`);
  ok(['他幫大家先付的', '一起分的', '各付各的', '自己買給自己的'].every(x => st.txt.includes(x)),
    '三段的白話名稱沒有全部出現');
  for (const r of st.rows) {
    /* 卡片上印出來的那條算式，使用者自己就能對一遍 */
    /* ⚠️ 贊助折抵是**條件式的第五行**（只有這趟有贊助時才出現），恆等式要含它：
       **幫大家先付的 − 一起分的 − 各付各的 ＋ 贊助折抵 ＝ 差額**。 */
    ok(r.fronted - r.shared - r.each + r.sponsor === r.diff,
      `${r.m}：幫大家先付 ${r.fronted} − 一起分 ${r.shared} − 各付各的 ${r.each}` +
      ` ＋ 贊助折抵 ${r.sponsor} ≠ 差額 ${r.diff}`);
    /* AC-2：幫大家先付的 ＝ 他付出去的全部 − 他自己買給自己的 */
    ok(r.paid - r.self === r.fronted,
      `${r.m}：data-paid ${r.paid} − data-self ${r.self} ≠ data-fronted ${r.fronted}`);
  }
  const sum = st.rows.reduce((a, x) => a + x.diff, 0);
  console.log(`   差額加總 ${sum}`);
  ok(sum === 0, `每個人的差額加總應為 0，實際 ${sum}`);
  const noPaid = st.rows.filter(r => r.paid === 0);
  ok(noPaid.length > 0, '沒有「完全沒代墊」的人，反向斷言等於沒驗');
  /* ⚠️ 這一條**被實作-AB-2 推翻**：原本驗「沒代墊的人不該出現那一段」，
     Rozi 2026-09-08 拍板改成**四行固定顯示，筆數 0 的也要顯示**
     ——整行為 0 時仍要出現，使用者才看得懂這一欄在講什麼。
     改成驗「那一段在，而且寫的是 0 筆」，一樣守得住「不能顯示假的筆數」。 */
  for (const r of noPaid) {
    ok(r.parts.includes('他幫大家先付的'), `${r.m} 的「他幫大家先付的」那一段不見了（四行固定顯示）`);
    ok(/他幫大家先付的\s*0 筆/.test(r.parts.replace(/\s+/g, ' ')),
      `${r.m} 沒有代墊，那一段應該寫「0 筆」：${r.parts.replace(/\s+/g, ' ').slice(0, 80)}`);
  }

  /* ── 6 欄位寬度 ──────────────────────────────────────────────────────── */
  console.log('');
  await go('screen=s02b');
  const w = await p.evaluate(() => {
    const g = sel => [...document.querySelectorAll(sel)].map(e => Math.round(e.getBoundingClientRect().width));
    return { rowb: g('.rowb'), pay: g('[data-payrow]'), rate: g('.ratebox'),
             fieldh: g('.fieldh'), date: g('.datefield'),
             all: [...new Set([...document.querySelectorAll('.fld > *, .rowb, [data-payrow], .ratebox')]
               .map(e => Math.round(e.getBoundingClientRect().width)))].sort((a, c) => a - c) };
  });
  console.log(`   寬度：.rowb ${w.rowb[0]}｜支付列 ${w.pay[0]}｜匯率格 ${w.rate[0]}｜幣別鈕 ${w.fieldh[0]}｜日期 ${w.date[0]}`);
  ok(w.pay.length >= 2, `支付列只有 ${w.pay.length} 條，這條等於沒驗`);
  ok(w.pay.every(x => x === 350), `支付列應為 350，實際 ${w.pay}`);
  ok(w.rate[0] === 350, `匯率格應為 350，實際 ${w.rate[0]}`);
  ok(w.rowb.every(x => x === 350), `.rowb 應為 350，實際 ${[...new Set(w.rowb)]}`);
  ok(w.fieldh[0] === 350, `幣別鈕應維持 350，實際 ${w.fieldh[0]}`);
  ok(w.date.every(x => x === 171), `日期欄應維持 171，實際 ${[...new Set(w.date)]}`);
  ok(!w.all.includes(322), `全頁不該再有 322 這個寬度，實際集合 ${w.all}`);

  /* ── 7 底部距離 ──────────────────────────────────────────────────────── */
  console.log('');
  await go('screen=s03');
  const bt = await p.evaluate(() => {
    const row = document.querySelector('.btnrow'), pad = document.querySelector('.btnpad');
    if (!row) return null;
    const btn = row.querySelector('.btn');
    return { gap: Math.round(window.innerHeight - btn.getBoundingClientRect().bottom),
             h: Math.round(row.getBoundingClientRect().height),
             pad: pad ? Math.round(pad.getBoundingClientRect().height) : null };
  });
  console.log(`   「記一筆」距底 ${bt && bt.gap}px（上方返回鈕距頂 30）｜.btnrow 高 ${bt && bt.h}｜留白 ${bt && bt.pad}`);
  ok(bt !== null, 's03 找不到 .btnrow，這條等於沒驗');
  ok(Math.abs(bt.gap - 30) <= 1, `距底應為 30，實際 ${bt.gap}`);
  ok(Math.abs(bt.h - 88) <= 1, `.btnrow 高應為 88，實際 ${bt.h}`);
  ok(bt.pad !== null && Math.abs(bt.pad - bt.h) <= 2, `留白 ${bt.pad} 應等於 .btnrow 的高 ${bt.h}`);
  const css = fs.readFileSync('src/index.css', 'utf8');
  ok(!/\.btnpad\s*\{[^}]*74px/.test(css), '.btnpad 還寫死著 74px——要跟著 .btnrow 的高度走');

  /* ── 8 外幣原值 ──────────────────────────────────────────────────────── */
  console.log('');
  await go('screen=s03&view=foreign&rate=full');
  const fv = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.exprow')].map(r => ({
      t: (r.querySelector('.t') || {}).textContent || '',
      a: (r.querySelector('.a') || {}).textContent || '' }));
    const fx = window.__HARNESS_FIXTURE__;
    return { rows, own: fx.expenses.filter(e => e.foreign_amount != null).length,
             none: fx.expenses.filter(e => e.foreign_amount == null && e.twd_amount != null).length };
  });
  console.log(`   假資料：有外幣 ${fv.own} 筆／只有台幣 ${fv.none} 筆`);
  ok(fv.own > 0 && fv.none > 0, '假資料缺其中一種，守門不過——下面會假通過');
  const dinner = fv.rows.find(r => r.t.includes('黑豬肉晚餐'));   // foreign 108000
  const flight = fv.rows.find(r => r.t.includes('機票'));         // 只有台幣
  console.log(`   有填外幣的「黑豬肉晚餐」→ ${dinner && dinner.a}｜只有台幣的「機票」→ ${flight && flight.a}`);
  ok(!!dinner && !!flight, '找不到那兩筆，這條等於沒驗');
  ok(dinner.a.includes('108,000'), `有填外幣的應原樣顯示 108,000，實際 ${dinner.a}`);
  ok(!dinner.a.includes('約'), '使用者自己填的不該標「約」');
  ok(flight.a.includes('約'), `回推出來的要標「約」，實際 ${flight.a}`);

  await go('screen=s03&rate=full');
  const tw = await p.evaluate(() => [...document.querySelectorAll('.exprow')]
    .filter(r => (r.querySelector('.t') || {}).textContent.includes('黑豬肉晚餐'))
    .map(r => (r.querySelector('.a') || {}).textContent)[0]);
  console.log(`   台幣視角同一筆 → ${tw}`);
  ok(tw && tw.includes('2,480'), `台幣視角不得受影響，實際 ${tw}`);

  /* ── 9 進場動畫不撐寬文件 ────────────────────────────────────────────── */
  console.log('');
  for (const vw of [320, 390, 414]) {
    await p.setViewport({ width: vw, height: 844, isMobile: true, hasTouch: true });
    /* `?anim=1` 把畫面包進 production 真正用的 `.animate-slide-in` */
    await go('screen=s03&anim=1');
    const samples = await p.evaluate(async () => {
      const el = document.querySelector('.animate-slide-in');
      if (!el) return null;
      /* 重新觸發動畫 */
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      const out = [];
      for (const t of [0, 20, 50, 80, 120, 160]) {
        await new Promise(r => setTimeout(r, t === 0 ? 0 : 20));
        out.push({ t, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth });
      }
      return out;
    });
    console.log(`   @${vw} 動畫期間 scrollWidth：${samples ? samples.map(x => x.sw).join(',') : '（找不到）'}（視窗 ${vw}）`);
    ok(samples !== null, `@${vw} 找不到 .animate-slide-in，這條等於沒驗`);
    for (const x of (samples ?? []))
      ok(x.sw <= x.cw + 1, `@${vw} ${x.t}ms 時文件被撐寬：${x.sw} > ${x.cw}`);
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  /* ── 10 外幣灰再淡一階 ───────────────────────────────────────────────── */
  console.log('');
  await go('screen=s04&rate=full');
  const typeIn = async (sel, v) => { await p.click(sel); await p.keyboard.press('End');
    for (let i = 0; i < 16; i++) await p.keyboard.press('Backspace');
    await p.type(sel, v, { delay: 8 }); await new Promise(r => setTimeout(r, 150)); };
  await typeIn('#e-for', '5000'); await typeIn('#e-twd', '1000');
  const col = await p.evaluate(() => {
    const f = document.getElementById('e-for'), t = document.getElementById('e-twd');
    return { f: getComputedStyle(f).color, t: getComputedStyle(t).color,
             ph: getComputedStyle(t, '::placeholder').color,
             fw: getComputedStyle(f).fontWeight, tw: getComputedStyle(t).fontWeight,
             fz: getComputedStyle(f).fontSize, tz: getComputedStyle(t).fontSize,
             fn: getComputedStyle(f).fontVariantNumeric, tn: getComputedStyle(t).fontVariantNumeric };
  });
  const cf = contrast(parseRgb(col.f)), ct = contrast(parseRgb(col.t)), cph = contrast(parseRgb(col.ph));
  console.log(`   外幣 ${col.f}（${cf.toFixed(2)}）｜台幣 ${col.t}（${ct.toFixed(2)}）｜placeholder（${cph.toFixed(2)}）`);
  ok(cf >= 4.4 && cf <= 4.7, `外幣對比應落在 4.4～4.7，實際 ${cf.toFixed(2)}`);
  ok(ct >= 17.0, `台幣對比應 ≥17.0，實際 ${ct.toFixed(2)}`);
  ok(ct > cf, '台幣必須比外幣深（方向做反也要抓得到）');
  ok(Math.abs(cf - cph) >= 1.8, `外幣有值與 placeholder 只差 ${Math.abs(cf - cph).toFixed(2)}，應 ≥1.8`);
  ok(col.fw === col.tw && col.fz === col.tz && col.fn === col.tn,
    `字級／字重／tabular-nums 兩欄應一致：${JSON.stringify(col)}`);

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
