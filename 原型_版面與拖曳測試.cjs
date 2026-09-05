/* #32：深色薄膜改回半透明黑／圓角定案 C／內距／S-00 版面／標籤折行／
 *      日期欄對齊／支付方式拖曳／S-06 消費明細比照行程頁
 *
 *   BEFORE=<#32 之前的 Tripay_原型.html>
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
const BEFORE = process.env.BEFORE, SHOTS = process.env.SHOTS;

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

const cr = (a, b) => {
  const L = c => {
    const v = c.match(/[\d.]+/g).slice(0, 3).map(x => +x / 255)
      .map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const open = async (w, h, mobile) => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: w, height: h, isMobile: !!mobile, hasTouch: !!mobile });
    await pg.goto('file://' + FILE, { waitUntil: 'load' });
    return pg;
  };
  const pg = await open(390, 844, true);

  /* 1　深色薄膜改回半透明黑 */
  console.log('\n=== 1　icon 薄膜 ===');
  const films = await pg.evaluate(exp => {
    setDev(false); eval('(' + exp + ')()');
    const seen = {};
    document.querySelectorAll('.ui .ic2').forEach(el => {
      const cs = getComputedStyle(el);
      const k = cs.backgroundColor + ' | ' + cs.borderTopColor;
      (seen[k] = seen[k] || []).push((el.getAttribute('aria-label') || '?') + '@' + el.closest('.ui').id);
    });
    return seen;
  }, EXPAND.toString());
  Object.entries(films).forEach(([k, v]) => console.log(`   ${k}　←　${v.length} 顆`));
  const dark = Object.keys(films).find(k => k.includes('rgba(0, 0, 0, 0.28)'));
  const light = Object.keys(films).find(k => k.includes('rgba(0, 0, 0, 0.05)'));
  ok(Object.keys(films).length === 2, `應只有兩種組合，實際 ${Object.keys(films).length}`);
  ok(dark && dark.includes('rgba(255, 255, 255, 0.35)'), '深色底應為 rgba(0,0,0,.28) ＋ 白線 .35');
  ok(light && light.includes('rgba(0, 0, 0, 0.14)'), '淺色底應維持 rgba(0,0,0,.05) ＋ 黑線 .14');
  ok(Object.keys(films).every(k => /rgba\([^)]*0?\.\d+\)/.test(k.split(' | ')[0])), '兩者都要是半透明');

  /* 2　8 個色調的對比 */
  console.log('\n=== 2　8 個目的地色調上的 icon 對比 ===');
  const tones = await pg.evaluate(() => {
    const t = tripOf('t1');
    return TONES.map((tone, ti) => {
      t.tone = ti; store.s03Tab = 'exp'; store.s03Menu = false; renderS03();
      const hero = document.querySelector('#scr-s03 .hero').getBoundingClientRect();
      const pts = [...document.querySelectorAll('#scr-s03 .hero .ic2')].map(el => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - hero.left, y: r.top + r.height / 2 - hero.top };
      });
      const deg = parseFloat(tone.g.match(/(-?[\d.]+)deg/)[1]);
      const stops = [...tone.g.matchAll(/(#[0-9A-Fa-f]{6})\s*([\d.]+)?%?/g)]
        .map((m, i) => ({ c: m[1], p: m[2] !== undefined ? +m[2] : (i === 0 ? 0 : 100) }));
      stops[stops.length - 1].p = 100;
      const W = hero.width, H = hero.height, rad = (deg - 90) * Math.PI / 180;
      const ux = Math.cos(rad), uy = Math.sin(rad);
      const L = Math.abs(W * ux) + Math.abs(H * uy);
      const at = (x, y) => {
        const pct = Math.max(0, Math.min(100, (((x - W / 2) * ux + (y - H / 2) * uy) / L + 0.5) * 100));
        let a = stops[0], b2 = stops[stops.length - 1];
        for (let i = 0; i < stops.length - 1; i++)
          if (pct >= stops[i].p && pct <= stops[i + 1].p) { a = stops[i]; b2 = stops[i + 1]; break; }
        const f = b2.p === a.p ? 0 : (pct - a.p) / (b2.p - a.p);
        const hx = h => h.replace('#', '').match(/../g).map(v => parseInt(v, 16));
        const ca = hx(a.c), cb = hx(b2.c);
        return 'rgb(' + ca.map((v, i) => Math.round(v + (cb[i] - v) * f)).join(', ') + ')';
      };
      return { k: tone.k, at: pts.map(p2 => at(p2.x, p2.y)) };
    });
  });
  await pg.evaluate(() => { tripOf('t1').tone = null; renderS03(); });
  /* 半透明黑薄膜：底色壓暗 28% */
  const film = (rgb, a) => {
    const c = rgb.match(/\d+/g).map(Number);
    return `rgb(${c.map(v => Math.round(v * (1 - a))).join(', ')})`;
  };
  const low = [];
  tones.forEach(t => t.at.forEach(bg => {
    const v = cr('rgb(255, 255, 255)', film(bg, 0.28));
    console.log(`   ${t.k}　底 ${bg} → 疊膜後 ${film(bg, 0.28)} → ${v.toFixed(2)}:1`);
    if (v < 3) low.push(`${t.k} ${v.toFixed(2)}`);
  }));
  console.log('   低於 3:1 的:', low.length ? low.join('、') : '（無）');
  ok(low.length === 0, `仍有色調對比不足：${low.join('、')}`);

  /* 3　⋯ 選單每顆按鈕 ≥44 */
  console.log('\n=== 3　⋯ 選單的按鈕高度 ===');
  const menuH = await pg.evaluate(() => {
    store.s03Tab = 'exp'; store.s03Menu = true; renderS03();
    const r = [...document.querySelectorAll('#scr-s03 .sheet button')]
      .map(el => ({ t: el.textContent.trim().slice(0, 6), h: +el.getBoundingClientRect().height.toFixed(1) }));
    store.s03Menu = false; renderS03();
    return r;
  });
  console.log('   ' + menuH.map(x => `${x.t} ${x.h}`).join('｜'));
  ok(menuH.every(x => x.h >= 44), `有按鈕不足 44：${menuH.filter(x => x.h < 44).map(x => x.t).join('、')}`);

  /* 4　圓角定案 C。#33-7 之後切換器已移除（拋棄式工具，挑完就收）， */
  console.log('\n=== 4　圓角定案 C ===');
  const rad = await pg.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { base: cs.getPropertyValue('--r-base').trim(), panel: cs.getPropertyValue('--r-panel').trim(),
             sw: document.querySelectorAll('[data-radius]').length };
  });
  console.log('   ' + JSON.stringify(rad));
  ok(rad.base === '10px' && rad.panel === '20px', `預設應為 10/20，實際 ${rad.base}/${rad.panel}`);
  ok(rad.sw === 0, '#33-7 之後圓角切換器應已移除');

  /* 5　內距 14px、且 ≥ 圓角 + 4 */
  console.log('\n=== 5　有圓角的內容容器左右內距 ===');
  const pads = await pg.evaluate(exp => {
    eval('(' + exp + ')()');
    /* .amtrow 要「各付各的」、.txrow 要部分付清、.tcard 要首頁有卡片——都先渲染出來 */
    const t = tripOf('t1'), M = t.members.map(m => m.id);
    g = window.exp({ twdAmt: '1000', pay: 'card', type: 'individual',
      parts: M, indiv: { [M[0]]: '250' }, payer: M[0] }); renderS04();
    store.s05 = 'partial'; store.s05open = true; renderS05();
    store.s01 = 'list'; renderS01();
    const out = {};
    ['.rowb', '.amtline', '.amtrow', '.fieldrow', '.txrow', '.tcard'].forEach(sel => {
      const el = document.querySelector('.ui ' + sel);
      if (!el) { out[sel] = null; return; }
      const cs = getComputedStyle(el);
      out[sel] = { l: cs.paddingLeft, r: cs.paddingRight, t: cs.paddingTop, b: cs.paddingBottom,
                   radius: parseFloat(cs.borderTopLeftRadius) };
    });
    return out;
  }, EXPAND.toString());
  Object.entries(pads).forEach(([k, v]) => console.log(`   ${k}: ${v ? `左右 ${v.l}/${v.r}　上下 ${v.t}/${v.b}　圓角 ${v.radius}` : '（找不到）'}`));
  ok(Object.values(pads).every(v => v && v.l === '14px' && v.r === '14px'), '左右內距應皆為 14px');
  ok(Object.values(pads).every(v => v && parseFloat(v.l) >= v.radius + 4),
    '左右內距要比圓角至少多 4px（避免內容壓在角落曲線上）');

  /* 6　S-00 版面 */
  console.log('\n=== 6　S-00 登入頁 ===');
  for (const [w, h] of [[320, 844], [390, 844], [390, 667], [414, 896]]) {
    const p2 = await open(w, h, true);
    const r = await p2.evaluate(() => {
      devScreen = 's00'; renderDevBar(); renderS00();
      const bd = id => [...document.querySelectorAll('#scr-s00 .bdg')].find(x => x.textContent === id).parentElement;
      const wr = document.querySelector('.s00wrap').getBoundingClientRect();
      const bz = document.querySelector('.s00brand').getBoundingClientRect();
      const btn = document.querySelector('#s00login').getBoundingClientRect();
      const tag = document.querySelector('.s00tag');
      const rg = document.createRange(); rg.selectNodeContents(tag.firstChild);
      const bar = document.getElementById('devbar').getBoundingClientRect();
      return { wrapH: +wr.height.toFixed(0), winH: innerHeight,
               avail: Math.round(innerHeight - bar.height),
               covered: btn.bottom > bar.top,
               w4: +bd('S-00-4').getBoundingClientRect().width.toFixed(1),
               w5: +bd('S-00-5').getBoundingClientRect().width.toFixed(1),
               ink: +rg.getBoundingClientRect().height.toFixed(1),
               lh: parseFloat(getComputedStyle(tag).lineHeight),
               mid: +(((bz.top + bz.bottom) / 2 - wr.top) / wr.height * 100).toFixed(1),
               bot: +(wr.bottom - btn.bottom).toFixed(1),
               sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    });
    console.log(`   ${w}×${h}: 容器 ${r.wrapH}(可用 ${r.avail}／視窗 ${r.winH})｜標語 ${r.w4} 登入鈕 ${r.w5}｜單行 ${r.ink}≤${r.lh}｜品牌中心 ${r.mid}%｜距底 ${r.bot}｜被切換器蓋住 ${r.covered}`);
    /* 真機模式底部有稿件用的畫面切換器，可用高度＝視窗高 − 切換器高 */
    ok(r.wrapH === r.avail, `${w}×${h} 容器高度應跟隨可用高度（${r.wrapH} vs ${r.avail}）`);
    ok(!r.covered, `${w}×${h} 登入鈕被畫面切換器蓋住了`);
    ok(r.w4 === r.w5 && r.w4 === 240, `${w}×${h} 標語與登入鈕應同為 240px`);
    ok(r.ink <= r.lh + 1, `${w}×${h} 標語折行了`);
    ok(r.mid >= 35 && r.mid <= 45, `${w}×${h} 品牌中心應在 35～45%，實際 ${r.mid}%`);
    ok(Math.abs(r.bot - 32) <= 2, `${w}×${h} 登入鈕距底應為 32±2，實際 ${r.bot}`);
    ok(r.sw <= r.cw, `${w}×${h} 橫向溢出`);
    await p2.close();
  }

  /* 7　.fieldrow 標籤不折行 */
  console.log('\n=== 7　欄位標籤不折行 ===');
  const lbl = await pg.evaluate(() => {
    setDev(false);
    f = blankForm(store.trips[0].members); f.showCur = true; renderS02();
    fb = null; renderS02b();
    return [...document.querySelectorAll('.ui .fieldrow>.lbl')].map(el => {
      const cs = getComputedStyle(el);
      const r = document.createRange(); r.selectNodeContents(el);
      return { t: el.textContent.trim(), w: cs.width, nowrap: cs.whiteSpace,
               ink: +r.getBoundingClientRect().height.toFixed(1),
               lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 };
    });
  });
  lbl.forEach(x => console.log(`   「${x.t}」寬 ${x.w}｜${x.nowrap}｜墨水高 ${x.ink} vs 行高 ${x.lh}`));
  /* S-04 的「花費」那一列有 inline 覆寫的寬度（它前面還有類別 emoji），不列入等寬檢查 */
  const std = lbl.filter(x => x.t !== '花費');
  ok(std.every(x => x.w === '68px'), `標籤欄應為 68px 等寬：${std.map(x => x.t + ' ' + x.w).join('、')}`);
  ok(lbl.every(x => x.nowrap === 'nowrap'), '標籤不得折行');
  ok(lbl.every(x => x.ink <= x.lh + 1), `有標籤折行了：${lbl.filter(x => x.ink > x.lh + 1).map(x => x.t).join('、')}`);
  /* 全站掃：還有沒有固定寬度容器裝不下內容 */
  const clipped = await pg.evaluate(exp => {
    eval('(' + exp + ')()');
    const bad = [];
    document.querySelectorAll('.ui *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.width === 'auto' || !/px$/.test(cs.width)) return;
      if (!el.textContent.trim() || el.children.length) return;
      if (el.scrollWidth > el.clientWidth + 1)
        bad.push(`${el.className || el.tagName}「${el.textContent.trim().slice(0, 8)}」${el.scrollWidth}>${el.clientWidth}`);
    });
    return [...new Set(bad)];
  }, EXPAND.toString());
  console.log('   固定寬度裝不下內容的:', clipped.length ? clipped.join('、') : '（無）');
  ok(clipped.length === 0, `有元素被截斷：${clipped.join('、')}`);

  /* 8　日期欄位對齊 */
  console.log('\n=== 8　日期輸入框 ===');
  const dates = await pg.evaluate(() => {
    f = blankForm(store.trips[0].members); f.start = '2026-03-14'; f.end = '2026-03-18'; renderS02();
    return [...document.querySelectorAll('#scr-s02 input[type=date]')].map(i => {
      const r = i.getBoundingClientRect(), cs = getComputedStyle(i);
      const padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom);
      const bT = parseFloat(cs.borderTopWidth), bB = parseFloat(cs.borderBottomWidth);
      /* 內容盒中心相對邊框盒中心的偏移＝上下不對稱的量 */
      const off = ((bT + padT) - (bB + padB)) / 2;
      return { h: +r.height.toFixed(1), w: +r.width.toFixed(1), align: cs.textAlign, off: +off.toFixed(2) };
    });
  });
  dates.forEach(d => console.log(`   ${d.w}×${d.h}｜對齊 ${d.align}｜內容盒中心偏移 ${d.off}px`));
  ok(dates.length === 2 && dates[0].w === dates[1].w && dates[0].h === dates[1].h, '兩個日期框應一樣大');
  ok(dates.every(d => Math.abs(d.off) <= 2), `文字未垂直置中，偏移 ${dates.map(d => d.off).join('/')}`);
  ok(dates.every(d => d.align === 'start' || d.align === 'left'), '日期比照一般文字靠左');

  /* 9　支付方式可拖曳 */
  console.log('\n=== 9　支付方式拖曳排序 ===');
  const drag = await pg.evaluate(() => {
    fb = null; renderS02b();
    fb.pays = ['現金', '信用卡', '悠遊卡']; renderS02b();
    const before = [...fb.pays];
    const grip = document.querySelector('#scr-s02b [data-paygrip="0"]');
    const has = !!grip;
    const ta = grip ? getComputedStyle(grip).touchAction : null;
    const fire = (el, type, y) => el.dispatchEvent(new PointerEvent(type,
      { bubbles: true, clientX: 20, clientY: y, pointerId: 1 }));
    const rows = () => [...document.querySelectorAll('#scr-s02b [data-payrow]')];
    const r2 = rows()[2].getBoundingClientRect();
    fire(grip, 'pointerdown', rows()[0].getBoundingClientRect().top + 10);
    const lifted = !!document.querySelector('#scr-s02b .rowb.dragging');
    fire(document, 'pointermove', r2.top + 10);
    fire(document, 'pointerup', r2.top + 10);
    const after = [...fb.pays];
    /* 整列其他區域不該起拖 */
    const nameSpan = rows()[0].querySelector('span:nth-child(2)');
    fire(nameSpan, 'pointerdown', rows()[0].getBoundingClientRect().top + 10);
    const rowDrag = !!document.querySelector('#scr-s02b .rowb.dragging');
    fire(document, 'pointerup', 0);
    /* 新增的也要能拖 */
    fb.pays.push('新方式'); renderS02b();
    const newGrip = !!document.querySelector(`#scr-s02b [data-paygrip="${fb.pays.length - 1}"]`);
    return { has, ta, lifted, before, after, moved: JSON.stringify(before) !== JSON.stringify(after), rowDrag, newGrip };
  });
  console.log('   ' + JSON.stringify(drag));
  ok(drag.has, '找不到拖曳把手');
  ok(drag.ta === 'none', '把手要 touch-action:none，否則與捲動打架');
  ok(drag.lifted, '按下把手應立刻浮起');
  ok(drag.moved, `拖曳應改變順序：${drag.before} → ${drag.after}`);
  ok(!drag.rowDrag, '整列的其他區域不該觸發拖曳');
  ok(drag.newGrip, '新增的支付方式也要能拖');

  /* 10　S-06 消費明細比照行程頁 */
  console.log('\n=== 10　S-06 消費明細 ===');
  const s06 = await pg.evaluate(() => {
    store.expenses.t1 = demoExpenses(); store.s03Tab = 'exp'; renderS03(); renderS06();
    const shape = r => r.tagName + ':' + [...r.children].map(c => c.className).join('|');
    const r6 = [...document.querySelectorAll('#scr-s06 .exprow')];
    const r3 = [...document.querySelectorAll('#scr-s03 .exprow')];
    const sec = s => [...document.querySelectorAll(s + ' .sec')].map(x => x.textContent.trim());
    return { sec6: sec('#scr-s06'), sec3: sec('#scr-s03'),
             shape6: shape(r6[0]), shape3: shape(r3[0]),
             sub6: r6[0].querySelector('.s').textContent.trim(),
             hasDate: r6.some(x => /\d{4}-\d{2}-\d{2}/.test(x.textContent)),
             clickable: r6.some(x => x.tagName === 'BUTTON' || x.hasAttribute('data-editexp')),
             n6: r6.length, n3: r3.length };
  });
  console.log('   S-06 標頭:', s06.sec6.join('／'));
  console.log('   S-03 標頭:', s06.sec3.join('／'));
  console.log(`   列結構 S-06 ${s06.shape6}｜S-03 ${s06.shape3}｜付款人「${s06.sub6}」`);
  ok(s06.sec3.every(x => s06.sec6.includes(x)), 'S-06 應有與 S-03 相同的日期分組標頭');
  ok(!s06.hasDate, '列上不該再寫日期');
  ok(s06.shape6.split(':')[1] === s06.shape3.split(':')[1], '兩處的列結構必須相同（同一段邏輯）');
  ok(s06.shape6.startsWith('DIV') && s06.shape3.startsWith('BUTTON'), '分享頁唯讀、行程頁可點');
  ok(!s06.clickable, '分享頁的列不可點');
  ok(s06.n6 === s06.n3, '兩處的列數應相同');
  ok(/function expenseGroups/.test(SRC), '分組必須由共用函式產生');

  /* 11　貼邊與橫向捲動 */
  console.log('\n=== 11　貼邊與橫向捲動 ===');
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

  /* 12　逐頁截圖（32-10：全域改動必須輸出截圖給人看） */
  console.log('\n=== 12　逐頁截圖 ===');
  if (!SHOTS) console.log('   （沒有給 SHOTS 目錄，跳過）');
  else {
    fs.mkdirSync(SHOTS, { recursive: true });
    const SCREENS = [['s00', ''], ['s01', ''], ['s02', ''], ['s02b', ''], ['s02c', ''],
      ['s03', ''], ['s03b', ''], ['s03d', ''], ['s04', ''], ['s05', ''], ['s06', ''], ['s07', '']];
    const shots = [];
    for (const [mode, w, h, mob] of [['真機', 390, 844, true], ['桌機', 1280, 900, false]]) {
      const p3 = await open(w, h, mob);
      await p3.evaluate(m => {
        if (m === '桌機') { setDev(false); document.querySelector('#modesw button[data-m="op"]').click();
          document.querySelector('.top').style.display = 'none'; }
        else setDev(true);
        store.expenses.t1 = demoExpenses(); render();
      }, mode);
      for (const [id] of SCREENS) {
        await p3.evaluate(i => {
          if (document.documentElement.classList.contains('dev')) { devScreen = i; renderDevBar(); }
          if (i === 's05') { store.s05 = 'partial'; store.s05open = true; renderS05(); }
          if (i === 's03b') { store.s03bView = 'share'; renderS03b(); }
          if (i === 's06') { store.s06StatOpen = true; renderS06(); }
          window.scrollTo(0, 0);
        }, id);
        const el = await p3.$('#' + id);
        if (!el) continue;
        const name = `32_${mode}_${id}.png`;
        await el.screenshot({ path: path.join(SHOTS, name) });
        shots.push(name);
      }
      await p3.close();
    }
    console.log(`   已輸出 ${shots.length} 張到 ${SHOTS}`);
    fs.writeFileSync(path.join(SHOTS, '32_截圖清單.txt'), shots.join('\n'));
    ok(shots.length >= 20, `截圖數量不足：${shots.length}`);
  }

  /* 13　編號對帳 */
  console.log('\n=== 13　編號對帳 ===');
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

  await pg.close();
  await browser.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
