/* 實作-U　外幣總額空白的算錯帳、`{名字} 的帳` 三段、矮按鈕、hub 模式。
   ⚠️ 一律用**關係式**，不寫死金額——`驗收：濟州島` 是 Rozi 正在填的正式帳。 */
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
const num = s => Number(String(s).replace(/[^\d.-]/g, ''));

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const go = async q => { await p.goto(`${BASE}/harness.html?${q}`, { waitUntil: 'networkidle0' });
                          await new Promise(r => setTimeout(r, 360)); };

  console.log('\n=== 實作-U　算錯的帳／這個人的帳／矮按鈕／hub ===\n');

  /* ── 1 U-1：外幣總額空白 → 每個人都算不出來（假資料造一筆）─────────────── */
  await go('screen=s03&fill=noforetotal');
  const u1 = await p.evaluate(() => {
    const fx = window.__HARNESS_FIXTURE__;
    const e = (fx.expenses || []).find(x => x.expense_type === 'individual'
      && x.split_fill_currency === 'FOR' && x.foreign_amount == null);
    if (!e) return null;
    const rows = [...document.querySelectorAll('.exprow')]
      .filter(r => (r.querySelector('.t') || {}).textContent === e.title);
    return { title: e.title, twd: e.twd_amount,
             sumFor: e.expense_splits.reduce((a, s) => a + (s.split_amount_foreign || 0), 0),
             shown: rows.length ? (rows[0].querySelector('.a') || {}).textContent : null };
  });
  console.log(`   U-1 樣本：「${u1 && u1.title}」台幣 ${u1 && u1.twd}｜各人外幣加總 ${u1 && u1.sumFor}｜列上顯示「${u1 && u1.shown}」`);
  ok(u1 !== null, '假資料裡沒有「外幣總額空白」的各自付各的——這條等於沒驗');
  ok(u1.sumFor > u1.twd * 5, '樣本不夠極端（外幣數字要遠大於台幣，才看得出「當成台幣」的災情）');

  /* 針對**那一筆本身**驗：每個參與者算他的金額都要是 null。
     不用整趟加總——這份假資料另有既存的不一致（「藥妝店」把外幣數字填進
     `split_amount` 卻標 `TWD`），會蓋掉這一條要驗的東西。 */
  await go('screen=s03&fill=noforetotal&member=0');
  const mine = await p.evaluate(() => {
    const row = [...document.querySelectorAll('[data-exp-row]')]
      .find(r => (r.textContent || '').includes('藥局'));
    return row ? { mine: row.dataset.mine, txt: (row.textContent || '').replace(/\s+/g, ' ') } : null;
  });
  console.log(`   那一筆算 Alex 的金額：${mine && mine.mine}（改之前是 12,000＝把韓元當台幣）`);
  ok(mine !== null, '那一筆沒有出現在成員的帳裡，這條等於沒驗');
  ok(mine.mine === 'null', `外幣總額空白時應該算不出來，實際 ${mine.mine}`);
  ok(mine.txt.includes('還沒算清楚'), '算不出來卻沒說出來');

  /* ── 2 U-1-b 提示 ────────────────────────────────────────────────────── */
  const expId = await p.evaluate(() => {
    const fx = window.__HARNESS_FIXTURE__;
    const e = (fx.expenses || []).find(x => x.expense_type === 'individual'
      && x.split_fill_currency === 'FOR' && x.foreign_amount == null);
    return e ? e.id : null; });
  ok(expId !== null, '找不到那一筆的 id，下一條等於沒驗');
  await go(`screen=s04&fill=noforetotal&exp=${expId}`);
  const hintOn = await p.evaluate(() => document.body.textContent || '');
  console.log(`   編輯那一筆 → 有「還沒填外幣總額…」 ${hintOn.includes('還沒填外幣總額，先補上才算得出各自要付多少')}`);
  ok(hintOn.includes('還沒填外幣總額，先補上才算得出各自要付多少'),
    '算不出來卻沒告訴使用者要補哪一格');
  await go('screen=s04&fill=for');
  const hintOff = await p.evaluate(() => document.body.textContent || '');
  ok(!hintOff.includes('還沒填外幣總額'), '外幣總額有值時不該出現那句（反向）');

  /* ── U-6 清單上看得出來「哪幾筆還沒算清楚」───────────────────────────── */
  await go('screen=s03&fill=noforetotal');
  const borders = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.exprow')].map(r => ({
      t: (r.querySelector('.t') || {}).textContent || '',
      bc: getComputedStyle(r).borderLeftColor, bw: getComputedStyle(r).borderLeftWidth }));
    return rows;
  });
  const bad = borders.find(r => r.t.includes('藥局'));
  const normal = borders.find(r => r.t.includes('黑豬肉晚餐'));
  console.log(`   U-6 算不出來的那一列 border-left ${bad && bad.bc} ${bad && bad.bw}｜` +
              `正常列 ${normal && normal.bc} ${normal && normal.bw}`);
  ok(!!bad && !!normal, '找不到對照的兩列，這條等於沒驗');
  ok(bad.bc !== 'rgb(223, 225, 218)', '算不出來的那一列跟正常列一模一樣——看不出來要調整哪一筆');
  ok(bad.bc !== normal.bc, `兩列的左框色相同（${bad.bc}）`);
  /* 反向：算得出來的筆不得被誤標 */
  ok(normal.bc === 'rgb(223, 225, 218)', `正常列被誤標成警示色：${normal.bc}`);
  const wrongly = borders.filter(r => !r.t.includes('藥局') && !r.t.includes('計程車')
    && !r.t.includes('只有外幣') && r.bc !== 'rgb(223, 225, 218)');
  console.log(`   被標成警示色的其他列：${wrongly.map(r => r.t).join('、') || '無'}`);

  /* ── 3 U-2 `{名字} 的帳` ─────────────────────────────────────────────── */
  console.log('');
  await go('screen=s03&member=1');
  const mv = await p.evaluate(() => ({
    title: (document.querySelector('.ttl') || {}).textContent,
    segs: [...document.querySelectorAll('[data-seg]')].map(e => ({
      k: e.dataset.seg, n: +e.dataset.segN, sum: +e.dataset.segSum,
      name: (e.querySelector('.sec span') || {}).textContent })),
    rows: [...document.querySelectorAll('[data-exp-row]')].map(e => ({
      tag: e.tagName, mine: e.dataset.mine, paid: e.dataset.paid,
      txt: (e.textContent || '').replace(/\s+/g, ' ') })),
    txt: (document.body.textContent || '').replace(/\s+/g, ' '),
  }));
  console.log(`   標題「${mv.title}」｜段 ${mv.segs.map(s => `${s.name}(${s.n}筆/${s.sum})`).join(' ')}`);
  ok(/的帳$/.test(mv.title || ''), `標題應是「{名字} 的帳」，實際「${mv.title}」`);
  ok(mv.segs.length > 0, '一段都沒有，這條等於沒驗');
  for (const need of ['跟大家平分的', '各自付各的', '只算我的'])
    ok(mv.txt.includes(need), `缺段名「${need}」`);
  ok(mv.rows.length > 0, '一列都沒有，這條等於沒驗');
  ok(mv.rows.every(r => r.tag === 'BUTTON'), '每一列都要點得下去');

  /* 加總 = 總行程頁那一列上的金額 */
  await go('screen=s03');
  const perAmt = await p.evaluate(() => {
    document.querySelector('.tot').click();
    return new Promise(r => setTimeout(() => r([...document.querySelectorAll('.perrow')]
      .map(x => (x.querySelector('.am .money') || {}).textContent)), 300));
  });
  const segSum = mv.segs.reduce((a, s) => a + s.sum, 0);
  console.log(`   三段小計加總 ${segSum}｜總行程頁該成員列 ${perAmt[1]}`);
  ok(Math.abs(segSum - num(perAmt[1])) <= 1,
    `三段小計 ${segSum} 與總行程頁那一列 ${perAmt[1]} 對不起來`);

  /* 付款小字（正反兩面） */
  const withPaid = mv.rows.filter(r => r.paid != null);
  const noPaid = mv.rows.filter(r => r.paid == null);
  console.log(`   有 data-paid ${withPaid.length} 列｜沒有 ${noPaid.length} 列`);
  ok(withPaid.length > 0 && noPaid.length > 0, '兩種列都要有，否則正反面驗不到');
  for (const r of withPaid) ok(r.txt.includes('你付的'), `有 data-paid 的列應顯示「你付的」：${r.txt}`);
  for (const r of noPaid) ok(!r.txt.includes('你付的'), `沒有 data-paid 的列不得顯示「你付的」：${r.txt}`);

  /* 算不出來的列 */
  const nulls = mv.rows.filter(r => r.mine === 'null');
  console.log(`   算不出來的列 ${nulls.length}`);
  ok(nulls.length > 0, '沒有算不出來的列，那一條等於沒驗');
  for (const r of nulls) ok(r.txt.includes('還沒算清楚'), `算不出來的列要說「還沒算清楚」：${r.txt}`);
  for (const seg of mv.segs) {
    const rows = mv.rows;   // 粗略：全部列的已知值加總不得小於各段小計加總
    void rows;
  }
  const known = mv.rows.filter(r => r.mine !== 'null').reduce((a, r) => a + Number(r.mine), 0);
  ok(Math.abs(known - segSum) <= 1, `算不出來的筆被算進小計了：已知 ${known} vs 小計 ${segSum}`);

  /* 點得進編輯 ／ 封存態反向 */
  await go('screen=s03&member=1');
  const tap = await p.evaluate(async () => {
    document.querySelector('[data-exp-row]').click();
    await new Promise(r => setTimeout(r, 500));
    return document.body.textContent || ''; });
  ok(tap.includes('記下來'), '點列沒有開編輯表單');
  await go('screen=s03&member=1&state=archived');
  const tapA = await p.evaluate(async () => {
    const r = document.querySelector('[data-exp-row]');
    if (!r) return null;
    r.click(); await new Promise(z => setTimeout(z, 450));
    return document.body.textContent || ''; });
  console.log(`   封存態：開表單 ${tapA && tapA.includes('記下來')}｜有 toast ${tapA && tapA.includes('重新開啟行程')}`);
  ok(tapA !== null, '封存態那一頁沒有列，這條等於沒驗');
  ok(!tapA.includes('記下來'), '封存態不該開編輯表單');
  ok(tapA.includes('重新開啟行程'), '封存態點下去沒講話');

  /* ── 4 U-2-f 註腳常駐 ────────────────────────────────────────────────── */
  console.log('');
  for (const q of ['screen=s03', 'screen=s03&rate=full']) {
    await go(q);
    const foot = await p.evaluate(async () => {
      document.querySelector('.tot').click();
      await new Promise(r => setTimeout(r, 300));
      return { txt: (document.querySelector('.foot') || {}).textContent,
               anyApprox: document.querySelectorAll('.perrow .am.ap').length };
    });
    console.log(`   ${q}：註腳「${foot.txt}」（被標約的人 ${foot.anyApprox}）`);
    ok(foot.txt === '點名字看這個人的帳是怎麼算出來的', `註腳不對：「${foot.txt}」`);
  }

  /* ── 5 U-2-g 分享頁反向 ──────────────────────────────────────────────── */
  await go('screen=s06');
  const share = await p.evaluate(async () => {
    document.querySelector('.tot').click();
    await new Promise(r => setTimeout(r, 300));
    const rows = [...document.querySelectorAll('.perrow')];
    return { n: rows.length, btn: rows.filter(x => x.tagName === 'BUTTON').length }; });
  console.log(`   分享頁成員列 ${share.n}（button ${share.btn}）`);
  ok(share.n > 0, '分享頁沒有成員列，這條等於沒驗');
  ok(share.btn === 0, '分享頁的成員列不得是 button（S-06-14：這裡的列不可點）');

  /* ── 6 U-4 矮按鈕 ────────────────────────────────────────────────────── */
  console.log('');
  for (const [q, name] of [['screen=s05&state=settled', '結算頁「標記付清」'],
                           ['screen=s06', '分享頁「開一趟自己的」']]) {
    await go(q);
    const cb = await p.evaluate(() => {
      const el = document.querySelector('.clearbtn');
      if (!el) return null;
      /* 先捲進畫面再問「這個點打下去會打到誰」——落在摺線以下時
         `elementFromPoint` 會回 null，那不是「被偷走」 */
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el, '::after');
      const w = Math.max(r.width, parseFloat(cs.width) || 0);
      const h = Math.max(r.height, parseFloat(cs.height) || 0);
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return { vis: `${Math.round(r.width)}×${Math.round(r.height)}`, w, h,
               own: !!hit && (hit === el || el.contains(hit)) };
    });
    console.log(`   ${name}：看得見 ${cb && cb.vis}｜可點區 ${cb && Math.round(cb.w)}×${cb && Math.round(cb.h)}｜中心命中自己 ${cb && cb.own}`);
    if (cb === null) { ok(false, `${name} 找不到 .clearbtn，這條等於沒驗`); continue; }
    ok(cb.h >= 44 && cb.w >= 44, `${name} 可點區只有 ${Math.round(cb.w)}×${Math.round(cb.h)}`);
    ok(Math.abs(parseFloat(cb.vis.split('×')[1]) - 31) <= 1,
      `${name} 看得見的高度應維持 31，實際 ${cb.vis}——撐大的是可點區不是外觀`);
    ok(cb.own, `${name} 的中心點被別的元素吃掉了`);
  }

  /* ── 7 U-5 hub 模式 ──────────────────────────────────────────────────── */
  console.log('');
  const txOf = async q => { await go(q); return p.evaluate(() =>
    [...document.querySelectorAll('.txrow')].map(r => (r.textContent || '').replace(/\s+/g, ' '))); };
  const hub = await txOf('screen=s05&state=settled&settle=hub');
  const dir = await txOf('screen=s05&state=settled');
  console.log(`   hub 轉帳 ${hub.length} 筆｜direct 轉帳 ${dir.length} 筆`);
  ok(hub.length > 0, 'hub 模式沒有轉帳列，這條等於沒驗');
  ok(JSON.stringify(hub) !== JSON.stringify(dir),
    'hub 與 direct 的轉帳清單一模一樣——等於沒驗到 hub');
  /* ⚠️ `txOf()` 會導航——下面兩段一定要**重新回到 hub 那一頁**再量，
     不然量到的是上一行 direct 的畫面（第一版就是這樣，收款人印出 m0）。 */
  await go('screen=s05&state=settled&settle=hub');
  const hubInfo = await p.evaluate(() => {
    const fx = window.__HARNESS_FIXTURE__;
    return { hub: fx.trip.hub_member_id, mode: fx.trip.settlement_mode,
             items: fx.confirmed_items.map(i => [i.from_member_id, i.to_member_id]) }; });
  console.log(`   模式 ${hubInfo.mode}｜中心人 ${hubInfo.hub}｜轉帳 ${JSON.stringify(hubInfo.items)}`);
  ok(hubInfo.mode === 'hub', `?settle=hub 沒有生效，實際 ${hubInfo.mode}`);
  /* hub 模式：**每一筆的其中一端都是中心人**（欠錢的轉給他、該拿回的由他轉出），
     不是「全部人的收款人都是同一個」——那是只有債務方向時才成立。 */
  ok(hubInfo.items.every(([f, t]) => f === hubInfo.hub || t === hubInfo.hub),
    `有轉帳沒有經過中心人 ${hubInfo.hub}：${JSON.stringify(hubInfo.items)}`);
  /* 中心人刻意不是付最多錢的那個（否則 direct 與 hub 會長一樣，等於沒驗） */
  ok(hubInfo.items.some(([f]) => f === hubInfo.hub),
    'hub 一次都沒有轉出去——收款人挑到了付最多錢的那個，等於沒驗到 hub');

  const hubSettle = await p.evaluate(async () => {
    const t = [...document.querySelectorAll('button')].find(x => x.textContent.includes('查看計算依據'));
    if (!t) return null;
    t.click(); await new Promise(r => setTimeout(r, 350));
    return [...document.querySelectorAll('[data-settle-row]')].map(e => ({
      m: e.dataset.member, s: +e.dataset.shared, n: +e.dataset.named,
      due: +e.dataset.due, paid: +e.dataset.paid, diff: +e.dataset.diff })); });
  ok(hubSettle !== null && hubSettle.length > 0, 'hub 模式展不開計算依據，這條等於沒驗');
  if (hubSettle) {
    for (const r of hubSettle) {
      ok(r.s + r.n === r.due, `hub ${r.m}：一起分 ${r.s} + 指名 ${r.n} ≠ 應分攤 ${r.due}`);
      ok(r.paid - r.due === r.diff, `hub ${r.m}：實際付出 − 應分攤 ≠ 差額`);
    }
    const z = hubSettle.reduce((a, x) => a + x.diff, 0);
    console.log(`   hub 三段：差額加總 ${z}`);
    ok(z === 0, `hub 模式差額加總應為 0，實際 ${z}`);
  }

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
