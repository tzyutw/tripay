/* 常設 C13　主要按鈕按下去之後，畫面或路由要變成文案承諾的那個地方
 *
 * Rozi：「『分享給大家』這個按鈕不能按」——其實是按了跳回行程頁。
 * C6 守「按不按得到」，C13 守「按了做什麼」。
 *
 * 掃哪些按鈕（第一批＋收線時列的；新增主要按鈕要加進 CASES）：
 *   S-01 記新的一趟／S-03 記一筆／S-03 有 N 筆還沒算清楚／
 *   S-05 結算行程（有未定案→提醒）→ 先去看一下／就這樣結算／S-05 帳算清楚了：分享給大家、建立新行程／S-02 出發！
 * 量什麼：`window.__ROUTE__`（MemoryRouter 的路徑）、畫面文字、`window.__WRITES__`（有沒有真的送出寫入）
 * 什麼時間點：按下後 700ms
 * ⚠️ 已知環境差異：雲端 headless＋MemoryRouter 上「分享給大家」可能直接落到 /trips/t1、沒經過 /share；
 *    Mac Chrome 與線上真實環境會開（2026-09-12 實測）。雲端量到紅要用真實 Chrome 對照一次再判。
 */
const H = require('./lib/harness.cjs');

const rowsOf = () => document.querySelectorAll('button.exprow, div.exprow').length;

const CASES = [
  { q: 'screen=s01', btn: '記新的一趟', want: '打開建立行程（出現「出發！」）', check: r => /出發！/.test(r.text) },
  { q: 'screen=s03', btn: '記一筆', want: '打開記一筆（出現「記下來」）', check: r => /記下來/.test(r.text) },
  { q: 'screen=s03', btn: '筆還沒算清楚', want: '只列出那 N 筆', n: true, check: (r, n) => r.rows === n },
  /* S-05 有還沒算清楚的筆時，「結算行程」先跳提醒（就這樣結算／先去看一下）——那是定案行為 */
  { q: 'screen=s05', btn: '結算行程', want: '有未定案時先跳提醒（出現「先去看一下」）', check: r => /先去看一下/.test(r.text) && r.writes === 0 },
  { q: 'screen=s05', pre: ['結算行程'], btn: '先去看一下', want: '回到消費列表、只列出還沒算清楚的那幾筆', nFrom: '筆還沒算清楚',
    check: (r, n) => r.route === '/trips/t1' && r.rows === n },
  { q: 'screen=s05', pre: ['結算行程'], btn: '就這樣結算', want: '送出結算（依序呼叫 calculate-settlement → confirm-settlement）',
    /* 樁的 functions.invoke 固定回空資料，畫面不會真的變成已結算，所以這裡只能驗「真的送出了」；
       結算後的畫面由 S-05 已結算態（state=settled）那幾組另外掃 */
    check: r => r.invokes.join('>') === 'calculate-settlement>confirm-settlement' },
  { q: 'screen=s05&state=done', btn: '分享給大家', want: '打開分享（路由 /share、出現「複製文字摘要」）', check: r => /\/share$/.test(r.route) || /複製文字摘要/.test(r.text) },
  { q: 'screen=s05&state=done', btn: '建立新行程', want: '回到行程列表（路由 /）', check: r => r.route === '/' },
  { q: 'screen=s02', btn: '出發！', want: '送出建立行程（寫入 trips）', fillName: true, check: r => r.wlist.some(w => /trips/.test(w)) },
];

module.exports = {
  id: 'C13', title: '主要按鈕按了去對的地方',
  async run({ page, base }) {
    const rows = [];
    for (const c of CASES) {
      await H.open(page, base, c.q, { wait: 400 });
      if (c.fillName) {
        /* 必填：行程名、出發日、至少一位成員 */
        const setv = (sel, v) => page.evaluate((sel, v) => {
          const i = document.querySelector(sel);
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v);
          i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
        }, sel, v);
        await setv('input[type=text]', 'ZZ 常設C13');
        await setv('input[type=date]', '2026-11-05');
        await H.clickByText(page, ['新增成員']);
        await setv('input[placeholder*="名字"]', 'ZZ');
        await H.clickByText(page, ['加進來']);
      }
      let n = null;
      /* 記錄 Edge Function 呼叫（在測試這一側包住樁，不動 src） */
      await page.evaluate(() => {
        window.__INVOKES__ = [];
        const f = window.__SUPABASE_STUB__ && window.__SUPABASE_STUB__.functions;
        if (f && !f.__wrapped) { const o = f.invoke; f.invoke = (name, ...a) => { window.__INVOKES__.push(name);
          /* 樁的 calculate 回 data:null，前端讀 settlement_id 會直接拋錯——補一個假 id，才走得到 confirm */
          return name === 'calculate-settlement' ? Promise.resolve({ data: { settlement_id: 'zz-c13' }, error: null }) : o(name, ...a); }; f.__wrapped = true; }
      });
      if (c.pre) await H.clickByText(page, c.pre, 400);
      if (c.nFrom) n = await page.evaluate(t => { const m = document.body.innerText.match(new RegExp('(\\d+)\\s*' + t)); return m ? Number(m[1]) : null; }, c.nFrom);
      const label = await page.evaluate(t => { const b = [...document.querySelectorAll('button,a')].find(x => x.textContent.includes(t)); return b ? b.textContent.trim() : null; }, c.btn);
      if (c.n) n = label ? Number((label.match(/(\d+)\s*筆/) || [])[1]) : null;
      const before = await page.evaluate(() => (window.__WRITES__ || []).length);
      const hit = label ? (await H.clickByText(page, [c.btn], 700)).length : 0;
      const r = await page.evaluate(rowsOf => ({ route: window.__ROUTE__, text: document.body.innerText,
        wlist: (window.__WRITES__ || []), invokes: window.__INVOKES__ || [], rows: eval(`(${rowsOf})`)() }), rowsOf.toString());
      r.writes = r.wlist.length - before;
      const ok = !!hit && c.check(r, n);
      rows.push({ where: c.q.replace('screen=', '').toUpperCase(), element: `「${label || c.btn}」`,
        measured: !hit ? '找不到這顆按鈕' : `路由 ${r.route}｜列 ${r.rows}${n != null ? `（標示 ${n} 筆）` : ''}｜新寫入 ${r.writes}${r.invokes.length ? '｜呼叫 ' + r.invokes.join('→') : ''}`,
        limit: c.want, ok });
    }
    return { rows };
  },
};
