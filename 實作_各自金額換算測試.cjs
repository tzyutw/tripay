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

  /* 7／8／9／11　🔴 **換算不出來 → 目標模式留空白**（Cowork 2026-09-08 訂正）。
     原本的做法是「值照留＋把比對列藏起來」。那是錯的：`12,000`／`40,000`（韓元）
     會頂著「$ 台幣填」的標題待在格子裡，按「記下來」就當台幣存進去
     ——那正是 C8 守恆式抓到的「藥局灌水 50,860」。藏掉比對列只是把警訊藏起來，
     錢還是錯的。留空白之後每格自動帶「自動」與均分的 placeholder，比對列是綠的。 */
  console.log('');
  await openExp('&fill=noforetotal');
  const before = await cells();
  const warnBefore = (await p.evaluate(() => document.body.innerText)).includes('還沒填');
  await clickFill(0);
  const st = await p.evaluate(() => ({
    vals: [...document.querySelectorAll('.amtrow input')].map(n => n.value),
    ph: [...document.querySelectorAll('.amtrow input')].map(n => n.placeholder),
    auto: [...document.querySelectorAll('.amtrow')].map(r => !!r.querySelector('.autotag')),
    txt: document.body.innerText,
  }));
  const k2 = await cmp();
  console.log(`   ?fill=noforetotal 切「$ 台幣填」：值 ${JSON.stringify(st.vals)}｜` +
              `placeholder ${JSON.stringify(st.ph)}｜自動 ${JSON.stringify(st.auto)}｜` +
              `比對列「${k2 && k2.txt}」cls「${k2 && k2.cls}」`);
  ok(before.length === 4, `?fill=noforetotal 應該有四格，實際 ${before.length}——這一段等於沒驗`);
  ok(st.vals.every(v => v === ''), `目標模式沒有留空白：${JSON.stringify(st.vals)}`);
  ok(st.auto.every(Boolean), `四格應該都有「自動」標籤，實際 ${JSON.stringify(st.auto)}`);
  ok(st.ph.every(x => x === '285'), `placeholder 應該都是 285，實際 ${JSON.stringify(st.ph)}`);
  ok(!st.txt.includes('NaN'), '畫面上出現 NaN');
  ok(k2 !== null && /\bok\b/.test(k2.cls), `比對列應該出現而且是綠的：${k2 && k2.cls}`);
  ok(k2 !== null && k2.txt.includes('$ 1,140 ／ $ 1,140'), `比對列文字不對：「${k2 && k2.txt}」`);
  ok(k2 !== null && !k2.txt.includes('差'), `比對列出現「差」：「${k2 && k2.txt}」`);

  /* 切回去要逐字還原，「還沒填」的警語也要回來 */
  await clickFill(1);
  const back = await cells();
  const warnBack = (await p.evaluate(() => document.body.innerText)).includes('還沒填');
  console.log(`   → 切回 ₩ KRW 填：${JSON.stringify(back)}｜「還沒填」警語 ${warnBefore}→${warnBack}`);
  ok(JSON.stringify(back) === JSON.stringify(before), `切回去沒有逐字還原：${JSON.stringify(back)}`);
  ok(warnBefore && warnBack, `「還沒填」的警語沒有回來（${warnBefore}／${warnBack}）`);

  /* 那個舊旗標整個拿掉。⚠️ 只掃 `src/`——掃 `*.cjs` 會把**這一段自己**算進去
     （檢查器提到那個字，就被自己的檢查器命中），永遠歸不了零。 */
  const flag = ['indiv', 'Stale'].join('');
  const srcHits = require('child_process')
    .execSync(`grep -rn ${flag} src 2>/dev/null | wc -l`).toString().trim();
  console.log(`   src/ 裡 ${flag} 命中 ${srcHits} 次`);
  ok(Number(srcHits) === 0, `${flag} 還有 ${srcHits} 處沒清掉`);

  /* §47　?fill=remainder：外幣總額有值、剩餘不為 0、一人沒填 */
  console.log('');
  await openExp('&fill=remainder');
  const rem = await p.evaluate(() => ({
    vals: [...document.querySelectorAll('.amtrow input')].map(n => n.value),
    ph: [...document.querySelectorAll('.amtrow input')].map(n => n.placeholder),
    auto: [...document.querySelectorAll('.amtrow')].map(r => !!r.querySelector('.autotag')),
    twd: [...document.querySelectorAll('.amtrow .amttwd')].map(n => n.textContent.trim()),
  }));
  const remSum = rem.twd.map(t => Number(t.replace(/[^\d]/g, ''))).reduce((a, x) => a + x, 0);
  console.log(`   ?fill=remainder：值 ${JSON.stringify(rem.vals)}｜placeholder ${JSON.stringify(rem.ph)}` +
              `｜自動 ${JSON.stringify(rem.auto)}｜列內台幣 ${JSON.stringify(rem.twd)}（合計 ${remSum}）`);
  ok(rem.vals.length === 4, `?fill=remainder 應該四格，實際 ${rem.vals.length}`);
  ok(rem.vals[3] === '', `第四人那格應該是空的，實際「${rem.vals[3]}」`);
  ok(rem.auto[3] === true, '第四人那格沒有「自動」標籤——§47「剩餘歸未填者」沒生效');
  ok(rem.ph[3] === '24,675', `第四人的 placeholder 應該是剩餘 24,675，實際「${rem.ph[3]}」`);
  ok(remSum === 1437, `四人換算後台幣加總應為 1,437，實際 ${remSum}`);
  await clickFill(0);
  const rem2 = await p.evaluate(() => ({
    vals: [...document.querySelectorAll('.amtrow input')].map(n => n.value),
    ph: [...document.querySelectorAll('.amtrow input')].map(n => n.placeholder),
    auto: [...document.querySelectorAll('.amtrow')].map(r => !!r.querySelector('.autotag')),
  }));
  const k3 = await cmp();
  console.log(`   → $ 台幣填：值 ${JSON.stringify(rem2.vals)}｜placeholder ${JSON.stringify(rem2.ph)}` +
              `｜比對列「${k3 && k3.txt}」cls「${k3 && k3.cls}」`);
  ok(JSON.stringify(rem2.vals) === JSON.stringify(['89', '542', '265', '']),
    `換算錯，或空白格被填進去了：${JSON.stringify(rem2.vals)}`);
  ok(rem2.auto[3] === true && rem2.ph[3] === '541',
    `沒填的那一格應該帶「自動」＋ placeholder 541（＝1,437−89−542−265），實際 ${rem2.auto[3]}／「${rem2.ph[3]}」`);
  ok(k3 !== null && /\bok\b/.test(k3.cls) && k3.txt.includes('$ 1,437 ／ $ 1,437') && !k3.txt.includes('差'),
    `比對列不對：「${k3 && k3.txt}」cls「${k3 && k3.cls}」`);

  /* §48／R6　?fill=alltyped：外幣總額空白但全員都填了 */
  console.log('');
  await openExp('&fill=alltyped');
  const at1 = await cells(); const kA = await cmp(); const atTwd = await twdTags();
  const atSum = atTwd.map(t => Number(t.replace(/[^\d]/g, ''))).reduce((a, x) => a + x, 0);
  console.log(`   ?fill=alltyped：值 ${JSON.stringify(at1)}｜比對列「${kA && kA.txt}」cls「${kA && kA.cls}」` +
              `｜列內台幣 ${JSON.stringify(atTwd)}（合計 ${atSum}）`);
  ok(JSON.stringify(at1) === JSON.stringify(['12,000', '40,000', '0', '0']),
    `?fill=alltyped 的靶不對：${JSON.stringify(at1)}`);
  ok(kA !== null && /\bok\b/.test(kA.cls),
    `R6 沒生效——外幣總額空白但全員都填了，分母該用 Σ各人外幣（比對列 ${kA ? kA.cls : '不存在'}）`);
  ok(atSum === 1140, `換算後台幣總計應為 1,140，實際 ${atSum}`);
  await clickFill(0);
  const at2 = await cells(); const kB = await cmp();
  console.log(`   → $ 台幣填：${JSON.stringify(at2)}｜比對列 cls「${kB && kB.cls}」`);
  ok(JSON.stringify(at2) === JSON.stringify(['263', '877', '0', '0']),
    `R6 的分母沒被沿用（應 263／877／0／0）：${JSON.stringify(at2)}`);
  ok(kB !== null && /\bok\b/.test(kB.cls), `切過去之後比對列不是綠的：${kB && kB.cls}`);

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
