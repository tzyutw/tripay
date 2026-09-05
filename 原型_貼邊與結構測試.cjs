/* #28：icon 底組定案 ＋ 文字貼邊（全站）＋ S-03 動作結構重整
 *
 * 用真實 Chrome。兩份基準檔：
 *   BEFORE=<#28 之前的 Tripay_原型.html>   條件 16 比對編號
 *   S05BASE=<#28 之前 renderS05() 的輸出 json>   條件 17 證明 S-05 一個字都沒動
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

/* 把每一頁展開到東西最多的狀態 */
const EXPAND = () => {
  store.s01 = 'empty'; renderS01();
  f = blankForm(store.trips[0].members); f.owner = 0; f.showCur = true; f.adding = true; f.dlg = true; renderS02();
  fb = null; renderS02b(); fb.tonePick = true; renderS02b();
  store.expenses.t1 = demoExpenses(); renderS03();
  store.s03Filter = { kind: 'member', memberId: tripOf('t1').members[0].id }; renderS03d();
  store.s07dlg = true; renderS07(); renderS02c(); renderS06();
  ['check', 'pending', 'partial', 'done'].forEach(p => { store.s05 = p; store.s05open = true; renderS05(); });
  store.s03bView = 'share'; renderS03b();
};

/* 每個 .ui 內文字節點的實際墨水位置——量 Range，不是元素外框 */
const INKSCAN = () => {
  const bad = [];
  document.querySelectorAll('.ui').forEach(ui => {
    const box = ui.getBoundingClientRect();
    const walk = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const txt = n.textContent.trim();
      if (!txt) continue;
      const el = n.parentElement;
      if (!el || el.classList.contains('bdg')) continue;          // 標註徽章不是產品文字
      if (getComputedStyle(el).visibility === 'hidden') continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const rect = r.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const left = rect.left - box.left, right = box.right - rect.right;
      if (left < 13.5 || right < 13.5)
        bad.push(`${ui.id}「${txt.slice(0, 12)}」左 ${left.toFixed(1)} 右 ${right.toFixed(1)}`);
    }
  });
  return [...new Set(bad)];
};

