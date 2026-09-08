/* 實作-AC　計算依據合併進每人卡片、他幫大家先付的只算代墊、差額不吃舊結算、分享頁同步。 */
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
const LABELS = ['他幫大家先付的', '一起分的', '各付各的', '自己買給自己的'];
const STALE_HINT = '這次結算之後帳有變動，數字跟現在的帳不一樣了';

(async () => {
  const { srv, port } = await serve(DIST);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`http://127.0.0.1:${port}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 360)); };
  const open = async () => {
    const el = await p.$('.detailtoggle');
    if (!el) return false;
    await p.click('.detailtoggle'); await new Promise(r => setTimeout(r, 320)); return true;
  };
  const cards = () => p.$$eval('[data-settle-row]', ns => ns.map(n => ({
    m: n.dataset.member,
    shared: +n.dataset.shared, self: +n.dataset.self, each: +n.dataset.each,
    fronted: +n.dataset.fronted, diff: +n.dataset.diff,
    /* ⚠️ 四行的標籤要**排除「差額」那一列**——它不是四行之一，它是三行的結果。
       不排除的話這條會拿五個標籤去比四個，永遠紅，而紅的原因跟實作無關。 */
    labels: [...n.querySelectorAll('.detailparts > div')]
      .map(d => (d.querySelector('span') || {}).textContent || null)
      .filter(x => x && x !== '差額'),
    /* 條件 3：「差額」要落在第 3 行與第 4 行之間 */
    order: [...n.querySelectorAll('.detailparts > div')]
      .map(d => (d.querySelector('span') || {}).textContent || '(line)'),
    lines: n.querySelectorAll('.partsline').length,
    afterLine: (() => { const l = n.querySelector('.partsline');
      return l && l.nextElementSibling ? l.nextElementSibling.textContent : ''; })(),
    tags: [...n.querySelectorAll('.selfline em')].map(x => x.textContent.trim()),
    head: (n.querySelector('.netrow .money') || {}).textContent || '',
  })));

  console.log('\n=== 實作-AC　每人卡片 ===\n');

  /* 1　四欄表消失 */
  for (const q of ['screen=s05', 'screen=s05&state=settled']) {
    await go(q); await open();
    const r = await p.evaluate(() => ({
      table: document.querySelectorAll('.detailtable, .detailhd, .detailrow').length,
      txt: document.body.innerText }));
    console.log(`   ${q.padEnd(24)} 四欄表元素 ${r.table}｜含「實際付出」${r.txt.includes('實際付出')}｜含「應分攤」${r.txt.includes('應分攤')}`);
    ok(r.table === 0, `${q} 四欄表還在（${r.table} 個元素）`);
    ok(!r.txt.includes('實際付出') && !r.txt.includes('應分攤'), `${q} 還看得到四欄表的表頭字串`);
  }

  /* 2／3／9　每人一張卡、四行、順序、分隔線 */
  console.log('');
  await go('screen=s05');
  ok(await open(), '未結算頁按不到「查看計算依據」，下面整段等於沒驗');
  const c0 = await cards();
  console.log(`   卡片 ${c0.length} 張｜第一張的行：${c0[0] && c0[0].labels.join('／')}`);
  ok(c0.length === 4, `卡片數應該等於成員數 4，實際 ${c0.length}`);
  for (const c of c0) {
    ok(JSON.stringify(c.labels) === JSON.stringify(LABELS),
      `${c.m} 的四行標籤或順序不對：${JSON.stringify(c.labels)}`);
    ok(c.lines === 1, `${c.m} 的分隔線應該恰好 1 條，實際 ${c.lines}`);
    ok(c.afterLine.includes('差額'), `${c.m} 分隔線的下一列不是「差額」：「${c.afterLine.slice(0, 20)}」`);
    const oi = c.order.indexOf('差額');
    ok(oi > c.order.indexOf('各付各的') && oi < c.order.indexOf('自己買給自己的'),
      `${c.m} 的「差額」沒有落在第 3 行與第 4 行之間：${JSON.stringify(c.order)}`);
    ok(c.tags.length === 1 && c.tags[0] === '不進結算',
      `${c.m} 的「不進結算」標籤應該恰好 1 個，實際 ${JSON.stringify(c.tags)}`);
  }

  /* 4／5／6　算式加得起來、自己買的不在算式內、靶要對 */
  console.log('');
  const WANT = { m0: 78900, m1: 1035, m2: 2480, m3: 0 };
  for (const c of c0) {
    console.log(`   ${c.m}　幫大家先付 ${c.fronted} − 一起分 ${c.shared} − 各付各的 ${c.each} = ` +
                `${c.fronted - c.shared - c.each}｜差額 ${c.diff}｜自己買 ${c.self}｜標題「${c.head.trim()}」`);
    ok(c.fronted - c.shared - c.each === c.diff,
      `${c.m}：三行加不起來（${c.fronted - c.shared - c.each} ≠ ${c.diff}）`);
    ok(c.fronted === WANT[c.m],
      `${c.m} 的「他幫大家先付的」應為 ${WANT[c.m]}，實際 ${c.fronted}` +
      (c.m === 'm1' ? '（1,895 是沒扣掉他自己買的紀念品 860）' : ''));
    if (c.self !== 0)
      ok(c.fronted - c.shared - c.each - c.self !== c.diff,
        `${c.m}：把自己買的加進算式竟然還是等於差額——那條反向沒有意義`);
    /* 標題的「要給出／可以拿回」要跟差額一致 */
    const headNum = Number((c.head.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''));
    ok(headNum === Math.abs(c.diff), `${c.m} 卡片標題 ${headNum} 與差額 ${c.diff} 對不上`);
  }
  ok(c0.some(c => c.self > 0), '沒有任何成員有「自己買給自己的」，第 5 條等於沒驗');
  const diffSum = c0.reduce((a, c) => a + c.diff, 0);
  console.log(`   四人差額加總 ${diffSum}`);
  ok(diffSum === 0, `四人差額加總應為 0，實際 ${diffSum}`);
  /* data-paid 保留原意：fronted === paid − self */
  const paidChk = await p.$$eval('[data-settle-row]', ns => ns.map(n => ({
    m: n.dataset.member, paid: n.dataset.paid == null ? null : +n.dataset.paid })));
  console.log(`   data-paid：${paidChk.map(x => `${x.m}=${x.paid}`).join('、')}`);
  ok(paidChk.every(x => x.paid !== null), 'data-paid 不見了（AC-2 明訂保留原意，供其他斷言用）');
  for (const c of c0) {
    const pd = paidChk.find(x => x.m === c.m).paid;
    ok(pd - c.self === c.fronted,
      `${c.m}：data-fronted 應等於 data-paid − data-self（${pd} − ${c.self} ≠ ${c.fronted}）`);
  }

  /* 7　負零 */
  const txt0 = await p.evaluate(() => document.body.innerText);
  console.log(`   全文含「−$ 0」：${/[−-]\$ 0(?!\d)/.test(txt0)}`);
  ok(!/[−-]\$ 0(?!\d)/.test(txt0), '畫面上出現了 −$ 0');

  /* 8　文案 */
  console.log(`   含「不影響要轉的錢」${txt0.includes('不影響要轉的錢')}｜含「總共付出」${txt0.includes('總共付出')}`);
  ok(!txt0.includes('不影響要轉的錢'), '那句灰字沒有拿掉（AC-3 要求改成「不進結算」標籤）');
  ok(!txt0.includes('總共付出'), '出現了「總共付出」——這一頁回答的是誰給誰多少');

  /* 10　收合時畫面不變 */
  console.log('');
  const pre = JSON.parse(fs.readFileSync('Claude outputs/_pre-AC基準.json', 'utf8'));
  await go('screen=s05');
  const now = await p.evaluate(() => document.body.innerText);
  const same = now === pre['screen=s05'].text;
  console.log(`   收合狀態與 pre-AC 逐字相同：${same}`);
  if (!same) {
    const a = pre['screen=s05'].text.split('\n'), c = now.split('\n');
    console.log(`     pre 有 App 沒有：${JSON.stringify(a.filter(x => !c.includes(x)).slice(0, 3))}`);
    console.log(`     App 有 pre 沒有：${JSON.stringify(c.filter(x => !a.includes(x)).slice(0, 3))}`);
  }
  ok(same, '收合狀態的畫面被改到了（AC 只准動展開後的內容）');

  /* 11／12／13　差額不吃舊結算 */
  console.log('');
  await go('screen=s05&state=stale');
  await open();
  const cs = await cards();
  const frozen = await p.evaluate(() => (window.__HARNESS_FIXTURE__.confirmed_items || [])
    .map(i => ({ from: i.from_member_id, to: i.to_member_id, amount: i.amount })));
  const frozenNet = {};
  for (const c of cs) frozenNet[c.m] = frozen.reduce((a, i) =>
    a + (i.to === c.m ? i.amount : 0) - (i.from === c.m ? i.amount : 0), 0);
  console.log(`   stale：卡片差額 ${cs.map(c => c.diff).join('、')}`);
  console.log(`         凍結值反推 ${cs.map(c => frozenNet[c.m]).join('、')}`);
  const staleTxt = await p.evaluate(() => document.body.innerText);
  ok(cs.every(c => c.fronted - c.shared - c.each === c.diff), 'stale 狀態下三行加不起來');
  ok(cs.some(c => c.diff !== frozenNet[c.m]),
    '卡片的差額與凍結值一模一樣——AC-4 沒生效，或假資料的 stale 沒生效');
  /* ⚠️ 「卡片標題與 data-diff 一致」**要在 stale 這一頁驗**。
     只在未結算頁驗的話，把 net 接回 netFromItems（＝Rozi 抱怨的那個 bug）
     照樣全綠——未結算根本沒有凍結值，兩者本來就相同。 */
  for (const c of cs) {
    const headNum = Number((c.head.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''));
    console.log(`     ${c.m} 標題「${c.head.trim()}」vs 差額 ${c.diff}｜凍結值 ${frozenNet[c.m]}`);
    ok(headNum === Math.abs(c.diff),
      `${c.m}：stale 頁的卡片標題 ${headNum} 與差額 ${Math.abs(c.diff)} 打架` +
      `（凍結值是 ${Math.abs(frozenNet[c.m])}——那就是吃到舊結算了）`);
  }
  ok(staleTxt.includes(STALE_HINT), `已結算且帳有變動時應出現提示：「${STALE_HINT}」`);
  await go('screen=s05&state=settled');
  const settledTxt = await p.evaluate(() => document.body.innerText);
  console.log(`   settled（沒變動）含提示：${settledTxt.includes(STALE_HINT)}`);
  ok(!settledTxt.includes(STALE_HINT), '沒變動的已結算頁不該出現那句提示（反向）');

  /* 12　已結算的「大家給」仍用凍結值（不得被改成即時） */
  await go('screen=s05&state=stale');
  const headTxt = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.txrow')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
    return el;
  });
  console.log(`   stale 的轉帳列：${headTxt.join('｜').slice(0, 90)}`);
  const frozenAmts = frozen.map(i => i.amount);
  ok(frozenAmts.every(a => headTxt.join(' ').includes(a.toLocaleString())),
    `已結算的轉帳列應該仍是凍結值 ${frozenAmts.join('、')}`);

  /* 14／15／16／17　分享頁 */
  console.log('');
  await go('screen=s06');
  const nTog = await p.$$eval('.detailtoggle', ns => ns.length);
  ok(nTog === 1, `分享頁的「查看計算依據」應該恰好 1 顆，實際 ${nTog}`);
  const hit = await p.evaluate(() => {
    const el = document.querySelector('.detailtoggle'); if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(), af = getComputedStyle(el, '::after');
    const h = Math.max(r.height, parseFloat(af.height) || 0);
    const q = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return { w: r.width, h, self: !!q && (q === el || el.contains(q)) };
  });
  console.log(`   分享頁按鈕 ${hit ? `${Math.round(hit.w)}×${Math.round(hit.h)}` : '（找不到）'}｜命中自己 ${hit ? hit.self : '—'}`);
  ok(hit !== null, '分享頁找不到按鈕，第 17 條等於沒驗');
  if (hit) {
    ok(hit.h >= 44 || (hit.h >= 34 && hit.w * hit.h >= 1600), `可點區不足（${Math.round(hit.w)}×${Math.round(hit.h)}）`);
    ok(hit.self, '按鈕中心點被蓋住');
  }
  await open();
  const c6 = await cards();
  console.log(`   分享頁卡片 ${c6.length} 張｜第一張的行：${c6[0] && c6[0].labels.join('／')}`);
  ok(c6.length === 4, `分享頁卡片數應為 4，實際 ${c6.length}`);
  ok(c6[0] && JSON.stringify(c6[0].labels) === JSON.stringify(LABELS), '分享頁的四行標籤與結算頁不同');
  const ro = await p.evaluate(() => {
    const box = document.querySelector('.detailtoggle').nextElementSibling;
    return { btn: box.querySelectorAll('button').length, inp: box.querySelectorAll('input').length,
             a: box.querySelectorAll('a').length, txt: document.body.innerText };
  });
  console.log(`   分享頁展開區塊：button ${ro.btn}／input ${ro.inp}／a ${ro.a}`);
  ok(ro.btn === 0 && ro.inp === 0 && ro.a === 0, '分享頁的計算依據區塊裡有可操作元素（A9）');
  ok(!ro.txt.includes('標記付清') && !ro.txt.includes('重新計算'), '分享頁出現了「標記付清」或「重新計算」');
  /* 15　文字只能存在於共用元件那一個檔案裡 */
  const files = { settle: 'src/pages/SettlementPage.tsx', share: 'src/pages/SharePage.tsx',
                  comp: 'src/components/shared/SettleBreakdown.tsx' };
  const cnt = Object.fromEntries(Object.entries(files).map(([k, f]) =>
    [k, (fs.readFileSync(f, 'utf8').match(/他幫大家先付的/g) || []).length]));
  const imports = Object.fromEntries(['settle', 'share'].map(k =>
    [k, /import\s+SettleBreakdown\s+from/.test(fs.readFileSync(files[k], 'utf8'))]));
  console.log(`   「他幫大家先付的」出現次數：元件 ${cnt.comp}／S-05 ${cnt.settle}／分享頁 ${cnt.share}` +
              `｜兩頁都 import SettleBreakdown：${imports.settle && imports.share}`);
  ok(cnt.comp === 1 && cnt.settle === 0 && cnt.share === 0,
    '那段文字不是只存在於共用元件裡——兩頁遲早分岔');
  ok(imports.settle && imports.share, '兩個頁面沒有都 import 同一個 SettleBreakdown');

  /* 18／19　三寬度不橫向捲動＋長名字 */
  console.log('');
  for (const longName of [false, true]) {
    for (const w of [320, 390, 430]) {
      for (const sc of ['screen=s05', 'screen=s06']) {
        await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
        await go(sc); await open();
        if (longName) {
          await p.evaluate(() => document.querySelectorAll('[data-settle-row] .netrow .flex-1')
            .forEach(n => { n.textContent = '很長的名字很長的名字很長的名字很長'; }));
          await new Promise(r => setTimeout(r, 160));
        }
        const r = await p.evaluate(() => {
          const d = document.documentElement;
          const scrollers = [...document.querySelectorAll('body *')].filter(el => {
            const cs = getComputedStyle(el);
            return /auto|scroll/.test(cs.overflowY + cs.overflowX) && el.scrollHeight > el.clientHeight + 1;
          });
          const over = scrollers.filter(el => el.scrollWidth > el.clientWidth + 1)
            .map(el => (el.className || '').toString().slice(0, 16));
          const bad = [];
          for (const card of document.querySelectorAll('[data-settle-row]')) {
            const cr = card.getBoundingClientRect();
            for (const el of card.querySelectorAll('*'))
              if (el.getBoundingClientRect().right > cr.right + 0.5)
                bad.push((el.className || el.tagName).toString().slice(0, 14));
          }
          return { docScrolls: d.scrollHeight > d.clientHeight + 1, doc: d.scrollWidth <= d.clientWidth + 1,
                   nScroll: scrollers.length, over, nBad: bad.length, bad: bad.slice(0, 3) };
        });
        console.log(`   ${longName ? '長名字' : '一般'} ${w}px ${sc.slice(7)}：` +
                    `捲的是 ${r.nScroll ? `內層 ${r.nScroll}` : (r.docScrolls ? '文件' : '（不捲）')}` +
                    `｜橫向溢出 ${r.over.length}｜卡片內凸出 ${r.nBad}${r.nBad ? '（' + r.bad.join('、') + '）' : ''}`);
        ok(r.nScroll > 0 || r.docScrolls, `${w}px ${sc} 整頁不會捲，這條等於沒驗`);
        ok(r.over.length === 0, `${w}px ${sc} 有內層容器橫向可捲：${r.over.join('、')}`);
        ok(r.nBad === 0, `${w}px ${sc} 卡片內有 ${r.nBad} 個元素凸出右緣`);
        ok(r.doc, `${w}px ${sc} 文件橫向捲動`);
      }
    }
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  /* 20　已結算頁不得被改壞 */
  console.log('');
  await go('screen=s05&state=settled');
  const nClear = await p.$$eval('.clearbtn', ns => ns.length);
  console.log(`   已結算的「標記付清」${nClear} 顆（pre-AC ${pre['screen=s05&state=settled'].clearbtn} 顆）`);
  ok(nClear === pre['screen=s05&state=settled'].clearbtn,
    `「標記付清」數量變了：${pre['screen=s05&state=settled'].clearbtn} → ${nClear}`);

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
