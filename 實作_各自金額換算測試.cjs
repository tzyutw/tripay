/* 實作-AA　各自金額：切幣別要換算（AA-1）、外幣填時每列看得到台幣（AA-2）。 */
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
                          await new Promise(r => setTimeout(r, 340)); };
  /* S-04 直接掛在量測靶上（`?screen=s04&exp=<id>`）——不用先點清單再等 sheet 動畫 */
  const openExp = async extra => {
    /* S-03 的消費列**沒有** `data-exp-id`（那個屬性只在「{名字} 的帳」那一頁），
       所以 id 從量測靶端出去的那一份假資料拿。拿錯 id 會開出一張空表單，
       而空表單上根本沒有 `.amtrow`——那時每一條都會紅，但紅的原因是量錯地方。 */
    await go(`screen=s04${extra}&exp=__probe__`);
    /* ⚠️ 不能寫死 `expenses[0]`：`?fill=noforetotal` 是**接在 baseExpenses 後面**的，
       第一筆是機票（一起分），開進去根本沒有 `.amtrow`。取**最後一筆各付各的**。 */
    const id = await p.evaluate(() => {
      const f = window.__HARNESS_FIXTURE__;
      const list = (f && f.expenses) || [];
      const each = list.filter(e => e.expense_type === 'individual');
      return each.length ? each[each.length - 1].id : null;
    });
    if (!id) throw new Error(`拿不到「各付各的」那一筆的 id（${extra}）`);
    await go(`screen=s04${extra}&exp=${id}`);
    return id;
  };
  const cells = () => p.$$eval('.amtrow input', ns => ns.map(n => n.value));
  const cmp = () => p.evaluate(() => {
    const el = document.querySelector('.cmp');
    if (!el) return null;
    return { cls: el.className, txt: el.textContent.replace(/\s+/g, ' ').trim(),
             sub: (el.querySelector('.sub2') || {}).textContent || '' };
  });
  const twdTags = () => p.$$eval('.amtrow .amttwd', ns => ns.map(n => n.textContent.trim()));
  /* Seg 的兩顆按鈕：0＝「$ 台幣填」、1＝「₩ KRW 填」 */
  const clickFill = async which => {
    await p.evaluate(w => {
      const segs = [...document.querySelectorAll('.seg')];
      const seg = segs.find(s => (s.textContent || '').includes('台幣填'));
      seg.querySelectorAll('button')[w].click();
    }, which);
    await new Promise(r => setTimeout(r, 280));
  };

  console.log('\n=== 實作-AA　各自金額換算 ===\n');

  /* 1　靶要對 */
  await openExp('&fill=for');
  let v = await cells(), k = await cmp(), tg = await twdTags();
  console.log(`   ?fill=for 開啟：格 ${JSON.stringify(v)}｜比對列「${k && k.txt}」cls「${k && k.cls}」｜列內台幣 ${JSON.stringify(tg)}`);
  ok(JSON.stringify(v) === JSON.stringify(['12,000', '18,000']), `兩格不是 12,000／18,000，量錯地方了：${JSON.stringify(v)}`);
  ok(k !== null && /\bok\b/.test(k.cls), `比對列 class 不含 ok：${k && k.cls}`);
  ok(k !== null && k.sub.trim() === '換算後台幣 $ 690', `副文字不是「換算後台幣 $ 690」：「${k && k.sub.trim()}」`);

  /* 10　AA-2 出現 */
  console.log(`   AA-2 列內台幣：${JSON.stringify(tg)}`);
  ok(tg.length === 2, `列內台幣顯示應該恰好 2 個，實際 ${tg.length}`);
  ok(JSON.stringify(tg) === JSON.stringify(['$ 276', '$ 414']), `列內台幣不是 $ 276／$ 414：${JSON.stringify(tg)}`);
  ok(tg.map(t => Number(t.replace(/[^\d]/g, ''))).reduce((a, x) => a + x, 0) === 690,
    '列內台幣相加不等於 690（＝比對列副文字的數字）');

  /* 2　切「$ 台幣填」→ 換算 */
  await clickFill(0);
  v = await cells(); k = await cmp(); tg = await twdTags();
  console.log(`   → $ 台幣填：格 ${JSON.stringify(v)}｜比對列「${k && k.txt}」cls「${k && k.cls}」｜列內台幣 ${tg.length} 個`);
  ok(JSON.stringify(v) === JSON.stringify(['276', '414']), `沒有換算，兩格是 ${JSON.stringify(v)}——切幣別只換了單位`);
  ok(k !== null && /\bok\b/.test(k.cls), `切過去之後比對列不是 ok：${k && k.cls}`);
  ok(k !== null && !k.txt.includes('差'), `切過去之後出現「差」：「${k && k.txt}」`);
  /* 11　AA-2 台幣填時不該出現 */
  ok(tg.length === 0, `台幣填時還顯示 ${tg.length} 個列內台幣——填的就是台幣，重複顯示沒意義`);

  /* 4　切回 KRW 不掉精度 */
  await clickFill(1);
  v = await cells();
  console.log(`   → 切回 ₩ KRW 填：格 ${JSON.stringify(v)}`);
  ok(JSON.stringify(v) === JSON.stringify(['12,000', '18,000']), `切回來掉精度了：${JSON.stringify(v)}`);

  /* 5　用當下的值換算，不是上一次的快照 */
  await p.evaluate(() => {
    const el = document.querySelectorAll('.amtrow input')[0];
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, '10000');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 260));
  const edited = await cells();
  await clickFill(0);
  v = await cells();
  console.log(`   KRW 改成 10,000（${JSON.stringify(edited)}）→ $ 台幣填：${JSON.stringify(v)}`);
  ok(edited[0] === '10,000', `第一格沒有被改成 10,000（${edited[0]}），第 5 條等於沒驗`);
  ok(JSON.stringify(v) === JSON.stringify(['230', '414']), `用的是上一次換算的快照：${JSON.stringify(v)}`);

  /* 6　?fill=twd 雙向 */
  console.log('');
  await openExp('&fill=twd');
  v = await cells();
  console.log(`   ?fill=twd 開啟：${JSON.stringify(v)}`);
  ok(JSON.stringify(v) === JSON.stringify(['276', '414']), `?fill=twd 的靶不對：${JSON.stringify(v)}`);
  await clickFill(1); v = await cells();
  console.log(`   → ₩ KRW 填：${JSON.stringify(v)}`);
  ok(JSON.stringify(v) === JSON.stringify(['12,000', '18,000']), `台幣→外幣換算錯：${JSON.stringify(v)}`);
  await clickFill(0); v = await cells();
  console.log(`   → 切回 $ 台幣填：${JSON.stringify(v)}`);
  ok(JSON.stringify(v) === JSON.stringify(['276', '414']), `切回來不是原值：${JSON.stringify(v)}`);

  /* 4b／9b　`?fill=oy`：**來回換算會掉精度**的形狀（照 Rozi 那筆 OY髮油）。
     `?fill=for` 的 12,000／18,000 剛好整除，「還原使用者打的值」與「重算」
     結果一模一樣——那條在那個靶上**驗不到東西**。這裡重算會得到
     32,989／21,011，只有真的還原才會回到 33,000／21,000。 */
  console.log('');
  await openExp('&fill=oy');
  v = await cells();
  console.log(`   ?fill=oy 開啟：${JSON.stringify(v)}`);
  ok(JSON.stringify(v) === JSON.stringify(['33,000', '21,000', '']),
    `?fill=oy 的靶不對：${JSON.stringify(v)}`);
  await clickFill(0); v = await cells();
  console.log(`   → $ 台幣填：${JSON.stringify(v)}`);
  ok(JSON.stringify(v) === JSON.stringify(['683', '435', '']),
    `外→台換算錯（應 683／435／空白）：${JSON.stringify(v)}`);
  await clickFill(1); v = await cells();
  console.log(`   → 切回 ₩ KRW 填：${JSON.stringify(v)}（重算會是 32,989／21,011）`);
  ok(JSON.stringify(v) === JSON.stringify(['33,000', '21,000', '']),
    `沒有還原使用者打的值，被重算掉精度了：${JSON.stringify(v)}`);

  /* 9b　換算得出來時，空白格仍維持空白（不是 0） */
  await p.evaluate(() => {
    const el = document.querySelectorAll('.amtrow input')[1];
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 240));
  const cleared = await cells();
  await clickFill(0);
  v = await cells();
  console.log(`   清空第二格（${JSON.stringify(cleared)}）→ $ 台幣填：${JSON.stringify(v)}`);
  ok(cleared[1] === '', `第二格沒被清空（${cleared[1]}），這條等於沒驗`);
  ok(v[1] === '' && v[2] === '', `空白格被換算成 ${JSON.stringify([v[1], v[2]])}——空白不等於 0`);
  ok(v[0] === '683', `其他格應該照常換算，實際 ${v[0]}`);

  /* 7／8／9／11　算不出來就不動 */
  console.log('');
  await openExp('&fill=noforetotal');
  const before = await cells(); const cmpBefore = await cmp();
  await clickFill(0);
  const after = await cells(); const cmpAfter = await cmp();
  const all = await p.evaluate(() => document.body.innerText);
  const tg2 = await twdTags();
  console.log(`   ?fill=noforetotal：切之前 ${JSON.stringify(before)} → 切之後 ${JSON.stringify(after)}｜` +
              `比對列 ${cmpBefore ? '有' : '無'}→${cmpAfter ? '有' : '無'}｜列內台幣 ${tg2.length} 個`);
  ok(before.length > 0, '?fill=noforetotal 一格都沒有，第 7～9 條等於沒驗');
  ok(JSON.stringify(before) === JSON.stringify(after), `算不出來卻動了值：${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  ok(!all.includes('NaN'), '畫面上出現 NaN');
  ok(cmpAfter === null, '外幣總額空白時比對列不該出現（c.noAutoReason → CmpRow 回 null）');
  ok(after.filter(x => x === '').length >= 1, '應該有空白格，第 9 條等於沒驗');
  ok(after.every(x => x !== '0' && x !== 'NaN'), `空白格被填成 0 或 NaN：${JSON.stringify(after)}`);
  ok(tg2.length === 0, `外幣總額空白時還顯示 ${tg2.length} 個列內台幣`);

  /* 12　AA-2 不得吃掉可點區 */
  console.log('');
  await openExp('&fill=for');
  const hit = await p.evaluate(() => [...document.querySelectorAll('.amtrow input')].map(el => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const af = getComputedStyle(el, '::after');
    const h = Math.max(r.height, parseFloat(af.height) || 0), w = Math.max(r.width, parseFloat(af.width) || 0);
    const row = el.closest('.amtrow').getBoundingClientRect();
    const hh = Math.max(h, row.height);            // 整列都是 <label for>，點列就等於點框
    const q = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return { w, h: hh, self: !!q && (q === el || el.contains(q)) };
  }));
  console.log(`   輸入框可點區 ${hit.map(x => `${Math.round(x.w)}×${Math.round(x.h)}/${x.self}`).join('　')}`);
  ok(hit.length > 0, '找不到輸入框，第 12 條等於沒驗');
  ok(hit.every(x => x.self), '有輸入框的中心點被「換算後台幣」蓋住');
  ok(hit.every(x => x.h >= 44 || (x.h >= 34 && x.w * x.h >= 1600)),
    `有輸入框的可點區不足：${hit.map(x => `${Math.round(x.w)}×${Math.round(x.h)}`).join('、')}`);

  /* 13／14　三寬度不橫向捲動（量會捲的那個容器）＋長名字 */
  for (const longName of [false, true]) {
    for (const w of [320, 390, 430]) {
      await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
      await openExp('&fill=for');
      if (longName) {
        await p.evaluate(() => document.querySelectorAll('.amtrow .flex-1')
          .forEach(n => { n.textContent = '很長的名字很長的名字很長的名字很長'; }));
        await new Promise(r => setTimeout(r, 160));
      }
      const r = await p.evaluate(() => {
        const scrollers = [...document.querySelectorAll('body *')]
          .filter(el => { const cs = getComputedStyle(el);
            return /auto|scroll/.test(cs.overflowY + cs.overflowX) && el.scrollHeight > el.clientHeight + 1; });
        const over = scrollers.filter(el => el.scrollWidth > el.clientWidth + 1)
          .map(el => (el.className || '').toString().slice(0, 20));
        const rows = [...document.querySelectorAll('.amtrow')].map(row => {
          const rr = row.getBoundingClientRect();
          const bad = [...row.children].filter(ch => ch.getBoundingClientRect().right > rr.right + 0.5)
            .map(ch => (ch.className || '').toString().slice(0, 14));
          const tw = row.querySelector('.amttwd');
          return { bad, twIn: tw ? tw.getBoundingClientRect().right <= rr.right + 0.5 : null };
        });
        return { nScroll: scrollers.length, over, rows,
                 doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
      });
      const badRows = r.rows.filter(x => x.bad.length).length;
      const twOut = r.rows.filter(x => x.twIn === false).length;
      console.log(`   ${longName ? '長名字' : '一般'} ${w}px：會捲的容器 ${r.nScroll} 個，橫向溢出 ${r.over.length}` +
                  `｜列內子元素凸出 ${badRows} 列｜台幣顯示被擠出去 ${twOut} 列｜文件不捲 ${r.doc}`);
      ok(r.nScroll > 0, `${w}px 找不到會捲動的容器，第 13 條等於沒驗`);
      ok(r.over.length === 0, `${w}px 有容器可以橫向捲：${r.over.join('、')}`);
      ok(badRows === 0, `${w}px 有 ${badRows} 列的子元素凸出列外`);
      ok(twOut === 0, `${w}px 有 ${twOut} 列的「換算後台幣」被擠出畫面`);
      ok(r.doc, `${w}px 文件橫向捲動`);
    }
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
