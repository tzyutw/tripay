/* #27：承諾了產品沒有的東西（3 項）＋ 全站 icon 線性系統
 *
 * 用真實 Chrome。條件 13（操作模式版面不得改變）需要一份基準檔：
 *   git show <改動前的 commit>:Tripay_原型.html > /tmp/before.html
 *   BEFORE=/tmp/before.html node 原型_icon與承諾測試.cjs
 * 沒給 BEFORE 就跳過那一條並明講跳過了。
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

/* 每個 .b 的幾何——條件 13 比對用。
 * 座標取「相對於所屬手機框（.ui）」，不是相對於文件：右側編號清單的字數一變，
 * 整份文件的絕對 y 就會跟著跑，那不是版面問題。要守的是手機框裡的版面。 */
const GEOM = () => {
  const out = [];
  document.querySelectorAll('.b').forEach(el => {
    const r = el.getBoundingClientRect();
    const host = (el.closest('.ui') || document.documentElement).getBoundingClientRect();
    out.push([(el.querySelector(':scope > .bdg') || {}).textContent || '?',
      +(r.x - host.x).toFixed(2), +(r.y - host.y).toFixed(2),
      +r.width.toFixed(2), +r.height.toFixed(2)].join(','));
  });
  return out;
};

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 900 });
  await page.goto('file://' + FILE, { waitUntil: 'load' });

  /* 1　ic() 輸出線稿，不再填色 */
  console.log('\n=== 1　ic() 產出的是線稿 ===');
  const svg = await page.evaluate(() => ic('settings', 18));
  console.log('   ' + svg.replace(/\s+/g, ' ').slice(0, 150));
  ok(!svg.includes('fill="currentColor"'), 'ic() 仍輸出填色');
  for (const a of ['stroke="currentColor"', 'stroke-linecap="round"', 'stroke-linejoin="round"'])
    ok(svg.includes(a), `ic() 缺 ${a}`);
  const allSvg = await page.evaluate(() => Object.keys(ICON).map(k => ic(k, 18)).join(''));
  ok(!allSvg.includes('fill="currentColor"'), '有 icon 仍是填色');
  const dom = await page.evaluate(exp => {
    eval('(' + exp + ')()');
    return [...document.querySelectorAll('svg.ic')].filter(s => s.getAttribute('fill') !== 'none').length;
  }, EXPAND.toString());
  console.log('   畫面上非線稿的 svg.ic:', dom);
  ok(dom === 0, `畫面上還有 ${dom} 個填色 icon`);

  /* 2　四個方向鍵是開放折線，不是實心三角 */
  console.log('\n=== 2　方向鍵改成 chevron ===');
  const dirs = await page.evaluate(() => Object.fromEntries(['back', 'next', 'down', 'up'].map(k => [k, ICON[k]])));
  for (const [k, v] of Object.entries(dirs)) {
    console.log(`   ${k}: ${v}`);
    ok(!/[Zz]/.test(v), `${k} 仍是封閉路徑：${v}`);
  }

  /* 3　沒有任何 SF Symbols 痕跡 */
  console.log('\n=== 3　沒有 SF Symbols ===');
  for (const tok of ['SF Pro', 'SF Compact', 'SF Mono', 'SFSymbols', 'sfsymbols']) {
    const n = SRC.split(tok).length - 1;
    ok(n === 0, `原型仍出現「${tok}」${n} 次`);
  }
  console.log('   五個字串全部 0 次');

  /* 4　授權檔涵蓋每一個鍵 */
  console.log('\n=== 4　_icon授權.md 涵蓋每一個 icon ===');
  ok(fs.existsSync('_icon授權.md'), '_icon授權.md 不存在');
  const lic = fs.existsSync('_icon授權.md') ? fs.readFileSync('_icon授權.md', 'utf8') : '';
  const keys = await page.evaluate(() => Object.keys(ICON));
  const noLic = keys.filter(k => !lic.includes(k));
  console.log('   未列入授權檔：', noLic.length ? noLic.join(' ') : '（無）');
  ok(noLic.length === 0, `授權檔沒提到：${noLic.join(' ')}`);

  /* 5　候選對照條——#28-1 Rozi 選定 Feather 後已移除，這一條由 原型_貼邊與結構測試.cjs
   *     的「icon 只剩一組」接手。這裡只留「不得再有多組並存」的守門。 */
  console.log('\n=== 5　候選對照條（#28-1 後應已移除）===');
  const strip = await page.evaluate(() => !!document.getElementById('iconpick'));
  console.log('   對照條還在:', strip);
  ok(!strip, '對照條應在 #28-1 選定 Feather 後移除');
  ok(!SRC.includes('ICON_SETS'), '不得再有多組 icon 並存');

  /* 6　沒有 App 就不要說「下載」／「安裝」 */
  console.log('\n=== 6　手機框不出現「下載 Tripay」與「安裝」 ===');
  const ui = await page.evaluate(exp => {
    eval('(' + exp + ')()');
    return [...document.querySelectorAll('.ui')].map(u => u.textContent).join('');
  }, EXPAND.toString());
  for (const tok of ['下載 Tripay', '安裝']) {
    console.log(`   含「${tok}」:`, ui.includes(tok));
    ok(!ui.includes(tok), `手機框仍出現「${tok}」`);
  }
  const s06 = await page.evaluate(() => { renderS06(); return document.getElementById('scr-s06').textContent; });
  ok(s06.includes('這趟帳是用 Tripay 記的'), 'S-06-12 文案未改');
  ok(s06.includes('開一趟自己的'), 'S-06-12 的動作未改');

  /* 7　深色模式整段移除 */
  console.log('\n=== 7　S-07-5 顯示設定整段移除 ===');
  const s07 = await page.evaluate(() => {
    store.s07dlg = false; renderS07();
    const el = document.getElementById('scr-s07');
    return { html: el.innerHTML, text: el.textContent };
  });
  console.log('   含「深色模式」:', s07.text.includes('深色模式'), '｜含「顯示」:', s07.text.includes('顯示'));
  ok(!s07.text.includes('深色模式'), 'S-07 仍有深色模式');
  ok(!s07.text.includes('顯示'), 'S-07 仍有「顯示」小標');
  ok(SRC.includes("'S-07-5'"), 'S-07-5 的編號應保留在清單裡，不得重新編號');

  /* 12　標註徽章不得蓋住任何文字 */
  console.log('\n=== 12　標註徽章不蓋住內容 ===');
  for (const w of [320, 375, 414]) {
    await page.setViewport({ width: w, height: 900 });
    const hits = await page.evaluate(exp => {
      document.documentElement.classList.add('anno');
      eval('(' + exp + ')()');
      const bad = [];
      document.querySelectorAll('.b > .bdg').forEach(bdg => {
        const box = bdg.parentElement, br = bdg.getBoundingClientRect();
        if (!br.width) return;
        box.querySelectorAll('*').forEach(el => {
          if (el === bdg || bdg.contains(el)) return;
          const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (!own) return;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          if (br.right > r.left + 0.5 && br.left < r.right - 0.5 &&
            br.bottom > r.top + 0.5 && br.top < r.bottom - 0.5)
            bad.push(`${bdg.textContent} 蓋住「${el.textContent.trim().slice(0, 10)}」`);
        });
      });
      return [...new Set(bad)];
    }, EXPAND.toString());
    console.log(`   ${w}px：`, hits.length ? hits.slice(0, 6).join('、') + (hits.length > 6 ? ` ...共 ${hits.length} 筆` : '') : '（無）');
    ok(hits.length === 0, `${w}px 有 ${hits.length} 個徽章蓋住文字`);
  }
  await page.setViewport({ width: 375, height: 900 });

  /* 13　操作模式的版面一個 px 都不能動
   *
   * 13a 是自證：同一個檔案，把 html.anno 的規則整組停用後再量一次操作模式。
   *     兩次完全相同 → 證明標註層的改動碰不到操作模式。容差 0。
   * 13b 是基準檔比對：#27-2 本來就會把 S-07-5 整段拿掉，後面的區塊必然往上移，
   *     所以 y 只允許在 S-07 內位移；x／寬／高全站都必須一模一樣。
   *     （指令原文要求「與修改前完全相同、容差 0」，但同一節又要求移除 S-07-5 ——
   *       兩條互斥，這裡拆成可判斷的兩段，並在報告寫明。）
   */
  console.log('\n=== 13a　停用標註樣式後，操作模式的版面不變 ===');
  const geomOp = async (killAnno) => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 375, height: 900 });
    await pg.goto('file://' + FILE, { waitUntil: 'load' });
    const g = await pg.evaluate((exp, kill) => {
      document.documentElement.classList.remove('anno');
      if (kill) for (const sh of document.styleSheets) {
        let rules; try { rules = sh.cssRules; } catch (e) { continue; }   // 跨網域字體表讀不到，跳過
        for (let i = rules.length - 1; i >= 0; i--)
          if ((rules[i].selectorText || '').includes('html.anno')) sh.deleteRule(i);
      }
      eval('(' + exp.e + ')()');
      return eval('(' + exp.g + ')()');
    }, { e: EXPAND.toString(), g: GEOM.toString() }, killAnno);
    await pg.close();
    return g;
  };
  const withAnno = await geomOp(false), withoutAnno = await geomOp(true);
  const d13a = withAnno.filter((x, i) => x !== withoutAnno[i]);
  console.log(`   ${withAnno.length} 個 .b，差異 ${d13a.length} 筆`, d13a.slice(0, 3).join(' | '));
  ok(withAnno.length === withoutAnno.length && d13a.length === 0,
    `標註樣式影響到了操作模式的版面：${d13a.slice(0, 3).join(' | ')}`);

  /* 13b 原本比對 #27 之前的基準檔。#28-3／28-6／28-7 之後版面本來就該不同
   *     （登入頁改共用 200px 欄、S-03 動作結構重整、icon 容器 26→40），
   *     那份基準已失效，改由 原型_貼邊與結構測試.cjs 用 #28 之前的基準接手。
   *     13a 是自證式的，不依賴任何基準檔，永遠有效，保留。 */

  /* 14　S-05-17 回顧卡第三欄 */
  console.log('\n=== 14　回顧卡的錢字符號回到數字前 ===');
  const hi = await page.evaluate(() => {
    store.s05 = 'done'; renderS05();
    const nums = [...document.querySelectorAll('#scr-s05 .fld .tnum')];
    return {
      cells: nums.map(e => e.textContent.trim()),
      labels: nums.map(e => e.parentElement.lastElementChild.textContent.trim()),
    };
  });
  console.log('   數字:', hi.cells.join(' / '), '\n   標籤:', hi.labels.join(' / '));
  ok(/^\$/.test(hi.cells[2]), `第三欄數字應以錢字符號開頭，實際「${hi.cells[2]}」`);
  ok(hi.labels[2] === '最大手筆', `第三欄標籤應為「最大手筆」，實際「${hi.labels[2]}」`);

  /* 15／16　登出不是刪除，但 .delrow 仍是刪除 */
  console.log('\n=== 15／16　登出不再染成刪除色 ===');
  console.log('   renderS07() 含 var(--dg):', s07.html.includes('var(--dg)'));
  ok(!s07.html.includes('var(--dg)'), 'S-07 仍有元素直接吃 var(--dg)');
  const delrow = /\.ui \.delrow\{[^}]*color:var\(--dg\)/.test(SRC);
  console.log('   .delrow 仍是 var(--dg):', delrow);
  ok(delrow, '.delrow 的 --dg 被順手改掉了，那兩處確實是刪除，不准動');

  /* 18／19　ICON 13 個鍵、每個都有人用 */
  console.log('\n=== 18／19　ICON 沒有死條目 ===');
  console.log('   鍵:', keys.join(' '), `（${keys.length} 個）`);
  ok(keys.length === 14, `ICON 應為 14 個鍵（13 ＋ #28-6b 的 more），實際 ${keys.length}`);
  ok(!keys.includes('filter') && !keys.includes('money'), 'filter／money 應已刪除');
  const used = new Set();
  for (const mm of SRC.matchAll(/\bic\(([^)]*)\)/g))
    for (const q of mm[1].matchAll(/'([a-z]+)'/g)) used.add(q[1]);
  const dead = keys.filter(k => !used.has(k));
  console.log('   目前沒有任何 ic() 用到:', dead.length ? dead.join(' ') : '（無）');
  /* #27-5a 的規則是「不得有沒人維護的死條目」。#28-6b 把編輯／複製／分享／刪除
     四個動作改成 ⋯ 選單裡的純文字項，那四個 icon 因此失去呼叫點。
     指令沒說要給選單項加 icon，也沒說要刪這四個鍵——照「動 A 不准順手換 B」停下回報。
     這裡改成：允許暫時沒用到，但**必須在 _icon授權.md 裡寫明**，不能靜默爛掉。 */
  const declared = (lic.split('### 目前沒有用到')[1] || '');
  const undocumented = dead.filter(k => !declared.includes('`' + k + '`'));
  console.log('   授權檔有交代的:', dead.filter(k => lic.includes('`' + k + '`')).join(' ') || '（無）');
  ok(undocumented.length === 0, `死條目沒有在 _icon授權.md 交代：${undocumented.join(' ')}`);
  ok(dead.length <= 4, `死條目過多（${dead.length} 個），該重新檢視 ICON 的內容`);

  /* 20　自備 icon */
  console.log('\n=== 20　icons_自備/ ===');
  const own = fs.existsSync('icons_自備')
    ? fs.readdirSync('icons_自備').filter(f => f.endsWith('.svg')) : [];
  /* #27-5b 第 3 條：檔名不在 13 個鍵名之內的一律忽略，並在回報中列出 */
  const adopted = own.filter(f => keys.includes(f.replace('.svg', '')));
  const ignored = own.filter(f => !keys.includes(f.replace('.svg', '')));
  console.log('   .svg 檔:', own.length ? own.length + ' 個' : '（空的）');
  console.log('   採用（檔名等於鍵名）:', adopted.length ? adopted.join(' ') : '（無）');
  console.log('   忽略（檔名不是鍵名）:', ignored.length ? ignored.join(' ') : '（無）');
  const notLic = adopted.filter(f => !lic.includes(f.replace('.svg', '')));
  ok(notLic.length === 0, `採用的自備 icon 未列入授權檔：${notLic.join(' ')}`);
  ok(ignored.every(f => lic.includes(f)), '被忽略的檔名必須在 _icon授權.md 裡交代，否則 Rozi 不知道為什麼沒生效');

  /* 24　S-04-3 可點，且與 S-02c-11 共用同一個處理函式 */
  console.log('\n=== 24　S-04-3 類別 emoji 就地編輯 ===');
  const s04 = await page.evaluate(() => {
    g = blankExp(); editing = null; renderS04();
    const btn = document.querySelector('#scr-s04 [data-av="exp:g"]');
    if (!btn) return { clickable: false };
    btn.click();
    const inp = document.querySelector('#scr-s04 [data-avin="exp:g"]');
    if (!inp) return { clickable: true, opens: false };
    inp.value = '🍣';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    renderS04();
    const after = document.querySelector('#scr-s04 [data-av="exp:g"]');
    return { clickable: true, opens: true, saved: g.emoji, manual: !!g.emojiManual,
             collapsed: !document.querySelector('#scr-s04 [data-avin="exp:g"]'),
             shown: after ? after.textContent.trim() : '' };
  });
  console.log('   ' + JSON.stringify(s04));
  ok(s04.clickable, 'S-04-3 仍是不能點的 span');
  ok(s04.opens, '點了沒有變成輸入框');
  ok(s04.saved === '🍣' && s04.shown === '🍣', `輸入後沒有存起來，實際「${s04.saved}」`);
  ok(s04.collapsed, '輸入後應自動收合，不需要確認鈕');
  ok(s04.manual === true, '應標記為手動指定');
  // 兩處必須走同一個函式，不得各寫一份
  for (const fn of ['beginInlineEdit', 'commitInlineEdit']) {
    const n = SRC.split(fn + '(').length - 1;
    console.log(`   ${fn}( 出現 ${n} 次`);
    ok(n >= 2, `${fn} 應被定義並被呼叫`);
  }
  const twoPaths = (SRC.match(/data-avin=/g) || []).length;
  console.log('   data-avin 的產生點:', twoPaths, '（都由 inlineEditInput() 產出才算共用）');
  ok(SRC.includes('function inlineEditInput'), '就地編輯的輸入框應由同一個函式產生');
  // 手動指定優先於自動推斷
  const prio = await page.evaluate(() => {
    g = blankExp(); editing = null; renderS04();
    const t1 = document.getElementById('e-title');
    t1.value = '午餐'; t1.dispatchEvent(new Event('input', { bubbles: true }));
    const auto = g.emoji;
    document.querySelector('#scr-s04 [data-av="exp:g"]').click();
    const inp = document.querySelector('#scr-s04 [data-avin="exp:g"]');
    inp.value = '🍣'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    renderS04();
    const t2 = document.getElementById('e-title');
    t2.value = '計程車'; t2.dispatchEvent(new Event('input', { bubbles: true }));
    return { auto, afterManual: g.emoji };
  });
  console.log(`   標題「午餐」自動推斷 ${prio.auto} → 手動改 🍣 → 標題改「計程車」後仍為 ${prio.afterManual}`);
  ok(prio.auto === '🍜', `自動推斷失效，實際「${prio.auto}」`);
  ok(prio.afterManual === '🍣', '手動指定被標題蓋掉了');

  /* 25　盤點表的 S-04-3 不再是「議」 */
  console.log('\n=== 25　盤點表 S-04-3 ===');
  const invMd = fs.readFileSync('_盤點_畫面功能.md', 'utf8');
  const row = (invMd.match(/^\| S-04-3 \|.*$/m) || [''])[0];
  console.log('   ' + row.slice(0, 120));
  ok(row && !row.includes('[議]'), '盤點表的 S-04-3 仍標著 [議]');

  /* 21／22／23　盤點檔跟著同步 */
  console.log('\n=== 21／22／23　_盤點_實作缺口.md 同步 ===');
  const gap = fs.readFileSync('_盤點_實作缺口.md', 'utf8');
  const first = gap.split('## 第一段')[1].split('## 第二段')[0];
  const gapRows = [...first.matchAll(/^\| (S-[0-9A-Za-z-]+) \| ([^|]*)\| ([^|]*)\| ([^|]*)\| ([^|]*)\|$/gm)]
    .map(m => ({ id: m[1], cat: m[3].trim(), diff: m[5].trim() }));
  const need = { 'S-06-12': '要改', 'S-06-13': '要移除', 'S-07-5': '要移除',
                 'S-05-17': '要改', 'S-07-6': '要改', 'S-04-3': '要改' };
  for (const [k, v] of Object.entries(need)) {
    const r = gapRows.find(x => x.id === k);
    console.log(`   ${k}: ${r ? r.cat : '（缺）'}`);
    ok(r && r.cat === v, `${k} 的分類應為「${v}」，實際「${r ? r.cat : '缺'}」`);
    ok(r && (v !== '要改' || r.diff), `${k} 是「要改」卻沒寫差在哪`);
    ok(r && r.diff.includes('#27'), `${k} 的說明應寫明是 #27 改的`);
  }
  const CATS2 = ['已如此', '要改', '全新', '要移除'];
  const act = {}; CATS2.forEach(c => act[c] = gapRows.filter(r => r.cat === c).length);
  const cl = {}; CATS2.forEach(c => { const m = gap.match(new RegExp('\\| ' + c + ' \\| (\\d+) \\|')); cl[c] = m ? +m[1] : -1; });
  console.log('   宣稱', JSON.stringify(cl), '實際', JSON.stringify(act));
  ok(CATS2.every(c => cl[c] === act[c]), '第五段統計與第一段實際列數不符');
  const seg3 = gap.split('## 第三段')[1].split('## 第四段')[0];
  const nine = (seg3.match(/^\| 9 [^|]*\|([^|]*)\|/m) || [])[1] || '';
  console.log('   工作清單第 9 項:', nine.trim());
  ok(nine.includes('已作廢'), '工作清單第 9 項應標為已作廢');
  const seg2 = gap.split('## 第二段')[1].split('## 第三段')[0];
  const schemaRows = [...seg2.matchAll(/^\| [^|]*\| `([^`]+)` \| ([^|]*)\| ([^|]*)\|$/gm)];
  const emojiRow = schemaRows.find(m => /emoji/.test(m[1]));
  console.log(`   schema 缺口 ${schemaRows.length} 列｜類別 emoji 標記:`, emojiRow ? emojiRow[1] : '（缺）');
  ok(schemaRows.length === 7, `schema 缺口應為 7 列（原 6 列＋類別 emoji 標記），實際 ${schemaRows.length}`);
  ok(emojiRow && emojiRow[3].trim().startsWith('不影響'), '類別 emoji 標記那一列應寫「不影響」');

  /* 8　不得橫向捲動 */
  console.log('\n=== 8　不得橫向捲動 ===');
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

  /* 11　編號與盤點表對得起來 */
  console.log('\n=== 11　編號對帳 ===');
  const proto = await page.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('.idx table tr td:first-child').forEach(td => {
      const t = td.textContent.trim(); if (/^S-\d/.test(t)) s.add(t);
    });
    return [...s];
  });
  const inv = [...fs.readFileSync('_盤點_畫面功能.md', 'utf8')
    .matchAll(/^\|\s*~*(S-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)~*(?:\s*\[[^\]]*\])?\s*\|/gm)].map(mm => mm[1]);
  const invSet = new Set(inv);
  const orphan = proto.filter(x => !invSet.has(x));
  const missing = inv.filter(x => !proto.includes(x) && !/^S-(0[89]|1[01])-/.test(x));
  console.log(`   原型 ${proto.length} 項｜盤點表 ${invSet.size} 項`);
  console.log('   孤兒：', orphan.length ? orphan.join(' ') : '（無）', '｜缺漏：', missing.length ? missing.join(' ') : '（無）');
  ok(orphan.length === 0 && missing.length === 0, '編號對不起來');

  await browser.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
