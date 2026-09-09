/* 實作-登　登入失敗要說話（登-1）＋隱私權政策／服務條款（登-2／3）＋掛進量測靶（登-4）。
 *
 * ⚠️ 這一支**同時用兩份建置**：
 *   - `dist-harness`：量測靶，量版面與可點區
 *   - `/tmp/dPROD`（正式模式，含 404.html）：**只有它驗得到「未登入直接開 /privacy
 *     不會被 AuthLayout 轉去 /login」**。量測靶是 MemoryRouter ＋ 單一畫面掛載，
 *     根本沒有 AuthLayout，那兩條在上面永遠是綠的——那是假通過。
 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HARNESS = path.resolve('dist-harness');
const PROD = '/tmp/dPROD';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
               '.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.ico':'image/x-icon' };
/** `spa`＝找不到檔案時回 404.html（比照 GitHub Pages 的 fallback，deploy.yml 第 41 行）。
 *  ⚠️ 正式模式的 `base` 是 **`/tripay/`**（`vite.config.ts:20`），
 *     `BrowserRouter` 的 `basename` 也是它——**掛在 `/` 底下的話什麼都不會 render**
 *     （pathname 對、畫面全空，看起來像頁面壞掉，其實是路徑前綴沒對上）。
 *     所以這個伺服器把 `/tripay` 前綴剝掉再找檔案。 */
const BASE = '/tripay';
function serve(dir, spa) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0].split('#')[0]);
      if (spa && u.startsWith(BASE)) u = u.slice(BASE.length) || '/';
      let f = path.join(dir, u);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        if (!spa) { r.writeHead(404); return r.end(); }
        f = path.join(dir, '404.html');
        if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

