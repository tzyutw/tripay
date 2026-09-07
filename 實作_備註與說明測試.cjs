/* 實作-S　匯率換算範例／備註只在 S-04／說明同時顯示／記一筆固定／外幣灰。
   ⚠️ 每一條先守門（斷言目標存在），再驗——找不到目標就變綠是 #29 犯過的錯。 */
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
/* WCAG 相對亮度 → 對白底的對比度 */
function contrast(rgb) {
  const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (1.05) / (L + 0.05);
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
  const typeIn = async (sel, v) => {
    await p.click(sel); await p.keyboard.press('End');
    for (let i = 0; i < 18; i++) await p.keyboard.press('Backspace');
    if (v) await p.type(sel, v, { delay: 10 });
    await new Promise(r => setTimeout(r, 180));
  };
  const text = () => p.evaluate(() => document.body.textContent || '');

  console.log('\n=== 實作-S　換算範例／備註／說明同時顯示／記一筆固定／外幣灰 ===\n');

  /* ── 2 匯率換算範例 ──────────────────────────────────────────────────── */
  await go('screen=s02b&cur=JPY');
  const empty = await text();
  ok(!empty.includes('記成台幣'), '還沒填就出現換算範例了');
  await typeIn('#rate-one', '0.21');
  const t1 = await text();
  console.log(`   JPY 填 0.21 → 有「花 10,000 日圓，記成台幣 2,100」 ${t1.includes('花 10,000 日圓，記成台幣 2,100')}`);
  ok(t1.includes('1 日圓 ＝ 0.21 台幣'), '第一行不見了');
  ok(t1.includes('花 10,000 日圓，記成台幣 2,100'), `換算範例不對：${(t1.match(/花 [^，]*，記成台幣 [\d,]+/) || ['（沒有）'])[0]}`);
  const flip = await p.evaluate(async () => {
    const x = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '換個方向');
    if (!x) return null; x.click(); await new Promise(r => setTimeout(r, 250));
    return document.body.textContent || '';
  });
  /* ⚠️ 指令上寫 47,619,048，那個數字**多了三個 0**：
     「1 台幣 = 0.21 日圓」→ 10,000 日圓 = 10000 ÷ 0.21 = **47,619** 台幣。
     用同一支 tripRate() 算出來就是 47,619，指令那個數字算錯了。 */
  const flipEx = (flip || '').match(/花 10,000 日圓，記成台幣 ([\d,]+)/);
  console.log(`   換個方向 → ${flipEx ? flipEx[0] : '（沒有）'}（正確值 ${Math.round(10000 / 0.21).toLocaleString('en-US')}）`);
  ok(flip !== null, '找不到「換個方向」');
  ok(flip.includes('1 台幣 ＝ 0.21 日圓'), '第一行沒換方向（回歸）');
  ok(!!flipEx, '換個方向之後沒有換算範例');
  ok(flipEx[1] === Math.round(10000 / 0.21).toLocaleString('en-US'),
    `換個方向之後範例沒跟著變：${flipEx[1]}——數量級差 22 倍就是要在這裡看出來`);
  /* 兩個方向的範例必須**數量級明顯不同**，不然這一行就沒有存在意義 */
  const firstEx = (t1.match(/記成台幣 ([\d,]+)/) || [])[1].replace(/,/g, '');
  ok(Number(flipEx[1].replace(/,/g, '')) / Number(firstEx) > 10,
    '兩個方向的範例數量級差不多，看不出差別');
  /* 不得用「約」——那是「金額未定案」的專用標記 */
  ok(!flip.includes('約'), '換算範例用了「約」字（那是未定案的專用標記，會被誤讀）');

  await go('screen=s02b&cur=USD');
  await typeIn('#rate-one', '32');
  const usd = await text();
  const m = usd.match(/花 ([\d,]+) 美元，記成台幣 ([\d,]+)/);
  console.log(`   USD 填 32 → ${m ? m[0] : '（沒有）'}`);
  ok(!!m, 'USD 沒有畫出換算範例');
  ok(m[1] === '100', `USD 的示範金額應是 100（不是 10,000），實際 ${m[1]}`);
  ok(m[2] === '3,200', `100 美元 × 32 = 3,200，實際 ${m[2]}`);

  /* 一致性：s04 記一筆輸入同一個示範金額，自動算出來的台幣必須等於範例寫的數字 */
  await go('screen=s04&cur=JPY&rate=full');
  const rateEx = await p.evaluate(() => {
    const t = window.__TRIP__;
    const r = Number(t.cash_rate_foreign) / Number(t.cash_rate_twd);
    return { n: Number(t.cash_rate_foreign) === 1 ? t.cash_rate_twd : t.cash_rate_foreign, rate: r };
  });
  await typeIn('#e-for', '10000');
  const auto = await p.evaluate(() => document.getElementById('e-twd').placeholder);
  const wantTwd = Math.round(10000 / rateEx.rate).toLocaleString('en-US');
  console.log(`   一致性：s04 外幣 10,000 → 台幣自動值 ${auto}（範例算法算出來是 ${wantTwd}）`);
  ok(auto === wantTwd, `範例與實際換算不一致：${auto} vs ${wantTwd}——範例會騙人`);

  /* ── 4 移除鈕不再是文字字元 ──────────────────────────────────────────── */
  console.log('');
  await go('screen=s02b');
  const rm = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.rowb')];
    /* 移除鈕才有 `w-6`；avatar 也掛 tap44，不加這一條會選到 avatar */
    const btns = rows.map(r => r.querySelector('button.tap44.w-6')).filter(Boolean);
    return { n: btns.length,
             svg: btns.filter(x => x.querySelector('svg')).length,
             box: btns.map(x => { const r = x.getBoundingClientRect(); return `${Math.round(r.width)}×${Math.round(r.height)}`; })[0],
             txt: document.body.innerText || '' };
  });
  console.log(`   成員移除鈕 ${rm.n} 顆｜有 svg ${rm.svg} 顆｜看得見的尺寸 ${rm.box}`);
  ok(rm.n >= 4, `成員移除鈕只掃到 ${rm.n} 顆，這條等於沒驗`);
  ok(rm.svg === rm.n, `有 ${rm.n - rm.svg} 顆還不是 SVG`);
  for (const ch of ['✕', '×', '＋', '✓', '⠿'])
    ok(!rm.txt.includes(ch), `畫面上還有文字字元 icon「${ch}」`);
  ok(rm.box === '24×24', `看得見的圖形應維持 24×24，實際 ${rm.box}`);

  /* ── 5 備註只在 S-04 ─────────────────────────────────────────────────── */
  console.log('');
  /* ⚠️ 不要寫死 `exp=e1`——樁現在真的會依 id 過濾，而 fixture 的 seq
     會隨著新增假資料而位移。從 `__HARNESS_FIXTURE__` 查那一筆的 id。 */
  await go('screen=s03');
  const noteId = await p.evaluate(() => {
    const fx = window.__HARNESS_FIXTURE__;
    const e = (fx.expenses || []).find(x => x.note);
    return e ? e.id : null; });
  ok(noteId !== null, '假資料裡沒有帶備註的消費，下面三條等於沒驗');
  await go(`screen=s04&exp=${noteId}`);
  const noteUi = await p.evaluate(() => {
    const el = document.querySelector('input[aria-label="備註"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const labels = [...document.querySelectorAll('.lbl')].filter(x => x.textContent.trim() === '備註').length;
    return { v: el.value, h: cs.height, fs: parseFloat(cs.fontSize), ph: el.placeholder, labels };
  });
  console.log(`   S-04 備註：值「${noteUi && noteUi.v}」｜高 ${noteUi && noteUi.h}｜字級 ${noteUi && noteUi.fs}｜標籤 ${noteUi && noteUi.labels} 個`);
  ok(noteUi !== null, '找不到備註欄，這條等於沒驗');
  ok(noteUi.labels === 1, `「備註」標籤應恰好 1 個，實際 ${noteUi.labels}`);
  ok(['40px', '28px'].includes(noteUi.h), `備註欄高 ${noteUi.h}，不在 {40px,28px}`);
  ok(noteUi.fs >= 16, `備註欄字級 ${noteUi.fs} < 16（iOS 會放大整頁）`);
  /* 實作-V-4：Rozi 2026-09-07 拍板縮短成「補一句」 */
  ok(noteUi.ph === '補一句', `placeholder 不對：${noteUi.ph}`);
  ok(noteUi.v.includes('ZZ 這句備註只該出現在記一筆'), '備註沒有從既有消費載入——下面兩條反向斷言會假通過');
  const cap = await p.evaluate(async () => {
    const el = document.querySelector('input[aria-label="備註"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, 'あ'.repeat(201));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return el.value.length;
  });
  console.log(`   打 201 個字 → 收下 ${cap} 個`);
  ok(cap === 200, `上限應為 200，實際 ${cap}`);

  for (const [q, name] of [['screen=s03', 'S-03 消費列表'], ['screen=s06', 'S-06 分享頁']]) {
    await go(q);
    const t = await text();
    const hasTrip = t.includes('機票');
    console.log(`   ${name}：畫到那一筆 ${hasTrip}｜出現備註 ${t.includes('ZZ 這句備註')}`);
    ok(hasTrip, `${name} 沒畫到那一筆，反向斷言會假通過`);
    ok(!t.includes('ZZ 這句備註'), `${name} 不該顯示備註（她明講「不用列在總行程頁」）`);
  }

  /* ── 9 金額的兩段說明同時顯示 ────────────────────────────────────────── */
  console.log('');
  await go('screen=s04');
  const both = await text();
  console.log(`   s04：教學句 ${both.includes('填一邊就好，另一邊自動換算')}｜` +
              `台幣未定警示 ${both.includes('先記著了。補上台幣金額就會算進結算。')}`);
  ok(both.includes('填一邊就好，另一邊自動換算'), '教學句不見了');
  ok(both.includes('先記著了。補上台幣金額就會算進結算。'),
    '兩句沒有同時顯示——她要的就是這個');
  ok(!both.includes('填一邊就好，另一邊會自動換算'), '舊字串（帶「會」）還在');
  const once = (both.match(/填一邊就好，另一邊自動換算/g) || []).length;
  ok(once === 1, `教學句出現 ${once} 次，應恰好 1 次（金額欄下方不得重複）`);
  const ph = await p.evaluate(() => ({
    f: document.getElementById('e-for').placeholder, t: document.getElementById('e-twd').placeholder }));
  ok(!/填一邊/.test(ph.f + ph.t), `placeholder 被說明文字佔用了：${JSON.stringify(ph)}`);

  await go('screen=s04&rate=full');
  const noRateCase = await go('screen=s04') || null; void noRateCase;
  for (const w of [320, 390, 414]) {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    await go('screen=s04');
    const row = await p.evaluate(() => {
      const el = document.querySelector('.lblrow');
      if (!el) return null;
      const note = el.querySelector('.lblnote');
      /* 量**教學字本身**有沒有折成兩行，不要量整列——列高還含 .lbl 的 margin-bottom */
      return { h: note.getBoundingClientRect().height,
               lineH: parseFloat(getComputedStyle(note).lineHeight) || 20,
               noteText: note.textContent, over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    console.log(`   @${w} 教學字高 ${row && row.h}（單行 ${row && row.lineH}）｜文字「${row && row.noteText}」｜整頁橫向捲動 ${row && row.over}`);
    ok(row !== null, `@${w} 找不到 .lblrow，這條等於沒驗`);
    ok(row.h <= row.lineH + 1, `@${w} 教學字換行了（高 ${row.h}，單行 ${row.lineH}）`);
    ok(!row.over, `@${w} 整頁橫向捲動`);
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  /* ── 10 記一筆固定在畫面下方 ─────────────────────────────────────────── */
  console.log('');
  await go('screen=s03');
  const sticky = await p.evaluate(async () => {
    const row = document.querySelector('.btnrow');
    if (!row) return null;
    const cs = getComputedStyle(row);
    const top = row.getBoundingClientRect().bottom;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 250));
    const rows = [...document.querySelectorAll('.exprow')];
    const last = rows[rows.length - 1];
    return { pos: cs.position, bottom: cs.bottom,
             topBottom: Math.round(top), scrolledBottom: Math.round(row.getBoundingClientRect().bottom),
             lastBottom: Math.round(last.getBoundingClientRect().bottom),
             rowTop: Math.round(row.getBoundingClientRect().top),
             vh: window.innerHeight, nRows: rows.length };
  });
  console.log(`   .btnrow：position ${sticky && sticky.pos}／bottom ${sticky && sticky.bottom}｜` +
              `一進畫面 bottom ${sticky && sticky.topBottom}｜捲到底 ${sticky && sticky.scrolledBottom}｜視窗 ${sticky && sticky.vh}`);
  ok(sticky !== null, 's03 找不到 .btnrow，這條等於沒驗');
  ok(sticky.nRows > 5, `只有 ${sticky.nRows} 筆消費，量不出「被排擠到後面」`);
  ok(sticky.pos === 'sticky', `.btnrow 的 position 應為 sticky，實際 ${sticky.pos}`);
  ok(sticky.bottom === '0px', `.btnrow 的 bottom 應為 0px，實際 ${sticky.bottom}`);
  ok(sticky.topBottom <= sticky.vh, `一進畫面就該看得到，實際 bottom ${sticky.topBottom} > ${sticky.vh}`);
  ok(sticky.scrolledBottom <= sticky.vh, `捲到底也該看得到，實際 ${sticky.scrolledBottom}`);
  ok(sticky.lastBottom <= sticky.rowTop + 1,
    `最後一筆被按鈕列蓋住了（列底 ${sticky.lastBottom} > 按鈕列頂 ${sticky.rowTop}）`);

  await go('screen=s03&state=settled');
  const settled = await p.evaluate(() => ({
    row: !!document.querySelector('.btnrow'), pad: !!document.querySelector('.btnpad') }));
  console.log(`   已結算態：有 .btnrow ${settled.row}｜有底部留白 ${settled.pad}`);
  ok(!settled.row, '已結算態不該有 .btnrow（#28-6b）');
  ok(!settled.pad, '已結算態沒有按鈕列，不該留那 74px 的白');

  /* ── 11 外幣灰 ───────────────────────────────────────────────────────── */
  console.log('');
  await go('screen=s04&rate=full');
  await typeIn('#e-for', '5000');
  await typeIn('#e-twd', '1000');
  const col = await p.evaluate(() => {
    const f = document.getElementById('e-for'), t = document.getElementById('e-twd');
    const phc = getComputedStyle(document.getElementById('e-twd'), '::placeholder').color;
    return { f: getComputedStyle(f).color, t: getComputedStyle(t).color, ph: phc,
             fw: getComputedStyle(f).fontWeight, fz: getComputedStyle(f).fontSize,
             num: getComputedStyle(f).fontVariantNumeric };
  });
  const cf = contrast(parseRgb(col.f)), ct = contrast(parseRgb(col.t)), cph = contrast(parseRgb(col.ph));
  console.log(`   外幣 ${col.f}（對比 ${cf.toFixed(2)}）｜台幣 ${col.t}（${ct.toFixed(2)}）｜placeholder ${col.ph}（${cph.toFixed(2)}）`);
  ok(col.f !== col.t, '外幣與台幣的顏色一樣，看不出哪個在結算');
  ok(cf >= 4.5, `外幣的對比 ${cf.toFixed(2)} < 4.5（WCAG AA）`);
  ok(Math.abs(cf - cph) >= 1.8,
    `外幣有值的灰與 placeholder 的灰只差 ${Math.abs(cf - cph).toFixed(2)}，應 ≥1.8（不然分不出填了沒）`);
  ok(col.fz === '16px', `字級被動到了：${col.fz}`);
  ok(col.num.includes('tabular-nums'), `tabular-nums 不見了：${col.num}`);

  /* 有匯率才切得過去（沒匯率時 curMode 會被強制留在 TWD） */
  await go('screen=s03&view=foreign&rate=full');
  const fv = await p.evaluate(() => {
    const a = document.querySelector('.exprow .a');
    const seg = [...document.querySelectorAll('.seg button')].find(x => x.classList.contains('on'));
    return a ? { c: getComputedStyle(a).color, t: a.textContent.trim(),
                 seg: seg ? seg.textContent.trim() : null } : null;
  });
  console.log(`   整頁只有外幣的視角：切換器在「${fv && fv.seg}」｜金額「${fv && fv.t}」色 ${fv && fv.c}`);
  ok(fv !== null, 's03 找不到金額，這條等於沒驗');
  /* 守門：先確認真的切過去了，否則下一條會在「還停在台幣視角」時假通過 */
  ok(/[₩¥$€]/.test(fv.t) && !fv.t.startsWith('$'),
    `沒有真的切到外幣視角（金額顯示「${fv.t}」）——下一條會假通過`);
  ok(fv.c !== col.f, '整頁只有外幣的視角也被灰掉了——那裡會變成沒東西可讀');

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
