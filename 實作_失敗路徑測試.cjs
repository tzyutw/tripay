/* 實作-掛／文　量測靶要能失敗（掛-1）＋QueryClient 露出來（掛-2）＋畫面清單（掛-3）
   ＋失敗時的話要讓人看得懂（文-1）。常設 C12：使用者會撞到的失敗都要有人守。 */
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
                          await new Promise(r => setTimeout(r, 380)); };
  /** 直接打樁，不經畫面——掛-1 驗的是樁本身 */
  const probe = () => p.evaluate(async () => {
    const S = window.__SUPABASE_STUB__;
    const id = (window.__HARNESS_FIXTURE__.expenses[0] || {}).id;
    const upd = await S.from('expenses').update({ title: 'ZZ 樁測試' }).eq('id', id);
    const sel = await S.from('expenses').select('*').eq('id', id);
    return { id,
      updErr: upd.error ? upd.error.message : null,
      selErr: sel.error ? sel.error.message : null,
      selN: sel.data ? sel.data.length : null,
      title: sel.data && sel.data[0] ? sel.data[0].title : null };
  });

  console.log('\n=== 實作-掛／文　失敗路徑 ===\n');

  /* 掛-1-2　反向：不帶 fail 時寫得進去、讀得到 */
  await go('screen=s03');
  const base = await probe();
  console.log(`   不帶 fail：update error ${base.updErr}｜select error ${base.selErr}｜` +
              `${base.selN} 筆｜title「${base.title}」`);
  ok(base.updErr === null, `不帶 fail 時 update 竟然失敗：${base.updErr}`);
  ok(base.selErr === null, `不帶 fail 時 select 竟然失敗：${base.selErr}`);
  ok(base.title === 'ZZ 樁測試', `不帶 fail 時 update 沒有真的改到值（title 是「${base.title}」）`);

  /* 掛-1-1／1-3　fail=write：寫入失敗、讀取不受影響 */
  await go('screen=s03&fail=write');
  const fw = await probe();
  console.log(`   fail=write：update error「${fw.updErr}」｜select error ${fw.selErr}｜` +
              `${fw.selN} 筆｜title「${fw.title}」`);
  ok(fw.updErr !== null && /寫入失敗/.test(fw.updErr), `update 沒有回錯誤：${fw.updErr}`);
  ok(fw.selErr === null && fw.selN > 0, 'fail=write 竟然連 select 也擋掉了（整個樁壞掉，不是只擋寫入）');
  ok(fw.title !== 'ZZ 樁測試', '寫入「失敗」了卻真的改到資料——按第二次會變成兩筆');

  /* 掛-1-4　fail=read */
  await go('screen=s03&fail=read');
  const fr = await probe();
  console.log(`   fail=read ：update error ${fr.updErr}｜select error「${fr.selErr}」`);
  ok(fr.selErr !== null, `select 沒有回錯誤：${fr.selErr}`);
  ok(fr.updErr === null, 'fail=read 不該擋寫入');

  /* 掛-1-5　fail=offline */
  await go('screen=s03&fail=offline');
  const fo = await probe();
  console.log(`   fail=offline：update「${fo.updErr}」｜select「${fo.selErr}」`);
  ok(fo.updErr === 'Failed to fetch', `update 的訊息應為 Failed to fetch，實際「${fo.updErr}」`);
  ok(fo.selErr === 'Failed to fetch', `select 的訊息應為 Failed to fetch，實際「${fo.selErr}」`);

  /* 掛-2-1　QueryClient 露出來 */
  console.log('');
  await go('screen=s03');
  const qc = await p.evaluate(() => ({
    has: !!window.__QC__,
    inv: window.__QC__ ? typeof window.__QC__.invalidateQueries : 'undefined' }));
  console.log(`   __QC__：存在 ${qc.has}｜invalidateQueries 是 ${qc.inv}`);
  ok(qc.has && qc.inv === 'function', 'QueryClient 沒有露出來，C11 的同版金絲雀做不了');

  /* 掛-3-1　三個畫面各自渲染對的東西 */
  console.log('');
  for (const [sc, want] of [['s00', '用 Google 繼續'], ['s08', '隱私權政策'], ['s09', '服務條款']]) {
    await go(`screen=${sc}`);
    const t = await p.evaluate(() => document.body.innerText);
    console.log(`   ${sc}：出現「${want}」${t.includes(want)}｜fallback 成行程列表 ${t.includes('新增行程')}`);
    ok(t.includes(want), `${sc} 沒有渲染出「${want}」`);
    ok(!t.includes('新增行程'), `${sc} fallback 成行程列表了`);
  }

  /* 文-1　失敗時的話 */
  console.log('');
  const saveAndRead = async q => {
    await go(`screen=s04&${q}`);
    /* ⚠️ **要先選付款人**，不然表單會擋在「先選這筆是誰付的」，
       mutation 根本不會跑——那時量到的「沒有訊息」是表單擋下來了，不是文案沒做。
       （第一版就是這樣紅的，`__WRITES__` 是空的才查出來。） */
    await p.evaluate(() => {
      const el = document.querySelector('input#e-title') || document.querySelector('input[type=text]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(el, 'ZZ 我打的字');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const amt = document.querySelector('input#e-twd');
      if (amt) { set.call(amt, '100'); amt.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await new Promise(r => setTimeout(r, 220));
    /* 付款人：「誰付的？」那一段的第一顆 chip */
    const paid = await p.evaluate(() => {
      const lbl = [...document.querySelectorAll('*')].find(n => n.textContent.trim() === '誰付的？');
      const box = lbl && lbl.parentElement;
      const btn = box && [...box.querySelectorAll('button')][0];
      if (!btn) return false;
      btn.click(); return true;
    });
    await new Promise(r => setTimeout(r, 250));
    const fired = await p.evaluate(() => {
      const before = (window.__WRITES__ || []).length;
      const b2 = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '記下來');
      if (b2) b2.click();
      return before;
    });
    await new Promise(r => setTimeout(r, 900));
    void paid; void fired;
    return p.evaluate(() => {
      const el = document.querySelector('input#e-title') || document.querySelector('input[type=text]');
      return { txt: document.body.innerText, open: !!el, title: el ? el.value : null,
               writes: (window.__WRITES__ || []).length };
    });
  };
  const off = await saveAndRead('fail=offline');
  ok(off.writes > 0, 'fail=offline 時 mutation 根本沒跑（表單被擋下來了），這一組等於沒驗');
  console.log(`   fail=offline 存檔：writes ${off.writes}｜含「連不上網路」${off.txt.includes('連不上網路')}｜` +
              `含「你打的還在」${off.txt.includes('你打的還在')}｜表單還開著 ${off.open}｜標題「${off.title}」`);
  ok(off.txt.includes('連不上網路'), '斷網存檔沒有說「連不上網路」');
  /* 🔴 實作-AF-6：「你打的還在」那半句**已經拿掉**——toast 只活 2200ms，
     30 字讀不完就消失，寫了等於沒寫。理由是**畫面本身已經回答了**：
     表單沒關、值還在、按鈕回到可按。所以這條改成**驗那個事實**，
     不是驗那句話——講不講是文案的事，東西在不在才是使用者真正怕的。 */
  ok(off.open && off.title === 'ZZ 我打的字',
    `表單${off.open ? '' : '被關掉了'}／標題變成「${off.title}」——「畫面本身已經回答了」不成立`);

  const fwv = await saveAndRead('fail=write');
  ok(fwv.writes > 0, 'fail=write 時 mutation 根本沒跑，這一組等於沒驗');
  console.log(`   fail=write  存檔：writes ${fwv.writes}｜含「存不起來」${fwv.txt.includes('存不起來')}｜` +
              `含「你打的還在」${fwv.txt.includes('你打的還在')}｜表單還開著 ${fwv.open}｜標題「${fwv.title}」`);
  ok(fwv.txt.includes('存不起來'), '寫入失敗沒有說「存不起來」');
  ok(fwv.open && fwv.title === 'ZZ 我打的字', '表單或使用者打的值不見了');

  /* 文-1-3　畫面上不得出現後端原文 */
  for (const [label, r] of [['offline', off], ['write', fwv]]) {
    const en = (r.txt.match(/[A-Za-z][A-Za-z']+(?:\s+[A-Za-z][A-Za-z']+)+/g) || [])
      .filter(x => !/^(Google|Tripay|KRW|JPY|TWD|USD|EUR)\b/.test(x));
    console.log(`   ${label}：含 Failed to fetch ${r.txt.includes('Failed to fetch')}｜` +
                `連續英文字 ${en.length}${en.length ? '（' + en.slice(0, 2).join('、') + '）' : ''}`);
    ok(!r.txt.includes('Failed to fetch'), `${label} 把後端原文 Failed to fetch 印到畫面上了`);
    ok(en.length === 0, `${label} 畫面上有連續的英文單字：${en.slice(0, 3).join('、')}`);
  }

  /* 文-1-5　反向：正常存檔不得出現那兩句 */
  const okSave = await saveAndRead('');
  console.log(`   正常存檔：含「存不起來」${okSave.txt.includes('存不起來')}｜` +
              `含「連不上網路」${okSave.txt.includes('連不上網路')}`);
  ok(!okSave.txt.includes('存不起來') && !okSave.txt.includes('連不上網路'),
    '正常存檔竟然跳了失敗訊息（反向）');

  /* ── 掛-4　執行期切換失敗模式 ─────────────────────────────────────────── */
  console.log('');
  await go('screen=s03');
  const rt = await p.evaluate(async () => {
    const S = window.__SUPABASE_STUB__;
    const id = (window.__HARNESS_FIXTURE__.expenses[0] || {}).id;
    window.__FAIL__ = 'offline';
    const a = await S.from('expenses').update({ title: 'ZZ 執行期' }).eq('id', id);
    window.__FAIL__ = null;
    const b2 = await S.from('expenses').update({ title: 'ZZ 執行期 2' }).eq('id', id);
    return { off: a.error ? a.error.message : null, back: b2.error ? b2.error.message : null };
  });
  console.log(`   執行期設 __FAIL__='offline' → update「${rt.off}」｜設回 null → 「${rt.back}」`);
  ok(rt.off === 'Failed to fetch', `執行期切 offline 沒生效：${rt.off}`);
  ok(rt.back === null, `__FAIL__ 設回 null 之後還在失敗：${rt.back}`);

  /* ── 讀-1　讀不到 ≠ 還沒有 ────────────────────────────────────────────── */
  console.log('');
  await go('screen=s01&fail=read');
  const r1 = await p.evaluate(() => {
    const t = document.body.innerText;
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '重新整理');
    const r = btn ? btn.getBoundingClientRect() : null;
    return { t, h: r ? r.height : null, w: r ? r.width : null };
  });
  console.log(`   s01&fail=read：含「現在讀不到你的行程」${r1.t.includes('現在讀不到你的行程')}｜` +
              `含「資料還在」${r1.t.includes('資料還在')}｜含「還沒有行程」${r1.t.includes('還沒有行程')}｜` +
              `重新整理鈕 ${r1.w && Math.round(r1.w)}×${r1.h && Math.round(r1.h)}`);
  ok(r1.t.includes('現在讀不到你的行程'), 's01 讀不到時沒有說「現在讀不到你的行程」');
  ok(r1.t.includes('資料還在'), 's01 沒有回答「我的資料還在不在」');
  ok(!r1.t.includes('還沒有行程') && !r1.t.includes('第一趟要去哪'),
    's01 讀不到卻被畫成「新使用者」——這是說了錯的話，比沒說話更嚴重');
  ok(r1.h !== null && r1.h >= 44, `s01 的「重新整理」鈕高 ${r1.h}，不足 44`);

  await go('screen=s03&fail=read');
  const r2 = await p.evaluate(() => {
    const t = document.body.innerText;
    const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '重新整理');
    const r = btn ? btn.getBoundingClientRect() : null;
    return { t, h: r ? r.height : null, w: r ? r.width : null };
  });
  console.log(`   s03&fail=read：含「現在讀不到這趟的帳」${r2.t.includes('現在讀不到這趟的帳')}｜` +
              `含「資料還在」${r2.t.includes('資料還在')}｜含「第一筆從哪裡開始」${r2.t.includes('第一筆從哪裡開始')}｜` +
              `重新整理鈕 ${r2.w && Math.round(r2.w)}×${r2.h && Math.round(r2.h)}`);
  ok(r2.t.includes('現在讀不到這趟的帳'), 's03 讀不到時沒有說「現在讀不到這趟的帳」');
  ok(r2.t.includes('資料還在'), 's03 沒有回答「我的資料還在不在」');
  ok(!r2.t.includes('第一筆從哪裡開始'), 's03 讀不到卻被畫成「這趟還沒記帳」');
  ok(r2.h !== null && r2.h >= 44, `s03 的「重新整理」鈕高 ${r2.h}，不足 44`);

  /* 讀-1-3　反向：**真的沒資料**時仍走原本的空狀態。
     ⚠️ 用 `?trip=missing`（樁的 `trips` 回空陣列），不要亂編一個不存在的參數——
        參數打錯的話清單裡有行程，這條就只是在驗「有行程時不說讀不到」，
        等於沒驗到「沒資料 vs 讀不到」的分辨。 */
  await go('screen=s01&trip=missing');
  const r3 = await p.evaluate(() => document.body.innerText);
  console.log(`   s01（真的沒行程）：含「還沒有行程」${r3.includes('還沒有行程')}｜` +
              `含「讀不到」${r3.includes('讀不到')}`);
  ok(r3.includes('還沒有行程'), '「真的沒行程」的靶沒對上——這條等於沒驗');
  ok(!r3.includes('讀不到'), '真的沒資料時卻說「讀不到」（反向）');

  /* 🔴 實作-AF-6　**會自己消失的提示 ≤12 字**（toast 只活 2200ms）。
     `MSG_READ_FAIL_BODY` 是例外——它停在整頁的錯誤狀態上，不會消失。 */
  console.log('');
  const msgSrc = fs.readFileSync('src/lib/messages.ts', 'utf8');
  for (const k of ['MSG_SAVE_OFFLINE', 'MSG_SAVE_FAIL', 'MSG_DELETE_FAIL',
                   'MSG_SETTLE_OFFLINE', 'MSG_SETTLE_FAIL']) {
    const m = msgSrc.match(new RegExp(k + "\\s*=\\s*'([^']*)'"));
    const n = m ? [...m[1]].length : -1;
    console.log(`   ${k.padEnd(20)}「${m ? m[1] : '(找不到)'}」${n} 字`);
    ok(m !== null, `${k} 不見了`);
    ok(n > 0 && n <= 12, `${k} 有 ${n} 字，超過 12 字的 toast 讀不完就消失`);
  }
  const body = msgSrc.match(/MSG_READ_FAIL_BODY\s*=\s*'([^']*)'/);
  console.log(`   MSG_READ_FAIL_BODY（例外，不受 12 字限制）「${body && body[1]}」`);
  ok(body !== null && body[1] === '資料還在，只是連不上。等收訊回來再重新整理一次。',
    '整頁錯誤狀態那句被改動了——它不是會消失的提示，不該套 12 字規則');

  console.log(`\n   pageerror：${errs.length ? errs.join(' | ') : '無'}`);
  ok(errs.length === 0, `有 ${errs.length} 個 pageerror`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
