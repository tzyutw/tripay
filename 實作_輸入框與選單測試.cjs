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
  /* 實作-P：全站收斂成兩階（--h-field 40／--h-inline 28）。
     這一條原本守的是「`:where()` 降權重不能連 preflight 都輸掉」——
     那個回歸的症狀是**塌成 26px**，所以現在改成守「等於 40，不是塌下去的值」。
     集合相等由 `實作_高度階梯與圖示測試.cjs` 全站掃。 */
  const pay = inputs.find(i => i.tag.includes('新增一種支付方式'));
  ok(pay, '找不到「新增一種支付方式」欄，這條等於沒驗');
  ok(pay && Math.abs(pay.h - 40) <= 1, `支付方式欄高 ${pay && pay.h}px，應為 40（--h-field）`);
  const rates = inputs.filter(i => i.cls.includes('rateinput'));
  ok(rates.length === 1, `匯率欄應只有一個（Q-1 兩格改一格），實際 ${rates.length}`);
  ok(rates.every(r => Math.abs(r.h - 40) <= 1), `匯率欄高 ${rates.map(r => r.h)}，應為 40（--h-field）`);

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
    const el = document.getElementById('rate-one');
    if (!el) return { err: '找不到 #rate-one' };
    el.focus();
    const lost = [];
    const set = window.Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const ch of ['0', '.', '1', '9']) {
      const node = document.getElementById('rate-one');
      set.call(node, node.value + ch);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
      /* **用 isSameNode 比節點，不要比 id**——重建後 id 一樣但節點不同 */
      if (!document.activeElement || !document.activeElement.isSameNode(el)) lost.push(ch);
    }
    return { lost, value: document.getElementById('rate-one').value,
             sameNode: document.getElementById('rate-one').isSameNode(el) };
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
  ok(nameField && Math.abs(nameField.h - 40) <= 1,
    `行程名欄高 ${nameField && nameField.h}px，應為 40（實作-P 收斂成兩階，原本是 46）`);

  /* ── 實作-Q-1　匯率改成**一個空格**（Rozi 2026-09-06 拍板方案 C，覆蓋實作-O-7）──
     方向判定、白話那一行、「換個方向」、端到端換算，全部在
     `實作_匯率與千分位測試.cjs` 裡驗。這裡只守「舊的兩格沒有復活」。 */
  await go('screen=s02b');
  const oneBox = await p.evaluate(() => ({
    n: document.querySelectorAll('.rateinput').length,
    one: !!document.getElementById('rate-one'),
    old: !!document.getElementById('rate-twd') || !!document.getElementById('rate-for'),
  }));
  console.log(`\n   匯率欄：.rateinput ${oneBox.n} 個｜#rate-one ${oneBox.one}｜舊的兩格還在 ${oneBox.old}`);
  ok(oneBox.one, '找不到 #rate-one，這條等於沒驗');
  ok(oneBox.n === 1, `.rateinput 應只有 1 個，實際 ${oneBox.n}`);
  ok(!oneBox.old, '舊的兩格復活了（實作-O-7 已被 Q-1 推翻）');

  /* 端到端：外幣 5000、台幣空 → 有匯率就要換算出 round(5000/0.21) */
  /* 期望值由**這一趟真正的兩欄**算出來，不寫死——`?rate=full` 的假資料在實作-Q
     改成「照該幣別正確的方向」組出來（KRW 是 1 台幣 = 43 韓元），
     寫死 23,810 的舊期望值其實是**方向反了**才會出現的數字。 */
  for (const [q, want] of [['screen=s03', '還沒填'], ['screen=s03&rate=full', null]]) {
    await go(q);
    const cell = await p.evaluate(() => {
      const row = [...document.querySelectorAll('.exprow')]
        .find(r => r.textContent.includes('只有外幣的一筆'));
      return row ? row.querySelector('.a').textContent.trim() : null;
    });
    const exp = want ?? await p.evaluate(() => {
      const t = window.__TRIP__;
      const rate = Number(t.cash_rate_foreign) / Number(t.cash_rate_twd);
      return '$ ' + Math.round(5000 / rate).toLocaleString('en-US');
    });
    console.log(`   ${q.padEnd(22)} 只有外幣的一筆 → ${JSON.stringify(cell)}（期望 ${JSON.stringify(exp)}）`);
    ok(cell !== null, `${q} 找不到那一列，這條等於沒驗`);
    ok(cell === exp, `${q} 應顯示 "${exp}"，實際 "${cell}"`);
  }

  /* ── 追加：類別 emoji 的識別圓圈（Rozi 2026-09-06）────────────────────── */
  await go('screen=s04');
  const box = async () => p.evaluate(() => {
    const el = document.querySelector('[aria-label="類別 emoji"]');
    if (!el) return null;
    const b = el.classList.contains('avatar') ? el : el.closest('.avatar');
    if (!b) return { avatar: false };
    const r = b.getBoundingClientRect(), row = el.closest('.fieldrow');
    return { avatar: true, w: +r.width.toFixed(1), h: +r.height.toFixed(1),
             row: +row.getBoundingClientRect().height.toFixed(1),
             focus: document.activeElement ? document.activeElement.tagName : null };
  });
  const before = await box();
  await p.evaluate(() => document.querySelector('[aria-label="類別 emoji"]').click());
  await new Promise(r => setTimeout(r, 300));
  const after = await box();
  console.log(`\n   類別 emoji：未編輯 ${before && before.w}×${before && before.h} 列高 ${before && before.row}｜` +
              `編輯中 ${after && after.w}×${after && after.h} 列高 ${after && after.row}｜焦點 ${after && after.focus}`);
  ok(before !== null, '找不到類別 emoji，這條等於沒驗');
  ok(before.avatar, '類別 emoji 未編輯時沒有識別圓圈（.avatar）');
  ok(before.w === before.h, `圓圈不是正方 ${before.w}×${before.h}`);
  ok(before.w >= 24 && before.w <= 28, `圓圈 ${before.w}px，應介於 24–28`);
  ok(after.avatar, '編輯狀態沒有 .avatar');
  ok(Math.abs(after.w - before.w) <= 1 && Math.abs(after.h - before.h) <= 1,
    `切換編輯時外框大小變了：${before.w}×${before.h} → ${after.w}×${after.h}（整列會跳動）`);
  ok(after.focus === 'INPUT', `點了之後焦點應在 input，實際 ${after.focus}`);
  /* 列高在兩種狀態相同，且與改動前（46.0）差 ≤2 */
  ok(before.row === after.row, `列高在兩種狀態不同：${before.row} vs ${after.row}`);
  ok(Math.abs(before.row - 46) <= 2, `列高 ${before.row}，與改動前的 46 差超過 2px`);

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
  for (const scr of ['s02b', 's03more', 's04']) {
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
