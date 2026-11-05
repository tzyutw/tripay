/* Phase 2 B 里程碑（貼上帳單明細，S-12）原型測試　2026-11-05
 *
 * 守的是：拆得對、看不懂的行擋得住、總額對不上擋得住、只先給看 5 筆、重複的不重記、
 * 匯入後自動落月份、**整個過程沒有任何網路請求**（不付費、帳單不離開手機），
 * 以及三種寬度不橫向捲動＋可點區（常設 C6）。
 * 期望值一律讀 src/test/harness/phase2-fixtures.json 的 importSample.expect，不在這裡另寫一份。
 *
 * 用法：PUPPETEER_PATH=/tmp/x/node_modules/puppeteer-core CHROME_PATH=<chrome> node 原型_Phase2匯入測試.cjs [檔案]
 */
const path = require('path');
const fs = require('fs');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) {
  if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
  else { console.error('需要 puppeteer-core：npm i puppeteer-core --prefix /tmp/x 後用 PUPPETEER_PATH 指過來'); process.exit(2); }
}
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || path.join(__dirname, 'Tripay_原型.html'));
const FIXTURE = path.join(__dirname, 'src/test/harness/phase2-fixtures.json');
if (!fs.existsSync(FIXTURE)) { console.error('缺少 ' + FIXTURE); process.exit(2); }
const IS = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).importSample, EX = IS.expect;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('   ❌ ' + m); } };
const sec = t => console.log('\n── ' + t + ' ──');

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  /* 網路請求一律記下來：S-12 的拆解與匯入不得發出任何請求 */
  const net = []; await page.setRequestInterception(true);
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) net.push(r.url()); r.continue(); });
  await page.setViewport({ width: 390, height: 844 });
  const boot = async () => {
    await page.goto('file://' + FILE, { waitUntil: 'load' });
    await page.evaluate(t => { today = () => t; setDev(true); loadP2Seed(); renderBatch2();
      const s = document.createElement('style'); s.textContent = '#devbar{display:none!important}html.dev body{padding-bottom:0!important}'; document.head.appendChild(s); }, IS.today);
  };
  await boot();
  const text = sel => page.$eval(sel, el => el.innerText);
  const parsed = () => page.evaluate(() => { const P = store.s12.parsed; return P && { rows: P.rows, bad: P.bad, ignored: P.ignored, sum: P.sum }; });
  const goDisabled = () => page.$eval('#s12go', b => b.disabled);

  sec('1　入口：帳單列表與首頁帳單分段的「貼上明細」都點得到');
  await page.evaluate(() => { devScreen = 's10'; renderDevBar(); });
  await page.click('#scr-s10 [data-billimport]');
  ok(await page.evaluate(() => devScreen) === 's12', 'S-10「貼上明細」應開 S-12');
  ok((await text('#scr-s12 .bar')).includes('貼上帳單明細'), 'S-12 標題應為「貼上帳單明細」');
  await page.evaluate(() => { store.s01Tab = 'bill'; renderS01(); devScreen = 's01'; renderDevBar(); });
  await page.click('#scr-s01 [data-billimport]');
  ok(await page.evaluate(() => devScreen) === 's12', 'S-01 帳單分段「貼上明細」應開 S-12');

  sec('2　真的貼上、真的按「拆開看看」：拆對了、看不懂的那一行擋下來');
  await page.click('#imp-total'); await page.keyboard.type(IS.billTotal);
  await page.click('#imp-text');
  await page.evaluate(t => { const el = document.getElementById('imp-text'); el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); }, IS.text);
  await page.click('#s12parse');
  let P = await parsed();
  console.log(`   拆出 ${P.rows.length} 筆、合計 ${P.sum}、看不懂 ${P.bad.map(x => '第' + x.line + '行').join('、')}、略過 ${P.ignored} 行`);
  ok(P.rows.length === EX.rowsBeforeFix, `應拆出 ${EX.rowsBeforeFix} 筆，實際 ${P.rows.length}`);
  ok(P.sum === EX.sumBeforeFix, `合計應為 ${EX.sumBeforeFix}，實際 ${P.sum}`);
  ok(P.bad.length === 1 && P.bad[0].line === IS.badLine, `第 ${IS.badLine} 行應被標成看不懂`);
  ok(P.ignored === 2, `表頭與總額那兩行（沒有日期）應略過，實際略過 ${P.ignored}`);
  const byT = Object.fromEntries(P.rows.map(r => [r.title, r]));
  ok(byT['全聯福利中心'] && byT['全聯福利中心'].date === '2026-09-02', '兩個日期時取第一個（消費日 9/2）');
  ok(byT['UNIQLO 台北店'] && byT['UNIQLO 台北店'].date === '2026-09-08', '帶年份的日期 2026/09/08');
  ok(byT['麥當勞'] && byT['麥當勞'].amount === 189, 'NT$189 → 189');
  ok(byT['好市多退貨'] && byT['好市多退貨'].amount === -350, '負數是退款 -350');
  Object.entries(EX.cards).forEach(([t, c]) => { if (byT[t]) ok(byT[t].cardId === c, `${t} 應歸 ${c}，實際 ${byT[t].cardId}`); });
  ok(byT['全聯福利中心'] && byT['全聯福利中心'].dupOf === 'e-px', '全聯那一行與之前記過的同卡同日同金額，要標成已經記過');
  const s12 = await text('#scr-s12');
  ok(s12.includes(`第 ${IS.badLine} 行看不懂`), '畫面要寫出第幾行看不懂');
  ok(await goDisabled(), '有看不懂的行時「匯入」不可按');
  ok(/差 \$ 160/.test(s12), '加總對不上要寫出差多少（差 $ 160）');

  sec('3　明細一改，舊的拆解結果作廢（不能拿過時的結果匯入）');
  await page.click('#imp-text'); await page.keyboard.type(' ');
  ok(!(await page.$('#s12go')), '改了明細之後，匯入鈕要消失，直到再按一次「拆開看看」');

  sec('4　修好第 7 行 → 加總對得上 → 只先給看 5 筆 → 可以匯入');
  await page.evaluate(([n, fixed]) => { const el = document.getElementById('imp-text'); const L = el.value.trimEnd().split('\n');
    L[n - 1] = fixed; el.value = L.join('\n'); el.dispatchEvent(new Event('input', { bubbles: true })); }, [IS.badLine, IS.fixedLine]);
  await page.click('#s12parse');
  P = await parsed();
  ok(P.rows.length === EX.rowsAfterFix && P.sum === EX.sumAfterFix && !P.bad.length, `修好後應 ${EX.rowsAfterFix} 筆 ${EX.sumAfterFix}，實際 ${P.rows.length} 筆 ${P.sum}`);
  const shown = await page.$$eval('#s12res .exprow:not(.badline)', x => x.length);
  ok(shown === 5, `匯入前只先列 5 筆，實際 ${shown}`);
  ok((await text('#scr-s12')).includes(`共 ${EX.rowsAfterFix} 筆`), '標題要寫出共幾筆');
  ok(!(await goDisabled()), '加總對得上、沒有看不懂的行時「匯入」可按');
  ok((await text('#s12go')).includes(`匯入 ${EX.imported} 筆`), `鈕上要寫匯入 ${EX.imported} 筆（不含已經記過的）`);

  sec('5　總額填錯 → 擋下來');
  await page.click('#imp-total', { clickCount: 3 }); await page.keyboard.type('5,000');
  ok(await goDisabled(), '總額對不上時「匯入」不可按');
  ok(/差 \$ 239/.test(await text('#scr-s12')), '要寫出差 $ 239');
  await page.click('#imp-total', { clickCount: 3 }); await page.keyboard.type(IS.billTotal);
  ok(!(await goDisabled()), '改回正確總額後又可以按');

  sec('6　匯入：不發任何網路請求、落到對的月份、重複的不重記');
  const before = net.length;
  await page.click('#s12go');
  const R = await page.evaluate(ym => { const st = `st~c-main~${ym}`, { net } = settleTrip(st), S = tripSummary(st);
    const px = expsOf(st).filter(e => e.cardId === 'c-mei' && e.date === '2026-09-02' && +e.twdAmt === 1280).length;
    const oil = expsOf(st).find(e => e.title === '台灣中油');
    return { res: store.s12.result, mei: -net[st + '~p-mei'], ming: -net[st + '~p-ming'], total: S.total, px,
      oil: oil && { parts: oil.parts, payer: oil.payer, type: oil.type } }; }, EX.afterImport.ym);
  console.log('   ' + JSON.stringify(R));
  ok(net.slice(before).every(u => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)), `匯入時發出了網路請求：${net.slice(before).join(', ')}`);
  ok(R.res && R.res.n === EX.imported && R.res.sum === EX.importedSum && R.res.dup === EX.duplicates, '匯入筆數／合計／略過重複的數字不對');
  ok(R.mei === EX.afterImport.owe['p-mei'] && R.ming === EX.afterImport.owe['p-ming'], `匯入後小美應還 ${EX.afterImport.owe['p-mei']}、小明 ${EX.afterImport.owe['p-ming']}`);
  ok(R.total === EX.afterImport.total, `匯入後 9 月總花費應為 ${EX.afterImport.total}，實際 ${R.total}`);
  ok(R.px === 1, `全聯那筆不能重複記，實際 ${R.px} 筆`);
  ok(R.oil && R.oil.type === 'single' && R.oil.parts.length === 1 && R.oil.parts[0].endsWith('~p-ming') && R.oil.payer.endsWith('~p-rozi'),
     '副卡的消費預設只算持卡人、誰付的是主卡人（D2）');
  const done = await text('#scr-s12');
  ok(done.includes(`新記了 ${EX.imported} 筆`) && done.includes('沒有重複記'), '匯入好了要說新記幾筆、略過幾筆');
  await page.click('#scr-s12 [data-openst="st~c-main~2026-09"]');
  ok(await page.evaluate(() => devScreen) === 's03' && (await text('#scr-s03')).includes('台灣中油'), '「看 9 月帳單」要進得去、看得到剛匯入的');

  sec('7　同一份再貼一次：全部都是已經記過 → 匯入 0 筆、不可按');
  await page.evaluate(([t, tot]) => { store.s12 = { cardId: 'c-main', total: tot, text: t, parsed: null, result: null };
    store.s12.parsed = parseBill(t, 'c-main', today()); renderS12(); },
    [IS.text.split('\n').map((l, i) => i === IS.badLine - 1 ? IS.fixedLine : l).join('\n'), IS.billTotal]);
  ok(await goDisabled() && (await text('#s12go')).includes('匯入 0 筆'), '重貼同一份不應再匯入');

  sec('8　跨月份與年份：9/20 落到 10 月帳單（自動建）；沒寫年份的 12/30 是去年');
  await boot();
  const X = await page.evaluate(() => {
    const P1 = parseBill('09/20 全家 5521 85', 'c-main', today());
    store.s12 = { cardId: 'c-main', total: '85', text: '', parsed: P1, result: null }; runImport();
    const P2 = parseBill('12/30 年菜 100', 'c-main', today());
    return { oct: !!statementOf('c-main', '2026-10') && expsOf('st~c-main~2026-10').some(e => e.title === '全家'), y: P2.rows[0] && P2.rows[0].date };
  });
  ok(X.oct, '9/20（結帳日 15 之後）應自動建 10 月帳單並落在那裡');
  ok(X.y === '2025-12-30', `今天 11/5 時「12/30」應是 2025-12-30，實際 ${X.y}`);

  sec('9　375／390／430：不橫向捲動、可點區（C6）');
  const STATES = [
    ['空白', () => { store.s12 = { cardId: 'c-main', total: '', text: '', parsed: null, result: null }; renderS12(); }],
    ['有一行看不懂', () => { document.querySelector('#s12rig [data-imp=sample]').click(); }],
    ['可以匯入', () => { document.querySelector('#s12rig [data-imp=fix]').click(); }],
    ['匯入好了', () => { document.querySelector('#s12go').click(); devScreen = 's12'; renderDevBar(); }],
    ['帳單列表兩顆鈕', () => { devScreen = 's10'; renderDevBar(); }],
  ];
  for (const w of [375, 390, 430]) {
    await page.setViewport({ width: w, height: 844 }); await boot();
    for (const [label, fn] of STATES) {
      await page.evaluate(`(${fn.toString()})(); if (devScreen !== 's10') { devScreen = 's12'; renderDevBar(); } window.scrollTo(0,0);`);
      const scr = label === '帳單列表兩顆鈕' ? 's10' : 's12';
      const r = await page.evaluate(scr => {
        const de = document.documentElement, ui = document.querySelector('#scr-' + scr), over = [], bad = [];
        if (de.scrollWidth > de.clientWidth) over.push('整頁 ' + (de.scrollWidth - de.clientWidth));
        [ui, ...ui.querySelectorAll('.gap,.chips,.fld,.btnrow')].forEach(el => { if (el.scrollWidth > el.clientWidth + 1) over.push((el.className || el.id) + ' ' + (el.scrollWidth - el.clientWidth)); });
        const els = [...ui.querySelectorAll('button,a,input,select,textarea')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && getComputedStyle(el).display !== 'none'; });
        for (const el of els) {
          let w = el.getBoundingClientRect().width, h = el.getBoundingClientRect().height;
          for (const ps of ['::after', '::before']) { const cs = getComputedStyle(el, ps);
            if (cs.content && cs.content !== 'none' && cs.position === 'absolute') { w = Math.max(w, parseFloat(cs.width) || 0); h = Math.max(h, parseFloat(cs.height) || 0); } }
          const lab = el.closest('label'); if (lab) { const lr = lab.getBoundingClientRect(); w = Math.max(w, lr.width); h = Math.max(h, lr.height); }
          el.scrollIntoView({ block: 'center' }); const rc = el.getBoundingClientRect();
          const hit = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
          const nm = (el.getAttribute('aria-label') || el.innerText || el.id).trim().replace(/\s+/g, ' ').slice(0, 12);
          if (!(h >= 44 || (h >= 34 && w * h >= 1600))) bad.push(`${nm} ${Math.round(w)}×${Math.round(h)}`);
          if (!(hit && (hit === el || el.contains(hit) || (lab && lab.contains(hit))))) bad.push(`${nm} 被蓋住`);
        }
        window.scrollTo(0, 0);
        return { over, bad, n: els.length };
      }, scr);
      if (w === 390) console.log(`   ${label}：互動元素 ${r.n} 個${r.over.length ? '、溢出 ' + r.over.join('；') : ''}${r.bad.length ? '、不合格 ' + r.bad.join('；') : ''}`);
      ok(r.n >= 2, `${w}px ${label}：互動元素太少（${r.n}），可能沒渲染`);
      ok(!r.over.length, `${w}px ${label}：橫向溢出 ${r.over.join('；')}`);
      ok(!r.bad.length, `${w}px ${label}：可點區不合格 ${r.bad.join('；')}`);
    }
  }
  const fonts = await page.evaluate(() => { store.s12 = { cardId: 'c-main', total: '', text: '', parsed: null, result: null }; renderS12(); return [...document.querySelectorAll('#scr-s12 input, #scr-s12 textarea')].map(i => parseFloat(getComputedStyle(i).fontSize)); });
  ok(fonts.length === 2 && fonts.every(f => f >= 16), `輸入框字級要 ≥16（iOS 才不會放大整頁），實際 ${fonts.join('、')}`);

  sec('10　整份測試期間（拆解＋匯入）沒有任何對外網路請求');
  /* 原型頁面本身從 Google Fonts 載入字體（與帳單無關，原型一直如此），只排除這兩個字體網域 */
  const FONT = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
  const other = [...new Set(net.filter(u => !FONT.test(u)))];
  console.log(`   字體以外的對外請求 ${other.length} 個${other.length ? '：' + other.join(', ') : ''}`);
  ok(other.length === 0, `原型發出了對外請求：${other.join(', ')}`);

  ok(errs.length === 0, '頁面錯誤：' + errs.join(' | '));
  await browser.close();
  console.log(`\n════════════════════════════\n通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
