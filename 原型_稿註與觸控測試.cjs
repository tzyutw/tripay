/* #30：稿註漏在產品畫面／圖示按鈕統一／hero 成員 emoji／S-07-4／
 *      未定案文案的因果／金額列觸控範圍／統計卡幣別提示
 *
 *   BEFORE=<#30 之前的 Tripay_原型.html>
 */
const fs = require('fs'), path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
            else { console.error('需要 puppeteer-core'); process.exit(2); } }
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || 'Tripay_原型.html');
const SRC  = fs.readFileSync(FILE, 'utf8');
const BEFORE = process.env.BEFORE;

const EXPAND = () => {
  store.s01 = 'empty'; renderS01();
  f = blankForm(store.trips[0].members); f.owner = 0; f.showCur = true; f.adding = true; f.dlg = true; renderS02();
  fb = null; renderS02b(); fb.tonePick = true; renderS02b();
  store.expenses.t1 = demoExpenses(); store.s03Tab = 'exp'; store.s03StatOpen = true; renderS03();
  store.s03Filter = { kind: 'member', memberId: tripOf('t1').members[0].id }; renderS03d();
  store.s07dlg = true; renderS07(); renderS02c();
  store.s06StatOpen = true; renderS06();
  g = blankExp(); renderS04();
  ['check', 'pending', 'partial', 'done'].forEach(p => { store.s05 = p; store.s05open = true; renderS05(); });
  store.s03bView = 'share'; renderS03b();
};

