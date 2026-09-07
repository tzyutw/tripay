/* 實作-W　已結算不標「約」（W-1／1b）＋320px 結算列（W-2）＋分享頁點得進成員的帳（W-3）。 */
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
  const nApprox = () => p.$$eval('.approx', ns => ns.length);
  const text = () => p.evaluate(() => document.body.innerText);

  console.log('\n=== 批 W　約／320px 結算列／分享頁 ===\n');

  /* 1／2　W-1 */
  await go('screen=s03');            const a0 = await nApprox();
  await go('screen=s03&state=settled');  const a1 = await nApprox();
  await go('screen=s03&state=archived'); const a2 = await nApprox();
  console.log(`   S-03 的「約」：進行中 ${a0}｜已結算 ${a1}｜已封存 ${a2}`);
  ok(a0 === 2, `進行中應該有 2 顆「約」（統計卡 1 ＋ 消費列 1），實際 ${a0}——靶不見了`);
  ok(a1 === 0, `已結算還有 ${a1} 顆「約」，違反 §5.6`);
  ok(a2 === 0, `已封存還有 ${a2} 顆「約」，違反 §5.6`);

  /* 3　W-1 反向：邊框要留著 */
  /* 指令點名「藥妝店」，但那一列的左邊框是**一般的 --ln**——拿它比對，
     §5.4 的橘紅框整條被拿掉也照樣綠。所以改成：先找出**真的有異色左邊框**的那幾列
     （那才是 §5.4 在標的），確認至少有一列，再逐列逐字比對兩個狀態。 */
  const borders = async q => { await go(q); return p.evaluate(() => {
    const base = getComputedStyle(document.documentElement).getPropertyValue('--ln').trim();
    return [...document.querySelectorAll('.exprow')].map(n => {
      const cs = getComputedStyle(n);
      return { t: (n.querySelector('.t') || {}).textContent || '',
               c: cs.borderLeftColor, w: cs.borderLeftWidth, base };
    });
  }); };
  const B0 = await borders('screen=s03'), B1 = await borders('screen=s03&state=settled');
  const toRgb = h => { const m = h.replace('#', ''); return `rgb(${parseInt(m.slice(0,2),16)}, ${parseInt(m.slice(2,4),16)}, ${parseInt(m.slice(4,6),16)})`; };
  const plain = B0.length ? toRgb(B0[0].base) : '';
  const marked0 = B0.filter(x => x.c !== plain), marked1 = B1.filter(x => x.c !== plain);
  console.log(`   §5.4 異色左邊框：進行中 ${marked0.length} 列` +
              `（${marked0.map(x => x.t + ' ' + x.w + ' ' + x.c).join('、') || '無'}）｜已結算 ${marked1.length} 列`);
  ok(B0.length > 0, '找不到任何消費列，這條等於沒驗');
  ok(marked0.length > 0, `進行中一列異色左邊框都沒有（--ln＝${plain}）——沒有靶，這條驗不到東西`);
  ok(JSON.stringify(marked0.map(x => [x.t, x.c, x.w])) === JSON.stringify(marked1.map(x => [x.t, x.c, x.w])),
    '§5.4 的橘紅左邊框被一起拿掉了（§5.6 只列了三件事，邊框不在裡面）');

  /* 4　W-1 反向：未定案入口 */
  await go('screen=s03&state=settled');
  const t4 = await text();
  ok(!t4.includes('還沒算清楚'), '已結算的畫面出現了「還沒算清楚」');

  /* 5／6　W-1b 分享頁 */
  /* ⚠️ 要讀 **rpc 真正端出去的那一份**（`__RPC_TRIP__`），不是
     `__HARNESS_FIXTURE__.trip`——後者一律是套用過 `?state=` 的 `rows.trips[0]`，
     rpc 回原始 trip 時它照樣顯示 settled，這條就變成在量別人。 */
  const shareStatus = async q => { await go(q); return p.evaluate(() =>
    (window.__RPC_TRIP__ || {}).status); };
  const st1 = await shareStatus('screen=s06&state=settled');
  await go('screen=s06&state=settled'); const s6a = await nApprox();
  await go('screen=s06');               const s6b = await nApprox();
  console.log(`   分享頁：state=settled 的 trip.status「${st1}」｜「約」已結算 ${s6a}／進行中 ${s6b}`);
  ok(st1 === 'settled', `量測靶端給分享頁的行程狀態還是「${st1}」——rpc 沒套用 ?state=`);
  ok(s6a === 0, `分享頁看到已結算的行程還有 ${s6a} 顆「約」`);
  ok(s6b === 2, `分享頁進行中應該有 2 顆「約」，實際 ${s6b}——反向靶不見了`);

  /* 7／8／9／10　W-2 */
  console.log('');
  const heights = {};
  for (const w of [320, 390, 414]) {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    await go('screen=s05&state=settled');
    const r = await p.evaluate(() => {
      const d = document.documentElement;
      const over = [...document.querySelectorAll('body *')]
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map(el => `${el.tagName}.${(el.className || '').toString().slice(0, 14)}@${Math.round(el.getBoundingClientRect().right)}`);
      const btn = document.querySelector('.clearbtn');
      let hit = null;
      if (btn) {
        const bb = btn.getBoundingClientRect();
        const af = getComputedStyle(btn, '::after');
        const hh = Math.max(bb.height, parseFloat(af.height) || 0);
        const hw = Math.max(bb.width, parseFloat(af.width) || 0);
        const el = document.elementFromPoint(Math.round(bb.left + bb.width / 2), Math.round(bb.top + bb.height / 2));
        hit = { h: hh, w: hw, self: !!el && (el === btn || btn.contains(el) || btn === el.parentElement) };
      }
      const rowH = document.querySelector('.txrow') ? document.querySelector('.txrow').getBoundingClientRect().height : null;
      const avs = [...document.querySelectorAll('.txrow .avatar')].map(a => a.getBoundingClientRect().width);
      return { doc: d.scrollWidth, cli: d.clientWidth, over: over.slice(0, 3), nOver: over.length,
               btn: hit, rowH, avMin: avs.length ? Math.min(...avs) : null, avN: avs.length };
    });
    heights[w] = r.rowH;
    console.log(`   ${w}px：scrollWidth ${r.doc}/${r.cli}｜凸出 ${r.nOver}${r.nOver ? '（' + r.over.join('、') + '）' : ''}` +
                `｜clearbtn ${r.btn && Math.round(r.btn.w)}×${Math.round(r.btn.h)} 命中 ${r.btn && r.btn.self}` +
                `｜txrow 高 ${r.rowH}｜avatar ${r.avN} 顆，最窄 ${r.avMin}`);
    ok(r.doc <= r.cli + 1, `${w}px 可以往旁邊拉（${r.doc} > ${r.cli}）`);
    ok(r.nOver === 0, `${w}px 有 ${r.nOver} 個元素凸出視窗右緣`);
    ok(r.btn !== null, `${w}px 找不到 .clearbtn，第 8／10 條等於沒驗`);
    ok(r.btn.h >= 44 || (r.btn.h >= 34 && r.btn.w * r.btn.h >= 1600),
      `${w}px 的 .clearbtn 可點區不足（${Math.round(r.btn.w)}×${Math.round(r.btn.h)}）`);
    ok(r.btn.self, `${w}px 的 .clearbtn 中心點被別的東西蓋住`);
    ok(r.avN > 0, `${w}px 的 .txrow 裡一顆 avatar 都沒有，第 9 條等於沒驗`);
    ok(r.avMin >= 20, `${w}px 有 avatar 被壓扁（最窄 ${r.avMin}）`);
  }
  ok(heights[390] !== null && heights[390] <= 46,
    `390px 的 .txrow 變成兩行了（高 ${heights[390]}）——那就是選錯方案`);
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  /* 12／19　W-3 成員列點得到 */
  console.log('');
  await go('screen=s06');
  await p.click('.tot'); await new Promise(r => setTimeout(r, 260));
  const rows = await p.$$eval('.perrow', ns => ns.map(n => ({
    tag: n.tagName, ro: n.classList.contains('ro'), cur: getComputedStyle(n).cursor })));
  const foot = await p.$eval('.foot', n => n.textContent.trim()).catch(() => '');
  console.log(`   分享頁成員列：${rows.map(r => `${r.tag}${r.ro ? '.ro' : ''}/${r.cur}`).join('　')}｜註腳「${foot}」`);
  ok(rows.length > 0, '分享頁展不開每人分擔列，第 12 條等於沒驗');
  ok(rows.every(r => r.tag === 'BUTTON'), '成員列還是 DIV，點不進去');
  ok(rows.every(r => !r.ro), '成員列還帶著 ro');
  ok(rows.every(r => r.cur === 'pointer'), '成員列的 cursor 不是 pointer');
  ok(foot === '點名字看這個人的帳是怎麼算出來的', `分享頁的註腳是「${foot}」`);

  /* 13　點下去真的到得了 */
  await p.click('.perrow'); await new Promise(r => setTimeout(r, 340));
  const landed = await p.evaluate(() => ({
    ttl: (document.querySelector('.bar .ttl') || {}).textContent || '',
    n: document.querySelectorAll('.exprow').length }));
  console.log(`   點第一顆 → 標題「${landed.ttl}」／${landed.n} 列`);
  ok(landed.ttl.includes('的帳'), '點下去沒有到「{名字} 的帳」');
  ok(landed.n >= 1, '到了但一列都沒有');

  /* 14／15　唯讀（A9） */
  await go('screen=s06&member=0');
  const ro = await p.evaluate(() => ({
    tags: [...document.querySelectorAll('.exprow')].map(n => n.tagName),
    inputs: document.querySelectorAll('input, textarea, select').length,
    txt: document.body.innerText }));
  console.log(`   ?screen=s06&member=0：${ro.tags.length} 列（${[...new Set(ro.tags)].join('/')}）｜輸入欄位 ${ro.inputs}`);
  ok(ro.tags.length > 0, '這一頁一列都沒有，第 14 條等於沒驗');
  ok(ro.tags.every(t => t === 'DIV'), `有 ${ro.tags.filter(t => t !== 'DIV').length} 列是 BUTTON——A9 破了`);
  ok(ro.inputs === 0, `這一頁有 ${ro.inputs} 個輸入欄位`);
  for (const bad of ['編輯', '刪除', '記一筆', '記下來', '儲存'])
    ok(!ro.txt.includes(bad), `唯讀頁出現「${bad}」`);
  const before15 = await p.$$eval('.exprow', ns => ns.length);
  for (let i = 0; i < Math.min(3, before15); i++) {
    await p.evaluate(i => document.querySelectorAll('.exprow')[i].click(), i);
    await new Promise(r => setTimeout(r, 1000));
    const t = await text();
    ok(!t.includes('記下來'), `點第 ${i + 1} 列開出了表單`);
  }

  /* 16　三段結構與自己那邊同一套 */
  const segsOf = async q => { await go(q); return p.$$eval('[data-seg-sum]', ns => ns.map(n => ({
    seg: n.dataset.seg, n: n.dataset.segN, sum: Number(n.dataset.segSum),
    ttl: n.querySelector('.sec span').textContent.trim() }))); };
  const own = await segsOf('screen=s03&member=0'), shr = await segsOf('screen=s06&member=0');
  console.log(`   三段：S-03 ${own.map(x => x.ttl + '(' + x.n + ')').join('、')}` +
              `｜S-06 ${shr.map(x => x.ttl + '(' + x.n + ')').join('、')}`);
  ok(own.length > 0, 'S-03 的成員頁一段都沒有，第 16 條等於沒驗');
  ok(JSON.stringify(own.map(x => [x.seg, x.ttl, x.n])) === JSON.stringify(shr.map(x => [x.seg, x.ttl, x.n])),
    '兩邊的三段結構不同');
  ok(JSON.stringify(own.map(x => x.sum)) === JSON.stringify(shr.map(x => x.sum)),
    '兩邊的小計不同——分享頁另算了一套');

  /* 17　金額對得起來
     ⚠️ 絕對值的恆等式現在就不成立，而且**跟這一批無關**：`per[]` 把贊助加
        12,500、成員頁顯示 −12,500，四位成員一律差 25,000（實作-V-2 只修顯示，
        `per[]` 的帳務語意要 Rozi 拍板，本節明文不准動）。
        所以驗的是「分享頁與自己那一頁的落差**一模一樣**」——分享頁沒有另算一套。 */
  await go('screen=s06'); await p.click('.tot'); await new Promise(r => setTimeout(r, 250));
  const shrPer = await p.$eval('.perrow', n => Number(n.querySelector('.money').textContent.replace(/[^\d-]/g, '')));
  await go('screen=s03'); await p.click('.tot'); await new Promise(r => setTimeout(r, 250));
  const ownPer = await p.$eval('.perrow', n => Number(n.querySelector('.money').textContent.replace(/[^\d-]/g, '')));
  const ownSum = own.reduce((a, x) => a + x.sum, 0), shrSum = shr.reduce((a, x) => a + x.sum, 0);
  console.log(`   成員 0：S-03 統計卡 ${ownPer} vs 三段 ${ownSum}（差 ${ownPer - ownSum}）｜` +
              `S-06 統計卡 ${shrPer} vs 三段 ${shrSum}（差 ${shrPer - shrSum}）`);
  ok(shrPer === ownPer && shrSum === ownSum, '分享頁與自己那一頁的數字對不起來');
  ok((ownPer - ownSum) === (shrPer - shrSum),
    `分享頁製造了新的落差（自己 ${ownPer - ownSum}／分享 ${shrPer - shrSum}）`);

  /* 18　文案 */
  await go('screen=s06&member=0'); const t18 = await text();
  const nm = await p.$eval('.bar .ttl', n => n.textContent.replace(' 的帳', '').trim());
  console.log(`   文案：含「你付的」${t18.includes('你付的')}｜含「${nm}付的」${t18.includes(nm + '付的')}`);
  ok(!t18.includes('你付的'), '分享頁出現「你付的」——觀看者不是任何一位成員');
  ok(t18.includes(nm + '付的'), `分享頁沒有出現「${nm}付的」`);
  await go('screen=s03&member=0'); const t18b = await text();
  ok(t18b.includes('你付的'), '自己那一邊的「你付的」被順手改掉了（這一輪不准動）');

  /* 20　返回 */
  await go('screen=s06&member=0');
  const back = await p.evaluate(() => {
    const el = document.querySelector('.bar .ic2'); if (!el) return null;
    const r = el.getBoundingClientRect();
    const af = getComputedStyle(el, '::after');
    const h = Math.max(r.height, parseFloat(af.height) || 0), w = Math.max(r.width, parseFloat(af.width) || 0);
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return { w, h, self: !!hit && (hit === el || el.contains(hit)) };
  });
  console.log(`   返回鍵 ${back && Math.round(back.w)}×${Math.round(back.h)}｜命中自己 ${back && back.self}`);
  ok(back !== null, '找不到返回鍵，第 20 條等於沒驗');
  ok(back.w >= 44 && back.h >= 44, `返回鍵可點區 ${Math.round(back.w)}×${Math.round(back.h)} 不足 44`);
  ok(back.self, '返回鍵中心點被蓋住');
  await p.click('.bar .ic2'); await new Promise(r => setTimeout(r, 340));
  const t20 = await text();
  ok(t20.includes('誰付給誰'), '按了返回沒有回到分享頁');

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
