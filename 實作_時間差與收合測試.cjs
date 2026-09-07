/* 實作-V　編輯後的 30 秒時間差、贊助符號、警示行斷行、頂部列固定與 hero 收合。 */
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
const alpha = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return 1;
  const p = m[1].split(',').map(x => x.trim()); return p.length > 3 ? Number(p[3]) : 1; };

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 360)); };

  console.log('\n=== 實作-V　時間差／贊助符號／警示斷行／頂部固定與收合 ===\n');

  /* ── 0　V-0 守門：stub 的寫入要真的改動假資料 ─────────────────────────── */
  await go('screen=s03');
  const stubWrites = await p.evaluate(async () => {
    const sb = window.__SUPABASE_STUB__;
    /* ⚠️ 讀回來的是**同一個物件的參考**，樁改的是它本身——
       不當場把字串複製下來，最後回傳時會拿到改過之後的值（兩邊一樣＝假通過）。 */
    const before = String(((await sb.from('expenses').select('*').eq('id', 'e3').single()).data || {}).title);
    await sb.from('expenses').update({ title: 'ZZ 改過的標題' }).eq('id', 'e3').select();
    const after = String(((await sb.from('expenses').select('*').eq('id', 'e3').single()).data || {}).title);
    return { before, after };
  });
  console.log(`   V-0 樁的寫入：「${stubWrites.before}」→「${stubWrites.after}」`);
  ok(stubWrites.after === 'ZZ 改過的標題',
    '樁的 update 沒有真的改動假資料——V-1 的正反兩條在它上面都是假的');
  ok(stubWrites.before !== stubWrites.after, '改前改後一樣，這條等於沒驗');

  /* ── 1／2　V-1：改一筆 → 存 → 立刻重開，要看到新標題 ─────────────────── */
  const editAndReopen = async () => {
    await go('screen=s03');
    return p.evaluate(async () => {
      const row = [...document.querySelectorAll('.exprow')][1];
      const id = null; void id;
      row.click(); await new Promise(r => setTimeout(r, 450));
      const input = document.querySelector('input[aria-label="花費"]');
      if (!input) return { err: '打不開編輯表單' };
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(input, 'ZZ 立刻要看到的新標題');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      const save = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '記下來');
      save.click();
      /* 等清單重畫（invalidate → refetch）。最多等 1 秒——這一條驗的就是
         「1 秒內重開讀到的是新的」，等太久等於把時間差等掉了。 */
      let again = null;
      for (let i = 0; i < 20 && !again; i++) {
        await new Promise(r => setTimeout(r, 50));
        again = [...document.querySelectorAll('.exprow')]
          .find(x => ((x.querySelector('.t') || {}).textContent || '').includes('ZZ 立刻要看到的新標題'));
      }
      if (!again) return { err: '清單上沒有更新（那是另一個 key 的問題）',
        titles: [...document.querySelectorAll('.exprow .t')].map(x => x.textContent) };
      again.click(); await new Promise(r => setTimeout(r, 500));
      const v = document.querySelector('input[aria-label="花費"]');
      return { value: v ? v.value : null };
    });
  };
  const reopened = await editAndReopen();
  console.log(`   V-1 改完立刻重開，表單裡是「${reopened.value ?? reopened.err}」`);
  ok(!reopened.err, `V-1 操作沒走完：${reopened.err}`);
  ok(reopened.value === 'ZZ 立刻要看到的新標題',
    `1 秒內重開讀到的是舊資料「${reopened.value}」——單筆快取沒被清`);

  /* 3　不得順手改 staleTime */
  const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
  ok(/staleTime:\s*30_000/.test(appSrc), 'App.tsx 的 staleTime 被動過了（那是全站設定）');
  /* 4　兩處 onSuccess 都要清單筆快取 */
  const efSrc = fs.readFileSync('src/components/ExpenseFormSheet.tsx', 'utf8');
  const invalidateOne = (efSrc.match(/queryKey:\s*\['expense',/g) || []).length;
  console.log(`   清單筆快取的呼叫數 ${invalidateOne}（存檔＋刪除各一）`);
  ok(invalidateOne >= 2, `只有 ${invalidateOne} 處清單筆快取，存檔與刪除都要`);

  /* ── 5／6／7　V-2 贊助 ───────────────────────────────────────────────── */
  console.log('');
  await go('screen=s03');
  const s03Sponsor = await p.evaluate(() => {
    const r = [...document.querySelectorAll('.exprow')].find(x => x.textContent.includes('爸爸贊助'));
    return r ? { txt: (r.querySelector('.a') || {}).textContent,
                 color: getComputedStyle(r.querySelector('.money')).color } : null; });
  await go('screen=s03&member=0');
  const mineSponsor = await p.evaluate(() => {
    const r = [...document.querySelectorAll('[data-exp-row]')].find(x => x.textContent.includes('爸爸贊助'));
    return r ? { txt: (r.querySelector('.a') || {}).textContent,
                 color: getComputedStyle(r.querySelector('.money')).color,
                 all: r.textContent, mine: Number(r.dataset.mine) } : null; });
  console.log(`   S-03「${s03Sponsor && s03Sponsor.txt}」${s03Sponsor && s03Sponsor.color}｜` +
              `新頁面「${mineSponsor && mineSponsor.txt}」${mineSponsor && mineSponsor.color}`);
  ok(s03Sponsor !== null && mineSponsor !== null, '找不到贊助那一筆，這條等於沒驗');
  ok(mineSponsor.txt.trim().startsWith('−'), `新頁面的贊助沒有負號：${mineSponsor.txt}`);
  ok(s03Sponsor.txt.trim().startsWith('−'), `S-03 的贊助沒有負號：${s03Sponsor.txt}`);
  ok(mineSponsor.color === s03Sponsor.color,
    `兩個畫面的顏色不同：${mineSponsor.color} vs ${s03Sponsor.color}`);
  ok(!mineSponsor.all.includes('你付的'), '贊助那一列不該說「你付的」——不是他付的');
  /* 7　小計語意：per[] 仍把贊助當正數（這一輪不動它），差額必須剛好是 2×贊助 */
  const sums = await p.evaluate(() => ({
    segSum: [...document.querySelectorAll('[data-seg]')].reduce((a, e) => a + Number(e.dataset.segSum), 0),
    sponsorMine: [...document.querySelectorAll('[data-exp-row]')]
      .filter(r => r.textContent.includes('爸爸贊助'))
      .reduce((a, r) => a + Number(r.dataset.mine), 0) }));
  await go('screen=s03');
  const per0 = await p.evaluate(() => { document.querySelector('.tot').click();
    return new Promise(r => setTimeout(() => r(Number(((document.querySelectorAll('.perrow')[0]
      .querySelector('.am .money') || {}).textContent || '').replace(/[^\d.-]/g, ''))), 300)); });
  const gap = per0 - sums.segSum;
  console.log(`   段小計 ${sums.segSum}｜統計卡 ${per0}｜差 ${gap}（贊助 ${sums.sponsorMine} × −2 = ${-2 * sums.sponsorMine}）`);
  /* ⚠️ `per[]` 把贊助當**正數**累加，新頁面當**負數**——差剛好是 2×。
     `per[]` 要不要排除贊助是 Rozi 的決策，這一輪明文不動，所以這條驗「差額剛好等於那一筆」，
     而不是「兩邊相等」。她拍板之後這條要改成相等。 */
  ok(Math.abs(gap - (-2 * sums.sponsorMine)) <= 1,
    `段小計與統計卡的差 ${gap} 不等於贊助的兩倍 ${-2 * sums.sponsorMine}——有別的東西也不一致`);

  /* ── 8／9／10　V-3 警示行 ────────────────────────────────────────────── */
  console.log('');
  const noteTop = async (sel) => p.evaluate((s2) => {
    const n = document.querySelector(s2);
    if (!n) return null;
    const svg = n.querySelector('svg');
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    let tn = null; while (w.nextNode()) if (w.currentNode.textContent.trim()) { tn = w.currentNode; break; }
    const rg = document.createRange(); rg.selectNode(tn);
    const tr = rg.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    return { diff: Math.abs(sr.top - tr.top), lines: Math.round(tr.height / 19.5),
             left: Math.round(tr.left), over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  }, sel);
  for (const w of [390, 320]) {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    await go('screen=s03&blanks=2');
    const id = await p.evaluate(() => { const fx = window.__HARNESS_FIXTURE__;
      const e = (fx.expenses || []).find(x => x.foreign_amount == null && x.expense_type === 'individual');
      return e ? e.id : null; });
    await go(`screen=s04&blanks=2&exp=${id}`);
    const n = await noteTop('.note.warn');
    console.log(`   @${w} .note.warn：圖示與文字 top 差 ${n && n.diff.toFixed(1)}｜文字 ${n && n.lines} 行｜橫向捲動 ${n && n.over}`);
    ok(n !== null, `@${w} 找不到 .note.warn，這條等於沒驗`);
    ok(n.diff <= 4, `@${w} 圖示與文字不在同一行（差 ${n.diff.toFixed(1)}）`);
    ok(!n.over, `@${w} 整頁橫向捲動`);
    if (w === 320) ok(n.lines >= 2, `@320 文字應該要換行（證明真的在換行），實際 ${n.lines} 行`);
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await go('screen=s05');
  const calm = await noteTop('.note.calm');
  console.log(`   .note.calm：圖示與內文 top 差 ${calm && calm.diff.toFixed(1)}｜橫向捲動 ${calm && calm.over}`);
  ok(calm !== null, '找不到 .note.calm，這條等於沒驗');
  ok(calm.diff <= 4, `.note.calm 的圖示與內文不在同一行（差 ${calm.diff.toFixed(1)}）`);
  ok(!calm.over, '.note.calm 那一頁橫向捲動');

  /* ── 11　V-4 備註 placeholder ────────────────────────────────────────── */
  await go('screen=s04');
  const ph = await p.evaluate(() => (document.querySelector('input[aria-label="備註"]') || {}).placeholder);
  console.log(`   備註 placeholder「${ph}」`);
  ok(ph === '補一句', `placeholder 應完全等於「補一句」，實際「${ph}」`);

  /* ── 12／13　V-5 首頁頂部列 ──────────────────────────────────────────── */
  console.log('');
  await go('screen=s01');
  const top = await p.evaluate(async () => {
    const bar = document.querySelector('.topbar');
    if (!bar) return null;
    const r0 = bar.getBoundingClientRect();
    const next = bar.parentElement.children[1];
    const before = { top: r0.top, h: r0.height, nextTop: next.getBoundingClientRect().top,
                     bg: getComputedStyle(bar).backgroundColor };
    /* 內容不夠長就捲不動——先塞高再捲，否則這條會因為「捲不動所以沒動」而假通過 */
    /* 內容不夠長就捲不動——撐在 documentElement 上（body 不一定是捲動容器） */
    document.documentElement.style.minHeight = '2400px';
    window.scrollTo(0, 300); await new Promise(r => setTimeout(r, 250));
    const after = bar.getBoundingClientRect().top;
    const scrolled = window.scrollY || document.documentElement.scrollTop;
    document.documentElement.style.minHeight = '';
    return { ...before, after, scrolled };
  });
  console.log(`   頂部列 高 ${top && Math.round(top.h)}｜捲 ${top && top.scrolled}px 後 top ${top && Math.round(top.after)}｜` +
              `底色 ${top && top.bg}｜下一塊 top ${top && Math.round(top.nextTop)}`);
  ok(top !== null, '找不到 .topbar，這條等於沒驗');
  ok(top.scrolled >= 200, `頁面沒有真的捲動（${top.scrolled}px），這條等於沒驗`);
  ok(top.after <= 4, `捲動後頂部列沒有黏住（top ${top.after}）`);
  ok(alpha(top.bg) === 1, `頂部列底色不是不透明：${top.bg}`);
  ok(top.nextTop >= top.h - 1, `頂部列蓋住了底下的內容（下一塊 top ${top.nextTop} < 列高 ${top.h}）`);

  /* ── 14～20　V-6 hero 收合 ───────────────────────────────────────────── */
  console.log('');
  for (const w of [320, 390, 414]) {
    await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
    await go('screen=s03');
    const st = await p.evaluate(async () => {
      const hero = document.querySelector('.hero');
      if (!hero) return null;
      const out = [];
      for (const y of [0, 100, 200, 300, 400]) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 200));
        const r2 = hero.getBoundingClientRect();
        const keys = ['返回', '更多'].map(k => {
          const el = hero.querySelector(`[aria-label="${k}"]`);
          if (!el) return null;
          const kr = el.getBoundingClientRect();
          const cs = getComputedStyle(el, '::after');
          const hw = Math.max(kr.width, parseFloat(cs.width) || 0);
          const hh = Math.max(kr.height, parseFloat(cs.height) || 0);
          const hit = document.elementFromPoint(Math.round(kr.left + kr.width / 2), Math.round(kr.top + kr.height / 2));
          return { k, w: hw, h: hh, own: !!hit && (hit === el || el.contains(hit)) };
        });
        out.push({ y, h: r2.height, top: r2.top, keys,
          dt: hero.querySelector('.dt').getBoundingClientRect().height,
          ttlSeen: (hero.innerText || '').includes('濟州島'),
          bg: getComputedStyle(hero).backgroundColor,
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth });
      }
      window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
      const inView = [...document.querySelectorAll('.exprow')]
        .filter(x => { const q = x.getBoundingClientRect(); return q.top >= 0 && q.bottom <= window.innerHeight; }).length;
      return { out, inView };
    });
    if (!st) { ok(false, `@${w} 找不到 .hero`); continue; }
    const open = st.out[0], shut = st.out[st.out.length - 1];
    console.log(`   @${w} hero 高 ${st.out.map(x => Math.round(x.h)).join('→')}｜` +
                `收合後 top ${Math.round(shut.top)}｜日期高 ${Math.round(shut.dt)}｜` +
                `底色 ${shut.bg}｜一進畫面看得到 ${st.inView} 筆`);
    ok(open.h >= 140, `@${w} 展開態應 ≥140，實際 ${Math.round(open.h)}`);
    ok(open.dt > 8, `@${w} 展開態看不到日期`);
    ok(shut.h <= 64, `@${w} 收合態應 ≤64，實際 ${Math.round(shut.h)}`);
    ok(shut.top <= 4, `@${w} 收合後沒有黏在頂端（top ${Math.round(shut.top)}）`);
    ok(shut.dt <= 1, `@${w} 收合後日期還在（高 ${Math.round(shut.dt)}）`);
    ok(shut.ttlSeen, `@${w} 收合後看不到行程名`);
    ok(alpha(shut.bg) === 1, `@${w} 收合態底色不是不透明：${shut.bg}`);
    for (const k of shut.keys) {
      ok(k !== null, `@${w} 收合後找不到那顆鍵`);
      if (!k) continue;
      ok(k.w >= 44 && k.h >= 44, `@${w} 收合後「${k.k}」可點區只有 ${Math.round(k.w)}×${Math.round(k.h)}`);
      ok(k.own, `@${w} 收合後「${k.k}」被別的元素蓋住了`);
    }
    for (const x of st.out) ok(x.sw <= x.cw + 1, `@${w} 捲到 ${x.y}px 時文件被撐寬：${x.sw} > ${x.cw}`);
    if (w === 390) ok(st.inView >= 2, `一進畫面只看得到 ${st.inView} 筆消費，應 ≥2`);
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
