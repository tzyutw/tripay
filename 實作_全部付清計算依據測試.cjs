/* 收尾-AH　S-05「帳算清楚了」（全部付清）也要看得到「查看計算依據」。
   由來：Rozi 2026-09-11 走驗收時問「標記付清頁沒辦法再看到當初結算的細節嗎？」
   三個 pageState 只有兩個掛了那顆按鈕，而分享頁不分狀態一直看得到——
   **旅伴看得到，記帳的本人反而看不到。** */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist-harness');
const MEMBERS = 4;                      // fixtures 的 NAMES = Alex／Robin／Sam／Kai
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

/* 「查看計算依據」那顆按鈕的可點區。
   ⚠️ 量之前一定要 `scrollIntoView({block:'center'})`——底部按鈕列會蓋住它，
   量到被蓋住的 rect 就是假紅（2026-09-07 造成 7 個假紅）。 */
const tapOf = () => {
  const b = document.querySelector('.detailtoggle');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
};

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  const go = async (q, w = 390) => {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => !document.querySelector('.spin'), { timeout: 8000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 250));
  };

  console.log('\n收尾-AH　全部付清也看得到計算依據\n');

  // ── 停止條件 1　守門：done 這一頁開得起來 ──────────────────────────────
  await go('screen=s05&state=done');
  const doneTxt = await p.evaluate(() => document.body.innerText);
  ok(doneTxt.includes('帳算清楚了'),
     `守門沒過：?state=done 進不到「帳算清楚了」那一頁（實際開頭：${doneTxt.slice(0, 40).replace(/\n/g, '⏎')}）`);
  if (!doneTxt.includes('帳算清楚了')) {
    console.log('\n   守門條件沒過，後面全部不算數。\n');
    await b.close(); srv.close(); process.exit(1);
  }

  // ── 停止條件 2　該頁看得到「查看計算依據」 ──────────────────────────────
  ok(doneTxt.includes('查看計算依據'), '「帳算清楚了」那一頁找不到「查看計算依據」');

  // 版位：排在「誰付給誰」之後、「分享給大家」之前（與另外兩態一致）
  const order = await p.evaluate(() => {
    const t = [...document.querySelectorAll('.detailtoggle')][0];
    const who = [...document.querySelectorAll('.lbl')].find(x => x.textContent.trim() === '誰付給誰');
    const sh = [...document.querySelectorAll('.btn')].find(x => x.textContent.trim() === '分享給大家');
    if (!t || !who || !sh) return null;
    return { afterWho: !!(who.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING),
             beforeShare: !!(t.compareDocumentPosition(sh) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  ok(order !== null, '量不到版位（按鈕／「誰付給誰」／分享 CTA 有一個找不到）——這條等於沒驗');
  ok(order && order.afterWho && order.beforeShare,
     `版位不對：在「誰付給誰」之後=${order && order.afterWho}、在「分享給大家」之前=${order && order.beforeShare}`);

  // ── 停止條件 3　展開後每人一張卡 ───────────────────────────────────────
  const cards = await p.evaluate(() => {
    const t = document.querySelector('.detailtoggle');
    if (!t) return null;
    t.click();
    return document.querySelectorAll('.netcard').length;
  });
  await new Promise(r => setTimeout(r, 200));
  const cards2 = await p.$$eval('.netcard', n => n.length);
  ok(cards !== null, '找不到「查看計算依據」按鈕，點不下去——這條等於沒驗');
  ok(cards2 === MEMBERS, `展開後每人卡片 ${cards2} 張，應為成員數 ${MEMBERS}`);

  // ── 停止條件 4　「誰付給誰」逐列金額 == SettleBreakdown 收到的 txNow ────
  const money = await p.evaluate(() => {
    const fld = [...document.querySelectorAll('.fld')]
      .find(f => f.querySelector('.lbl') && f.querySelector('.lbl').textContent.trim() === '誰付給誰');
    if (!fld) return null;
    const top = [...fld.querySelectorAll('.rowb .money')].map(x => x.textContent.trim());
    // 每一筆轉帳在「付的人」與「收的人」兩張卡各出現一次，所以應該剛好是 top 的兩倍
    const inner = [...document.querySelectorAll('.netcard .netwho .money')].map(x => x.textContent.trim());
    return { top, inner };
  });
  ok(money !== null && money.top.length > 0,
     '抓不到「誰付給誰」的金額列——這條等於沒驗（不是通過）');
  if (money && money.top.length) {
    const sorted = a => [...a].sort();
    const expect = sorted([...money.top, ...money.top]);
    const actual = sorted(money.inner);
    console.log(`   「誰付給誰」${money.top.length} 列：${money.top.join('／')}`);
    console.log(`   卡片內轉帳列 ${money.inner.length} 筆：${money.inner.join('／')}`);
    ok(expect.length === actual.length && expect.every((x, i) => x === actual[i]),
       `逐筆對不上——上面 ${JSON.stringify(expect)} vs 卡片內 ${JSON.stringify(actual)}`);
  }

  // ── 停止條件 7　三個狀態下按鈕可點區都夠大 ─────────────────────────────
  const STATES = [['screen=s05', 'pending 未結算'],
                  ['screen=s05&state=settled', 'partial 逐筆付清'],
                  ['screen=s05&state=done', 'done 全部付清']];
  for (const [q, label] of STATES) {
    await go(q);
    const txt = await p.evaluate(() => document.body.innerText);
    // ── 停止條件 5　反向回歸：另外兩態仍然看得到 ──
    ok(txt.includes('查看計算依據'), `${label} 看不到「查看計算依據」（反向回歸退步了）`);
    const tap = await p.evaluate(tapOf);
    ok(tap !== null, `${label} 找不到 .detailtoggle，可點區這條等於沒驗`);
    if (tap) {
      const good = tap.h >= 44 || (tap.h >= 34 && tap.w * tap.h >= 1600);
      ok(good, `${label} 可點區 ${tap.w}×${tap.h}（面積 ${tap.w * tap.h}），不符 h≥44 或（h≥34 且面積≥1600）`);
      console.log(`   ${label}：可點區 ${tap.w}×${tap.h}`);
    }
  }

  // ── 停止條件 9　三個寬度都不橫向捲動（含頁內會捲的容器） ────────────────
  for (const w of [320, 390, 430]) {
    await go('screen=s05&state=done', w);
    await p.evaluate(() => { const t = document.querySelector('.detailtoggle'); if (t) t.click(); });
    await new Promise(r => setTimeout(r, 200));
    const of = await p.evaluate(() => {
      const bad = [];
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth) bad.push(`document ${de.scrollWidth}>${de.clientWidth}`);
      // 只量最外層不夠：跑版常常發生在頁內自己會捲的容器裡（2026-09-05 的教訓）
      for (const el of document.querySelectorAll('*')) {
        const st = getComputedStyle(el);
        if (!/auto|scroll/.test(st.overflowX + st.overflow)) continue;
        if (el.scrollWidth > el.clientWidth + 1)
          bad.push(`${el.className || el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
      }
      return bad;
    });
    ok(of.length === 0, `${w}px 有橫向捲動：${of.join('｜')}`);
  }

  ok(errs.length === 0, `主控台有例外：${errs.join('｜')}`);

  await b.close(); srv.close();
  console.log(`\n   通過 ${pass}／失敗 ${fail}\n`);
  process.exit(fail ? 1 : 0);
})();
