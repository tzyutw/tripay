/* 實作-O　外幣被靜默跳過／整筆算到付款人頭上、SW 把舊版釘住、兩頁欄位一致、
   必填標示、⋯ 三個入口真的會開。全部在**真實 Chrome** 上量。

   ⚠️ 每一條都先斷言「目標存在」再比數值。找不到目標時要**紅**，不是綠——
   `null < 54` 在 JS 裡是 true，#29 那條假通過的斷言就是這樣過關的。 */
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

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 340)); };

  console.log('\n=== 實作-O　外幣結算／欄位一致／必填／⋯ 三個入口 ===\n');

  /* ── 16 harness 出口：先確認假資料真的換了，不然下面全是「查了但沒查到」 ── */
  await go('screen=s06&settlements=many');
  const fx = await p.evaluate(() => window.__HARNESS_FIXTURE__ ?? null);
  console.log(`   __HARNESS_FIXTURE__：settlements ${fx && fx.settlements.length} 筆｜` +
              `items ${fx && fx.settlement_items.length} 筆｜confirmed ${fx && fx.confirmed_items.length} 筆`);
  ok(fx !== null, '沒有 __HARNESS_FIXTURE__ 出口——下面的斷言分不出「挑對了」與「本來就只有一組」');
  ok(fx && fx.settlements.length === 12,
    `?settlements=many 應有 12 筆結算，實際 ${fx && fx.settlements.length}`);
  ok(fx && fx.settlements.filter(x => x.status === 'confirmed').length === 1,
    'confirmed 應該恰好一筆');
  ok(fx && fx.settlements.filter(x => x.status === 'superseded').length === 10, 'superseded 應有 10 筆');
  ok(fx && fx.settlement_items.length === 36,
    `每一筆結算都要帶自己的 items，應 36 筆，實際 ${fx && fx.settlement_items.length}`);

  /* ── 4 分享頁只畫 confirmed 那一組轉帳 ───────────────────────────────── */
  const tx = await p.evaluate(() => {
    const sec = [...document.querySelectorAll('.sec')].find(s => s.textContent.trim() === '誰付給誰');
    if (!sec) return null;
    let n = sec.nextElementSibling;
    return n ? n.querySelectorAll('.trow, .transfer, [data-tx]').length || n.children.length : null;
  });
  console.log(`   分享頁轉帳列：${tx} 筆（confirmed 的 items ${fx.confirmed_items.length} 筆）`);
  ok(tx !== null, '找不到「誰付給誰」那一段，這條等於沒驗');
  ok(tx === fx.confirmed_items.length,
    `轉帳列應等於 confirmed 的 ${fx.confirmed_items.length} 筆，實際 ${tx}（12 組疊在一起會是 36）`);

  /* ── 9 兩頁欄位標題集合完全相同 ─────────────────────────────────────── */
  const labelsOf = () => p.evaluate(() => {
    const skip = new Set(['這趟去哪？', '編輯行程']);        // 頁面標題不是欄位
    return [...document.querySelectorAll('label, .lbl')]
      .map(l => (l.textContent || '').trim()).filter(t => t && !skip.has(t)).sort();
  });
  await go('screen=s02');   const L02  = await labelsOf();
  await go('screen=s02b');  const L02b = await labelsOf();
  console.log(`\n   s02  欄位：${JSON.stringify(L02)}`);
  console.log(`   s02b 欄位：${JSON.stringify(L02b)}`);
  ok(L02.length >= 6, `s02 只掃到 ${L02.length} 個欄位標題，這條等於沒驗`);
  ok(JSON.stringify(L02) === JSON.stringify(L02b), '兩頁的欄位標題集合不同');
  ok(L02.includes('這趟叫什麼？'), 's02 的名稱欄位沒改成「這趟叫什麼？」');
  ok(!L02.includes('去哪？'), 's02 還有「去哪？」這個欄位標題');
  ok(L02b.includes('這趟叫什麼？'), 's02b 的名稱欄位不是「這趟叫什麼？」');
  for (const need of ['當地幣別', '出發', '回程', '誰一起去？',
                      '這趟怎麼結算？', '這趟的支付方式', '這趟的現金匯率'])
    ok(L02.includes(need) && L02b.includes(need), `兩頁都要有「${need}」`);

  /* ── 10 必填恰好四個 ─────────────────────────────────────────────────── */
  await go('screen=s02');
  const req = await p.evaluate(() => [...document.querySelectorAll('.req')]
    .map(l => (l.textContent || '').trim()));
  const star = await p.evaluate(() => {
    const el = document.querySelector('.req');
    return el ? getComputedStyle(el, '::after').content : null;
  });
  console.log(`   必填 .req：${JSON.stringify(req)}｜::after content ${star}`);
  ok(req.length === 4, `.req 應恰好 4 個，實際 ${req.length}`);
  ok(JSON.stringify([...req].sort()) === JSON.stringify(['出發', '這趟叫什麼？', '當地幣別', '誰一起去？'].sort()),
    `必填的四個不對：${JSON.stringify(req)}`);
  ok(!req.includes('回程'), '回程不該標必填（不填就是當天來回）');
  ok(!req.includes('這趟怎麼結算？'), '結算模式不該標必填（預設誰欠誰就轉給誰）');
  ok(star && star.includes('*'), `.req 的 ::after 應該畫出星號，實際 ${star}`);

  /* ── 11 必填沒填就跳過去，而且不送出 ────────────────────────────────── */
  await go('screen=s02');
  const jump = await p.evaluate(async () => {
    const name = [...document.querySelectorAll('input[type=text]')][0];
    const before = (window.__WRITES__ || []).length;
    const go2 = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '出發！');
    if (!name || !go2) return null;
    go2.click();
    await new Promise(r => setTimeout(r, 250));
    return { focused: document.activeElement === name,
             tag: document.activeElement && document.activeElement.tagName,
             writes: (window.__WRITES__ || []).length - before,
             err: (document.body.textContent || '').includes('這欄還沒填喔') };
  });
  console.log(`   名稱空著按「出發！」：焦點在名稱欄 ${jump && jump.focused}｜` +
              `寫入次數 ${jump && jump.writes}｜出現錯誤說明 ${jump && jump.err}`);
  ok(jump !== null, '找不到名稱欄或「出發！」，這條等於沒驗');
  ok(jump.focused, `焦點應落在沒填的那一欄，實際在 ${jump.tag}`);
  ok(jump.writes === 0, `不該送出任何寫入，實際送了 ${jump.writes} 次`);
  ok(jump.err, '沒有在欄位下方出錯誤說明');

  /* ── 12 兩頁的日期欄共用同一組 CSS（這處已修過三次）───────────────── */
  const dateCss = async () => p.evaluate(() => {
    const els = [...document.querySelectorAll('.datefield input[type=date]')];
    return els.map(e => { const cs = getComputedStyle(e);
      return { h: cs.height, ap: cs.appearance || cs.webkitAppearance }; });
  });
  await go('screen=s02');  const d02  = await dateCss();
  await go('screen=s02b'); const d02b = await dateCss();
  console.log(`   日期欄 s02 ${JSON.stringify(d02)}｜s02b ${JSON.stringify(d02b)}`);
  ok(d02.length === 2, `s02 應有兩個日期欄，實際 ${d02.length}`);
  ok(d02b.length === 2, `s02b 應有兩個日期欄，實際 ${d02b.length}`);
  for (const [nm, arr] of [['s02', d02], ['s02b', d02b]])
    for (const d of arr) {
      ok(d.h === '40px', `${nm} 日期欄高度應 40px，實際 ${d.h}`);
      ok(d.ap === 'none', `${nm} 日期欄 appearance 應 none（iOS 會用長格式撐爆），實際 ${d.ap}`);
    }

  /* ── 14 ⋯ 頁三個入口：網址要變，**畫面也要真的有東西** ───────────── */
  console.log('');
  for (const [label, seg, marker] of [
    ['分享', 'share', '複製分享連結'],
    ['複製成新的一趟', 'copy', '這趟叫什麼？'],
    ['刪除行程', 'delete', '請輸入「刪除」兩個字'],
  ]) {
    await go('screen=s03more');
    const r = await p.evaluate(async (lb) => {
      const btn = [...document.querySelectorAll('button, [role=button]')]
        .find(x => (x.textContent || '').trim().startsWith(lb));
      if (!btn) return { found: false };
      btn.click();
      await new Promise(r2 => setTimeout(r2, 400));
      const root = document.getElementById('root');
      return { found: true, route: window.__ROUTE__,
               len: root ? root.innerHTML.length : 0,
               text: (document.body.textContent || '') };
    }, label);
    console.log(`   點「${label}」→ ${r.route}｜#root ${r.len} 字元｜有「${marker}」 ${r.found && r.text.includes(marker)}`);
    ok(r.found, `⋯ 頁找不到「${label}」`);
    ok(r.route === `/trips/t1/${seg}`, `網址應變成 /trips/t1/${seg}，實際 ${r.route}`);
    /* 只驗網址不驗畫面不算過——這一輪的 bug 就是「網址對了但畫面沒東西」 */
    ok(r.len > 0, `${seg} 的畫面是空的（#root innerHTML 長度 0）`);
    ok(r.text.includes(marker), `${seg} 的畫面上找不到「${marker}」`);
  }

  /* ── O-3 兩個新的假資料模式真的造出那條路徑 ─────────────────────────── */
  console.log('');
  for (const [q, want] of [['screen=s03&fill=for', '各自付各的（只填外幣）'],
                           ['screen=s03&forOnly=1', '只有外幣沒有台幣']]) {
    await go(q);
    const has = await p.evaluate(w => (document.body.textContent || '').includes(w), want);
    const n = await p.evaluate(() => (window.__HARNESS_FIXTURE__ || {}).expenses?.length ?? -1);
    console.log(`   ${q}：畫得出「${want}」 ${has}｜消費 ${n} 筆`);
    ok(has, `${q} 沒有畫出那一筆——這條路徑等於還是沒有假資料走過`);
    ok(n === 1, `${q} 應該只掛那一筆，實際 ${n} 筆`);
  }

  /* ── 17 假資料開關**真的接上了**（不是只寫進 fixtures.ts）──────────────
     反向斷言：不帶參數時那條路徑**不存在**——證明參數真的有作用，
     而不是「本來就長這樣」。這與 #29 那條假通過的斷言是同一類問題。 */
  console.log('');
  await go('screen=s04&fill=for');
  const ff = await p.evaluate(() => {
    const f = window.__HARNESS_FIXTURE__;
    const e = f && f.expenses[0];
    return e ? { type: e.expense_type, cur: e.split_fill_currency,
                 splits: e.expense_splits.map(x => x.split_amount_foreign) } : null;
  });
  console.log(`   ?fill=for：type ${ff && ff.type}｜fillCur ${ff && ff.cur}｜各人外幣 ${JSON.stringify(ff && ff.splits)}`);
  ok(ff !== null, '?fill=for 沒有造出任何消費，這條等於沒驗');
  ok(ff.type === 'individual', `expense_type 應為 individual，實際 ${ff.type}`);
  ok(ff.cur === 'FOR', `split_fill_currency 應為 FOR，實際 ${ff.cur}`);
  ok(ff.splits.length >= 2 && ff.splits.every(v => v !== null),
    `每個 split 都要有 split_amount_foreign，實際 ${JSON.stringify(ff.splits)}`);

  const forOnlyRows = async q => { await go(q); return p.evaluate(() => {
    const f = window.__HARNESS_FIXTURE__;
    const rows2 = f ? f.expenses : [];
    return { n: rows2.length,
             onlyFor: rows2.filter(e => e.foreign_amount !== null && e.twd_amount === null
                                        && e.expense_type === 'shared').length,
             mine: rows2.filter(e => e.title === '只有外幣沒有台幣').length };
  }); };
  const withFlag = await forOnlyRows('screen=s03&forOnly=1');
  /* 反向對照：不帶參數時**那一筆不存在**，而且清單長度完全不同——
     證明上面那個 1 是參數造出來的，不是「本來就長這樣」。 */
  const without = await forOnlyRows('screen=s03');
  console.log(`   ?forOnly=1：共 ${withFlag.n} 筆／只有外幣 ${withFlag.onlyFor} 筆／目標筆 ${withFlag.mine}` +
              `　｜不帶參數：共 ${without.n} 筆／目標筆 ${without.mine}`);
  ok(withFlag.n === 1 && withFlag.onlyFor === 1,
    `?forOnly=1 應只掛一筆「只有外幣」的 shared 消費，實際 ${JSON.stringify(withFlag)}`);
  ok(withFlag.mine === 1, '?forOnly=1 沒有造出那一筆');
  ok(without.mine === 0 && without.n > 1,
    `不帶參數時不該有那一筆，實際 ${JSON.stringify(without)}——參數沒有作用`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