const IDS = () => {
  const s = new Set();
  document.querySelectorAll('.idx table tr td:first-child').forEach(td => {
    const t = td.textContent.trim(); if (/^S-\d/.test(t)) s.add(t);
  });
  return [...s];
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

  /* 1　全站文字貼邊掃描 */
  console.log('\n=== 1　文字不得貼邊（量 Range，不是元素外框）===');
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    const hits = await page.evaluate((exp, scan) => {
      document.documentElement.classList.remove('anno');
      eval('(' + exp + ')()');
      return eval('(' + scan + ')()');
    }, EXPAND.toString(), INKSCAN.toString());
    console.log(`   ${w}px：`, hits.length ? hits.slice(0, 8).join('、') + (hits.length > 8 ? ` ...共 ${hits.length} 筆` : '') : '（無）');
    ok(hits.length === 0, `${w}px 有 ${hits.length} 處文字貼邊`);
  }
  await page.setViewport({ width: 375, height: 900 });

  /* 2　.sec 的左內距 */
  console.log('\n=== 2　.sec 終於有定義 ===');
  const secPad = await page.evaluate(() => {
    renderS06();
    const el = document.querySelector('.ui .sec');
    const cs = getComputedStyle(el);
    return { left: cs.paddingLeft, size: cs.fontSize, color: cs.color };
  });
  console.log('   ' + JSON.stringify(secPad));
  ok(secPad.left === '14px', `.sec 的 padding-left 應為 14px，實際 ${secPad.left}`);

  /* 3　S-00-4 與 S-00-5 同寬 */
  console.log('\n=== 3　標語與登入鈕同寬 ===');
  const w00 = await page.evaluate(() => {
    renderS00();
    const g = id => {
      const bdg = [...document.querySelectorAll('#scr-s00 .bdg')].find(x => x.textContent === id);
      return +bdg.parentElement.getBoundingClientRect().width.toFixed(2);
    };
    return { s4: g('S-00-4'), s5: g('S-00-5') };
  });
  console.log(`   S-00-4 ${w00.s4}px ｜S-00-5 ${w00.s5}px`);
  ok(w00.s4 === w00.s5, `兩者應完全相等，實際 ${w00.s4} vs ${w00.s5}`);

  /* 4　返回改純 icon */
  console.log('\n=== 4　返回只留 icon ===');
  const backs = await page.evaluate(exp => {
    eval('(' + exp + ')()');
    return [...document.querySelectorAll('.ui [aria-label="返回"]')].map(el => {
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const hw = Math.max(r.width, parseFloat(after.width) || 0);
      const hh = Math.max(r.height, parseFloat(after.height) || 0);
      return { scr: el.closest('.ui').id, txt: el.textContent.trim(),
               w: +r.width.toFixed(1), h: +r.height.toFixed(1), hw, hh };
    });
  }, EXPAND.toString());
  backs.forEach(b => console.log(`   ${b.scr}：文字「${b.txt}」容器 ${b.w}×${b.h}　可點 ${b.hw}×${b.hh}`));
  ok(backs.length >= 3, `應有多個返回控制項，只找到 ${backs.length}`);
  ok(backs.every(b => !b.txt.includes('返回')), '仍有返回鍵帶著「返回」二字');
  ok(backs.every(b => b.hw >= 44 && b.hh >= 44), '有返回鍵的可點區不足 44×44');
  const strayBack = await page.evaluate(exp => {
    eval('(' + exp + ')()');
    return [...document.querySelectorAll('.ui .bar, .ui .navrow')]
      .filter(el => el.textContent.includes('返回')).length;
  }, EXPAND.toString());
  console.log('   導覽列裡還帶「返回」字樣的:', strayBack);
  ok(strayBack === 0, `還有 ${strayBack} 條導覽列帶著「返回」二字`);

  /* 5　icon 底組定案 */
  console.log('\n=== 5　icon 只剩一組 ===');
  const keys = await page.evaluate(() => Object.keys(ICON));
  console.log('   鍵:', keys.join(' '), `（${keys.length} 個）`);
  ok(keys.length === 14, `ICON 應為 14 個鍵（13 ＋ #28-6b 的 more），實際 ${keys.length}`);
  const lic = fs.readFileSync('_icon授權.md', 'utf8');
  ok(keys.every(k => lic.includes('`' + k + '`')), '有 icon 沒列進 _icon授權.md');
  for (const tok of ['Lucide', 'Heroicons', 'ICON_SETS', 'iconpick']) {
    const n = SRC.split(tok).length - 1;
    ok(n === 0, `原型仍出現「${tok}」${n} 次`);
  }
  ok(lic.includes('Feather') && !/Lucide|Heroicons/.test(lic), '_icon授權.md 應只列 Feather 一組');
  console.log('   對照條與另兩組已清乾淨；授權檔只列 Feather');
  const featherShape = await page.evaluate(() => ICON.back);
  console.log('   back 造形:', featherShape);
  ok(featherShape.includes('polyline'), 'back 應是 Feather 的 polyline 造形');
  // 自備 icon：只看第一層，未採用/ 忽略
  const own = fs.existsSync('icons_自備')
    ? fs.readdirSync('icons_自備', { withFileTypes: true })
        .filter(d => d.isFile() && d.name.endsWith('.svg')).map(d => d.name) : [];
  console.log('   icons_自備/ 第一層的 .svg:', own.length ? own.join(' ') : '（無，未採用/ 依規則忽略）');
  ok(own.every(f => lic.includes(f.replace('.svg', ''))), '第一層的自備 icon 未列入授權檔');

  /* 6　登出確認框 */
  console.log('\n=== 6　登出不是刪除 ===');
  const s07 = await page.evaluate(() => {
    store.s07dlg = true; renderS07();
    const btns = [...document.querySelectorAll('#scr-s07 .dlg button')].map(b => ({ t: b.textContent.trim(), c: b.className }));
    return { btns, html: document.getElementById('scr-s07').innerHTML };
  });
  s07.btns.forEach(b => console.log(`   「${b.t}」class="${b.c}"`));
  const out = s07.btns.find(b => b.t === '登出');
  ok(out && out.c.includes('gh'), '登出鈕應改為描邊的 .btn gh');
  ok(out && !out.c.split(/\s+/).includes('dg'), '登出鈕不得再用刪除的實心紅');
  ok(!s07.html.includes('var(--dg)'), 'S-07 不得有元素直接吃 var(--dg)');
  ok(/\.ui \.delrow\{[^}]*color:var\(--dg\)/.test(SRC), '.delrow 的 --dg 不准被順手改掉');

  /* 10　S-03 頂列只剩兩顆 */
  console.log('\n=== 10　S-03 頂列只有返回與 ⋯ ===');
  const nav = await page.evaluate(() => {
    store.s03Menu = false; store.s03Tab = 'exp';
    store.expenses.t1 = demoExpenses(); renderS03();
    const row = document.querySelector('#scr-s03 .navrow');
    return [...row.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
  });
  console.log('   ' + JSON.stringify(nav));
  ok(nav.length === 2, `頂列應只有 2 個可點元素，實際 ${nav.length}`);
  ok(nav[0] === '返回' && nav[1] === '更多', `應為 返回 / 更多，實際 ${nav.join(' / ')}`);

  /* 11　icon 容器 40×40 圓形帶線、icon 20px、可點 ≥44 */
  console.log('\n=== 11　icon 容器尺寸 ===');
  const ic2 = await page.evaluate(exp => {
    eval('(' + exp + ')()');
    return [...document.querySelectorAll('.ui .ic2')].map(el => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const a = getComputedStyle(el, '::after');
      const svg = el.querySelector('svg');
      return { scr: el.closest('.ui').id, dark: !!el.closest('.hero'),
               w: +r.width.toFixed(1), h: +r.height.toFixed(1),
               radius: cs.borderRadius, border: cs.borderTopWidth,
               svg: svg ? svg.getAttribute('width') : null,
               hw: parseFloat(a.width) || r.width, hh: parseFloat(a.height) || r.height };
    });
  }, EXPAND.toString());
  const dark = ic2.filter(x => x.dark), light = ic2.filter(x => !x.dark);
  console.log(`   共 ${ic2.length} 顆（深底 ${dark.length}／淺底 ${light.length}）`);
  console.log('   ' + JSON.stringify(ic2[0]));
  ok(ic2.length > 0, '找不到任何 .ic2');
  ok(ic2.every(x => x.w === 40 && x.h === 40), `有容器不是 40×40：${JSON.stringify(ic2.filter(x => x.w !== 40 || x.h !== 40))}`);
  ok(ic2.every(x => x.radius === '50%' || parseFloat(x.radius) >= 20), '有容器不是正圓');
  ok(ic2.every(x => parseFloat(x.border) > 0), '有容器沒有那一圈線');
  ok(ic2.every(x => x.svg === '20'), `有 icon 不是 20px：${JSON.stringify(ic2.filter(x => x.svg !== '20'))}`);
  ok(ic2.every(x => x.hw >= 44 && x.hh >= 44), '有容器的可點區不足 44');
  ok(dark.length > 0 && light.length > 0, '深底與淺底兩套都要有實際用到');

  /* 12　分段控制 */
  console.log('\n=== 12　消費／結算分段控制 ===');
  const seg = await page.evaluate(() => {
    store.s03Tab = 'exp'; renderS03();
    const bdg = [...document.querySelectorAll('#scr-s03 .bdg')].find(x => x.textContent === 'S-03-33');
    const cells = bdg ? [...bdg.parentElement.querySelectorAll('.seg button')].map(b => b.textContent.trim()) : [];
    store.s03Tab = 'settle'; renderS03();
    const pane = document.getElementById('s03settlepane');
    const ids = pane ? [...pane.querySelectorAll('.bdg')].map(x => x.textContent).filter(x => x.startsWith('S-05')) : [];
    store.s03Tab = 'exp'; renderS03();
    return { cells, s05count: ids.length, sample: ids.slice(0, 4) };
  });
  console.log(`   分格: ${seg.cells.join(' / ')}｜結算分頁內的 S-05 編號 ${seg.s05count} 個`, seg.sample.join(' '));
  ok(seg.cells.length === 2, `應恰好 2 格，實際 ${seg.cells.length}`);
  ok(seg.cells[0] === '消費' && seg.cells[1] === '結算', `文案應為 消費／結算，實際 ${seg.cells.join('／')}`);
  ok(seg.s05count > 0, '切到結算分頁後沒有渲染出 S-05 的內容');

  /* 13／14　三種狀態的底部主鈕與 ⋯ 選單 */
  console.log('\n=== 13／14　三種狀態 ===');
  const states = await page.evaluate(() => {
    const t = tripOf('t1'), out = {};
    for (const [k, st] of [['active', 'active'], ['settled', 'settled'], ['archived', 'archived']]) {
      t.status = st === 'active' ? 'active' : st;
      store.s03Tab = 'exp'; store.s03Menu = false; renderS03();
      const row = document.querySelector('#scr-s03 .btnrow');
      const main = row ? [...row.querySelectorAll('button,span.btn')].map(b => b.textContent.trim()) : null;
      store.s03Menu = true; renderS03();
      const menu = [...document.querySelectorAll('#scr-s03 .shopt')].map(b => ({
        t: b.textContent.trim(), dg: getComputedStyle(b.querySelector('.t')).color }));
      store.s03Menu = false;
      out[k] = { main, menu: menu.map(m => m.t), dgCount: menu.filter(m => m.dg !== menu[0].dg || m.t === '刪除行程').length,
                 dgItems: menu.filter(m => m.t === '刪除行程').map(m => m.dg) };
    }
    t.status = 'active'; renderS03();
    return out;
  });
  for (const [k, v] of Object.entries(states))
    console.log(`   ${k}：主鈕 ${v.main ? v.main.join('＋') : '（沒有）'}｜選單 ${v.menu.join('／')}`);
  ok(states.active.main && states.active.main.length === 1 && states.active.main[0].includes('記一筆'),
    `旅途中的底部主鈕應只有「＋ 記一筆」，實際 ${JSON.stringify(states.active.main)}`);
  ok(states.settled.main === null, `已結算態不應有底部主鈕，實際 ${JSON.stringify(states.settled.main)}`);
  ok(states.archived.main && states.archived.main.length === 1 && states.archived.main[0] === '重新開啟行程',
    `已封存的主鈕應為「重新開啟行程」，實際 ${JSON.stringify(states.archived.main)}`);
  ok(JSON.stringify(states.active.menu) === JSON.stringify(['編輯行程', '分享', '複製成新的一趟', '刪除行程']),
    `旅途中選單不符：${states.active.menu.join('／')}`);
  ok(JSON.stringify(states.settled.menu) === JSON.stringify(['編輯行程', '分享', '複製成新的一趟', '封存行程', '刪除行程']),
    `已結算選單不符：${states.settled.menu.join('／')}`);
  ok(JSON.stringify(states.archived.menu) === JSON.stringify(['分享', '複製成新的一趟', '刪除行程']),
    `已封存選單不符（不應有「編輯行程」）：${states.archived.menu.join('／')}`);
  const dgColour = await page.evaluate(() => {
    store.s03Menu = true; renderS03();
    const items = [...document.querySelectorAll('#scr-s03 .shopt .t')];
    const dg = getComputedStyle(document.querySelector('.ui')).getPropertyValue('--dg').trim();
    const hex = h => h.replace('#', '').match(/../g).map(x => parseInt(x, 16));
    const want = `rgb(${hex(dg).join(', ')})`;
    const r = items.map(x => ({ t: x.textContent.trim(), on: getComputedStyle(x).color === want }));
    store.s03Menu = false; renderS03();
    return r;
  });
  const coloured = dgColour.filter(x => x.on).map(x => x.t);
  console.log('   用 --dg 著色的項目:', coloured.join('／') || '（無）');
  ok(coloured.length === 1 && coloured[0] === '刪除行程', `--dg 應只用在「刪除行程」，實際 ${coloured.join('／')}`);

  /* 15　設定從行程頁移到首頁 */
  console.log('\n=== 15　設定入口移到首頁 ===');
  const settings = await page.evaluate(() => {
    store.s03Tab = 'exp'; store.s03Menu = false; renderS03(); renderS01();
    const inS03 = [...document.querySelectorAll('#scr-s03 [aria-label]')].map(x => x.getAttribute('aria-label'));
    const inS01 = [...document.querySelectorAll('#scr-s01 [aria-label]')].map(x => x.getAttribute('aria-label'));
    return { inS03, inS01 };
  });
  console.log('   S-03 的 aria-label:', settings.inS03.join('／'), '｜S-01:', settings.inS01.join('／'));
  ok(!settings.inS03.includes('設定'), 'S-03 仍有設定入口');
  ok(settings.inS01.includes('設定'), 'S-01 沒有設定入口');

  /* 16　編號：只多不改 */
  console.log('\n=== 16　編號沒有被重新指派 ===');
  const after = await page.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('.idx table tr td:first-child').forEach(td => {
      const t = td.textContent.trim(); if (/^S-\d/.test(t)) s.add(t);
    });
    return [...s];
  });
  if (!BEFORE) console.log('   （沒有給 BEFORE 基準檔，這一條跳過）');
  else {
    const pg = await browser.newPage();
    await pg.goto('file://' + path.resolve(BEFORE), { waitUntil: 'load' });
    const before = await pg.evaluate(fn => eval('(' + fn + ')()'), IDS.toString());
    await pg.close();
    const added = after.filter(x => !before.includes(x)).sort();
    const gone = before.filter(x => !after.includes(x)).sort();
    console.log('   新增:', added.join(' ') || '（無）', '｜消失:', gone.join(' ') || '（無）');
    ok(gone.length === 0, `有編號消失了：${gone.join(' ')}`);
    ok(JSON.stringify(added) === JSON.stringify(['S-01-15', 'S-03-31', 'S-03-32', 'S-03-33']),
      `新增編號不符（指令寫 S-03-30 起，但 30 已被「已結算／已封存不提醒」占用，故往後接）：${added.join(' ')}`);
  }

  /* 17　S-05 一個字都沒動 */
  console.log('\n=== 17　S-05 的內容一個字都沒動（只借它的輸出當分頁）===');
  if (!S05BASE) console.log('   （沒有給 S05BASE 基準檔，這一條跳過）');
  else {
    const base = JSON.parse(fs.readFileSync(S05BASE, 'utf8'));
    /* 前面的檢查改過 t.status 等狀態，這裡開一個乾淨的分頁重跑，與基準檔的取樣方式完全一致 */
    const pg2 = await browser.newPage();
    await pg2.setViewport({ width: 375, height: 900 });
    await pg2.goto('file://' + FILE, { waitUntil: 'load' });
    const now = await pg2.evaluate(() => {
      store.expenses.t1 = demoExpenses();
      const o = {};
      ['pending', 'check', 'partial', 'done'].forEach(s => {
        store.s05 = s; store.s05open = true; renderS05();
        o[s] = document.getElementById('scr-s05').innerHTML;
      });
      tripOf('t1').settleMode = 'hub'; tripOf('t1').hubMember = tripOf('t1').members[0].id;
      store.s05 = 'partial'; renderS05(); o.hub = document.getElementById('scr-s05').innerHTML;
      return o;
    });
    await pg2.close();
    /* 導覽列的返回鍵是 28-4 全站改的（不是 28-6 動 S-05），所以比對前先把 .bar 那一段
       從兩邊都拿掉。.bar 裡只有 button 與 span、沒有巢狀 div，第一個 </div> 就是它自己的收尾。 */
    /* icon 的 SVG 標記也換了（28-1 全站換 Feather、28-4 尺寸改 20），那是 icon 系統的事，
       不是 S-05 的內容。一併正規化掉，剩下的才是 S-05 自己的結構與文字。 */
    const strip = h => h
      .replace(/<div class="bar">[\s\S]*?<\/div>/, '§NAV§')
      .replace(/<svg class="ic"[\s\S]*?<\/svg>/g, '§IC§');
    const icCount = h => (h.match(/<svg class="ic"/g) || []).length;
    for (const k of Object.keys(base)) {
      const same = strip(base[k]) === strip(now[k] || '');
      const ic = icCount(base[k]) === icCount(now[k] || '');
      console.log(`   ${k}: ${same ? '相同' : '不同（' + base[k].length + ' → ' + (now[k] || '').length + ' 字元）'}`
        + `｜icon 數 ${icCount(base[k])} → ${icCount(now[k] || '')}`);
      ok(same, `renderS05() 的 ${k} 狀態輸出被改動了（已扣除全站共用的導覽列與 icon 標記）`);
      ok(ic, `${k} 狀態的 icon 數量變了——那代表內容真的被動過`);
    }
    /* 導覽列本身確實只差在返回鍵：標題與右側佔位以外的部分不得多出東西 */
    const navOf = h => (h.match(/<div class="bar">[\s\S]*?<\/div>/) || [''])[0];
    const nb = navOf(base.partial), nn = navOf(now.partial);
    console.log('   導覽列 前:', nb.replace(/\s+/g, ' ').slice(0, 90));
    console.log('   導覽列 後:', nn.replace(/\s+/g, ' ').slice(0, 90));
    ok(nb.includes('返回') && !nn.includes('>返回') && nn.includes('aria-label="返回"'),
      '導覽列的改動應只是把「返回」二字換成 aria-label');
    ok(nb.includes('結算') && nn.includes('結算'), '導覽列標題不得改動');
  }

  /* 7　不得橫向捲動 */
  console.log('\n=== 7　不得橫向捲動 ===');
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    for (const mode of ['anno', 'op']) {
      const d = await page.evaluate((exp, m) => {
        document.documentElement.classList.toggle('anno', m === 'anno');
        eval('(' + exp + ')()');
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
      }, EXPAND.toString(), mode);
      console.log(`   ${w}px ${mode}：${d.sw} / ${d.cw}`);
      ok(d.sw <= d.cw, `${w}px ${mode} 橫向溢出 ${d.sw - d.cw}px`);
    }
  }

  /* 9　編號與盤點表對得起來 */
  console.log('\n=== 9　編號對帳 ===');
  const inv = [...fs.readFileSync('_盤點_畫面功能.md', 'utf8')
    .matchAll(/^\|\s*~*(S-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)~*(?:\s*\[[^\]]*\])?\s*\|/gm)].map(m => m[1]);
  const invSet = new Set(inv);
  const orphan = after.filter(x => !invSet.has(x));
  const missing = inv.filter(x => !after.includes(x) && !/^S-(0[89]|1[01])-/.test(x));
  console.log(`   原型 ${after.length} 項｜盤點表 ${invSet.size} 項`);
  console.log('   孤兒：', orphan.join(' ') || '（無）', '｜缺漏：', missing.join(' ') || '（無）');
  ok(orphan.length === 0 && missing.length === 0, '編號對不起來');

  await browser.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
