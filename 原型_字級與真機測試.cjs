/* #29：S-04 日期位置／「可留空」／視覺層級顛倒／全站字級／真機模式／S-06 統計卡
 *
 *   BEFORE=<#29 之前的 Tripay_原型.html>
 *   S05BASE=<#29 之前 renderS05() 的輸出 json>
 */
const fs = require('fs'), path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
            else { console.error('需要 puppeteer-core'); process.exit(2); } }
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || 'Tripay_原型.html');
const SRC  = fs.readFileSync(FILE, 'utf8');
const BEFORE = process.env.BEFORE, S05BASE = process.env.S05BASE;

const EXPAND = () => {
  store.s01 = 'empty'; renderS01();
  f = blankForm(store.trips[0].members); f.owner = 0; f.showCur = true; f.adding = true; f.dlg = true; renderS02();
  fb = null; renderS02b(); fb.tonePick = true; renderS02b();
  store.expenses.t1 = demoExpenses(); store.s03Tab = 'exp'; store.s03StatOpen = true; renderS03();
  store.s03Filter = { kind: 'member', memberId: tripOf('t1').members[0].id }; renderS03d();
  store.s07dlg = true; renderS07(); renderS02c();
  store.s06StatOpen = true; renderS06();
  ['check', 'pending', 'partial', 'done'].forEach(p => { store.s05 = p; store.s05open = true; renderS05(); });
  store.s03bView = 'share'; renderS03b();
};

/* 文字節點的實際墨水位置 */
const INKSCAN = () => {
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
      const left = rect.left - box.left, right = box.right - rect.right;
      if (left < 13.5 || right < 13.5)
        bad.push(`${ui.id}「${n.textContent.trim().slice(0, 12)}」左 ${left.toFixed(1)} 右 ${right.toFixed(1)}`);
    }
  });
  return [...new Set(bad)];
};

/* 每個文字節點的 computed font-size 與是否為金額 */
const FONTSCAN = () => {
  const out = [];
  document.querySelectorAll('.ui').forEach(ui => {
    const walk = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const txt = n.textContent.trim();
      if (!txt) continue;
      const el = n.parentElement;
      if (!el || el.classList.contains('bdg') || el.closest('.bdg')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      /* 金額＝帶數字、且在金額容器裡。日期也用 tabular-nums（.dt），
         「約」「天」「筆」是標記不是金額，都要排除。 */
      const money = /\d/.test(txt)
        && (el.closest('.money') || (el.closest('.tnum') && !el.closest('.dt') && !el.closest('.daterow')))
        && !el.classList.contains('approx')
        && !el.closest('.money.inline');   /* 句子裡的金額跟著行內字級走 */
      out.push({ px: parseFloat(cs.fontSize), txt: txt.slice(0, 14), money,
                 scr: ui.id, cls: el.className || el.tagName.toLowerCase() });
    }
  });
  return out;
};