/* 描述稿件本身的字眼——這些只能出現在右側清單，不能出現在手機框裡 */
const DRAFT_WORDS = ['移除了', '識別由字標', '列表到此結束', '首頁沒有固定底部操作列',
  '稿上', '這裡示意', '（示意）', '原型', '佔位', '編號清單', '即將推出'];

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 900 });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file://' + FILE, { waitUntil: 'load' });
  console.log('\n=== 0　載入 ===');
  console.log('   錯誤', errs.length, errs.slice(0, 2).join(' | '));
  ok(errs.length === 0, `載入時有 ${errs.length} 個錯誤`);

  /* 1　手機框裡不得有稿註 */
  console.log('\n=== 1　手機框裡不得有描述稿件本身的字 ===');
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    const hits = await page.evaluate((exp, words) => {
      document.documentElement.classList.remove('anno');
      eval('(' + exp + ')()');
      const bad = [];
      document.querySelectorAll('.ui').forEach(ui => {
        const t = [...ui.querySelectorAll('*')]
          .filter(el => !el.classList.contains('bdg'))
          .map(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))
          .join(' ');
        words.forEach(k => { if (t.includes(k)) bad.push(`${ui.id}:${k}`); });
      });
      return [...new Set(bad)];
    }, EXPAND.toString(), DRAFT_WORDS);
    console.log(`   ${w}px：`, hits.length ? hits.join('、') : '（無）');
    ok(hits.length === 0, `${w}px 手機框裡有稿註：${hits.join('、')}`);
  }
  await page.setViewport({ width: 375, height: 900 });

  /* 2　圖示按鈕一律 .ic2 */
  console.log('\n=== 2　所有 icon 按鈕統一 .ic2 ===');
  const btns = await page.evaluate(exp => {
    eval('(' + exp + ')()');
    return {
      x: document.querySelectorAll('.ui .x').length,
      ic2: [...document.querySelectorAll('.ui .ic2')].map(el => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        const a = getComputedStyle(el, '::after');
        const svg = el.querySelector('svg');
        return { label: el.getAttribute('aria-label'), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                 border: parseFloat(cs.borderTopWidth), radius: cs.borderRadius,
                 svg: svg ? svg.getAttribute('width') : null,
                 hw: parseFloat(a.width) || r.width, hh: parseFloat(a.height) || r.height };
      }),
    };
  }, EXPAND.toString());
  console.log(`   class="x" 還有 ${btns.x} 個｜.ic2 共 ${btns.ic2.length} 顆`);
  console.log('   ' + [...new Set(btns.ic2.map(x => x.label))].join('／'));
  ok(btns.x === 0, `還有 ${btns.x} 個舊的 .x 關閉鍵`);
  ok(!/\.ui \.x\{/.test(SRC), '.x 的 CSS 定義應已刪除');
  ok(btns.ic2.every(x => x.w === 40 && x.h === 40), '有 .ic2 不是 40×40');
  ok(btns.ic2.every(x => x.border > 0), '有 .ic2 沒有那一圈線');
  ok(btns.ic2.every(x => x.svg === '20'), '有 .ic2 的 icon 不是 20px');
  ok(btns.ic2.every(x => x.hw >= 44 && x.hh >= 44), '有 .ic2 的可點區不足 44');
  ok(btns.ic2.filter(x => x.label === '關閉').length === 3, '三個關閉鍵都要是 .ic2 且有 aria-label');

  /* 3　hero 副標只留日期 */
  console.log('\n=== 3　S-03-8 hero 副標 ===');
  const hero = await page.evaluate(() => {
    const t = tripOf('t1');
    store.expenses.t1 = demoExpenses(); store.s03Tab = 'exp'; renderS03();
    const withEmoji = document.querySelector('#scr-s03 .dt').textContent.trim();
    const keep = t.members.map(m => m.emoji);
    t.members.forEach(m => m.emoji = '');
    renderS03();
    const noEmoji = document.querySelector('#scr-s03 .dt').textContent.trim();
    t.members.forEach((m, i) => m.emoji = keep[i]);
    renderS03();
    return { withEmoji, noEmoji, names: t.members.map(m => m.name) };
  });
  console.log(`   有 emoji 時：「${hero.withEmoji}」\n   全員都沒設 emoji 時：「${hero.noEmoji}」`);
  ok(hero.withEmoji === hero.noEmoji, 'hero 副標不該隨成員 emoji 改變');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(hero.withEmoji), 'hero 副標仍有成員 emoji');
  ok(hero.names.every(n => !hero.noEmoji.includes(n[0])), 'hero 副標仍有成員名字的字元');

  /* 4　S-07-4 整段移除 */
  console.log('\n=== 4　S-07-4 整段移除 ===');
  const s07 = await page.evaluate(() => {
    store.s07dlg = false; renderS07();
    return document.getElementById('scr-s07').textContent;
  });
  for (const k of ['我的資料', '通訊錄', '卡片管理', '帳單週期', '即將推出']) {
    console.log(`   含「${k}」:`, s07.includes(k));
    ok(!s07.includes(k), `S-07 仍有「${k}」`);
  }
  ok(SRC.includes("'S-07-4'"), 'S-07-4 的編號要保留在清單裡');
  console.log('   S-07 剩下:', s07.replace(/\s+/g, ' ').trim());

  /* 5　未定案文案：因果不能講反 */
  console.log('\n=== 5　未定案文案 ===');
  for (const k of ['結算會跳過這筆', '換算不了']) {
    const n = SRC.split(k).length - 1;
    console.log(`   「${k}」出現 ${n} 次`);
    ok(n === 0, `全站仍有 ${n} 個「${k}」`);
  }
  const msgs = await page.evaluate(() => {
    const t = tripOf('t1'), M = t.members.map(m => m.id), out = {};
    t.rateTwd = undefined; t.rateFor = undefined;
    g = exp({ forAmt: '20000', pay: 'cash', type: 'shared', parts: M, payer: M[0] });
    renderS04(); out.沒匯率 = document.getElementById('amtnote').textContent.trim();
    t.rateTwd = '1'; t.rateFor = '45';
    g = exp({ pay: 'cash', type: 'shared', parts: M, payer: M[0] });
    renderS04(); out.沒台幣 = document.getElementById('amtnote').textContent.trim();
    g = exp({ forAmt: '45000', twdAmt: '1035', pay: 'card', type: 'shared', parts: M, payer: M[0] });
    renderS04(); out.正常 = document.getElementById('amtnote').textContent.trim();
    /* 同一句字串在 S-04-16 的 sub2 也出現一次——必須完全相同。
       要讓 sub2 走到 twdPending 那一支：沒匯率、只填外幣、沒有台幣總額。 */
    t.rateTwd = undefined; t.rateFor = undefined;
    /* 四個人都填了，外幣總額才會自動補（R6）；沒有匯率、沒有台幣總額 → twdPending */
    g = exp({ pay: 'cash', type: 'individual', parts: M, fillCur: 'FOR',
              indiv: { [M[0]]: '12000', [M[1]]: '8000', [M[2]]: '5000', [M[3]]: '5000' }, payer: M[0] });
    renderS04();
    const sub2 = document.querySelector('#scr-s04 .cmp .sub2');
    out.sub2 = sub2 ? sub2.textContent.trim() : '';
    return out;
  });
  Object.entries(msgs).forEach(([k, v]) => console.log(`   ${k}：「${v}」`));
  ok(msgs.沒匯率.includes('先記著了') && msgs.沒匯率.includes('設好這趟的現金匯率就會自動換算'),
    '沒匯率時要先說東西還在，再講解除條件');
  ok(msgs.沒台幣.includes('先記著了') && msgs.沒台幣.includes('補上台幣金額就會算進結算'),
    '沒台幣金額時同上');
  ok(msgs.正常.includes('填一邊就好'), '正常狀態維持原句');
  ok(msgs.sub2 === msgs.沒台幣,
    `sub2 與金額提示必須是同一句：「${msgs.sub2}」vs「${msgs.沒台幣}」`);
  const once = SRC.split('補上台幣金額就會算進結算').length - 1;
  console.log('   「補上台幣金額就會算進結算」在原始碼出現', once, '次');
  ok(once === 1, `同一句只准寫一次，實際寫了 ${once} 次`);
  ok(/const MSG_TWD_PENDING/.test(SRC) && /const MSG_NO_RATE/.test(SRC), '兩句都要是共用常數');

  /* 6　金額列：夠高、整列可點 */
  console.log('\n=== 6　金額列的觸控範圍 ===');
  const amt = await page.evaluate(() => {
    g = blankExp(); renderS04();
    const lines = [...document.querySelectorAll('#scr-s04 .amtline')];
    const stack = document.querySelector('#scr-s04 .amtstack');
    return { h: lines.map(l => +l.getBoundingClientRect().height.toFixed(1)),
             tag: lines.map(l => l.tagName), forAttr: lines.map(l => l.getAttribute('for')),
             gap: getComputedStyle(stack).rowGap };
  });
  console.log('   高度', JSON.stringify(amt.h), '｜標籤', amt.tag.join('/'), '｜for', amt.forAttr.join('/'), '｜gap', amt.gap);
  ok(amt.h.every(h => h >= 48), `金額列應 ≥48px，實際 ${JSON.stringify(amt.h)}`);
  ok(amt.tag.every(t => t === 'LABEL'), '金額列要是 <label> 才能整列點');
  ok(amt.forAttr.join(',') === 'e-for,e-twd', 'label 的 for 要指向該列的 input');
  ok(amt.gap === '10px', `.amtstack 的 gap 應為 10px，實際 ${amt.gap}`);
  const focus = await page.evaluate(() => {
    g = blankExp(); renderS04();
    const out = {};
    document.querySelector('#scr-s04 .amtline .cur').click();
    out.幣別文字 = document.activeElement.id;
    const t = tripOf('t1'), M = t.members.map(m => m.id);
    g = exp({ twdAmt: '1000', pay: 'card', type: 'individual', parts: M, indiv: {}, payer: M[0] });
    renderS04();
    const row = document.querySelector('#scr-s04 .amtrow');
    out.逐人列標籤 = row ? row.tagName : null;
    if (row) { row.querySelector('span:nth-child(2)').click(); out.逐人名字 = document.activeElement.id; }
    return out;
  });
  console.log('   ' + JSON.stringify(focus));
  ok(focus.幣別文字 === 'e-for', `點左側幣別文字應聚焦該列 input，實際 ${focus.幣別文字}`);
  ok(focus.逐人列標籤 === 'LABEL', '「各自多少？」的逐人列也要是 <label>');
  ok(/^ei-/.test(focus.逐人名字 || ''), `點逐人列的名字應聚焦該列 input，實際 ${focus.逐人名字}`);

  /* 7　統計卡的幣別提示 */
  console.log('\n=== 7　統計卡幣別提示 ===');
  const cur = await page.evaluate(() => {
    const t = tripOf('t1'), out = {};
    t.rateTwd = undefined; t.rateFor = undefined;
    store.expenses.t1 = demoExpenses(); store.s03Cur = 'TWD'; store.s03Tab = 'exp'; renderS03();
    const h1 = document.querySelector('#scr-s03 .curswitch .hint');
    out.沒匯率 = h1 ? h1.textContent.trim() : '';
    out.沒匯率有連結 = !!(h1 && h1.querySelector('a'));
    out.pendingN = expsOf('t1').filter(e => {
      const c = calc(e, t); return c.twdPending && Number.isFinite(parseFloat(e.forAmt)); }).length;
    /* 補上匯率後：那幾筆換算得出來，提示整條消失 */
    t.rateTwd = '1'; t.rateFor = '45'; renderS03();
    const h2 = document.querySelector('#scr-s03 .curswitch .hint');
    out.有匯率 = h2 ? h2.textContent.trim() : '（整條不顯示）';
    /* 外幣檢視要真的切得動 */
    document.querySelector('[data-s03cur="FOR"]').click();
    out.切到外幣 = store.s03Cur;
    out.總花費 = document.querySelector('#scr-s03 .statcard .tot b').textContent.trim();
    out.每人分擔 = [...document.querySelectorAll('#scr-s03 .perlist .money')].map(x => x.textContent.trim())[0];
    store.s03Cur = 'TWD'; renderS03();
    return out;
  });
  console.log('   ' + JSON.stringify(cur, null, 0));
  ok(/有 \d+ 筆還沒換算成台幣/.test(cur.沒匯率), '提示要講出後果與筆數，不是只講「換算不了」');
  ok(cur.沒匯率.includes(String(cur.pendingN)), '筆數要是真的，不是寫死的字');
  ok(cur.沒匯率.includes('上面的總花費不含它們'), '要講出「上面那個數字是少算的」');
  ok(cur.沒匯率有連結, '台幣檢視要帶「設現金匯率 ›」的連結');
  ok(cur.有匯率 === '（整條不顯示）', '沒有缺口時整條不顯示，不要講「都換算好了」');
  ok(cur.切到外幣 === 'FOR', '外幣檢視要真的切得動');
  ok(/^[^$]/.test(cur.總花費) && !cur.總花費.startsWith('$'), `切到外幣後總花費應以外幣呈現，實際「${cur.總花費}」`);
  ok(cur.每人分擔 && !cur.每人分擔.startsWith('$'), `每人分擔列也要以外幣呈現，實際「${cur.每人分擔}」`);

  /* 8　字級：S-00 字標是唯一例外；稿件外殼不受影響 */
  console.log('\n=== 8　字級例外與稿件外殼 ===');
  const fontx = await page.evaluate(exp => {
    document.documentElement.classList.remove('anno');
    eval('(' + exp + ')()');
    const ALLOWED = [12, 13, 15, 16, 17, 20, 26];
    const odd = [];
    document.querySelectorAll('.ui').forEach(ui => {
      const walk = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || el.closest('.bdg')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        const px = parseFloat(cs.fontSize);
        if (!ALLOWED.includes(px)) odd.push({ px, txt: n.textContent.trim().slice(0, 10), scr: ui.id });
      }
    });
    const logo = odd.filter(x => x.txt === 'Tripay' && x.scr === 'scr-s00');
    return { odd: odd.filter(x => !(x.txt === 'Tripay' && x.scr === 'scr-s00')), logo };
  }, EXPAND.toString());
  console.log('   S-00 字標:', JSON.stringify(fontx.logo));
  console.log('   其餘不在階梯上的:', fontx.odd.length ? JSON.stringify(fontx.odd.slice(0, 4)) : '（無）');
  ok(fontx.logo.length === 1 && fontx.logo[0].px === 44, 'S-00 字標應維持 44px——它是圖形識別，不受字級階梯約束');
  ok(fontx.odd.length === 0, `除字標外還有 ${fontx.odd.length} 處字級不在階梯上`);
  const shell = async (f) => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 1280, height: 900 });
    await pg.goto('file://' + path.resolve(f), { waitUntil: 'load' });
    const r = await pg.evaluate(() => {
      const q = s => { const el = document.querySelector(s); return el ? getComputedStyle(el).fontSize : null; };
      return { top: q('.top .nm'), bt: q('.top .bt'), scrhd: q('.scrhd h2'), rig: q('.rig .t'),
               idx: q('.idx table'), modesw: q('.modesw button'), devt: q('#devtoggle'), phcap: q('.phcap') };
    });
    await pg.close(); return r;
  };
  const nowShell = await shell(FILE);
  console.log('   稿件外殼:', JSON.stringify(nowShell));
  if (BEFORE) {
    const beforeShell = await shell(BEFORE);
    ok(JSON.stringify(nowShell) === JSON.stringify(beforeShell),
      `稿件外殼的字級被動到了：${JSON.stringify(beforeShell)} → ${JSON.stringify(nowShell)}`);
  } else console.log('   （沒有 BEFORE 基準檔，這一條跳過）');

  /* 9　貼邊與橫向捲動（含真機模式）*/
  console.log('\n=== 9　貼邊與橫向捲動 ===');
  const INK = () => {
    const bad = [];
    document.querySelectorAll('.ui').forEach(ui => {
      const box = ui.getBoundingClientRect();
      const walk = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || el.classList.contains('bdg')) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        const r = document.createRange(); r.selectNodeContents(n);
        const rect = r.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.left - box.left < 13.5 || box.right - rect.right < 13.5)
          bad.push(`${ui.id}「${n.textContent.trim().slice(0, 10)}」`);
      }
    });
    return [...new Set(bad)];
  };
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    const r = await page.evaluate((exp, ink) => {
      document.documentElement.classList.remove('anno');
      eval('(' + exp + ')()');
      return { ink: eval('(' + ink + ')()'),
               sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    }, EXPAND.toString(), INK.toString());
    console.log(`   ${w}px：${r.sw}/${r.cw}`, r.ink.length ? '貼邊 ' + r.ink.slice(0, 3).join('、') : '');
    ok(r.sw <= r.cw && r.ink.length === 0, `${w}px 有溢出或貼邊`);
    const pg = await browser.newPage();
    await pg.setViewport({ width: w, height: 800, isMobile: true, hasTouch: true });
    await pg.goto('file://' + FILE, { waitUntil: 'load' });
    const d = await pg.evaluate(ink => ({
      dev: document.documentElement.classList.contains('dev'),
      ink: eval('(' + ink + ')()'),
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    }), INK.toString());
    console.log(`   ${w}px 真機：dev=${d.dev} ${d.sw}/${d.cw}`, d.ink.length ? '貼邊 ' + d.ink.slice(0, 2).join('、') : '');
    ok(d.dev && d.sw <= d.cw && d.ink.length === 0, `${w}px 真機模式有問題`);
    await pg.close();
  }

  /* 10　編號對帳 */
  console.log('\n=== 10　編號對帳 ===');
  const ids = await page.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('.idx table tr td:first-child').forEach(td => {
      const t = td.textContent.trim(); if (/^S-\d/.test(t)) s.add(t); });
    return [...s];
  });
  const rd = f => [...fs.readFileSync(f, 'utf8')
    .matchAll(/^\|\s*~*(S-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)~*(?:\s*\[[^\]]*\])?\s*\|/gm)].map(m => m[1]);
  const inv = new Set(rd('_盤點_畫面功能.md'));
  const gap = new Set(rd('_盤點_實作缺口.md'));
  const orphan = ids.filter(x => !inv.has(x));
  const missing = [...inv].filter(x => !ids.includes(x) && !/^S-(0[89]|1[01])-/.test(x));
  const gapMiss = ids.filter(x => !gap.has(x));
  console.log(`   原型 ${ids.length}｜盤點表 ${inv.size}｜盤點檔 ${gap.size}`);
  console.log('   孤兒：', orphan.join(' ') || '（無）', '｜盤點表缺：', missing.join(' ') || '（無）',
              '｜盤點檔缺：', gapMiss.join(' ') || '（無）');
  ok(orphan.length === 0 && missing.length === 0, '與盤點表對不起來');
  ok(gapMiss.length === 0, '與盤點檔對不起來');

  await browser.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
