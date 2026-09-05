/* #33：日期分組倒序／日期欄位正規化／提示句字級／支付方式連動／
 *      分享選單排版／單選鈕形狀／圓角定案／字元充當 icon
 *
 *   SHOTS=<截圖輸出目錄>
 */
const fs = require('fs'), path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
            else { console.error('需要 puppeteer-core'); process.exit(2); } }
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || 'Tripay_原型.html');
const SRC  = fs.readFileSync(FILE, 'utf8');
const SHOTS = process.env.SHOTS;

const EXPAND = () => {
  store.s01 = 'empty'; renderS01();
  f = blankForm(store.trips[0].members); f.owner = 0; f.showCur = true; f.adding = true; f.dlg = true;
  f.start = '2026-03-14'; f.end = '2026-03-18'; renderS02();
  fb = null; renderS02b(); fb.tonePick = true; renderS02b();
  store.expenses.t1 = demoExpenses(); store.s03Tab = 'exp'; store.s03StatOpen = true; renderS03();
  store.s03Filter = { kind: 'member', memberId: tripOf('t1').members[0].id }; renderS03d();
  store.s07dlg = true; renderS07(); renderS02c();
  store.s06StatOpen = true; renderS06();
  g = blankExp(); renderS04();
  ['check', 'pending', 'partial', 'done'].forEach(p => { store.s05 = p; store.s05open = true; renderS05(); });
  store.s03bView = 'share'; renderS03b();
};

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