const lum = hex => {
  const v = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgbLum = rgb => {
  const m = rgb.match(/[\d.]+/g).slice(0, 3).map(x => +x / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
};

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
  const vp = await page.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return m ? m.getAttribute('content') : null;
  });
  console.log('   viewport:', vp);
  ok(vp && /width=device-width/.test(vp) && /initial-scale=1/.test(vp), 'viewport meta 不正確');

  /* 1／2　S-04-10 日期改成標題下的窄列 */
  console.log('\n=== 1／2　日期改成標題下的一條窄列 ===');
  const dr = await page.evaluate(() => {
    g = blankExp(); store.expenses.t1 = demoExpenses(); renderS04();
    const html = document.getElementById('scr-s04').innerHTML;
    const el = document.querySelector('#scr-s04 .daterow');
    const flds = [...document.querySelectorAll('#scr-s04 .fld')].map(x => x.getBoundingClientRect().height);
    return { i1: html.indexOf('S-04-1'), i10: html.indexOf('S-04-10'), i2: html.indexOf('S-04-2'),
             txt: el ? el.textContent.trim() : null, tag: el ? el.tagName : null,
             h: el ? +el.getBoundingClientRect().height.toFixed(1) : null,
             minFld: Math.min(...flds), hasDate: !!document.querySelector('#scr-s04 .daterow input[type=date]') };
  });
  console.log(`   位置 S-04-1@${dr.i1} < S-04-10@${dr.i10} < S-04-2@${dr.i2}`);
  console.log(`   文字「${dr.txt}」｜<${dr.tag}> 高 ${dr.h}px｜最矮的欄位列 ${dr.minFld}px`);
  ok(dr.i1 < dr.i10 && dr.i10 < dr.i2, 'S-04-10 應排在 S-04-1 之後、S-04-2 之前');
  ok(dr.txt && dr.txt.includes('記在'), '應含「記在」');
  ok(dr.txt && !dr.txt.includes('日期'), '不該再用「日期」當標籤——那是欄位的講法');
  ok(dr.tag === 'BUTTON', '整條要可點');
  ok(dr.h < dr.minFld, `日期列 ${dr.h}px 應低於任何欄位列 ${dr.minFld}px`);
  ok(dr.hasDate, '應沿用原生日期選擇，不新造第三種');

  /* 3／4　「可留空」與 placeholder */
  console.log('\n=== 3／4　「可留空」清乾淨 ===');
  const n可 = SRC.split('可留空').length - 1;
  console.log('   全站「可留空」出現', n可, '次');
  ok(n可 === 0, `全站仍有 ${n可} 個「可留空」`);
  const ph = await page.evaluate(() => {
    tripOf('t1').rateTwd = '1'; tripOf('t1').rateFor = '45';
    g = blankExp(); renderS04();
    return ['e-for', 'e-twd'].map(id => document.getElementById(id).placeholder);
  });
  console.log('   兩欄 placeholder:', JSON.stringify(ph));
  ok(ph.every(x => x === '0'), `金額欄的 placeholder 應為 0，實際 ${JSON.stringify(ph)}`);

  /* 5　「填一邊就好」與匯率警告互斥 */
  console.log('\n=== 5　兩句提示互斥 ===');
  const notes = await page.evaluate(() => {
    const t = tripOf('t1'), out = {};
    t.rateTwd = '1'; t.rateFor = '45';
    /* 金額都填好時才輪到這一句——沒填台幣的警告優先，那更重要 */
    g = exp({ forAmt: '45000', twdAmt: '1035', pay: 'card', type: 'shared',
              parts: t.members.map(m => m.id), payer: t.members[0].id });
    renderS04();
    out.有匯率 = document.getElementById('amtnote').textContent.trim();
    t.rateTwd = undefined; t.rateFor = undefined;
    g = exp({ forAmt: '20000', pay: 'cash', type: 'shared', parts: t.members.map(m => m.id), payer: t.members[0].id });
    renderS04();
    out.沒匯率 = document.getElementById('amtnote').textContent.trim();
    t.rateTwd = '1'; t.rateFor = '45';
    return out;
  });
  console.log('   有匯率：「' + notes.有匯率 + '」\n   沒匯率：「' + notes.沒匯率 + '」');
  ok(notes.有匯率.includes('填一邊就好'), '有匯率時應出現「填一邊就好，另一邊會自動換算」');
  ok(!notes.有匯率.includes('還沒設這趟的匯率'), '有匯率時不該出現匯率警告');
  // #30-5a 文案改成可行動的語氣：先說東西還在，再講解除條件
  ok(notes.沒匯率.includes('設好這趟的現金匯率就會自動換算'), '沒匯率時應出現 S-04-38 的警告');
  ok(!notes.沒匯率.includes('填一邊就好'), '沒匯率時不該再多疊一句做不到的事');

  /* 6／7／8　視覺層級三階 */
  console.log('\n=== 6／7／8　提示不得比選項深 ===');
  const tiers = await page.evaluate(() => {
    g = blankExp(); renderS04();
    const q = s => document.querySelector(s);
    const inp = q('#scr-s04 input[placeholder]');
    return {
      placeholder: getComputedStyle(inp, '::placeholder').color,
      hint: getComputedStyle(q('.ui .hint') || q('.ui .sec')).color,
      seg: getComputedStyle(q('#scr-s03 .seg button:not(.on)') || q('.ui .seg button:not(.on)')).color,
      chip: getComputedStyle(q('#scr-s04 .chip:not(.on)')).color,
      lbl: getComputedStyle(q('#scr-s04 .lbl')).color,
      content: getComputedStyle(q('#scr-s04 .exprow .t') || q('.ui')).color,
      gr: getComputedStyle(q('.ui')).getPropertyValue('--gr').trim(),
      md: getComputedStyle(q('.ui')).getPropertyValue('--md').trim(),
    };
  });
  Object.entries(tiers).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
  const hex2rgb = h => { const m = h.replace('#', '').match(/../g).map(x => parseInt(x, 16)); return `rgb(${m.join(', ')})`; };
  ok(tiers.placeholder === hex2rgb(tiers.gr), `placeholder 應等於 --gr，實際 ${tiers.placeholder}`);
  ok(tiers.seg === tiers.chip, `seg 未選 ${tiers.seg} 應與 chip 未選 ${tiers.chip} 同色`);
  ok(tiers.seg === hex2rgb(tiers.md), 'seg 未選應是二階 --md');
  const L = { content: rgbLum(tiers.content), tier2: rgbLum(tiers.chip), tier3: rgbLum(tiers.hint) };
  console.log(`   亮度 內容 ${L.content.toFixed(3)} < 二階 ${L.tier2.toFixed(3)} < 三階 ${L.tier3.toFixed(3)}`);
  ok(L.content < L.tier2 && L.tier2 < L.tier3, '三階層級不成立（提示比選項深）');
  ok(rgbLum(tiers.placeholder) >= L.tier2, 'placeholder 仍比可點選項深');

  /* 9　色碼 */
  console.log('\n=== 9　色碼 ===');
  const cols = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.ui'));
    return Object.fromEntries(['--gr', '--md', '--dg', '--out', '--w']
      .map(k => [k, cs.getPropertyValue(k).trim()]));
  });
  console.log('   ' + JSON.stringify(cols));
  ok(cols['--gr'] === '#6A7980', `--gr 應為 #6A7980，實際 ${cols['--gr']}`);
  const cr = ratio('#FFFFFF', cols['--gr']);
  console.log(`   白底對 --gr 的對比度 ${cr.toFixed(2)}:1`);
  ok(cr >= 4.5, `--gr 對比度只有 ${cr.toFixed(2)}，未達 4.5`);
  ok(cols['--md'] === '#4C5B64' && cols['--dg'] === '#9B1B14'
     && cols['--out'] === '#B03A22' && cols['--w'] === '#1276C4', '其他色碼被動到了');

  /* 10～13　字級 */
  console.log('\n=== 10～13　字級階梯 ===');
  const ALLOWED = [12, 13, 15, 16, 17, 20];
  const MONEY = [16, 20, 26];
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    const list = await page.evaluate((exp, scan) => {
      document.documentElement.classList.remove('anno');
      eval('(' + exp + ')()');
      return eval('(' + scan + ')()');
    }, EXPAND.toString(), FONTSCAN.toString());
    const tooSmall = list.filter(x => x.px < 12);
    const odd = list.filter(x => !x.money && !ALLOWED.includes(x.px) && x.px !== 44);
    const oddMoney = list.filter(x => x.money && !MONEY.includes(x.px));
    console.log(`   ${w}px：${list.length} 個文字節點`);
    console.log('     <12px:', tooSmall.length ? tooSmall.slice(0, 4).map(x => `${x.px}「${x.txt}」`).join('、') : '（無）');
    console.log('     非階梯值:', odd.length ? odd.slice(0, 4).map(x => `${x.px}「${x.txt}」`).join('、') : '（無）');
    console.log('     金額非 {16,20,26}:', oddMoney.length ? oddMoney.slice(0, 4).map(x => `${x.px}「${x.txt}」`).join('、') : '（無）');
    ok(tooSmall.length === 0, `${w}px 有 ${tooSmall.length} 處文字 <12px`);
    ok(odd.length === 0, `${w}px 有 ${odd.length} 處字級不在階梯上`);
    ok(oddMoney.length === 0, `${w}px 有 ${oddMoney.length} 處金額字級不對`);
  }
  await page.setViewport({ width: 375, height: 900 });
  const inputs = await page.evaluate(exp => {
    eval('(' + exp + ')()');
    return [...document.querySelectorAll('.ui input, .ui textarea, .ui select')]
      .map(i => ({ px: parseFloat(getComputedStyle(i).fontSize), id: i.id || i.type }))
      .filter(x => x.px < 16);
  }, EXPAND.toString());
  console.log('   輸入框 <16px:', inputs.length ? JSON.stringify(inputs) : '（無）');
  ok(inputs.length === 0, `有輸入框字級 <16px（iOS Safari 會自動放大整頁）：${JSON.stringify(inputs)}`);
  const named = await page.evaluate(() => {
    store.expenses.t1 = demoExpenses(); store.s05 = 'done'; renderS05();
    const px = el => el ? parseFloat(getComputedStyle(el).fontSize) : null;
    const find = (sel, t) => [...document.querySelectorAll(sel)].find(x => x.textContent.trim() === t);
    const out = {};
    ['出遊', '共記了'].forEach(t => out[t] = px(find('#scr-s05 div', t)));
    out['最大手筆'] = px(find('#scr-s05 div', '最大手筆'));
    out['任何人免登入可看'] = px(find('#scr-s05 .hint', '任何人免登入可看'));
    store.s03bView = 'del'; renderS03b();
    out['S-03c-1 標題'] = px([...document.querySelectorAll('#scr-s03b .dlg p')][0]);
    store.s03Tab = 'exp'; renderS03();
    out['付款人'] = px(document.querySelector('#scr-s03 .exprow .s'));
    out['消費名稱'] = px(document.querySelector('#scr-s03 .exprow .t'));
    return out;
  });
  console.log('   ' + JSON.stringify(named));
  ['出遊', '共記了', '最大手筆', '任何人免登入可看', '付款人'].forEach(k =>
    ok(named[k] === 13, `${k} 應為 13px，實際 ${named[k]}`));
  ok(named['S-03c-1 標題'] === 17, `對話框標題應為 17px，實際 ${named['S-03c-1 標題']}`);
  ok(named['消費名稱'] === 15, `消費名稱應為 15px，實際 ${named['消費名稱']}`);
  const hard = [...SRC.matchAll(/font-size:[\d.]+px/g)].length;
  const uiHard = SRC.split('</style>')[1].match(/font-size:[\d.]+px/g) || [];
  console.log(`   原始碼寫死的 font-size：CSS 區 ${hard - uiHard.length} 處（稿註區，不限）｜render 區 ${uiHard.length} 處`);
  ok(uiHard.length === 0, `render 區還有寫死的字級：${uiHard.slice(0, 3).join(' ')}`);

  /* 14　S-03b 沒有 icon；S-07 列尾箭頭 */
  console.log('\n=== 14　S-03b 無 icon；S-07 列尾箭頭 16px ===');
  const s03b = await page.evaluate(() => { store.s03bView = 'share'; renderS03b();
    return document.getElementById('scr-s03b').innerHTML; });
  ok(!s03b.includes('<svg'), 'S-03b 分享選單不該有 icon');
  const s07n = await page.evaluate(() => {
    store.s07dlg = false; renderS07();
    return [...document.querySelectorAll('#scr-s07 .rowb svg')].map(x => ({
      w: x.getAttribute('width'), wrapped: !!x.closest('.ic2') }));
  });
  console.log('   ' + JSON.stringify(s07n));
  // #30-4 之後 S-07 只剩帳號卡與登出，那三列 › 隨「我的資料」一起移除；
  // 規格（16px、不加圓形容器）仍然有效，等批四畫 S-08～S-11 時會再用到。
  console.log('   （#30-4 移除「我的資料」後，S-07 已無列尾箭頭）');
  ok(s07n.every(x => x.w === '16'), '列尾箭頭應為 16px');
  ok(s07n.every(x => !x.wrapped), '列尾箭頭不該加圓形容器——可點的是整一列');
  const s07back = await page.evaluate(() => {
    const el = document.querySelector('#scr-s07 .ic2');
    const r = el.getBoundingClientRect();
    return { w: r.width, svg: el.querySelector('svg').getAttribute('width') };
  });
  console.log('   S-07 返回鈕:', JSON.stringify(s07back));
  ok(s07back.w === 40 && s07back.svg === '20', 'S-07 返回鈕應維持 #28-7 的規格');

  /* 15　操作模式下不得有可見徽章 */
  console.log('\n=== 15　操作模式下沒有任何可見的編號徽章 ===');
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    const vis = await page.evaluate(exp => {
      document.documentElement.classList.remove('anno');
      eval('(' + exp + ')()');
      return [...document.querySelectorAll('.ui .bdg')]
        .filter(x => getComputedStyle(x).display !== 'none')
        .map(x => x.textContent + '@' + x.closest('.ui').id);
    }, EXPAND.toString());
    console.log(`   ${w}px：`, vis.length ? vis.join('、') : '（無）');
    ok(vis.length === 0, `${w}px 操作模式下漏出 ${vis.length} 個編號徽章`);
  }
  await page.setViewport({ width: 375, height: 900 });
  const cover = await page.evaluate(exp => {
    document.documentElement.classList.add('anno');
    eval('(' + exp + ')()');
    const bad = [];
    document.querySelectorAll('.b > .bdg').forEach(bdg => {
      const box = bdg.parentElement, br = bdg.getBoundingClientRect();
      if (!br.width) return;
      box.querySelectorAll('*').forEach(el => {
        if (el === bdg || bdg.contains(el)) return;
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (br.right > r.left + 0.5 && br.left < r.right - 0.5 &&
            br.bottom > r.top + 0.5 && br.top < r.bottom - 0.5)
          bad.push(bdg.textContent + '→' + el.textContent.trim().slice(0, 8));
      });
    });
    document.documentElement.classList.remove('anno');
    return [...new Set(bad)];
  }, EXPAND.toString());
  console.log('   標註模式下徽章蓋住文字:', cover.length ? cover.slice(0, 4).join('、') : '（無）');
  ok(cover.length === 0, `徽章又蓋住文字了：${cover.slice(0, 4).join('、')}`);

  /* 16　分頁與幣別切換不是同一套 */
  console.log('\n=== 16　分頁 vs 幣別切換 ===');
  const ctl = await page.evaluate(() => {
    store.s03Tab = 'exp'; store.s03Menu = false; renderS03();
    const bd = id => [...document.querySelectorAll('#scr-s03 .bdg')].find(x => x.textContent === id);
    const tabs = bd('S-03-33').parentElement.querySelector('.tabs, .seg');
    const seg = bd('S-03-12').parentElement.querySelector('.seg');
    const on = el => el ? getComputedStyle(el.querySelector('button.on')).backgroundColor : null;
    return { tabsCls: tabs ? tabs.className : null, segCls: seg ? seg.className : null,
             tabsOn: on(tabs), segOn: on(seg),
             w: getComputedStyle(document.querySelector('.ui')).getPropertyValue('--w').trim() };
  });
  console.log('   ' + JSON.stringify(ctl));
  /* #29-8b 曾把切換器拆成兩套（.tabs／.seg）；#31-8 Rozi 收回，兩種合併成一套
     ——淺灰底軌＋白色凸起 pill，不再有實心主色的切換器。
     這條測試改成守「全站只有一套、選中格一律白色 pill」。 */
  ok(ctl.tabsCls === 'seg' && ctl.segCls === 'seg', '兩種切換器都應是同一個 class');
  ok(ctl.tabsOn === ctl.segOn, '合併之後兩者的選中樣式必須相同');
  ok(ctl.tabsOn === 'rgb(255, 255, 255)', `選中格應是白色 pill，實際 ${ctl.tabsOn}`);
  ok(ctl.segOn !== hex2rgb(ctl.w), '不該再有實心主色的切換器');

  /* 17　⋯ 選單配 icon */
  console.log('\n=== 17　⋯ 選單的項目配 icon ===');
  const menu = await page.evaluate(() => {
    store.s03Menu = true; renderS03();
    const dg = getComputedStyle(document.querySelector('.ui')).getPropertyValue('--dg').trim();
    const hex = h => { const m = h.replace('#', '').match(/../g).map(x => parseInt(x, 16)); return `rgb(${m.join(', ')})`; };
    const r = [...document.querySelectorAll('#scr-s03 .shopt')].map(el => {
      const svg = el.querySelector('svg');
      return { t: el.querySelector('.t').textContent.trim(),
               w: svg ? svg.getAttribute('width') : null,
               icColor: svg ? getComputedStyle(svg).color : null,
               txColor: getComputedStyle(el.querySelector('.t')).color,
               isDg: getComputedStyle(svg).color === hex(dg) };
    });
    store.s03Menu = false; renderS03();
    return r;
  });
  menu.forEach(m => console.log(`   ${m.t}：icon ${m.w}px ${m.icColor}｜文字 ${m.txColor}`));
  ok(menu.length > 0 && menu.every(m => m.w === '16'), '每一項都要有 16px 的 icon');
  ok(menu.every(m => m.icColor === m.txColor), 'icon 與文字要同色');
  const dgItems = menu.filter(m => m.isDg).map(m => m.t);
  console.log('   用 --dg 的:', dgItems.join('／') || '（無）');
  ok(dgItems.length === 1 && dgItems[0] === '刪除行程', `--dg 應只用在刪除行程，實際 ${dgItems.join('／')}`);
  /* 直接看渲染結果——ic() 的名字有些是變數傳進去的（⋯ 選單），掃原始碼會漏 */
  const dead = await page.evaluate(exp => {
    /* ICON[k] 的字串要先過一次瀏覽器的正規化，才比得上 DOM 讀回來的 innerHTML */
    const norm = {};
    for (const [k, v] of Object.entries(ICON)) {
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      tmp.innerHTML = v;
      norm[tmp.innerHTML.replace(/\s+/g, ' ').trim()] = k;
    }
    const seen = new Set();
    /* 每渲染一種狀態就收一次——後面的渲染會蓋掉前面的 DOM，最後才收會漏掉 */
    const collect = () => document.querySelectorAll('.ui svg.ic').forEach(sv => {
      const k = norm[sv.innerHTML.replace(/\s+/g, ' ').trim()];
      if (k) seen.add(k);
    });
    const t0 = tripOf('t1');
    eval('(' + exp + ')()'); collect();                       // 旅途中：add 在「＋ 記一筆」上
    store.s03Menu = true; renderS03(); collect();             // ⋯ 選單：edit／share／copy／del
    t0.status = 'settled'; renderS03(); collect();            // 已結算的選單多一個 archive
    store.s05 = 'partial'; store.s05open = true; renderS05(); collect();   // 已付清那一列的 check
    store.s03Menu = false; t0.status = 'active'; renderS03();
    return Object.keys(ICON).filter(k => !seen.has(k));
  }, EXPAND.toString());
  console.log('   沒人用的 icon:', dead.join(' ') || '（無）');
  ok(dead.length === 0, `死條目：${dead.join(' ')}`);

  /* 18　S-06 統計卡與 S-03 共用 */
  console.log('\n=== 18　S-06 統計卡 ===');
  const s06 = await page.evaluate(() => {
    store.s06StatOpen = false; renderS06();
    const html0 = document.getElementById('scr-s06').innerHTML;
    store.s06StatOpen = true; renderS06();
    const el = document.getElementById('scr-s06');
    const rows6 = [...el.querySelectorAll('.perlist .perrow')];
    store.s03Tab = 'exp'; store.s03StatOpen = true; renderS03();
    const rows3 = [...document.querySelectorAll('#scr-s03 .perlist .perrow')];
    const shape = r => r.map(x => x.tagName + ':' + [...x.children].map(c => c.className).join('|'));
    return { has人均: el.textContent.includes('人均'),
             collapsed: !html0.includes('perlist'),
             tot: !!el.querySelector('#s06stat'),
             n6: rows6.length, n3: rows3.length,
             tag6: rows6[0] ? rows6[0].tagName : null, tag3: rows3[0] ? rows3[0].tagName : null,
             shape6: shape(rows6)[0], shape3: shape(rows3)[0],
             clickable: rows6.some(x => x.tagName === 'BUTTON' || x.hasAttribute('data-permember')),
             foot: el.textContent.includes('點名字看是哪幾筆') };
  });
  console.log('   ' + JSON.stringify(s06));
  ok(!s06.has人均, 'S-06 不該再有「人均」');
  ok(s06.collapsed, '統計卡應預設收合');
  ok(s06.tot, '應有可點的總花費列');
  ok(s06.n6 > 0 && s06.n6 === s06.n3, '每人分擔列的數量應與 S-03 相同');
  ok(s06.shape6.split(':')[1] === s06.shape3.split(':')[1], '兩處的每人分擔列結構必須相同（同一個元件）');
  ok(!s06.clickable, '分享頁是唯讀，每人分擔列不可點');
  ok(!s06.foot, '點不了就不要邀請人點');
  ok(SRC.includes('function statCard'), '兩處必須共用同一個函式');

  /* 19　真機模式 */
  console.log('\n=== 19　真機模式 ===');
  for (const w of [320, 375, 414]) {
    const pg = await browser.newPage();
    await pg.setViewport({ width: w, height: 800, isMobile: true, hasTouch: true });
    await pg.goto('file://' + FILE, { waitUntil: 'load' });
    const d = await pg.evaluate(() => ({
      coarse: matchMedia('(pointer:coarse)').matches,
      dev: document.documentElement.classList.contains('dev'),
      wrapPad: getComputedStyle(document.querySelector('.wrap')).paddingLeft,
      phBorder: getComputedStyle(document.querySelector('.ph')).borderTopWidth,
      phRadius: getComputedStyle(document.querySelector('.ph')).borderRadius,
      uiW: +document.querySelector('.scr.devon .ui').getBoundingClientRect().width.toFixed(2),
      winW: innerWidth,
      shown: [...document.querySelectorAll('.scr')].filter(x => getComputedStyle(x).display !== 'none').length,
      hidden: ['.bdg', '.rig', '.idx', '.scrhd'].map(s => {
        const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'none'; }),
      bar: !!document.querySelector('#devbar .list button'),
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    }));
    console.log(`   ${w}px：`, JSON.stringify(d));
    ok(d.dev, `${w}px 沒有自動進入真機模式`);
    ok(d.wrapPad === '0px', `${w}px .wrap 左右內距應為 0`);
    ok(d.phBorder === '0px' && d.phRadius === '0px', `${w}px .ph 應去掉外框與圓角`);
    ok(d.uiW === d.winW, `${w}px .ui 寬度 ${d.uiW} 應等於視窗 ${d.winW}`);
    ok(d.shown === 1, `${w}px 應一次只顯示一個畫面，實際 ${d.shown}`);
    ok(d.hidden.every(x => x === 'none'), `${w}px 稿件元素沒有全部藏起來：${d.hidden.join(',')}`);
    ok(d.bar, `${w}px 沒有畫面切換器`);
    ok(d.sw <= d.cw, `${w}px 真機模式橫向溢出 ${d.sw - d.cw}px`);
    // 切換器可收起
    const col = await pg.evaluate(() => {
      document.getElementById('devmin').click();
      return getComputedStyle(document.querySelector('#devbar .list')).display;
    });
    ok(col === 'none', '切換器要能收起來，否則會擋住被檢視畫面的底部按鈕');
    // 真機模式下也不得有文字貼邊
    const ink = await pg.evaluate(scan => eval('(' + scan + ')()'), INKSCAN.toString());
    console.log(`     貼邊：`, ink.length ? ink.slice(0, 3).join('、') : '（無）');
    ok(ink.length === 0, `${w}px 真機模式有 ${ink.length} 處文字貼邊`);
    await pg.close();
  }

  /* 20　桌機版面不受真機模式影響 */
  console.log('\n=== 20　桌機的檢視方式沒有被動到 ===');
  const geom = async (f) => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 1280, height: 900 });
    await pg.goto('file://' + path.resolve(f), { waitUntil: 'load' });
    const g = await pg.evaluate(() => ({
      dev: document.documentElement.classList.contains('dev'),
      wrapPad: getComputedStyle(document.querySelector('.wrap')).paddingLeft,
      phW: +document.querySelector('.ph').getBoundingClientRect().width.toFixed(2),
      phRadius: getComputedStyle(document.querySelector('.ph')).borderRadius,
      scrs: [...document.querySelectorAll('.scr')].filter(x => getComputedStyle(x).display !== 'none').length,
    }));
    await pg.close(); return g;
  };
  const nowG = await geom(FILE);
  console.log('   現在:', JSON.stringify(nowG));
  ok(!nowG.dev, '桌機不該自動進入真機模式');
  if (BEFORE) {
    const beforeG = await geom(BEFORE);
    console.log('   #29 之前:', JSON.stringify(beforeG));
    ok(JSON.stringify(nowG) === JSON.stringify(beforeG), '真機模式影響到了桌機的檢視方式');
  } else console.log('   （沒有 BEFORE 基準檔，這一條跳過）');

  /* 21　S-05 的結構沒有改變 */
  console.log('\n=== 21　S-05 除了字級之外沒有結構改變 ===');
  if (!S05BASE) console.log('   （沒有 S05BASE，跳過）');
  else {
    const base = JSON.parse(fs.readFileSync(S05BASE, 'utf8'));
    const pg2 = await browser.newPage();
    await pg2.setViewport({ width: 375, height: 900 });
    await pg2.goto('file://' + FILE, { waitUntil: 'load' });
    const now = await pg2.evaluate(() => {
      store.expenses.t1 = demoExpenses(); const o = {};
      ['pending', 'check', 'partial', 'done'].forEach(s => {
        store.s05 = s; store.s05open = true; renderS05();
        o[s] = document.getElementById('scr-s05').innerHTML; });
      tripOf('t1').settleMode = 'hub'; tripOf('t1').hubMember = tripOf('t1').members[0].id;
      store.s05 = 'partial'; renderS05(); o.hub = document.getElementById('scr-s05').innerHTML;
      return o;
    });
    await pg2.close();
    /* 允許 class／style 的字級差異與 icon 標記差異，比對標籤結構與文字內容 */
    /* 條件 26 允許 class／style 的字級差異，所以兩者都正規化掉，
       剩下的標籤結構與文字內容必須完全一樣 */
    const shape = h => h
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/＋/g, '')
      .replace(/ (?:style|class)="[^"]*"/g, '')
      .replace(/\s+/g, ' ').trim();
    for (const k of Object.keys(base)) {
      const same = shape(base[k]) === shape(now[k] || '');
      console.log(`   ${k}: ${same ? '結構與文字相同' : '不同'}`);
      ok(same, `renderS05() 的 ${k} 結構被改動了`);
    }
  }

  /* 22　貼邊與橫向捲動 */
  console.log('\n=== 22　貼邊與橫向捲動 ===');
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    for (const mode of ['anno', 'op']) {
      const r = await page.evaluate((exp, scan, m) => {
        document.documentElement.classList.toggle('anno', m === 'anno');
        eval('(' + exp + ')()');
        return { ink: m === 'op' ? eval('(' + scan + ')()') : [],
                 sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
      }, EXPAND.toString(), INKSCAN.toString(), mode);
      console.log(`   ${w}px ${mode}：${r.sw}/${r.cw}`, r.ink.length ? '貼邊 ' + r.ink.slice(0, 3).join('、') : '');
      ok(r.sw <= r.cw, `${w}px ${mode} 橫向溢出 ${r.sw - r.cw}px`);
      ok(r.ink.length === 0, `${w}px 有 ${r.ink.length} 處文字貼邊`);
    }
  }

  /* 23　編號對帳 */
  console.log('\n=== 23　編號對帳 ===');
  const ids = await page.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('.idx table tr td:first-child').forEach(td => {
      const t = td.textContent.trim(); if (/^S-\d/.test(t)) s.add(t); });
    return [...s];
  });
  const inv = [...fs.readFileSync('_盤點_畫面功能.md', 'utf8')
    .matchAll(/^\|\s*~*(S-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)~*(?:\s*\[[^\]]*\])?\s*\|/gm)].map(m => m[1]);
  const invSet = new Set(inv);
  const orphan = ids.filter(x => !invSet.has(x));
  const missing = inv.filter(x => !ids.includes(x) && !/^S-(0[89]|1[01])-/.test(x));
  console.log(`   原型 ${ids.length} 項｜盤點表 ${invSet.size} 項`);
  console.log('   孤兒：', orphan.join(' ') || '（無）', '｜缺漏：', missing.join(' ') || '（無）');
  ok(orphan.length === 0 && missing.length === 0, '編號對不起來');

  await browser.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
