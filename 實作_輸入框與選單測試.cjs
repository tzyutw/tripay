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

  /* ── 實作-N-1　匯率的「1」自動帶值 ＋ 端到端換算 ─────────────────────── */
  await go('screen=s02b');
  const rate = await p.evaluate(() => {
    const t = document.getElementById('rate-twd'), f = document.getElementById('rate-for');
    const rows = [...document.querySelectorAll('.raterow')].map(r => r.dataset.side);
    return t && f ? {
      order: rows,
      twd: { v: t.value, ph: t.placeholder }, for: { v: f.value, ph: f.placeholder },
      hint: (document.body.textContent || '').includes('還差一欄，兩邊都填才換算得出來'),
    } : null;
  });
  console.log(`\n   匯率（KRW）：順序 ${rate.order}｜TWD v="${rate.twd.v}" ph="${rate.twd.ph}"｜` +
              `KRW v="${rate.for.v}" ph="${rate.for.ph}"｜只填一欄提示 ${rate.hint}`);
  ok(rate !== null, '找不到匯率欄，這條等於沒驗');
  /* fixture 是 KRW，oneSideOf('KRW')==='twd' → 1 在台幣那一欄、且排第一 */
  ok(rate.order[0] === 'twd', `第一列應是台幣（KRW 的「1」在台幣側），實際 ${rate.order[0]}`);
  ok(rate.twd.v === '1', `台幣欄應自動帶 1，實際 "${rate.twd.v}"`);
  ok(rate.for.v === '', `外幣欄應留空，實際 "${rate.for.v}"`);
  ok(rate.twd.ph === '1', `台幣欄 placeholder 應為 1，實際 "${rate.twd.ph}"`);
  ok(rate.for.ph !== '1', `外幣欄 placeholder 不該是 1，實際 "${rate.for.ph}"`);
  ok(rate.hint, '只填一欄時沒有出提示——這正是 Rozi 靜默算不出來的原因');

  /* 換一個「1」在外幣側的幣別（JPY）——KRW 剛好與寫死 `isTwd` 同結果，驗不出差別 */
  await go('screen=s02b&cur=JPY');
  const jpy = await p.evaluate(() => {
    const t = document.getElementById('rate-twd'), f = document.getElementById('rate-for');
    return t && f ? {
      order: [...document.querySelectorAll('.raterow')].map(r => r.dataset.side),
      twd: { v: t.value, ph: t.placeholder }, for: { v: f.value, ph: f.placeholder },
    } : null;
  });
  console.log(`   匯率（JPY）：順序 ${jpy.order}｜TWD v="${jpy.twd.v}" ph="${jpy.twd.ph}"｜` +
              `JPY v="${jpy.for.v}" ph="${jpy.for.ph}"`);
  ok(jpy !== null, 'JPY 模式找不到匯率欄，這條等於沒驗');
  ok(jpy.order[0] === 'for', `JPY 的「1」在外幣側，第一列應是 for，實際 ${jpy.order[0]}`);
  ok(jpy.for.v === '1', `JPY 欄應自動帶 1，實際 "${jpy.for.v}"`);
  ok(jpy.twd.v === '', `台幣欄應留空，實際 "${jpy.twd.v}"`);
  /* **與寫死 isTwd 相反**：JPY 行程時 placeholder 的 1 在 JPY 那欄，不在台幣欄 */
  ok(jpy.for.ph === '1', `JPY 欄 placeholder 應為 1，實際 "${jpy.for.ph}"`);
  ok(jpy.twd.ph !== '1', `台幣欄 placeholder 不該是 1（那正是誤導 Rozi 的地方），實際 "${jpy.twd.ph}"`);

  /* 兩欄都填好時不再提示 */
  await go('screen=s02b&rate=full');
  const full = await p.evaluate(() => ({
    twd: document.getElementById('rate-twd').value,
    for: document.getElementById('rate-for').value,
    hint: (document.body.textContent || '').includes('還差一欄'),
  }));
  console.log(`   匯率兩欄都填：TWD="${full.twd}" KRW="${full.for}"｜提示 ${full.hint}`);
  ok(full.twd === '1' && full.for === '0.21', '兩欄的值沒有帶進來');
  ok(!full.hint, '兩欄都有值還在提示');

  /* 端到端：外幣 5000、台幣空 → 有匯率就要換算出 round(5000/0.21) */
  for (const [q, want] of [['screen=s03', '還沒填'], ['screen=s03&rate=full', '$ 23,810']]) {
    await go(q);
    const cell = await p.evaluate(() => {
      const row = [...document.querySelectorAll('.exprow')]
        .find(r => r.textContent.includes('只有外幣的一筆'));
      return row ? row.querySelector('.a').textContent.trim() : null;
    });
    console.log(`   ${q.padEnd(22)} 只有外幣的一筆 → ${JSON.stringify(cell)}`);
    ok(cell !== null, `${q} 找不到那一列，這條等於沒驗`);
    ok(cell === want, `${q} 應顯示 "${want}"，實際 "${cell}"`);
  }

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
