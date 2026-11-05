/* R-10（2026-11 產品負責人拍板）　記一筆的「一起分」0 人提示——真實 Chrome。
 *   1 把一起分全部取消勾選 → 參與者下方出現提示與「改成只算一個人」
 *   2 按鈕可點區高度 ≥ 44px（量 border box，含 .ratelink 的內距）
 *   3 重新勾一人 → 提示消失
 *   4 按「改成只算一個人」→ 切過去、一定有人被選
 *   5 320／375／414 寬都不得整頁或 sheet 橫向捲動
 *   6 0 人時名單固定展開、不給收合鈕；按「記下來」→ 擋下、提示閃一下、在「記下來」上方看得到
 * 執行：npx vite build --mode harness && CHROME_PATH=… node 實作_R10零人提示測試.cjs
 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist-harness');
const SHOT = process.env.SHOT_DIR || '';
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  console.log('\n=== R-10　一起分 0 人提示 ===\n');

  for (const w of [320, 375, 414]) {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    await p.goto(`${BASE}/harness.html?screen=s04`, { waitUntil: 'networkidle0' });
    await sleep(320);
    const clickText = t => p.evaluate(t => {
      const el = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t);
      if (el) el.click(); return !!el; }, t);
    ok(await clickText('要排除誰？'), `@${w} 找不到「要排除誰？」`);
    await sleep(80);
    const nRows = await p.evaluate(() => document.querySelectorAll('button.rowb').length);
    ok(nRows >= 2, `@${w} 名單只有 ${nRows} 列，後面的斷言會空跑`);
    const before = await p.evaluate(() => !!document.querySelector('[data-testid="noparts"]'));
    ok(!before, `@${w} 還有人勾著就出現提示`);
    /* 逐一取消勾選（rowb.on → 點掉） */
    for (let i = 0; i < nRows; i++) {
      await p.evaluate(() => { const r = document.querySelector('button.rowb.on'); if (r) r.click(); });
      await sleep(40);
    }
    const m = await p.evaluate(() => {
      const h = document.querySelector('[data-testid="noparts"]');
      if (!h) return null;
      const btn = [...h.querySelectorAll('button')].find(x => x.textContent.trim() === '改成只算一個人');
      const rows = [...document.querySelectorAll('button.rowb')];
      const last = rows[rows.length - 1].getBoundingClientRect();
      const hr = h.getBoundingClientRect();
      const br = btn && btn.getBoundingClientRect();
      /* 按鈕的可點區不可以蓋到提示文字（負外距撐出來的那一圈） */
      const txt = h.querySelector('.notebody').firstChild;
      const range = document.createRange(); range.selectNodeContents(txt);
      const tr = range.getBoundingClientRect();
      const sheet = document.querySelector('.overflow-y-auto') || document.body;
      return { text: h.textContent.trim(), btn: !!btn, bh: br && br.height, bw: br && br.width,
               below: hr.top >= last.bottom - 1, overlap: br ? Math.max(0, tr.bottom - br.top) : null,
               docOver: document.documentElement.scrollWidth > document.documentElement.clientWidth,
               sheetOver: sheet.scrollWidth > sheet.clientWidth,
               dialog: !!document.querySelector('[role=dialog], .dlgwrap') };
    });
    console.log(`   @${w} 提示：${m ? `「${m.text}」` : '(沒有)'}｜按鈕 ${m && m.bw}×${m && m.bh}｜在名單下方 ${m && m.below}｜蓋到字 ${m && m.overlap}px`);
    ok(m, `@${w} 0 人時沒有出現提示`);
    if (m) {
      ok(m.text.includes('一個人都沒勾。這筆只算某一個人的話：'), `@${w} 文案不對：${m.text}`);
      ok(m.btn, `@${w} 沒有「改成只算一個人」按鈕`);
      ok(m.bh >= 44, `@${w} 按鈕可點區只有 ${m.bh}px 高，應 ≥ 44`);
      ok(m.below, `@${w} 提示不在參與者名單下方`);
      ok(m.overlap !== null && m.overlap <= 0.5, `@${w} 按鈕可點區蓋到提示文字 ${m.overlap}px`);
      ok(!m.dialog, `@${w} 不該彈出視窗`);
      ok(!m.docOver && !m.sheetOver, `@${w} 橫向捲動：頁面 ${m.docOver}／sheet ${m.sheetOver}`);
    }
    if (SHOT && w === 375) {
      await p.evaluate(() => document.querySelector('[data-testid="noparts"]').scrollIntoView({ block: 'center' }));
      await sleep(100);
      await p.screenshot({ path: path.join(SHOT, `r10_零人提示_${w}.png`) });
    }

    /* 2b 0 人時名單固定展開、沒有「要排除誰？」；按「記下來」→ 擋下、提示閃一下、落在「記下來」上方 */
    await p.evaluate(() => { const z = [...document.querySelectorAll('.fld')].find(x => x.textContent.includes('誰付的？'));
      const c = z && z.querySelector('.chip'); if (c && !c.classList.contains('on')) c.click(); });
    await sleep(60);
    const noExpand = await p.evaluate(() => !document.querySelector('.expandbtn'));
    await clickText('記下來'); await sleep(120);
    const blk = await p.evaluate(() => {
      const h = document.querySelector('[data-testid="noparts"]'), f = document.querySelector('.btnrow');
      if (!h || !f) return null;
      const hr = h.getBoundingClientRect(), fr = f.getBoundingClientRect();
      return { rows: document.querySelectorAll('button.rowb').length, nudge: h.classList.contains('nudge'),
               bg: getComputedStyle(h).backgroundColor, top: hr.top, bottom: hr.bottom, footer: fr.top,
               over: (document.querySelector('.overflow-y-auto') || document.body).scrollWidth
                   > (document.querySelector('.overflow-y-auto') || document.body).clientWidth };
    });
    console.log(`   @${w} 0 人按記下來 → 收合鈕 ${noExpand ? '無' : '有'}｜名單 ${blk && blk.rows} 列｜閃 ${blk && blk.nudge}（${blk && blk.bg}）｜提示 ${blk && Math.round(blk.top)}–${blk && Math.round(blk.bottom)}，記下來在 ${blk && Math.round(blk.footer)}`);
    ok(noExpand, `@${w} 0 人時還有「要排除誰？／收起」`);
    ok(blk && blk.rows >= 2, `@${w} 0 人時名單沒有展開，看不到可以勾的人`);
    ok(blk && blk.nudge && blk.bg !== 'rgba(0, 0, 0, 0)', `@${w} 擋下時提示沒有閃（畫面毫無變化）`);
    ok(blk && blk.top >= 0 && blk.bottom <= blk.footer, `@${w} 擋下後提示不在可見區`);
    ok(blk && !blk.over, `@${w} 閃的時候 sheet 橫向溢出`);

    /* 3 重新勾一人 → 消失 */
    await p.evaluate(() => document.querySelector('button.rowb').click());
    await sleep(60);
    const gone = await p.evaluate(() => !document.querySelector('[data-testid="noparts"]'));
    ok(gone, `@${w} 重新勾一人後提示還在`);

    /* 4 再取消一次 → 按「改成只算一個人」→ 一定有人 */
    await p.evaluate(() => { const r = document.querySelector('button.rowb.on'); if (r) r.click(); });
    await sleep(60);
    ok(await clickText('改成只算一個人'), `@${w} 第二次取消勾選後沒有按鈕可按`);
    await sleep(80);
    const after = await p.evaluate(() => {
      const tab = [...document.querySelectorAll('[role=tab]')].find(x => x.textContent.trim() === '只算一個人');
      const fld = [...document.querySelectorAll('.fld')].find(x => x.textContent.includes('算誰的？'));
      return { sel: tab && tab.getAttribute('aria-selected'),
               on: fld ? fld.querySelectorAll('.chip.on').length : -1,
               hint: !!document.querySelector('[data-testid="noparts"]') };
    });
    console.log(`   @${w} 改成只算一個人 → 分頁選中 ${after.sel}｜選中 ${after.on} 人｜提示 ${after.hint}`);
    ok(after.sel === 'true', `@${w} 沒切到「只算一個人」`);
    ok(after.on === 1, `@${w} 「算誰的？」選中 ${after.on} 人，應恰好 1 人`);
    ok(!after.hint, `@${w} 切過去之後提示還在`);
  }

  await b.close(); srv.close();
  console.log(`\n   ${pass} 過 ／ ${fail} 未過\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
