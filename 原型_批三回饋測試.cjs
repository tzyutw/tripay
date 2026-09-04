/* 原型批三回饋測試（#25）
 *
 * Rozi 看完批三原型後提的 7 項回饋＋1 項自查發現。守的是：
 *   佔位符清乾淨、內部批號不外洩、b() 造成的按鈕塌陷、--dg 與 --out 分級、
 *   空名字不得存檔、S-02c 說明卡移出手機框、摺紙動畫只播一次且留下最終畫面、
 *   S-03b／S-03c 的灰字取捨。
 *
 * 用真實 Chrome——寬度、顏色、animation 的 computed 值 jsdom 全部量不到。
 *   PUPPETEER_PATH=... node 原型_批三回饋測試.cjs [檔案]
 */
const path = require('path'), fs = require('fs');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) {
  if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
  else { console.error('需要 puppeteer-core'); process.exit(2); }
}
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || 'Tripay_原型.html');
const SRC = fs.readFileSync(FILE, 'utf8');

/* 把每一頁都展開到「東西最多」的狀態，之後的掃描才蓋得到 */
const EXPAND = () => {
  store.s01 = 'empty'; renderS01();
  f = blankForm(store.trips[0].members); f.owner = 0; f.showCur = true; f.adding = true; f.dlg = true; renderS02();
  fb = null; renderS02b(); fb.tonePick = true; renderS02b();
  store.expenses.t1 = demoExpenses(); renderS03();
  store.s03bView = 'share'; renderS03b();
  store.s03Filter = { kind:'member', memberId: tripOf('t1').members[0].id }; renderS03d();
  store.s07dlg = true; renderS07(); renderS02c(); renderS06();
  ['check','pending','partial','done'].forEach(p => { store.s05 = p; store.s05open = true; renderS05(); });
};

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('   ❌ ' + m)); };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 900 });
  await page.goto('file://' + FILE, { waitUntil: 'load' });

  /* ── 1　佔位符清乾淨（#25-1）───────────────────────────────── */
  console.log('\n=== 1　沒有殘留佔位符 ===');
  for (const tok of ['佔位', '〔', '〕']) {
    const n = SRC.split(tok).length - 1;
    console.log(`   「${tok}」出現 ${n} 次`);
    ok(n === 0, `全文仍有 ${n} 個「${tok}」`);
  }
  const dlg = await page.evaluate(() => { f = blankForm(store.trips[0].members); f.start='2026-08-31'; f.dlg = true; renderS02();
    return document.querySelector('#scr-s02 .dlg').textContent; });
  console.log('   單日確認框：', dlg.replace(/\s+/g,' ').trim());
  ok(/只有 8\/31 這一天？/.test(dlg), '標題應以出發日提問，不用「單日行程」這個系統講法');
  ok(dlg.includes('回程還沒填。之後可以再補。'), '說明應只留「之後可以再補」');
  ok(dlg.includes('就這一天') && !dlg.includes('是，單日'), '右鈕應是動作「就這一天」，不是回答');

  /* ── 2　手機框裡不得出現內部批號（#25-9）───────────────────── */
  console.log('\n=== 2　手機框不出現「批一～批四」 ===');
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    const hits = await page.evaluate(exp => {
      eval('(' + exp + ')()');
      const bad = [];
      document.querySelectorAll('.ui').forEach(u => {
        const t = u.textContent;
        ['批一','批二','批三','批四'].forEach(k => { if (t.includes(k)) bad.push(u.id + ':' + k); });
      });
      return [...new Set(bad)];
    }, EXPAND.toString());
    console.log(`   ${w}px：`, hits.length ? hits.join('、') : '（無）');
    ok(hits.length === 0, `${w}px 手機框出現內部批號：${hits.join('、')}`);
  }
  await page.setViewport({ width: 375, height: 900 });

  /* ── 3　b() 造成的按鈕塌陷，全站掃描（#25-7）────────────────── */
  console.log('\n=== 3　flex 容器裡被 b() 包住的按鈕沒有塌陷 ===');
  const squashed = await page.evaluate(exp => {
    eval('(' + exp + ')()');
    const out = []; let cand = 0;
    const scan = () => document.querySelectorAll('.ui *').forEach(box => {
      if (getComputedStyle(box).display !== 'flex') return;
      const kids = [...box.children];
      const bs = kids.filter(k => k.classList.contains('b') && k.querySelector('.btn'));
      if (!bs.length) return;
      const share = box.getBoundingClientRect().width / kids.length;
      cand += bs.length;
      bs.forEach(k => {
        const w = k.getBoundingClientRect().width;
        if (w < share * 0.7) out.push({ id: (k.querySelector('.bdg') || {}).textContent
                                            || k.textContent.trim().slice(0,6),
                                        w: +w.toFixed(1), share: +share.toFixed(1) });
      });
    });
    // S-03b 的兩個 view 共用同一個容器，一次只渲染得出一個——兩個都要掃到
    store.s03bView = 'share'; renderS03b(); scan();
    store.s03bView = 'del';   renderS03b(); scan();
    return { out, cand };
  }, EXPAND.toString());
  // 掃到 0 個候選就等於沒測——先確認這條掃描真的看得到東西
  console.log(`   掃到 ${squashed.cand} 個被 b() 包住的按鈕｜塌陷：`,
              squashed.out.length ? JSON.stringify(squashed.out) : '（無）');
  ok(squashed.cand > 0, '掃描沒找到任何被 b() 包住的按鈕，這條測試等於沒測');
  ok(squashed.out.length === 0, `按鈕被壓縮：${JSON.stringify(squashed.out)}`);

  /* ── 4／5　--dg 與 --out 分級、對比度（#25-8）───────────────── */
  console.log('\n=== 4／5　destructive 與提醒不再同色 ===');
  const col = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.ui'));   // token 掛在 .ui 上，不是 :root
    return { dg: cs.getPropertyValue('--dg').trim(), out: cs.getPropertyValue('--out').trim() };
  });
  const hex = h => { const m = h.replace('#','').match(/../g).map(x => parseInt(x,16)); return m; };
  const lum = h => { const [r,g,b] = hex(h).map(v => { v /= 255; return v <= .03928 ? v/12.92 : ((v+.055)/1.055)**2.4; });
    return .2126*r + .7152*g + .0722*b; };
  const ratio = (a,b) => { const [x,y] = [lum(a), lum(b)].sort((p,q)=>q-p); return (x+.05)/(y+.05); };
  console.log(`   --dg ${col.dg} ｜--out ${col.out}`);
  ok(col.dg && col.out && col.dg !== col.out, '--dg 與 --out 仍是同一個色碼');
  console.log(`   相對亮度 dg ${lum(col.dg).toFixed(4)} < out ${lum(col.out).toFixed(4)}`);
  ok(lum(col.dg) < lum(col.out), '--dg 應比 --out 更深');
  const cr = ratio('#FFFFFF', col.dg);
  console.log(`   白字對 --dg 對比度 ${cr.toFixed(2)}:1`);
  ok(cr >= 4.5, `白字對 --dg 只有 ${cr.toFixed(2)}:1，未達 4.5`);

  /* ── 6　名字空白不得存檔（#25-4）──────────────────────────── */
  console.log('\n=== 6　沒有名字就不能加成員 ===');
  const add = await page.evaluate(() => {
    const r = {};
    f = blankForm(store.trips[0].members); f.adding = true; f.newName = ''; renderS02();
    r.emptyDisabled = document.getElementById('s02adddo').disabled;
    f.newName = '   '; renderS02();
    r.spaceDisabled = document.getElementById('s02adddo').disabled;
    f.newName = '阿'; renderS02();
    r.filledDisabled = document.getElementById('s02adddo').disabled;
    // Enter 這條路徑也要擋
    const before = f.members.length;
    f.newName = '  '; renderS02();
    const inp = document.getElementById('s02newname');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
    r.afterEnter = f.members.length - before;
    // 打字時 disabled 要跟著鬆開，而且不得重繪輸入框（#13）
    inp.value = '阿'; inp.dispatchEvent(new Event('input', { bubbles:true }));
    r.liveEnabled = !document.getElementById('s02adddo').disabled;
    r.sameNode = document.getElementById('s02newname') === inp;
    return r;
  });
  console.log('   空白 disabled:', add.emptyDisabled, '｜只有空格:', add.spaceDisabled,
              '｜有字:', add.filledDisabled, '｜Enter 增加了', add.afterEnter, '人');
  ok(add.emptyDisabled === true,  '名字空白時「加進來」應為 disabled');
  ok(add.spaceDisabled === true,  '只有空白字元時「加進來」應為 disabled');
  ok(add.filledDisabled === false,'有名字時「加進來」應可按');
  ok(add.afterEnter === 0,        'Enter 在空名字時不應加入成員');
  ok(add.liveEnabled === true,    '打字後 disabled 應即時鬆開');
  ok(add.sameNode === true,       '打字時不得重繪輸入框（#13 的教訓）');

  /* ── 7　S-02c 說明卡移出手機框，示範剩三列（#25-3／25-4）───── */
  console.log('\n=== 7　S-02c 不再向使用者解釋規則 ===');
  const s02c = await page.evaluate(() => {
    renderS02c();
    const el = document.getElementById('scr-s02c');
    return { html: el.innerHTML, text: el.textContent,
             demo: el.querySelectorAll('.sec')[0].nextElementSibling.querySelectorAll('.rowb').length };
  });
  for (const k of ['emoji 鍵盤', '驗證規則', 'grapheme']) {
    console.log(`   含「${k}」:`, s02c.text.includes(k));
    ok(!s02c.text.includes(k), `手機框仍在解釋「${k}」`);
  }
  console.log('   示範列數:', s02c.demo);
  ok(s02c.demo === 3, `三層 fallback 示範應剩 3 列（移除「名字也空」），實際 ${s02c.demo}`);
  ok(/firstGrapheme/.test(SRC), '驗證邏輯 firstGrapheme() 不得移除');
  ok(/'S-02c-12'/.test(SRC) && /'S-02c-13'/.test(SRC), 'S-02c-12／13 的編號要留在清單裡，不重新編號');

  /* ── 8／9／10　摺紙動畫（#25-2）───────────────────────────── */
  console.log('\n=== 8／9／10　結算完成動畫只播一次，且留下最終畫面 ===');
  const anim = await page.evaluate(() => {
    store.s05 = 'done'; renderS05();
    const g = s => { const el = document.querySelector('.anim.fold ' + s); if (!el) return null;
      const c = getComputedStyle(el); return { it: c.animationIterationCount, fm: c.animationFillMode, nm: c.animationName }; };
    return { sheet: g('.sheetline'), plane: g('.plane') };
  });
  console.log('   .sheetline', JSON.stringify(anim.sheet), '\n   .plane    ', JSON.stringify(anim.plane));
  ok(anim.sheet && anim.sheet.it === '1', '.sheetline 應只播一次');
  ok(anim.plane && anim.plane.it === '1', '.plane 應只播一次');
  ok(anim.sheet && anim.sheet.fm.includes('forwards'), '.sheetline 應 fill-mode: forwards');
  ok(anim.plane && anim.plane.fm.includes('forwards'), '.plane 應 fill-mode: forwards');

  await new Promise(r => setTimeout(r, 2000));
  const finalOp = await page.evaluate(() => +getComputedStyle(document.querySelector('.anim.fold .plane')).opacity);
  console.log('   播完 2s 後 .plane opacity =', finalOp);
  ok(finalOp > 0.9, `動畫結束後紙飛機應留在畫面上，實際 opacity ${finalOp}`);

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const reduced = await page.evaluate(() => {
    store.s05 = 'done'; renderS05();
    const svg = document.querySelector('.anim.fold');
    const names = [...svg.querySelectorAll('*')].map(e => getComputedStyle(e).animationName);
    return { names: [...new Set(names)], planeOp: +getComputedStyle(svg.querySelector('.plane')).opacity };
  });
  console.log('   reduce 時 animation-name:', reduced.names.join('、'), '｜.plane opacity', reduced.planeOp);
  ok(reduced.names.every(n => n === 'none'), `reduce 時仍有動畫：${reduced.names.join('、')}`);
  ok(reduced.planeOp > 0.9, 'reduce 時應直接呈現最終畫面，不是空白');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  /* ── 11　S-03b 灰字只剩一條（#25-5）───────────────────────── */
  console.log('\n=== 11　分享選單只留隱私告知那一條灰字 ===');
  const sh = await page.evaluate(() => {
    store.s03bView = 'share'; renderS03b();
    return [...document.querySelectorAll('#scr-s03b .shopt .s')].map(e => e.textContent.trim());
  });
  console.log('   灰字:', sh.length ? sh.join(' ／ ') : '（無）');
  ok(sh.length === 1, `分享選單灰字應剩 1 條，實際 ${sh.length}`);
  ok(sh[0] === '不用登入就看得到消費明細', `留下的應是隱私告知，實際「${sh[0]}」`);
  const shTitles = await page.evaluate(() => [...document.querySelectorAll('#scr-s03b .shopt .t')].map(e => e.textContent.trim()));
  console.log('   標題:', shTitles.join(' ／ '));
  ok(shTitles[0] === '複製文字摘要', '差別要做進標題本身：「文字摘要」對上「分享連結」');

  /* ── 12　刪除對話框（#25-6）───────────────────────────────── */
  console.log('\n=== 12　刪除對話框砍提示行，清單留著 ===');
  const del = await page.evaluate(() => {
    store.s03bView = 'del'; renderS03b();
    const d = document.querySelector('#scr-s03b .dlg');
    return { text: d.textContent, li: d.querySelectorAll('li').length };
  });
  console.log('   清單', del.li, '項｜含「維持不可按」:', del.text.includes('維持不可按'));
  ok(!del.text.includes('維持不可按'), 'S-03c-8 提示行應已移除');
  ok(del.li === 3, `S-03c-3 的三項清單不得動，實際 ${del.li} 項`);
  ok(del.text.includes('刪掉就救不回來：'), 'S-03c-2 應縮短為「刪掉就救不回來：」');
  ok(del.text.includes('請輸入「刪除」兩個字'), 'S-03c-4 應改用口語的「兩個字」');

  /* ── 13　三個寬度都不橫向捲動（既有規則，這裡再跑一次）────── */
  console.log('\n=== 13　不得橫向捲動 ===');
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    const d = await page.evaluate(exp => { eval('(' + exp + ')()');
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; }, EXPAND.toString());
    console.log(`   ${w}px：${d.sw} / ${d.cw}`);
    ok(d.sw <= d.cw, `${w}px 橫向溢出 ${d.sw - d.cw}px`);
  }

  /* ── 14　原型與盤點表逐一對得起來 ─────────────────────────── */
  console.log('\n=== 14　編號與盤點表對帳 ===');
  const proto = await page.evaluate(() => {
    const ids = new Set();
    document.querySelectorAll('.idx tr').forEach(tr => {
      const c = tr.querySelector('td'); if (c && /^S-\d/.test(c.textContent.trim())) ids.add(c.textContent.trim()); });
    return [...ids];
  });
  // 盤點表的第一欄可能帶刪除線（~~S-05-1~~）或註記（S-01-11 [不在稿上]），兩種都要收
  const inv = [...fs.readFileSync('_盤點_畫面功能.md','utf8')
    .matchAll(/^\|\s*~*(S-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)~*(?:\s*\[[^\]]*\])?\s*\|/gm)].map(m => m[1]);
  const invSet = new Set(inv);
  const orphan = proto.filter(x => !invSet.has(x));
  const missing = inv.filter(x => !proto.includes(x) && !/^S-(0[89]|1[01])-/.test(x));
  console.log(`   原型 ${proto.length} 項｜盤點表 ${invSet.size} 項`);
  console.log('   原型有、盤點表沒有：', orphan.length ? orphan.join(' ') : '（無）');
  console.log('   盤點表有、原型沒有（已扣除延後的批四）：', missing.length ? missing.join(' ') : '（無）');
  ok(orphan.length === 0, `孤兒編號：${orphan.join(' ')}`);
  ok(missing.length === 0, `盤點表有但原型沒有：${missing.join(' ')}`);

  await browser.close();
  console.log('\n════════════════════════════');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