(async () => {
  if (!fs.existsSync(path.join(PROD, '404.html'))) {
    console.log(`\n[X] 找不到 ${PROD}/404.html——正式模式建置沒做，登-2-1／登-3-1 驗不到東西`);
    process.exit(1);
  }
  const H = await serve(HARNESS, false), P = await serve(PROD, true);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const goH = async q => { await p.goto(`http://127.0.0.1:${H.port}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                           await new Promise(r => setTimeout(r, 340)); };
  /* 正式模式的網址一律帶 `/tripay` 前綴（與 GitHub Pages 上線後一致） */
  /* ⚠️ 每次都先跳 about:blank：只差 hash 的兩個網址之間，瀏覽器**不會重新載入頁面**，
     模組層級的擷取就不會再跑一次——那時量到的「沒顯示」是測試的假象，不是程式壞掉。
     真實情況是使用者從 Google 導回來，一定是整頁載入。 */
  const goP = async u => {
    await p.goto('about:blank');
    await p.goto(`http://127.0.0.1:${P.port}${BASE}${u}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 700));
  };
  const txt = () => p.evaluate(() => document.body.innerText);

  console.log('\n=== 實作-登　登入失敗／條款頁 ===\n');

  /* 登-1-1／2／3　正式模式：帶錯誤參數開登入頁 */
  await goP('/login#error=access_denied&error_description=Test+reason');
  const t1 = await txt();
  const url1 = await p.evaluate(() => ({ h: location.hash, s: location.search, pn: location.pathname }));
  console.log(`   帶 error 開 /login：出現「登不進去」${t1.includes('登不進去')}｜` +
              `含「Test reason」${t1.includes('Test reason')}｜含「Test+reason」${t1.includes('Test+reason')}`);
  console.log(`     網址：pathname ${url1.pn}｜hash「${url1.h}」｜search「${url1.s}」`);
  ok(t1.includes('登不進去'), '沒有出現「登不進去」');
  ok(t1.includes('Google 沒有讓這個帳號登入 Tripay。換一個 Google 帳號試試看。'), '內文不對');
  ok(t1.includes('還是不行的話，把下面這行傳給分享行程給你的人：'), '小字不對');
  ok(t1.includes('Test reason'), '`+` 沒有還原成空白');
  ok(!t1.includes('Test+reason'), '畫面上直接印出了未 decode 的 `Test+reason`');
  /* ⚠️ 反向：**真的有加號**的說明字串（`%2B`）不可以被吃掉。
     `URLSearchParams` 本來就處理對了；自己再 `decodeURIComponent(v.replace(/\+/g,' '))`
     一次就會把 `a+b` 變成 `a b`——我一度寫了那一行，靠這條才抓得到。 */
  await goP('/login#error=access_denied&error_description=a%2Bb');
  const tPlus = await txt();
  console.log(`   error_description=a%2Bb → 畫面含「a+b」${tPlus.includes('a+b')}｜含「a b」${tPlus.includes('a b')}`);
  ok(tPlus.includes('a+b'), '字面的加號被吃掉了（多做了一次 decode）');
  ok(!/error/i.test(url1.h) && !/error/i.test(url1.s),
    `網址上的錯誤參數沒清掉（hash「${url1.h}」search「${url1.s}」）`);

  /* 登-1-4　反向：沒有錯誤參數就不該出現 */
  await goP('/login');
  const t4 = await txt();
  console.log(`   乾淨開 /login：出現「登不進去」${t4.includes('登不進去')}`);
  ok(!t4.includes('登不進去'), '沒有錯誤參數卻出現了「登不進去」（反向）');

  /* 登-1-5　只有 error、沒有 description */
  await goP('/login#error=access_denied');
  const t5 = await txt();
  console.log(`   只有 error：出現「登不進去」${t5.includes('登不進去')}｜含 access_denied ${t5.includes('access_denied')}`);
  ok(t5.includes('登不進去'), '只有 error 時沒有出現「登不進去」');
  ok(t5.includes('access_denied'), '沒有退回顯示 error 本身');

  /* 登-2-1／登-3-1　**未登入直接開，不得被轉走**（只有正式模式驗得到） */
  console.log('');
  for (const [route, title] of [['/privacy', '隱私權政策'], ['/terms', '服務條款']]) {
    await goP(route);
    const r = await p.evaluate(() => ({ pn: location.pathname, t: document.body.innerText }));
    console.log(`   未登入開 ${route.padEnd(9)}：pathname ${r.pn}｜出現「${title}」${r.t.includes(title)}`);
    ok(r.pn.endsWith(route), `被轉走了：pathname 變成 ${r.pn}（AuthLayout 沒有放行）`);
    ok(r.pn.startsWith(BASE), `pathname 少了 ${BASE} 前綴（${r.pn}）——量錯環境`);
    ok(r.t.includes(title), `${route} 沒有出現「${title}」`);
    ok(!r.t.includes('用 Google 繼續'), `${route} 竟然渲染成登入頁`);
  }
  /* 登-2-4／登-3-4　內文 */
  await goP('/privacy');
  const tp = await txt();
  /* ⚠️ 停止條件寫的是「你自己輸入的行程」，但 Cowork 給的**內文逐字**是
     「你自己輸入的：**行程名稱與日期**…」——中間有個冒號，那個字串不存在。
     內文是「逐字照抄、不要改寫」，所以改驗內文裡真的有的那兩段。 */
  for (const s2 of ['Google 帳號的名字、頭像、電子郵件', '你自己輸入的', '行程名稱與日期'])
    ok(tp.includes(s2), `隱私權政策少了「${s2}」`);
  await goP('/terms');
  const tt = await txt();
  ok(tt.includes('Tripay 幫你算誰該給誰多少錢'), '服務條款少了那一句');

  /* 登-2-2／登-3-2　登入頁上兩個連結 */
  console.log('');
  await goP('/login');
  const links = await p.evaluate(() => [...document.querySelectorAll('a')]
    .filter(a => ['隱私權政策', '服務條款'].includes(a.textContent.trim()))
    .map(a => { const r = a.getBoundingClientRect();
      const q = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return { t: a.textContent.trim(), href: a.getAttribute('href'),
               w: r.width, h: r.height, self: !!q && (q === a || a.contains(q)) }; }));
  console.log(`   登入頁的連結：${links.map(l => `${l.t}(${l.href}) ${Math.round(l.w)}×${Math.round(l.h)} 命中${l.self}`).join('｜') || '（無）'}`);
  ok(links.length === 2, `登入頁應該有兩個連結，實際 ${links.length}`);
  for (const l of links) {
    ok(l.h >= 34 && l.w * l.h >= 1600,
      `「${l.t}」可點區不足（${Math.round(l.w)}×${Math.round(l.h)} = ${Math.round(l.w * l.h)}px²）`);
    ok(l.self, `「${l.t}」中心點被蓋住`);
  }
  /* 點下去真的到得了（不是只有 href 對） */
  const clicked = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === '隱私權政策');
    if (!a) return false;
    a.click(); return true;
  });
  ok(clicked, '登入頁上找不到「隱私權政策」連結，這條等於沒驗');
  await new Promise(r => setTimeout(r, 600));
  const after = await p.evaluate(() => ({ pn: location.pathname, t: document.body.innerText }));
  console.log(`   點「隱私權政策」→ pathname ${after.pn}｜出現標題 ${after.t.includes('隱私權政策')}`);
  ok(!clicked || (after.pn.endsWith('/privacy') && after.t.includes('隱私權政策')),
    '點連結沒有到隱私權政策頁');

  /* 登-1-6／登-2-3／登-3-3　三寬度不橫向捲動；登-1-7 按鈕可點區 */
  console.log('');
  for (const w of [375, 390, 430]) {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    for (const [label, u] of [['登入頁（有錯誤）', '/login#error=access_denied&error_description=Test+reason'],
                              ['隱私權政策', '/privacy'], ['服務條款', '/terms']]) {
      await goP(u);
      const r = await p.evaluate(() => {
        const d = document.documentElement;
        const over = [...document.querySelectorAll('body *')]
          .filter(el => el.getBoundingClientRect().right > window.innerWidth + 0.5)
          .map(el => (el.className || el.tagName).toString().slice(0, 16));
        const g = document.querySelector('.gbtn');
        const gr = g ? g.getBoundingClientRect() : null;
        return { doc: d.scrollWidth <= d.clientWidth + 1, nOver: over.length, over: over.slice(0, 3),
                 gbtn: gr ? { w: gr.width, h: gr.height } : null };
      });
      console.log(`   ${w}px ${label.padEnd(14)} 不橫向捲 ${r.doc}｜凸出 ${r.nOver}` +
                  (r.gbtn ? `｜Google 鈕 ${Math.round(r.gbtn.w)}×${Math.round(r.gbtn.h)}` : ''));
      ok(r.doc, `${w}px 的${label}文件橫向捲動`);
      ok(r.nOver === 0, `${w}px 的${label}有 ${r.nOver} 個元素凸出右緣：${r.over.join('、')}`);
      if (r.gbtn) ok(r.gbtn.h >= 44, `${w}px 顯示錯誤訊息時 Google 鈕只有 ${Math.round(r.gbtn.h)}px 高`);
    }
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  /* 登-4　兩頁掛進量測靶了 */
  console.log('');
  for (const [sc, title] of [['s08', '隱私權政策'], ['s09', '服務條款']]) {
    await goH(`screen=${sc}`);
    const t = await txt();
    console.log(`   量測靶 ${sc}：出現「${title}」${t.includes(title)}`);
    ok(t.includes(title), `量測靶的 ${sc} 掛不起來`);
  }
  /* 登-4-1　正式模式建置的 tarball */
  const tgz = 'Claude outputs/_dprod.tgz';
  const has = fs.existsSync(tgz);
  const names = has ? require('child_process').execSync(`tar -tzf "${tgz}"`).toString() : '';
  console.log(`   ${tgz}：存在 ${has}｜含 index.html ${/(^|\n)\.?\/?index\.html/.test(names)}` +
              `｜含 404.html ${/(^|\n)\.?\/?404\.html/.test(names)}`);
  ok(has, `${tgz} 不存在`);
  ok(/(^|\n)\.?\/?index\.html/.test(names) && /(^|\n)\.?\/?404\.html/.test(names),
    'tarball 裡少了 index.html 或 404.html');

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); H.srv.close(); P.srv.close();
  process.exit(fail ? 1 : 0);
})();