/* 被當成圖示使用的符號字元。emoji（成員、類別、國旗）是內容，不在此限 */
const SYMBOLS = ['⠿', '✕', '✖', '×', '＋', '›', '‹', '▸', '▾', '↑', '↓', '→', '←', '⋯', '☰', '≡', '✓', '⚙', '⌄'];

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const open = async (w, h, mobile) => {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h, isMobile: !!mobile, hasTouch: !!mobile });
    await p.goto('file://' + FILE, { waitUntil: 'load' });
    return p;
  };
  const pg = await open(1280, 900, false);
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.reload({ waitUntil: 'load' });
  console.log('\n=== 0　載入 ===');
  console.log('   錯誤', errs.length, errs.slice(0, 2).join(' | '));
  ok(errs.length === 0, `載入時有 ${errs.length} 個錯誤`);

  /* 1／2　日期分組倒序 */
  console.log('\n=== 1／2　日期分組由新到舊 ===');
  const order = await pg.evaluate(() => {
    setDev(false);
    store.expenses.t1 = demoExpenses();
    /* 同一天多記兩筆，驗「剛記完的在最上面」 */
    const t = tripOf('t1'), M = t.members.map(m => m.id);
    store.expenses.t1.push(exp({ title: '晚一點記的', date: '2026-03-16', twdAmt: '100',
      pay: t.pays[0], type: 'shared', parts: M, payer: M[0] }));
    store.s03Tab = 'exp'; renderS03(); renderS06();
    const sec = s => [...document.querySelectorAll(s + ' .sec')].map(x => x.textContent.trim());
    const rows = s => [...document.querySelectorAll(s + ' .exprow .t')].map(x => x.textContent.trim());
    const html3 = document.getElementById('scr-s03').innerHTML;
    return { sec3: sec('#scr-s03'), sec6: sec('#scr-s06').filter(x => /天|出發前/.test(x)),
             rows3: rows('#scr-s03'), rows6: rows('#scr-s06'),
             bannerFirst: html3.indexOf('還沒算清楚') < html3.indexOf('class="sec"') };
  });
  console.log('   S-03 分組:', order.sec3.join(' → '));
  console.log('   S-06 分組:', order.sec6.join(' → '));
  console.log('   S-03 第一組的列:', order.rows3.slice(0, 3).join('、'));
  ok(order.sec3[0].includes('第 5 天') && order.sec3[order.sec3.length - 1] === '出發前',
    `分組應由新到舊、出發前在最底：${order.sec3.join('→')}`);
  ok(JSON.stringify(order.sec3) === JSON.stringify(order.sec6), '兩處的分組順序必須相同（同一段邏輯）');
  const i16 = order.sec3.indexOf('第 3 天 · 3/16（一）');
  const rowsIn16 = order.rows3.slice(0, 20);
  console.log('   3/16 那一組:', order.rows3.filter(x => ['紀念品', '計程車', '晚一點記的'].includes(x)).join('→'));
  const seq = order.rows3.filter(x => ['紀念品', '計程車', '晚一點記的'].includes(x));
  ok(seq[0] === '晚一點記的', `同一天之內剛記完的要在最上面，實際 ${seq.join('→')}`);
  ok(order.bannerFirst, '「還沒算清楚」橫幅要留在列表最上方');
  ok(/c2\.date\.localeCompare\(a\.date\)/.test(SRC), '排序必須寫在共用的 expenseGroups()');

  /* 3　日期欄位 */
  console.log('\n=== 3　日期輸入框 ===');
  const dates = await pg.evaluate(() => {
    f = blankForm(store.trips[0].members); f.start = '2026-03-14'; f.end = ''; renderS02();
    const q = () => [...document.querySelectorAll('#scr-s02 input[type=date]')].map(i => {
      const r = i.getBoundingClientRect(), cs = getComputedStyle(i);
      return { w: +r.width.toFixed(1), appear: cs.webkitAppearance || cs.appearance, min: cs.minWidth,
               v: i.value };
    });
    const empty = q();
    f.end = '2026-03-18'; renderS02();
    const filled = q();
    return { empty, filled, cal: document.querySelectorAll('#scr-s02 .datefield svg').length };
  });
  console.log('   空值時:', JSON.stringify(dates.empty));
  console.log('   有值時:', JSON.stringify(dates.filled));
  ok(dates.empty[0].w === dates.empty[1].w, '兩框應等寬（空值）');
  ok(dates.filled[0].w === dates.filled[1].w, '兩框應等寬（有值）');
  ok(dates.empty[0].w === dates.filled[0].w, '有值與空值的寬度必須相同——iOS 上這是溢出的來源');
  ok(dates.filled.every(d => d.appear === 'none'), `-webkit-appearance 應為 none，實際 ${dates.filled[0].appear}`);
  ok(dates.filled.every(d => d.min === '0px'), 'min-width 應為 0（flex 子元素預設 auto 會拒絕被壓縮）');
  ok(dates.cal === 2, `每個日期欄應補一個日曆 icon，實際 ${dates.cal}`);
  ok(/calendar:/.test(SRC), 'ICON 應含 calendar');

  /* 4　提示句一律 13px */
  console.log('\n=== 4　提示句字級 ===');
  const fs13 = await pg.evaluate(exp => {
    eval('(' + exp + ')()');
    const t = tripOf('t1'), M = t.members.map(m => m.id);
    t.rateTwd = undefined; t.rateFor = undefined;
    g = window.exp({ forAmt: '20000', pay: t.pays[0], type: 'shared', parts: M, payer: M[0] });
    renderS04();
    const out = {};
    ['.hint', '.note', '.txsub', '.cmp .sub2', '.statcard .foot', '.err'].forEach(sel => {
      const el = document.querySelector('.ui ' + sel);
      out[sel] = el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });
    const inp = document.querySelector('#scr-s04 input[placeholder]');
    out.input = parseFloat(getComputedStyle(inp).fontSize);
    out.placeholder = parseFloat(getComputedStyle(inp, '::placeholder').fontSize);
    return out;
  }, EXPAND.toString());
  console.log('   ' + JSON.stringify(fs13));
  const hints = ['.hint', '.note', '.txsub', '.cmp .sub2', '.statcard .foot', '.err']
    .map(k => [k, fs13[k]]).filter(([, v]) => v !== null);
  ok(hints.every(([, v]) => v === 13), `提示句應一律 13px：${hints.map(([k, v]) => k + ' ' + v).join('、')}`);
  ok(fs13.input === 16, 'placeholder 與輸入值必須 16px（iOS Safari 的硬性下限）');

  /* 5／6　支付方式連動 */
  console.log('\n=== 5／6　S-04-9 連動 S-02b-11 ===');
  const pay = await pg.evaluate(() => {
    const t = tripOf('t1');
    t.pays = ['現金', '信用卡']; fb = null; renderS02b();
    g = blankExp(); renderS04();
    const chips = () => [...document.querySelectorAll('#scr-s04 [data-pay]')].map(x => x.textContent.trim());
    const before = chips(), def = (document.querySelector('#scr-s04 .chips .chip.on') || {}).textContent;
    /* 改成只有信用卡＋悠遊卡，順序也換 */
    t.pays = ['悠遊卡', '信用卡']; fb = null; renderS02b();
    g = blankExp(); renderS04();
    const after = chips(), def2 = (document.querySelector('#scr-s04 .chips .chip.on') || {}).textContent;
    const s02b = [...document.querySelectorAll('#scr-s02b [data-payrow] span:nth-child(2)')].map(x => x.textContent.trim());
    t.pays = ['現金', '信用卡']; fb = null; renderS02b(); g = blankExp(); renderS04();
    return { before, def, after, def2, s02b, html: document.getElementById('scr-s04').innerHTML };
  });
  console.log('   S-04 chips:', pay.before.join('／'), '→ 改清單後', pay.after.join('／'));
  console.log('   S-02b 清單:', pay.s02b.join('／'), '｜S-04 預設選中:', pay.def2);
  ok(JSON.stringify(pay.after) === JSON.stringify(pay.s02b), 'S-04 的 chips 必須與 S-02b 的清單相同且同序');
  ok(pay.def === '現金' && pay.def2 === '悠遊卡', `預設應是清單第一項，實際 ${pay.def}／${pay.def2}`);
  ok(!pay.html.includes('儲值卡'), 'S-04 不該再出現清單裡沒有的「儲值卡」');
  ok(!/const PAY\s*=/.test(SRC), '全域常數 PAY 應已刪除');

  /* 7　分享選單的灰字不在同一行 */
  console.log('\n=== 7　S-03b 的灰字 ===');
  const shopt = await pg.evaluate(() => {
    store.s03bView = 'share'; renderS03b();
    const el = document.querySelector('#scr-s03b .shopt .s');
    const t = el.previousElementSibling;
    return { dir: getComputedStyle(el.parentElement).flexDirection,
             gapY: +(el.getBoundingClientRect().top - t.getBoundingClientRect().top).toFixed(1),
             lh: parseFloat(getComputedStyle(t).lineHeight) };
  });
  console.log(`   flexDirection ${shopt.dir}｜灰字距標題頂端 ${shopt.gapY}px（標題行高 ${shopt.lh}）`);
  ok(shopt.dir === 'column', '.shopt 應改為直向');
  ok(shopt.gapY >= shopt.lh, `灰字要在標題下方，實際只差 ${shopt.gapY}px`);

  /* 8　單選鈕沒有文字 */
  console.log('\n=== 8　「選」字改成單選鈕 ===');
  const sel = await pg.evaluate(() => {
    fb = null; renderS02b();
    const on = document.querySelector('#scr-s02b .selchip.on');
    const off = document.querySelector('#scr-s02b .selchip:not(.on)');
    const dot = getComputedStyle(on, '::after');
    return { txt: [on.textContent, off.textContent],
             onR: getComputedStyle(on).borderRadius, w: on.getBoundingClientRect().width,
             dotW: dot.width, dotBg: dot.backgroundColor,
             offBg: getComputedStyle(off).backgroundColor,
             offDot: getComputedStyle(off, '::after').content };
  });
  console.log('   ' + JSON.stringify(sel));
  ok(sel.txt.every(t => t.trim() === ''), '單選鈕裡不得有文字');
  ok(sel.onR === '50%' || parseFloat(sel.onR) >= sel.w / 2, '應為圓形');
  ok(parseFloat(sel.dotW) > 0, '選中應是圓框內一個實心點');
  ok(sel.offDot === 'none', '未選應是空心圓');

  /* 9　圓角定案、切換器已移除 */
  console.log('\n=== 9　圓角 ===');
  const rad = await pg.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { base: cs.getPropertyValue('--r-base').trim(), panel: cs.getPropertyValue('--r-panel').trim(),
             sw: document.querySelectorAll('[data-radius]').length,
             box: !!document.getElementById('radiussw') };
  });
  console.log('   ' + JSON.stringify(rad));
  ok(rad.base === '10px' && rad.panel === '20px', `應為 10/20，實際 ${rad.base}/${rad.panel}`);
  ok(rad.sw === 0 && !rad.box, '圓角切換器應已移除');
  ok(!/RADIUS_SETS/.test(SRC), 'RADIUS_SETS 應已刪除');

  /* 10　真機模式底部列變矮之後不遮住主要按鈕 */
  console.log('\n=== 10　真機模式的底部列 ===');
  const p2 = await open(390, 844, true);
  const cover = await p2.evaluate(() => {
    store.expenses.t1 = demoExpenses(); render();
    const bad = [];
    DEV_SCREENS.forEach(([id]) => {
      devScreen = id; renderDevBar();
      const bar = document.getElementById('devbar').getBoundingClientRect();
      const scr = document.querySelector('.scr.devon');
      if (!scr) return;
      /* 捲到底再量——按鈕在摺線以下只是還沒捲到，不是被遮住 */
      window.scrollTo(0, document.body.scrollHeight);
      const bar2 = document.getElementById('devbar').getBoundingClientRect();
      scr.querySelectorAll('.btnrow button, .btnrow span.btn, .gbtn').forEach(btn => {
        const r = btn.getBoundingClientRect();
        if (r.height && r.bottom > bar2.top + 0.5) bad.push(`${id}:${btn.textContent.trim().slice(0, 6)}`);
      });
    });
    devScreen = 's03'; renderDevBar();
    return { bad, barH: +document.getElementById('devbar').getBoundingClientRect().height.toFixed(0) };
  });
  console.log(`   底部列高 ${cover.barH}px｜被遮住的按鈕:`, cover.bad.length ? cover.bad.join('、') : '（無）');
  ok(cover.bad.length === 0, `有主要按鈕被切換器遮住：${cover.bad.join('、')}`);

  /* 11　沒有用字元充當 icon */
  console.log('\n=== 11　不得用字元充當 icon ===');
  const syms = await pg.evaluate((exp, list) => {
    document.documentElement.classList.remove('anno', 'dev');
    eval('(' + exp + ')()');
    const found = {};
    document.querySelectorAll('.ui').forEach(ui => {
      const walk = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        if (n.parentElement && n.parentElement.closest('.bdg')) continue;
        /* 只抓「拿字元當控制項或圖示」的用法。兩種要排除：
           ① 句子裡的符號——「機票 ×4」的 ×，那是文案；
           ② 夾在兩段文字中間的連接符——「小魚 → Rozi」的 →，那是排版，
              換成 16px 的 SVG 箭頭塞進 15px 的文字行只會更難讀。
           判準：左右都有文字的就是連接符，不算圖示。 */
        const txt = n.textContent.trim();
        const el = n.parentElement;
        const around = el && el.parentElement ? el.parentElement.textContent.trim() : txt;
        const idx = around.indexOf(txt);
        const midPhrase = idx > 0 && idx + txt.length < around.length;
        list.forEach(sym => {
          if (txt === sym && !midPhrase) (found[sym] = found[sym] || []).push(ui.id);
        });
      }
    });
    return found;
  }, EXPAND.toString(), SYMBOLS);
  console.log('   ' + (Object.keys(syms).length ? JSON.stringify(syms) : '（無）'));
  ok(Object.keys(syms).length === 0, `產品畫面仍用字元當圖示：${JSON.stringify(syms)}`);
  const gripSvg = await pg.evaluate(() => {
    fb = null; renderS02b();
    const g2 = document.querySelector('#scr-s02b .grip svg');
    return g2 ? g2.getAttribute('width') : null;
  });
  console.log('   拖曳把手 svg 寬:', gripSvg);
  ok(gripSvg === '16', '拖曳把手應是 16px 的 Feather menu');
  const lic = fs.readFileSync('_icon授權.md', 'utf8');
  const keys = await pg.evaluate(() => Object.keys(ICON));
  const noLic = keys.filter(k => !lic.includes('`' + k + '`'));
  console.log('   ICON', keys.length, '個｜未列入授權檔:', noLic.join(' ') || '（無）');
  ok(noLic.length === 0, `授權檔沒提到：${noLic.join(' ')}`);
  const dead = await pg.evaluate(exp => {
    const norm = {};
    for (const [k, v] of Object.entries(ICON)) {
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      tmp.innerHTML = v;
      norm[tmp.innerHTML.replace(/\s+/g, ' ').trim()] = k;
    }
    const seen = new Set();
    const collect = () => document.querySelectorAll('.ui svg.ic').forEach(sv => {
      const k = norm[sv.innerHTML.replace(/\s+/g, ' ').trim()]; if (k) seen.add(k);
    });
    const t0 = tripOf('t1');
    eval('(' + exp + ')()'); collect();
    store.s03Menu = true; renderS03(); collect();
    t0.status = 'settled'; renderS03(); collect();
    store.s05 = 'partial'; store.s05open = true; renderS05(); collect();
    store.s03Menu = false; t0.status = 'active'; renderS03();
    return Object.keys(ICON).filter(k => !seen.has(k));
  }, EXPAND.toString());
  console.log('   沒人用的 icon:', dead.join(' ') || '（無）');
  ok(dead.length === 0, `死條目：${dead.join(' ')}`);

  /* 12　貼邊與橫向捲動 */
  console.log('\n=== 12　貼邊與橫向捲動 ===');
  for (const w of [320, 375, 414]) {
    await pg.setViewport({ width: w, height: 900 });
    const r = await pg.evaluate((exp, ink) => {
      document.documentElement.classList.remove('anno', 'dev');
      eval('(' + exp + ')()');
      return { ink: eval('(' + ink + ')()'),
               sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    }, EXPAND.toString(), INK.toString());
    console.log(`   ${w}px：${r.sw}/${r.cw}`, r.ink.length ? '貼邊 ' + r.ink.slice(0, 3).join('、') : '');
    ok(r.sw <= r.cw && r.ink.length === 0, `${w}px 有溢出或貼邊`);
  }

  /* 13　逐頁截圖 */
  console.log('\n=== 13　逐頁截圖 ===');
  if (!SHOTS) console.log('   （沒有給 SHOTS 目錄，跳過）');
  else {
    fs.mkdirSync(SHOTS, { recursive: true });
    const IDS = ['s00', 's01', 's02', 's02b', 's02c', 's03', 's03b', 's03d', 's04', 's05', 's06', 's07'];
    const shots = [];
    for (const [mode, w, h, mob] of [['真機', 390, 844, true], ['桌機', 1280, 900, false]]) {
      const p3 = await open(w, h, mob);
      await p3.evaluate(m => {
        if (m === '桌機') { setDev(false); document.querySelector('#modesw button[data-m="op"]').click();
          document.querySelector('.top').style.display = 'none'; }
        else setDev(true);
        store.expenses.t1 = demoExpenses(); render();
      }, mode);
      for (const id of IDS) {
        await p3.evaluate(i => {
          if (document.documentElement.classList.contains('dev')) { devScreen = i; renderDevBar(); }
          if (i === 's05') { store.s05 = 'partial'; store.s05open = true; renderS05(); }
          if (i === 's03b') { store.s03bView = 'share'; renderS03b(); }
          if (i === 's06') { store.s06StatOpen = true; renderS06(); }
          window.scrollTo(0, 0);
        }, id);
        const el = await p3.$('#' + id);
        if (!el) continue;
        const name = `33_${mode}_${id}.png`;
        await el.screenshot({ path: path.join(SHOTS, name) });
        shots.push(name);
      }
      await p3.close();
    }
    fs.writeFileSync(path.join(SHOTS, '33_截圖清單.txt'), shots.join('\n'));
    console.log(`   已輸出 ${shots.length} 張到 ${SHOTS}`);
    ok(shots.length >= 20, `截圖數量不足：${shots.length}`);
  }

  /* 14　編號對帳 */
  console.log('\n=== 14　編號對帳 ===');
  await pg.setViewport({ width: 1280, height: 900 });
  await pg.goto('file://' + FILE, { waitUntil: 'load' });
  const ids = await pg.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('.idx table tr td:first-child').forEach(td => {
      const t = td.textContent.trim(); if (/^S-\d/.test(t)) s.add(t); });
    return [...s];
  });
  const rd = f => [...fs.readFileSync(f, 'utf8')
    .matchAll(/^\|\s*~*(S-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)~*(?:\s*\[[^\]]*\])?\s*\|/gm)].map(m => m[1]);
  const inv = new Set(rd('_盤點_畫面功能.md')), gap = new Set(rd('_盤點_實作缺口.md'));
  const orphan = ids.filter(x => !inv.has(x));
  const missing = [...inv].filter(x => !ids.includes(x) && !/^S-(0[89]|1[01])-/.test(x));
  console.log(`   原型 ${ids.length}｜盤點表 ${inv.size}｜盤點檔 ${gap.size}`);
  console.log('   孤兒：', orphan.join(' ') || '（無）', '｜缺：', missing.join(' ') || '（無）');
  ok(orphan.length === 0 && missing.length === 0, '編號對不起來');
  ok(ids.every(x => gap.has(x)), '盤點檔對不起來');

  await pg.close(); await p2.close();
  await browser.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
