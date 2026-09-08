/* 實作-AB　未結算頁也要有「查看計算依據」（AB-1）＋「自己買給自己的」獨立一行（AB-2）。 */
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
/* ⚠️ 實作-AC-3 把那句灰字整句拿掉，改成該行右側的標籤——
   位置（在差額下面、不在算式內）已經說明了它不進結算，不需要再解釋一次。 */
const NOTE = '不進結算';
/* ⚠️ 實作-AC 改了順序與第一行的名字（Rozi 2026-09-08 拍板）：
   他幫大家先付的 → 一起分的 → 各付各的 →（分隔線）→ 差額 → 自己買給自己的。
   AB 那一版的順序與「他先付出去的」這個名字都不存在了。 */
const LABELS = ['他幫大家先付的', '一起分的', '各付各的', '自己買給自己的'];
const num = t => Number(String(t).replace(/[^\d-]/g, '')) * (/[−-]/.test(String(t)) ? -1 : 1);

(async () => {
  const { srv, port } = await serve(DIST);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`http://127.0.0.1:${port}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 340)); };
  const toggles = () => p.$$eval('.detailtoggle', ns => ns.map(n => ({
    txt: n.textContent.replace(/\s+/g, ' ').trim(),
    prev: n.previousElementSibling ? (n.previousElementSibling.className || '').toString() : '(無)',
  })));
  /* 按鈕不在時**回 false，不要讓整支腳本崩掉**——崩掉的輸出裡看不出是哪一條紅的 */
  const open = async () => {
    const has = await p.$('.detailtoggle');
    if (!has) return false;
    await p.click('.detailtoggle'); await new Promise(r => setTimeout(r, 300));
    return true;
  };
  const rows = () => p.$$eval('[data-settle-row]', ns => ns.map(n => ({
    member: n.dataset.member, paid: Number(n.dataset.paid),
    diff: Number(n.dataset.diff), shared: Number(n.dataset.shared),
    self: Number(n.dataset.self), each: Number(n.dataset.each),
    fronted: Number(n.dataset.fronted), sponsor: Number(n.dataset.sponsor ?? 0),
    held: Number(n.dataset.sponsorheld ?? 0),
    parts: [...n.querySelectorAll('.detailparts > div')].map(d => ({
      /* 分隔線那一列沒有 span／i／b，先濾掉；「差額」不是四行之一，也濾掉 */
      label: (d.querySelector('span') || {}).textContent,
      n: (d.querySelector('i') || {}).textContent,
      amt: (d.querySelector('b') || {}).textContent }))
      .filter(x => x.label && x.label.trim() !== '差額')
      .map(x => ({ label: x.label.trim(), n: (x.n || '').trim(), amt: (x.amt || '').trim() })),
    /* AC-3 把那句灰字換成「不進結算」標籤 */
    notes: [...n.querySelectorAll('.selfline em')].map(x => x.textContent.trim()),
  })));

  console.log('\n=== 實作-AB　計算依據四行 ===\n');

  /* 1／2　AB-1 兩個狀態各恰好一顆，已結算那顆位置不變 */
  await go('screen=s05');            const t0 = await toggles();
  await go('screen=s05&state=settled'); const t1 = await toggles();
  console.log(`   未結算：${t0.length} 顆（前一個元素 ${t0.map(x => x.prev).join('、') || '—'}）`);
  console.log(`   已結算：${t1.length} 顆（前一個元素 ${t1.map(x => x.prev).join('、') || '—'}）`);
  ok(t0.length === 1, `未結算應該恰好 1 顆「查看計算依據」，實際 ${t0.length}`);
  ok(t0[0] && t0[0].txt.includes('查看計算依據'), '未結算那顆的文字不是「查看計算依據」');
  ok(t1.length === 1, `已結算應該仍是恰好 1 顆，實際 ${t1.length}`);

  /* 3／4／7　四行固定顯示 */
  console.log('');
  await go('screen=s05');
  ok(await open(), '未結算頁按不到「查看計算依據」——下面整段等於沒驗');
  const r0 = await rows();
  console.log(`   未結算展開：${r0.length} 位成員`);
  ok(r0.length > 0, '展開後一位成員都沒有，下面全部等於沒驗');
  for (const m of r0) {
    /* 贊助折抵是條件式的第五行，不在固定四行之內 */
    const labels = m.parts.map(x => x.label).filter(x => !['贊助折抵', '代收要發出去'].includes(x));
    console.log(`   ${m.member.slice(0, 6)}…　${m.parts.map(x => `${x.label} ${x.n} ${x.amt}`).join('｜')}`);
    ok(JSON.stringify(labels) === JSON.stringify(LABELS),
      `四行標籤不對：${JSON.stringify(labels)}`);
    ok(m.notes.length === 1 && m.notes[0] === NOTE,
      `「不進結算」標籤應該每位成員各 1 個，實際 ${JSON.stringify(m.notes)}`);
  }
  const zeroRow = r0.some(m => m.parts.some(x => x.n === '0 筆' && num(x.amt) === 0));
  console.log(`   有出現「0 筆 $ 0」的行：${zeroRow}`);
  ok(zeroRow, '筆數 0 的行被過濾掉了——Rozi 拍板要固定顯示四行');

  /* 🔴 AB-2 的核心：**自己買給自己的那一筆真的落在第二行**。
     只驗「四行都在」是不夠的——把 `isSelfPaid` 停用（全部落到「各付各的」）
     照樣會四行都在、加總也對，那條金絲雀不會紅。
     base 假資料裡「紀念品」860 是 Robin 自己付、也只算他自己。 */
  /* ⚠️ 筆數要從**畫面上讀**（「N 筆」），不要讀 `data-` ——`data-selfN` 根本沒輸出，
     讀到的是 undefined，`undefined > 0` 永遠是 false，這一組會靜靜地永遠通過。 */
  const partOf = (m, label) => m.parts.find(x => x.label === label);
  const cnt = x => Number(String(x.n).replace(/[^\d]/g, ''));
  const selfOwner = r0.filter(m => cnt(partOf(m, '自己買給自己的')) > 0);
  console.log(`   有「自己買給自己的」的成員：${
    selfOwner.map(m => `${m.member} ${partOf(m, '自己買給自己的').n} ${partOf(m, '自己買給自己的').amt}`).join('、') || '（無）'}`);
  ok(selfOwner.length === 1, `應該恰好一位成員有自己買給自己的，實際 ${selfOwner.length} 位`);
  if (selfOwner[0]) {
    const sp = partOf(selfOwner[0], '自己買給自己的'), ep = partOf(selfOwner[0], '各付各的');
    ok(cnt(sp) === 1 && num(sp.amt) === 860,
      `「紀念品」860 沒有落在「自己買給自己的」：${sp.n} ${sp.amt}`);
    /* 反向：「別人付、只算他」會產生欠款，一定要留在「各付各的」 */
    ok(cnt(ep) === 2, `同一位的「各付各的」應該還有 2 筆（藥妝店＋幫小美買的藥），實際 ${ep.n}`);
  }

  /* 5　不准改到數字 */
  console.log('');
  for (const m of r0) {
    /* AC 之後卡片上沒有「應分攤」了，改驗卡片自己印出來的那條算式 */
    console.log(`   ${m.member.slice(0, 6)}…　幫大家先付 ${m.fronted} − 一起分 ${m.shared}` +
                ` − 各付各的 ${m.each} ＋ 贊助 ${m.sponsor} = ${m.fronted - m.shared - m.each + m.sponsor}` +
                `｜差額 ${m.diff}｜自己買 ${m.self}`);
    ok(m.fronted - m.shared - m.each + m.sponsor + m.held === m.diff,
      `算式加不起來：${m.fronted - m.shared - m.each + m.sponsor + m.held} ≠ ${m.diff}`);
  }
  /* 拆之前的「指名算他的」＝ 自己買 ＋ 各付各的（只是換呈現，總額不變） */
  const namedSum = r0.map(m => m.self + m.each);
  console.log(`   自己買＋各付各的（＝更早以前的「指名算他的」）：${namedSum.join('、')}`);
  ok(namedSum.some(x => x !== 0), '每位成員的那兩類都是 0——這一組斷言沒有靶');

  /* 6　接上既有那一套，不得另寫判斷 */
  const src = fs.readFileSync('src/pages/SettlementPage.tsx', 'utf8');
  /* AC 之後判定搬進模組層級的 `breakdownFor()`，`breakdownOf` 只剩快取 */
  const bd = src.slice(src.indexOf('export function breakdownFor'), src.indexOf('export default function'));
  console.log(`   SettlementPage import isSelfPaid：${/import\s*{[^}]*\bisSelfPaid\b/.test(src)}｜` +
              `breakdownOf 內另寫的判斷：personal ${(bd.match(/expense_type === 'personal'/g) || []).length} 處`);
  ok(/import\s*{[^}]*\bisSelfPaid\b/.test(src), 'SettlementPage 沒有 import isSelfPaid');
  ok((bd.match(/expense_type === 'personal'/g) || []).length === 0,
    'breakdownOf 裡另寫了 `expense_type === \'personal\'` 的判斷');
  ok(!/payer_member_id\s*===\s*id[\s\S]{0,80}is_participating/.test(bd),
    'breakdownOf 裡另寫了「付款人＝參與者」的判斷');

  /* 8／9　三寬度不橫向捲動＋長名字 */
  console.log('');
  for (const longName of [false, true]) {
    for (const w of [320, 390, 430]) {
      await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
      await go('screen=s05');
      if (!await open()) { ok(false, `${w}px 未結算頁按不到「查看計算依據」`); continue; }
      if (longName) {
        await p.evaluate(() => document.querySelectorAll('.detailrow .trunc')
          .forEach(n => { n.textContent = '很長的名字很長的名字很長的名字很長'; }));
        await new Promise(r => setTimeout(r, 160));
      }
      const r = await p.evaluate(() => {
        const scrollers = [...document.querySelectorAll('body *')].filter(el => {
          const cs = getComputedStyle(el);
          return /auto|scroll/.test(cs.overflowY + cs.overflowX) && el.scrollHeight > el.clientHeight + 1;
        });
        const overScroll = scrollers.filter(el => el.scrollWidth > el.clientWidth + 1)
          .map(el => (el.className || '').toString().slice(0, 18));
        const bad = [];
        for (const row of document.querySelectorAll('.detailparts > div')) {
          const rr = row.getBoundingClientRect();
          for (const ch of row.children)
            if (ch.getBoundingClientRect().right > rr.right + 0.5)
              bad.push(`${ch.tagName}:${(ch.textContent || '').slice(0, 6)}`);
        }
        const d = document.documentElement;
        return { nScroll: scrollers.length, overScroll, bad: bad.slice(0, 3), nBad: bad.length,
                 docScrolls: d.scrollHeight > d.clientHeight + 1,
                 doc: d.scrollWidth <= d.clientWidth + 1 };
      });
      /* ⚠️ S-05 單獨載入時**沒有內層捲動容器，捲的是文件本身**。
         原本只認內層容器，量到 0 個就把「這條沒驗到」報成失敗——
         正確的做法是「哪個會捲就量哪個」，兩種都要能接住。 */
      const target = r.nScroll > 0 ? `內層容器 ${r.nScroll} 個` : (r.docScrolls ? '文件本身' : '（都不捲）');
      console.log(`   ${longName ? '長名字' : '一般'} ${w}px：捲的是 ${target}，橫向溢出 ${r.overScroll.length}` +
                  `｜四行內凸出右緣 ${r.nBad}${r.nBad ? '（' + r.bad.join('、') + '）' : ''}｜文件不捲 ${r.doc}`);
      ok(r.nScroll > 0 || r.docScrolls, `${w}px 整頁短到根本不會捲，這條等於沒驗`);
      ok(r.overScroll.length === 0, `${w}px 有內層容器可以橫向捲：${r.overScroll.join('、')}`);
      ok(r.nBad === 0, `${w}px 四行內有 ${r.nBad} 個元素凸出右緣`);
      ok(r.doc, `${w}px 文件橫向捲動`);
    }
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  /* 10　C6 可點區 */
  console.log('');
  await go('screen=s05');
  const hit = await p.evaluate(() => {
    const el = document.querySelector('.detailtoggle'); if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(), af = getComputedStyle(el, '::after');
    const h = Math.max(r.height, parseFloat(af.height) || 0);
    const q = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return { w: r.width, h, self: !!q && (q === el || el.contains(q)) };
  });
  console.log(`   未結算那顆按鈕 ${hit ? `${Math.round(hit.w)}×${Math.round(hit.h)}` : '（找不到）'}` +
              `｜中心命中自己 ${hit ? hit.self : '—'}`);
  ok(hit !== null, '找不到按鈕，第 10 條等於沒驗');
  /* 找不到就別再往下讀屬性——整支崩掉的話，前面那幾條紅在哪裡就看不到了 */
  if (hit) {
    ok(hit.h >= 44 || (hit.h >= 34 && hit.w * hit.h >= 1600),
      `可點區不足（${Math.round(hit.w)}×${Math.round(hit.h)}）`);
    ok(hit.self, '按鈕中心點被蓋住');
  }

  /* 11　C9 切過去再切回來 */
  console.log('');
  await go('screen=s03');
  const seg = async label => { await p.evaluate(l => {
      const s2 = [...document.querySelectorAll('.seg')].find(x => (x.textContent || '').includes('結算'));
      [...s2.querySelectorAll('button')].find(bt => bt.textContent.trim() === l).click();
    }, label); await new Promise(r => setTimeout(r, 380)); };
  await seg('結算');
  const before = await p.evaluate(() => document.querySelectorAll('.detailparts').length);
  await p.click('#s03settlepane .detailtoggle, .detailtoggle').catch(() => {});
  await new Promise(r => setTimeout(r, 320));
  const opened = await p.evaluate(() => document.querySelectorAll('.detailparts').length);
  await seg('消費');
  const onExp = await p.evaluate(() => ({
    parts: document.querySelectorAll('.detailparts').length,
    rows: document.querySelectorAll('.exprow').length }));
  await seg('結算');
  const backAgain = await p.evaluate(() => document.querySelectorAll('.detailparts').length);
  console.log(`   分頁切換：結算(收合 ${before}→展開 ${opened}) → 消費(${onExp.parts} 段, ${onExp.rows} 列) → 結算(${backAgain})`);
  ok(opened > before, '在結算分頁按了「查看計算依據」沒有展開，第 11 條等於沒驗');
  ok(onExp.parts === 0, `切到消費分頁還殘留 ${onExp.parts} 段計算依據`);
  ok(onExp.rows > 0, '切到消費分頁看不到消費列');

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
