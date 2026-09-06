/* 實作-K　原型的「真實形狀」示範資料（T4／T5）。
 *
 * 為什麼要有這一支：原型三趟假行程清一色有 emoji、八筆消費、金額都填好，
 * 而 Rozi 每天打開的三趟是**成員全部沒 emoji、0 筆消費、匯率只填一邊**。
 * 她連續三批回報的問題，原型上從來沒被顯示過。
 */
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve('Tripay_原型.html');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };

const SCREENS = ['s00','s01','s02','s02b','s03','s03d','s04','s05','s06','s07'];

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto('file://' + FILE, { waitUntil: 'load' });

  console.log('\n=== 實作-K　原型的真實形狀示範資料 ===\n');

  /* 停止條件 1：切到 real，兩趟的形狀要對 */
  const shape = await p.evaluate(() => {
    document.documentElement.classList.remove('anno');
    const btn = document.querySelector('#s01dataset button[data-d="real"]');
    if (!btn) return { err: '找不到「真實形狀」切換鈕' };
    btn.click();
    const t4 = store.realTrips.find(x => x.id === 't4');
    const t5 = store.realTrips.find(x => x.id === 't5');
    const d = t => t && ({
      members: t.members.length,
      allNoEmoji: t.members.every(m => !m.emoji),
      names: t.members.map(m => m.name),
      expenses: (store.expenses[t.id] || []).length,
      rateTwd: t.rateTwd ?? null, rateFor: t.rateFor ?? null,
      pays: t.pays, status: t.status,
    });
    return { dataset: store.dataset, t4: d(t4), t5: d(t5),
             listed: [...currentTrips()].map(x => x.name) };
  });

  if (shape.err) { console.log('   [X] ' + shape.err); process.exit(1); }
  console.log(`   切換後 dataset=${shape.dataset}｜列表：${shape.listed.join('、')}`);
  console.log(`   T4 ${shape.t4.members} 人 ${shape.t4.names.join('/')}｜無 emoji ${shape.t4.allNoEmoji}｜` +
              `${shape.t4.expenses} 筆｜匯率 twd="${shape.t4.rateTwd}" for="${shape.t4.rateFor}"｜` +
              `付款 ${shape.t4.pays.join('/')}｜${shape.t4.status}`);
  console.log(`   T5 ${shape.t5.members} 人 ${shape.t5.names.join('/')}｜無 emoji ${shape.t5.allNoEmoji}｜` +
              `${shape.t5.expenses} 筆｜匯率 twd="${shape.t5.rateTwd}" for="${shape.t5.rateFor}"｜` +
              `付款 ${shape.t5.pays.join('/')}｜${shape.t5.status}`);

  ok(shape.dataset === 'real', '切換鈕沒有把 dataset 切成 real');
  ok(shape.t4 && shape.t4.members === 4, 'T4 應為 4 位成員');
  ok(shape.t4.allNoEmoji, 'T4 的成員應全部沒有 emoji');
  ok(shape.t4.expenses === 0, `T4 應為 0 筆消費，實際 ${shape.t4.expenses}`);
  ok(shape.t4.rateFor === '0.19' && !shape.t4.rateTwd, 'T4 的匯率應只填外幣那一邊');
  ok(shape.t4.pays.length === 3, 'T4 應有三種支付方式（含自訂的 Linepay）');
  ok(shape.t5 && shape.t5.members === 2, 'T5 應為 2 位成員');
  ok(shape.t5.allNoEmoji, 'T5 的成員應全部沒有 emoji');
  ok(shape.t5.expenses === 0, `T5 應為 0 筆消費，實際 ${shape.t5.expenses}`);
  ok(!shape.t5.rateTwd && !shape.t5.rateFor, 'T5 的兩邊匯率都應該是空的');

  /* 停止條件 2：十個畫面不得橫向溢出，也不得出現 undefined／null／NaN */
  console.log('');
  for (const id of SCREENS) {
    const m = await p.evaluate(sid => {
      const el = document.getElementById('scr-' + sid);
      if (!el) return null;
      const bad = [];
      let scrollables = 0;
      for (const e of el.querySelectorAll('*')) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || e.clientWidth === 0) continue;
        if (cs.overflowX === 'visible') continue;
        scrollables++;
        if (e.scrollWidth > e.clientWidth + 1)
          bad.push(`${e.tagName}.${(typeof e.className === 'string' ? e.className : '').slice(0, 18)} ${e.scrollWidth}>${e.clientWidth}`);
      }
      const txt = el.textContent || '';
      return {
        len: txt.trim().length, scrollables,
        over: el.scrollWidth > el.clientWidth + 1 ? `${el.scrollWidth}>${el.clientWidth}` : null,
        inner: bad.slice(0, 2), innerN: bad.length,
        junk: ['undefined', 'null', 'NaN'].filter(k => txt.includes(k)),
      };
    }, id);
    if (!m) { ok(false, `找不到畫面 ${id}`); continue; }
    console.log(`   ${id.padEnd(5)} 文字 ${String(m.len).padStart(4)} 字｜捲動容器 ${m.scrollables}` +
                (m.junk.length ? `｜⚠️ ${m.junk.join('/')}` : ''));
    ok(m.len > 5, `${id} 幾乎沒有內容（${m.len} 字）——後面每一條都會假通過`);
    ok(!m.over, `${id} 整頁橫向溢出：${m.over}`);
    ok(m.innerN === 0, `${id} 有 ${m.innerN} 個容器橫向溢出：${m.inner.join('；')}`);
    ok(m.junk.length === 0, `${id} 畫面上出現 ${m.junk.join('／')}`);
  }

  await b.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
