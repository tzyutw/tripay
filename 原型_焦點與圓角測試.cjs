/* #31：鍵盤彈出且關不掉／真機模式的返回鍵／icon 薄膜／⋯ 選單撐滿／
 *      切換器合併／圓角版本切換器
 *
 *   BEFORE=<#31 之前的 Tripay_原型.html>
 */
const fs = require('fs'), path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
            else { console.error('需要 puppeteer-core'); process.exit(2); } }
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || 'Tripay_原型.html');
const SRC  = fs.readFileSync(FILE, 'utf8');

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
  const phone = async () => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await pg.goto('file://' + FILE, { waitUntil: 'load' });
    return pg;
  };

  /* 1　沒有 autofocus，載入後焦點在 body */
  console.log('\n=== 1　不得有 autofocus ===');
  const nAuto = SRC.split('autofocus').length - 1;
  console.log('   原始碼中 autofocus 出現', nAuto, '次');
  ok(nAuto === 0, `autofocus 應為 0 次，實際 ${nAuto}`);
  const pg = await phone();
  const boot = await pg.evaluate(() => document.activeElement.tagName);
  console.log('   載入後 activeElement:', boot);
  ok(boot === 'BODY', `載入後不該有東西被聚焦，實際 ${boot}`);
  const perScreen = await pg.evaluate(() => {
    const bad = [];
    DEV_SCREENS.forEach(([id]) => {
      devScreen = id; renderDevBar();
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) bad.push(id);
    });
    devScreen = 's03'; renderDevBar();
    return bad;
  });
  console.log('   切過每一個畫面後被聚焦的輸入框:', perScreen.length ? perScreen.join(' ') : '（無）');
  ok(perScreen.length === 0, `切畫面時聚焦了輸入框：${perScreen.join(' ')}`);

  /* 2　點按鈕不得聚焦輸入框 */
  console.log('\n=== 2　點按鈕不會叫出鍵盤 ===');
  const taps = await pg.evaluate(() => {
    const out = {};
    const tap = (sel, key) => {
      const el = document.querySelector(sel);
      if (!el) { out[key] = '（找不到）'; return; }
      el.click();
      const a = document.activeElement;
      out[key] = a ? a.tagName + (a.id ? '#' + a.id : '') : 'null';
    };
    store.expenses.t1 = demoExpenses(); store.s03Tab = 'exp'; store.s03Menu = false; renderS03();
    tap('#scr-s03 [aria-label="返回"]', '返回');
    devScreen = 's03'; renderDevBar(); renderS03();
    tap('#scr-s03 [aria-label="更多"]', '更多');
    store.s03Menu = false; renderS03();
    tap('#scr-s03 [data-s03tab="settle"]', '分頁');
    store.s03Tab = 'exp'; renderS03();
    tap('#scr-s03 .btnrow button', '底部主鈕');
    return out;
  });
  Object.entries(taps).forEach(([k, v]) => console.log(`   點${k} → activeElement ${v}`));
  ok(Object.values(taps).every(v => !/^(INPUT|TEXTAREA)/.test(v)), '有按鈕點下去會聚焦輸入框');

  /* 3　主動就地編輯仍然要自動聚焦 */
  console.log('\n=== 3　就地編輯的自動聚焦沒有被改壞 ===');
  const inline = await pg.evaluate(() => {
    const out = {};
    /* 真機模式一次只顯示一個畫面，其餘 display:none——隱藏元素 .focus() 不會生效。
       這一段測的是就地編輯本身，先離開真機模式。 */
    setDev(false);
    f = blankForm(store.trips[0].members); renderS02();
    document.querySelector('#scr-s02 [data-av]').click();
    out.成員識別 = document.activeElement.getAttribute('data-avin');
    editing = null; renderS02();
    g = blankExp(); renderS04();
    document.querySelector('#scr-s04 [data-av="exp:g"]').click();
    out.類別emoji = document.activeElement.getAttribute('data-avin');
    /* 開著的時候重繪一次，焦點要留在原地 */
    const before = document.activeElement;
    paintS04();
    out.重繪後仍是同一個 = document.activeElement === before;
    editing = null; renderS04();
    return out;
  });
  console.log('   ' + JSON.stringify(inline));
  ok(inline.成員識別 && inline.成員識別.startsWith('f:'), '點成員識別圓圈應聚焦該列輸入框');
  ok(inline.類別emoji === 'exp:g', '點類別 emoji 應聚焦輸入框');
  ok(inline.重繪後仍是同一個 === true, '重繪後焦點應留在同一個輸入框');
  ok(/keepIsInput/.test(SRC), '重繪還原焦點要先確認 keep 是輸入元件');

  /* 4　真機模式的返回鍵有去處 */
  console.log('\n=== 4　真機模式的返回鍵 ===');
  const back = await pg.evaluate(() => {
    setDev(true);
    const out = [];
    for (const [from, to] of Object.entries(DEV_BACK)) {
      devScreen = from; renderDevBar();
      const el = document.querySelector('.scr.devon [aria-label="返回"],.scr.devon [aria-label="關閉"]');
      if (!el) { out.push(`${from}:（這一頁沒有返回或關閉鍵）`); continue; }
      const pe = getComputedStyle(el).pointerEvents;
      el.click();
      out.push(`${from}→${devScreen}${devScreen === to ? '' : '（預期 ' + to + '）'}${pe === 'none' ? ' [不可點]' : ''}`);
    }
    devScreen = 's03'; renderDevBar();
    return out;
  });
  console.log('   ' + back.join('｜'));
  ok(back.every(x => !x.includes('預期')), `返回鍵沒有走到該去的地方：${back.join('｜')}`);
  ok(back.some(x => x.includes('→')), '至少要有畫面真的變了');

  /* 5　icon 容器是半透明薄膜 */
  console.log('\n=== 5　icon 容器透得出底色 ===');
  const films = await pg.evaluate(exp => {
    devScreen = 's03'; renderDevBar();
    document.documentElement.classList.remove('dev');
    eval('(' + exp + ')()');
    const seen = {};
    document.querySelectorAll('.ui .ic2').forEach(el => {
      const cs = getComputedStyle(el);
      const key = cs.backgroundColor + ' | ' + cs.borderTopColor;
      (seen[key] = seen[key] || []).push((el.getAttribute('aria-label') || '?') + '@' + el.closest('.ui').id);
    });
    return seen;
  }, EXPAND.toString());
  Object.entries(films).forEach(([k, v]) => console.log(`   ${k}　←　${v.join('、')}`));
  const combos = Object.keys(films);
  ok(combos.length === 2, `全站應只有兩種組合（深底／淺底），實際 ${combos.length} 種`);
  ok(combos.every(k => /rgba\([^)]*0?\.\d+\)/.test(k.split(' | ')[0])),
    `有 .ic2 的底色不是半透明：${combos.join(' ／ ')}`);
  /* 在 8 種目的地色調上量 icon 對「按鈕實際所在位置」的底色的對比。
     hero 是 160deg 的漸層——把所有色停都當底色會過度悲觀（最亮的那一停在右下角，
     按鈕在頂端）。這裡把按鈕中心投影到漸層軸上、內插出該點的顏色，再疊 14% 白膜。 */
  const contrast = await pg.evaluate(() => {
    const t = tripOf('t1');
    return TONES.map((tone, ti) => {
      t.tone = ti;   /* toneFor(name, forced) 的第二個參數是 TONES 的索引，不是 key */
      store.s03Tab = 'exp'; store.s03Menu = false; renderS03();
      const hero = document.querySelector('#scr-s03 .hero').getBoundingClientRect();
      const pts = [...document.querySelectorAll('#scr-s03 .hero .ic2')]
        .map(el => { const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2 - hero.left, y: r.top + r.height / 2 - hero.top }; });
      /* 解析 linear-gradient(160deg, #A 0%, #B 35%, ...) */
      const deg = parseFloat(tone.g.match(/(-?[\d.]+)deg/)[1]);
      const stops = [...tone.g.matchAll(/(#[0-9A-Fa-f]{6})\s*([\d.]+)?%?/g)]
        .map((m, i, a) => ({ c: m[1], p: m[2] !== undefined ? +m[2] : (i === 0 ? 0 : 100) }));
      if (stops.length && stops[stops.length - 1].p !== 100) stops[stops.length - 1].p = 100;
      const W = hero.width, H = hero.height;
      const rad = (deg - 90) * Math.PI / 180;
      const ux = Math.cos(rad), uy = Math.sin(rad);
      const L = Math.abs(W * ux) + Math.abs(H * uy);   // 漸層線長度
      const at = (x, y) => {
        const d = ((x - W / 2) * ux + (y - H / 2) * uy) / L + 0.5;
        const pct = Math.max(0, Math.min(100, d * 100));
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
  const film = (rgb, a) => {
    const c = rgb.match(/\d+/g).map(Number);
    return `rgb(${c.map(v => Math.round(v * (1 - a) + 255 * a)).join(', ')})`;   // 疊 14% 白膜
  };
  const low = [];
  let worst = 99, worstAt = '';
  contrast.forEach(t => t.at.forEach(bg => {
    const v = cr('rgb(255, 255, 255)', film(bg, 0.14));
    if (v < 3) low.push(`${t.k} ${bg} → ${v.toFixed(2)}:1`);
    if (v < worst) { worst = v; worstAt = `${t.k} ${bg}`; }
  }));
  console.log(`   白 icon 對「按鈕位置的底色＋14% 白膜」最差：${worstAt} → ${worst.toFixed(2)}:1`);
  console.log('   低於 3:1 的色調:', low.length ? low.join('、') : '（無）');
  /* 指令明講：若某些色調對比不夠，停下回報是哪一個，不要自己改回黑色或加陰影。
     所以這裡只記錄，不當成失敗；清單會寫進停點報告給 Rozi 判斷。 */
  ok(true, '');
  if (low.length) console.log('   ⚠ 上列色調需要 Rozi 裁示（依指令不自行處理）');
  const lightC = await pg.evaluate(() => {
    g = blankExp(); renderS04();
    const el = document.querySelector('#scr-s04 .ic2');
    return { ic: getComputedStyle(el).color, bg: getComputedStyle(el.closest('.shd') || el.parentElement).backgroundColor };
  });
  const lightBg = 'rgb(240, 241, 236)';   // #EDEEE8 疊 5% 黑
  console.log(`   淺底：icon ${lightC.ic} 對薄膜後的底 ${lightBg} → ${cr(lightC.ic, lightBg).toFixed(2)}:1`);
  ok(cr(lightC.ic, lightBg) >= 3, '淺底上的 icon 對比不足 3:1');
  const size = await pg.evaluate(exp => {
    eval('(' + exp + ')()');
    return [...document.querySelectorAll('.ui .ic2')].map(el => {
      const r = el.getBoundingClientRect(), a = getComputedStyle(el, '::after');
      return { w: r.width, h: r.height, svg: el.querySelector('svg').getAttribute('width'),
               hw: parseFloat(a.width), hh: parseFloat(a.height) };
    });
  }, EXPAND.toString());
  ok(size.every(x => x.w === 40 && x.h === 40 && x.svg === '20' && x.hw >= 44 && x.hh >= 44),
    '.ic2 的尺寸或可點區被動到了');

  /* 6　⋯ 選單撐滿寬度、分隔線由面板負責 */
  console.log('\n=== 6　⋯ 選單的項目撐滿 ===');
  const menu = await pg.evaluate(() => {
    const t = tripOf('t1'), out = {};
    for (const st of ['planned', 'settled', 'archived']) {
      t.status = st; store.s03Tab = 'exp'; store.s03Menu = true; renderS03();
      const items = [...document.querySelectorAll('#scr-s03 .shopt.mi')];
      const panel = items[0].parentElement.getBoundingClientRect().width;
      const rules = [...document.querySelectorAll('#scr-s03 .mrule')];
      /* 只看動作項目——底部的「取消」是有框的按鈕，本來就該有邊 */
      const bordered = items.filter(el => parseFloat(getComputedStyle(el).borderBottomWidth) > 0).length;
      out[st] = { n: items.length, panel: +panel.toFixed(1),
                  w: items.map(x => +x.getBoundingClientRect().width.toFixed(1)),
                  h: items.map(x => +x.getBoundingClientRect().height.toFixed(1)),
                  rules: rules.length,
                  ruleW: rules.map(x => +x.getBoundingClientRect().width.toFixed(1)),
                  bordered };
    }
    t.status = 'active'; store.s03Menu = false; renderS03();
    return out;
  });
  Object.entries(menu).forEach(([k, v]) => console.log(`   ${k}: ${v.n} 項｜面板 ${v.panel}｜寬 ${v.w.join(',')}｜高 ${v.h.join(',')}｜分隔線 ${v.rules} 條 寬 ${v.ruleW.join(',')}`));
  ok(Object.values(menu).every(v => v.w.every(w => Math.abs(w - v.panel) <= 2)), '選單項目沒有撐滿面板');
  ok(Object.values(menu).every(v => v.h.every(h => h >= 44)), '選單項目高度不足 44');
  ok(Object.values(menu).every(v => v.rules === 2), `分隔線應為每種狀態 2 條，實際 ${Object.values(menu).map(v => v.rules).join('/')}`);
  ok(Object.values(menu).every(v => v.ruleW.every(w => w >= v.panel)), '分隔線不是滿版');
  ok(Object.values(menu).every(v => v.bordered === 0), '選單裡不該還有自帶 border-bottom 的項目');
  const narrow = await pg.evaluate(exp => {
    eval('(' + exp + ')()');
    store.s03Menu = true; renderS03(); store.s03bView = 'del'; renderS03b();
    /* 沿用 #25-7 的判準：跟「同一個容器裡該分到的寬度」比，
       不是跟整個面板比——兩顆並排的按鈕各佔一半是正常的。 */
    const bad = [];
    document.querySelectorAll('.ui .sheet, .ui .dlg').forEach(panel => {
      panel.querySelectorAll('button, .btn, .shopt').forEach(el => {
        const box = el.parentElement;
        if (!box) return;
        const kids = [...box.children].filter(k => k.getBoundingClientRect().width > 0);
        /* 只看「整列都是按鈕」的按鈕列——那才是 #25-7 那個塌陷的形狀。
           成員列那種「emoji＋名字＋小按鈕」的混合列不算，那些元素本來就不同寬。 */
        if (kids.length < 1 || !kids.every(k => k.matches('button, .btn, .shopt, .b'))) return;
        const share = box.getBoundingClientRect().width / kids.length;
        const w = el.getBoundingClientRect().width;
        if (w && share && w < share * 0.7)
          bad.push(`${el.textContent.trim().slice(0, 6)} ${w.toFixed(0)}/${share.toFixed(0)}`);
      });
    });
    store.s03Menu = false; renderS03();
    return bad;
  }, EXPAND.toString());
  console.log('   .sheet／.dlg 內寬度不足的可點元素:', narrow.length ? narrow.join('、') : '（無）');
  ok(narrow.length === 0, `可點區小於視覺區：${narrow.join('、')}`);

  /* 7　切換器只剩一套 */
  console.log('\n=== 7　.tabs 與 .seg 已合併 ===');
  const seg = await pg.evaluate(exp => {
    eval('(' + exp + ')()');
    const w = getComputedStyle(document.querySelector('.ui')).getPropertyValue('--w').trim();
    const segs = [...document.querySelectorAll('.ui .seg')];
    return { tabs: document.querySelectorAll('.ui .tabs').length, n: segs.length,
             on: [...new Set(segs.map(s => { const b = s.querySelector('button.on');
               return b ? getComputedStyle(b).backgroundColor : null; }).filter(Boolean))],
             w };
  }, EXPAND.toString());
  console.log('   ' + JSON.stringify(seg));
  ok(!/\.tabs/.test(SRC.split('</style>')[0].replace(/\/\*[\s\S]*?\*\//g, '')), '.tabs 的 CSS 應已移除');
  ok(seg.tabs === 0, '還有元素在用 .tabs');
  ok(seg.n >= 3, `.seg 應涵蓋分頁／幣別／填哪一邊等處，實際只有 ${seg.n}`);
  ok(seg.on.length === 1 && seg.on[0] === 'rgb(255, 255, 255)',
    `選中格應一律是白色 pill，實際 ${seg.on.join('／')}`);
  const dis = await pg.evaluate(() => {
    const t = tripOf('t1'); t.rateTwd = undefined; t.rateFor = undefined;
    store.s03Tab = 'exp'; renderS03();
    const b = document.querySelector('#scr-s03 .seg button.dis');
    const on = document.querySelector('#scr-s03 .seg button.on');
    const track = getComputedStyle(b.parentElement).backgroundColor;
    return { dis: getComputedStyle(b).color, able: getComputedStyle(on).color, track,
             cursor: getComputedStyle(b).cursor };
  });
  console.log(`   停用格 ${dis.dis} 對底軌 ${dis.track} → ${cr(dis.dis, dis.track).toFixed(2)}:1`
            + `｜可按的 ${dis.able} → ${cr(dis.able, dis.track).toFixed(2)}:1｜cursor ${dis.cursor}`);
  ok(dis.dis !== dis.able, '停用態要與可按的分得出來');
  ok(cr(dis.dis, dis.track) >= 3, '停用態仍要讀得出來（≥3:1）');

  /* 8　圓角變數與六個版本 */
  console.log('\n=== 8　圓角六個版本 ===');
  const uiCss = SRC.slice(SRC.indexOf('/* ══ 產品 UI'), SRC.indexOf('</style>'));
  const hard = uiCss.match(/border-radius:\s*\d+px/g) || [];
  console.log('   .ui CSS 內寫死的圓角:', hard.length ? hard.join(' ') : '（無）');
  ok(hard.length === 0, `還有寫死的圓角：${hard.join(' ')}`);
  const broken = []; let baseOver = new Set();
  /* #33-7 圓角定案 C，六版切換器已移除——這一整段的六版比對隨之作廢，
     改為只驗「圓角仍由變數控制、值就是定案的 10/20」。 */
  /* #33-7 圓角定案 C，六版切換器已移除——原本的六版逐一比對隨之作廢。
     改為只驗「圓角仍由變數控制、值就是定案的 10/20、沒有寫死的圓角」。 */
  const one = await pg.evaluate((exp, ink) => {
    document.documentElement.classList.remove('dev', 'anno');
    eval('(' + exp + ')()');
    const vals = new Set();
    document.querySelectorAll('.ui *').forEach(el => {
      const br = getComputedStyle(el).borderRadius;
      if (br && br !== '0px') vals.add(br);
    });
    const cs = getComputedStyle(document.documentElement);
    return { vals: [...vals], base: cs.getPropertyValue('--r-base').trim(),
             panel: cs.getPropertyValue('--r-panel').trim(),
             ink: eval('(' + ink + ')()'),
             sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  }, EXPAND.toString(), INK.toString());
  console.log(`   圓角值 ${one.vals.join(' / ')}｜--r-base ${one.base}／--r-panel ${one.panel}｜${one.sw}/${one.cw}｜貼邊 ${one.ink.length}`);
  ok(one.base === '10px' && one.panel === '20px', `圓角應為定案的 10/20，實際 ${one.base}/${one.panel}`);
  ok(one.sw <= one.cw && one.ink.length === 0, '有橫向捲動或文字貼邊');


  /* 9　切換器在桌機與真機模式都在 */
  console.log('\n=== 9　圓角切換器已移除（#33-7）===');
  const gone = await pg.evaluate(() => ({
    box: !!document.getElementById('radiussw'),
    btns: document.querySelectorAll('[data-radius]').length,
    inBar: !!document.querySelector('#devbar .rr'),
  }));
  console.log('   ' + JSON.stringify(gone));
  ok(!gone.box && gone.btns === 0 && !gone.inBar, '圓角切換器應已移除（拋棄式工具，挑完就收）');
  ok(!/RADIUS_SETS/.test(SRC), 'RADIUS_SETS 應已刪除');

  await pg.close();

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
