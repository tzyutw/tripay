/* 實作-X　「只看共同的帳」開關的 17 條停止條件。 */
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
const num = s => Number(String(s).replace(/[^\d-]/g, ''));

(async () => {
  const { srv, port } = await serve(DIST);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`http://127.0.0.1:${port}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 340)); };
  const titles = () => p.$$eval('.exprow .t', ns => ns.map(n => n.textContent.trim()));

  console.log('\n=== 批 X　只看共同的帳 ===\n');

  /* 1／2／3　X-0 的判斷規則 */
  await go('screen=s03');           const off = await titles();
  await go('screen=s03&onlyshared=1'); const on = await titles();
  const gone = off.filter(t => !on.includes(t));
  console.log(`   關 ${off.length} 列 → 開 ${on.length} 列｜收起來的：${gone.join('、') || '（無）'}`);
  ok(off.length - on.length === 2, `應該少 2 列，實際少 ${off.length - on.length}`);
  ok(gone.length === 2 && gone.some(t => t.includes('紀念品')) && gone.some(t => t.includes('阿明的計程車')),
    `收起來的不是「紀念品」與「阿明的計程車」，而是：${gone.join('、')}`);
  for (const keep of ['幫小美買的藥', '機場接送', '爸爸贊助'])
    ok(on.some(t => t.includes(keep)), `誤傷：「${keep}」不該被收起來（會產生欠款／多人參與）`);
  ok(!on.some(t => t.includes('阿明的計程車')),
    'personal 那一筆沒被抓到——只用「參與者剛好一人」會整批漏掉這種');

  /* 4　統計卡標題 */
  const totTitle = () => p.$eval('.tot > span:first-child', n => n.textContent.trim());
  await go('screen=s03');            const t0 = await totTitle();
  await go('screen=s03&onlyshared=1'); const t1 = await totTitle();
  console.log(`   統計卡標題：關「${t0}」→ 開「${t1}」`);
  ok(t0 === '總花費' && t1 === '共同的帳', `標題沒跟著換（${t0} / ${t1}）`);

  /* 5／6　恆等式與筆數（三個數字都從畫面上讀） */
  const totMoney = () => p.$eval('.tot .money', n => n.textContent.trim());
  const sumRow = () => p.$eval('.selfsum', n => n.textContent.trim());
  await go('screen=s03');            const m0 = await totMoney();
  await go('screen=s03&onlyshared=1'); const m1 = await totMoney(); const sr = await sumRow();
  const srAmt = num((sr.match(/·\s*\$\s*[\d,]+/) || [''])[0]);
  const srN = Number((sr.match(/另有 (\d+) 筆自己買的/) || [])[1]);
  console.log(`   總花費(關) ${m0}｜共同的帳(開) ${m1}｜摘要行「${sr}」`);
  ok(Math.abs((num(m0) - num(m1)) - srAmt) <= 1,
    `錢憑空消失：${num(m0)} − ${num(m1)} = ${num(m0) - num(m1)}，摘要行卻是 ${srAmt}`);
  ok(srN === off.length - on.length, `摘要行的筆數 ${srN} 對不上少掉的 ${off.length - on.length} 列`);

  /* 7　摘要行點得進去 */
  const before = await p.evaluate(() => window.__ROUTE__ + location.search);
  await p.click('.selfsum'); await new Promise(r => setTimeout(r, 320));
  const after = await p.evaluate(() => ({
    route: window.__ROUTE__, sec: (document.querySelector('.sec') || {}).textContent || '',
    ttl: (document.querySelector('.bar .ttl') || {}).textContent || '',
    n: document.querySelectorAll('.exprow').length }));
  console.log(`   點摘要行 → 標題「${after.ttl}」／段標「${after.sec.trim()}」／${after.n} 列`);
  ok(after.ttl.includes('自己買的') || after.sec.includes('自己買的'), '點進去的頁面標題沒有「自己買的」');
  ok(after.n === srN, `那一頁 ${after.n} 列，摘要行說 ${srN} 筆`);
  void before;

  /* 8　每個人的金額也跟著變，而且沒有人變大 */
  const pers = async q => { await go(q); await p.click('.tot'); await new Promise(r => setTimeout(r, 260));
    return p.$$eval('.perrow', ns => ns.map(n => ({
      nm: n.querySelector('.nm').textContent.trim(),
      v: Number(n.querySelector('.money').textContent.replace(/[^\d-]/g, '')) }))); };
  const p0 = await pers('screen=s03'), p1 = await pers('screen=s03&onlyshared=1');
  const diffs = p0.map((x, i) => ({ nm: x.nm, a: x.v, b: p1[i].v }));
  console.log('   每人分擔：' + diffs.map(d => `${d.nm} ${d.a}→${d.b}`).join('｜'));
  ok(diffs.some(d => d.a !== d.b), '沒有任何一位成員的金額改變——篩選根本沒進到 per[]');
  ok(diffs.every(d => d.b <= d.a), '有人的金額變大了：' + diffs.filter(d => d.b > d.a).map(d => d.nm).join('、'));

  /* 9　「還沒算清楚」的 N 不受開關影響（反向） */
  const nUn = async q => { await go(q); return p.$eval('.unsettled', n => Number((n.textContent.match(/(\d+)/) || [])[1])); };
  const u0 = await nUn('screen=s03'), u1 = await nUn('screen=s03&onlyshared=1');
  console.log(`   還沒算清楚：關 ${u0} 筆｜開 ${u1} 筆`);
  ok(u0 === u1 && u0 > 0, `未定案入口跟著開關變了（${u0} → ${u1}）——等於開關可以把警告藏起來`);
  /* ⚠️ base 假資料裡自己買的兩筆**都填了金額**，所以上面那條把 unsettledList
     搬到篩選後面也照樣綠。`?selfpending=1` 多掛一筆自己買的、金額還沒填的，
     這條才真的在守東西。 */
  const g0 = await nUn('screen=s03&selfpending=1'), g1 = await nUn('screen=s03&selfpending=1&onlyshared=1');
  await go('screen=s03&selfpending=1');            const sp0 = await titles();
  await go('screen=s03&selfpending=1&onlyshared=1'); const sp1 = await titles();
  console.log(`   ?selfpending=1：還沒算清楚 關 ${g0}｜開 ${g1}｜` +
              `那一筆在清單上 關 ${sp0.some(t => t.includes('自己買的（還沒填）'))}／` +
              `開 ${sp1.some(t => t.includes('自己買的（還沒填）'))}`);
  ok(sp0.some(t => t.includes('自己買的（還沒填）')), '靶不見了：`?selfpending=1` 沒掛上那一筆');
  ok(!sp1.some(t => t.includes('自己買的（還沒填）')), '那一筆是自己買的，開關打開應該收起來');
  ok(g0 === u0 + 1, `?selfpending=1 應該多一筆未定案（${u0} → ${g0}）`);
  ok(g0 === g1, `未定案入口跟著開關變了（${g0} → ${g1}）——收起來的筆裡有未定案的就露餡了`);

  /* 10　幣別切換仍可用，外幣下恆等式也成立 */
  await go('screen=s03&rate=full&view=foreign');            const f0 = await totMoney();
  await go('screen=s03&rate=full&view=foreign&onlyshared=1'); const f1 = await totMoney(); const fsr = await sumRow();
  const fAmt = num((fsr.match(/·\s*\S+\s*[\d,]+/) || [''])[0]);
  console.log(`   外幣：總花費 ${f0}｜共同的帳 ${f1}｜摘要行 ${fsr}`);
  ok(/^[^\d\s$]/.test(f1.trim()) || f1.includes('₩'), `外幣視角沒顯示外幣符號（${f1}）`);
  ok(Math.abs((num(f0) - num(f1)) - fAmt) <= 1,
    `外幣下恆等式不成立：${num(f0)} − ${num(f1)} = ${num(f0) - num(f1)}，摘要行 ${fAmt}`);

  /* 11　X-2 兩個畫面對得起來（兩個狀態都要驗）
        ⚠️ **絕對值的恆等式現在就不成立，而且跟這一批無關**：`per[]` 把贊助
        **加** 12,500，`{名字} 的帳` 顯示的是 **−**12,500（實作-V-2 只修了顯示，
        `per[]` 的帳務語意要 Rozi 拍板，這一節明文不准動）。四位成員的落差
        一律是 2 × 贊助分擔＝25,000。
        所以這裡驗的是**開關有沒有讓兩邊各走各的**：
        ① 落差在開與關兩個狀態下必須一樣（開關沒有製造新的落差）
        ② 開關造成的變化量兩邊必須相等。任一條破了就是 X-2 沒做到。 */
  const perRow = async (q, i) => {
    await go(`screen=s03${q}`); await p.click('.tot'); await new Promise(r => setTimeout(r, 250));
    return p.$$eval('.perrow', ns => ns.map(n => Number(n.querySelector('.money').textContent.replace(/[^\d-]/g, ''))))
            .then(v => v[i]);
  };
  const segSum = async (q, i) => {
    await go(`screen=s03&member=${i}${q}`);
    return p.$$eval('[data-seg-sum]', ns => ns.reduce((a, n) => a + Number(n.dataset.segSum), 0));
  };
  const gaps = [];
  for (let i = 0; i < 4; i++) {
    const a0 = await perRow('', i), s0 = await segSum('', i);
    const a1 = await perRow('&onlyshared=1', i), s1 = await segSum('&onlyshared=1', i);
    gaps.push({ i, a0, s0, a1, s1 });
    console.log(`   成員 ${i}：關 統計卡 ${a0} vs 三段 ${s0}（差 ${a0 - s0}）｜` +
                `開 統計卡 ${a1} vs 三段 ${s1}（差 ${a1 - s1}）`);
    ok((a0 - s0) === (a1 - s1),
      `成員 ${i}：開關製造了新的落差（關差 ${a0 - s0}／開差 ${a1 - s1}）——X-2 沒做到`);
    ok((a0 - a1) === (s0 - s1),
      `成員 ${i}：統計卡少了 ${a0 - a1}，三段卻少了 ${s0 - s1}——兩個畫面各走各的`);
  }
  ok(gaps.some(g => g.a0 !== g.a1 || g.s0 !== g.s1),
    '四位成員在開與關之下數字完全一樣——這條等於沒驗（篩選沒生效）');

  /* 12　結算完全不受影響（反向） */
  const tx = async q => { await go(q); return p.$$eval('.txrow', ns => ns.map(n => n.textContent.replace(/\s+/g, ' ').trim())); };
  const x0 = await tx('screen=s05'), x1 = await tx('screen=s05&onlyshared=1');
  console.log(`   結算：${x0.length} 列｜逐字相同 ${JSON.stringify(x0) === JSON.stringify(x1)}`);
  ok(x0.length > 0, '結算頁一列都沒有，這條等於沒驗');
  ok(JSON.stringify(x0) === JSON.stringify(x1), '結算被開關影響了');

  /* 13　記憶：同一趟記住、換一趟回到預設 */
  await p.evaluate(() => localStorage.clear());
  await go('screen=s03');
  ok(await p.$eval('.swchip', n => n.getAttribute('aria-pressed')) === 'false', '清掉記憶後預設不是關');
  await p.click('.swchip'); await new Promise(r => setTimeout(r, 260));
  const afterClick = await p.$eval('.swchip', n => n.getAttribute('aria-pressed'));
  await go('screen=s03');
  const remembered = await p.$eval('.swchip', n => n.getAttribute('aria-pressed'));
  await go('screen=s03&tripid=t2');
  const otherTrip = await p.$eval('.swchip', n => n.getAttribute('aria-pressed'));
  console.log(`   記憶：按下後 ${afterClick}｜重載同一趟 ${remembered}｜換一趟 ${otherTrip}`);
  ok(afterClick === 'true', '按了開關沒有變成開');
  ok(remembered === 'true', '重新載入同一趟沒有記住');
  ok(otherTrip === 'false', '換一趟行程卻沿用了上一趟的選擇');
  await p.evaluate(() => localStorage.clear());

  /* 14　可點區 */
  await go('screen=s03&onlyshared=1');
  for (const sel of ['.swchip', '.selfsum']) {
    const r = await p.evaluate(q => {
      const el = document.querySelector(q); if (!el) return null;
      /* 底部有 `.btnrow.sticky` 蓋著——先捲到畫面中間再量，
         不然量到的是「被主鈕蓋住」而不是「可點區不夠」。 */
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return { w: b.width, h: b.height, self: !!hit && (hit === el || el.contains(hit)) };
    }, sel);
    console.log(`   ${sel.padEnd(10)} ${r && Math.round(r.w)}×${r && Math.round(r.h)}｜中心命中自己 ${r && r.self}`);
    ok(r !== null, `找不到 ${sel}，這條等於沒驗`);
    ok(r.h >= 44 || (r.h >= 34 && r.w * r.h >= 1600), `${sel} 的可點區不足（${Math.round(r.w)}×${Math.round(r.h)}）`);
    ok(r.self, `${sel} 的中心點被別的東西蓋住`);
  }

  /* 15　不橫向捲動（會捲的容器都要量，不是只量最外層） */
  for (const w of [320, 390, 414]) {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    await go('screen=s03&onlyshared=1');
    const r = await p.evaluate(() => {
      const d = document.documentElement;
      const over = [...document.querySelectorAll('body *')]
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 0.5)
        .map(el => (el.className || '').toString().slice(0, 18));
      const scr = [...document.querySelectorAll('body *')]
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => (el.className || '').toString().slice(0, 18));
      return { doc: d.scrollWidth <= d.clientWidth, over: over.slice(0, 3), nOver: over.length,
               scr: scr.slice(0, 3), nScr: scr.length };
    });
    console.log(`   ${w}px：文件不捲 ${r.doc}｜凸出 ${r.nOver}${r.nOver ? '（' + r.over.join('、') + '）' : ''}` +
                `｜自己會捲 ${r.nScr}${r.nScr ? '（' + r.scr.join('、') + '）' : ''}`);
    ok(r.doc, `${w}px 文件橫向捲動`);
    ok(r.nOver === 0, `${w}px 有 ${r.nOver} 個元素凸出視窗右緣`);
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  /* 16　全部都是自己買的 → 清單空了要有一句話 */
  await go('screen=s03&expenses=allself&onlyshared=1');
  const empty = await p.evaluate(() => ({
    rows: document.querySelectorAll('.exprow').length,
    txt: (document.querySelector('.empty') || {}).textContent || '',
    sum: !!document.querySelector('.selfsum') }));
  console.log(`   全部自己買：${empty.rows} 列｜空狀態「${empty.txt.trim()}」｜有摘要行 ${empty.sum}`);
  ok(empty.rows === 0, `?expenses=allself 開關打開後還有 ${empty.rows} 列`);
  ok(empty.txt.trim().length > 0, '清單空了卻是一片空白，沒有說為什麼');
  ok(!empty.txt.includes('第一筆從哪裡開始'), '空狀態拿「還沒開始記帳」的文案來充數——那是在說謊');
  ok(empty.sum, '清單空了卻連摘要行都沒有，錢就真的不見了');

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
