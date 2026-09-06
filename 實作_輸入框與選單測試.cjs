/* 實作-L　四項的機器驗收（真實 Chrome）。
 *   1 輸入框高度：`:where()` 降權重不能連 Tailwind preflight 都輸掉
 *   2 匯率欄位打字不失焦：元件內部定義的函式元件會讓 React 重建 input
 *   3 S-02b-14 行程名欄位
 *   4 「⋯」是獨立頁面
 */
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
                          await new Promise(r => setTimeout(r, 320)); };

  console.log('\n=== 實作-L　輸入框高度／打字焦點／行程名／⋯ 選單 ===\n');

  /* ── 1 輸入框高度 ───────────────────────────────────────────────────── */
  await go('screen=s02b');
  const inputs = await p.evaluate(() => [...document.querySelectorAll('input[type=text]')].map(i => {
    const r = i.getBoundingClientRect(), cs = getComputedStyle(i);
    return { tag: i.placeholder || i.className || '(無 class)',
             cls: i.className || '', h: +r.height.toFixed(1),
             padT: cs.paddingTop, w: +r.width.toFixed(1) };
  }));
  for (const i of inputs) console.log(`   ${i.tag.slice(0, 18).padEnd(20)} h=${i.h} padT=${i.padT}`);
  const pay = inputs.find(i => i.tag.includes('新增一種支付方式'));
  ok(pay, '找不到「新增一種支付方式」欄，這條等於沒驗');
  ok(pay && pay.h >= 36 && pay.h <= 42, `支付方式欄高 ${pay && pay.h}px，應在 36–42`);
  ok(pay && pay.padT === '9px', `支付方式欄 paddingTop=${pay && pay.padT}，應為 9px`);
  const rates = inputs.filter(i => i.cls.includes('rateinput'));
  ok(rates.length === 2, `匯率欄應有兩個，實際 ${rates.length}`);
  ok(rates.every(r => Math.abs(r.h - 38) <= 1), `匯率欄高 ${rates.map(r => r.h)}，應為 38（不得被一起壓矮）`);

  /* ── 2 破框沒有壞回去（實作-J 修好的） ─────────────────────────────── */
  await p.evaluate(() => { const a = document.querySelector('.rowb .avatar'); if (a) a.click(); });
  await new Promise(r => setTimeout(r, 250));
  const inlineW = await p.evaluate(() => {
    const i = document.querySelector('.rowb input[type=text]');
    return i ? +i.getBoundingClientRect().width.toFixed(1) : null;
  });
  console.log(`   emoji 就地編輯框 w=${inlineW}`);
  ok(inlineW !== null, '點不開就地編輯，這條等於沒驗');
  ok(inlineW >= 30 && inlineW <= 34, `就地編輯框寬 ${inlineW}px，應在 30–34`);

  /* ── 3 匯率欄位連打四鍵不失焦 ──────────────────────────────────────── */
  await go('screen=s02b');
  const typed = await p.evaluate(async () => {
    const el = document.getElementById('rate-for');
    if (!el) return { err: '找不到 #rate-for' };
    el.focus();
    const lost = [];
    const set = window.Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const ch of ['0', '.', '1', '9']) {
      const node = document.getElementById('rate-for');
      set.call(node, node.value + ch);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
      /* **用 isSameNode 比節點，不要比 id**——重建後 id 一樣但節點不同 */
      if (!document.activeElement || !document.activeElement.isSameNode(el)) lost.push(ch);
    }
    return { lost, value: document.getElementById('rate-for').value,
             sameNode: document.getElementById('rate-for').isSameNode(el) };
  });
  if (typed.err) { ok(false, typed.err); }
  else {
    console.log(`   匯率打「0.19」：失焦 ${typed.lost.length} 次${typed.lost.length ? '（' + typed.lost.join('') + '）' : ''}｜` +
                `最終值 "${typed.value}"｜節點未被重建 ${typed.sameNode}`);
    ok(typed.lost.length === 0, `打字時失焦 ${typed.lost.length} 次——input 被 React 重建了`);
    ok(typed.value === '0.19', `最終值應為 0.19，實際 "${typed.value}"`);
    ok(typed.sameNode, 'input 節點被換掉了（元件型別每次 render 都不同）');
  }

  /* ── 4 S-02b-14 行程名欄位 ─────────────────────────────────────────── */
  const nameField = await p.evaluate(() => {
    const i = [...document.querySelectorAll('input[type=text]')]
      .find(x => x.placeholder && x.placeholder.includes('沖繩四人行'));
    if (!i) return null;
    return { value: i.value, h: +i.getBoundingClientRect().height.toFixed(1) };
  });
  console.log(`   S-02b-14 行程名："${nameField && nameField.value}" h=${nameField && nameField.h}`);
  ok(nameField !== null, '編輯行程沒有行程名欄位');
  ok(nameField && nameField.value.length > 0, '行程名欄位沒有帶入現有的行程名');
  ok(nameField && Math.abs(nameField.h - 46) <= 1, `行程名欄高 ${nameField && nameField.h}px，應為 46`);

  /* ── 5 「⋯」是獨立頁面 ─────────────────────────────────────────────── */
  await go('screen=s03more');
  const more = await p.evaluate(() => ({
    scrim: !!document.querySelector('.scrim'),
    sheet: !!document.querySelector('.sheet'),
    back: !!document.querySelector('.bar button[aria-label="返回"]'),
    title: document.querySelector('.bar .ttl') ? document.querySelector('.bar .ttl').textContent : null,
    items: [...document.querySelectorAll('.shopt.mi')].map(x => x.textContent.trim()),
    cancel: (document.body.textContent || '').includes('取消'),
    del: document.querySelectorAll('.shopt.del').length,
  }));
  console.log(`   ⋯ 頁：遮罩 ${more.scrim}｜.sheet ${more.sheet}｜返回鍵 ${more.back}｜` +
              `標題「${more.title}」｜項目 ${JSON.stringify(more.items)}`);
  ok(more.items.length === 4, `項目應為 4 個，實際 ${more.items.length}——這條等於沒驗`);
  ok(!more.scrim, '還有遮罩，仍是彈層');
  ok(!more.sheet, '還有 .sheet，仍是彈層');
  ok(more.back, '缺返回鍵');
  ok(more.title === '這趟行程', `標題應為「這趟行程」，實際「${more.title}」`);
  ok(!more.cancel, '底部還有「取消」——有返回鍵了不要並存');
  ok(more.del === 1, `刪除應是唯一著色的一項，實際 ${more.del}`);

  /* ── 6 s02b 與 more 在三個寬度下不橫向溢出 ─────────────────────────── */
  for (const scr of ['s02b', 's03more']) {
    for (const w of [320, 390, 414]) {
      await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
      await go(`screen=${scr}`);
      const o = await p.evaluate(() => {
        const bad = []; let n = 0;
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.overflowX === 'visible' || el.clientWidth === 0) continue;
          n++;
          if (el.scrollWidth > el.clientWidth + 1)
            bad.push(`${el.tagName}.${(typeof el.className === 'string' ? el.className : '').slice(0, 18)} ${el.scrollWidth}>${el.clientWidth}`);
        }
        return { n, bad: bad.slice(0, 3), total: bad.length };
      });
      ok(o.n >= 1, `${scr} @${w} 一個捲動容器都沒掃到，這條等於沒驗`);
      ok(o.total === 0, `${scr} @${w} 容器橫向溢出 ${o.total} 處：${o.bad.join('；')}`);
    }
  }

  await b.close(); srv.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
