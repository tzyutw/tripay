/* 常設 C9　有兩段以上的切換，要「切過去 → 量 → 切回來 → 再量」
 *
 * 由來：「各付各的」切填寫幣別不換算，出現 `差 $52,882`，兩天沒人發現——
 *       既有斷言只驗預設那一段，從來沒有人切過去再切回來。
 *
 * 掃哪些切換（新增 Seg／分頁／模式鈕時加進 CASES）：
 *   S-03 幣別（台幣 ⇄ 外幣）、S-03「只看共同的帳」開關、S-03 分頁（消費 ⇄ 結算）
 *   S-04 分帳方式（一起分 ⇄ 各付各的 ⇄ 只算一個人）
 *   S-04 各付各的的填寫幣別（台幣填 ⇄ 外幣填），**先填好兩個人的金額再切**
 *   S-02 結算方式（誰欠誰就轉給誰 ⇄ 都轉給同一個人）
 * 量什麼：畫面全部文字＋所有輸入框的值＋按鈕的選取狀態（class／aria）（快照）
 *   ＊ S-03 幣別用 `rate=full`（有匯率才換算得了；沒匯率時外幣那段本來就沒東西可看）
 * 什麼時間點：切到 A 後、切到 B 後、切回 A 後，各等 300ms
 * 判定：a. 切到 B 畫面有變（切換真的有作用）
 *       b. 切回 A 與原本的 A 完全相同（含輸入框裡的數字）
 *       c. 三個快照都沒有 NaN／undefined／Infinity
 */
const H = require('./lib/harness.cjs');

const CASES = [
  { name: 'S-03 幣別 台幣⇄外幣', q: 'screen=s03&rate=full', a: '$ 台幣', b: '₩ KRW' },
  { name: 'S-03 只看共同的帳 開⇄關', q: 'screen=s03', a: null, b: '只看共同的帳', toggle: true },
  { name: 'S-03 分頁 消費⇄結算', q: 'screen=s03', a: '消費', b: '結算' },
  { name: 'S-03 統計卡幣別（展開後）', q: 'screen=s03&rate=full', expand: ['總花費'], a: '$ 台幣', b: '₩ KRW' },
  { name: 'S-04 分帳方式 一起分⇄各付各的', q: 'screen=s04', a: '一起分', b: '各付各的' },
  { name: 'S-04 分帳方式 一起分⇄只算一個人', q: 'screen=s04', a: '一起分', b: '只算一個人' },
  { name: 'S-04 各付各的 台幣填⇄外幣填（已填金額）', q: 'screen=s04', expand: ['各付各的'],
    fill: { total: '1000', each: ['300', '200'] }, a: '$ 台幣填', b: '₩ KRW 填' },
  { name: 'S-02 結算方式 直接轉⇄中心人', q: 'screen=s02', a: '誰欠誰就轉給誰', b: '都轉給同一個人' },
  { name: 'S-02b 結算方式 直接轉⇄中心人', q: 'screen=s02b', a: '誰欠誰就轉給誰', b: '都轉給同一個人' },
];

const SNAP = () => {
  const vals = [...document.querySelectorAll('input,textarea,select')].map(e => e.type === 'checkbox' ? e.checked : e.value).join('|');
  /* 選取狀態不一定反映在文字上（Seg 只換底色），所以按鈕的 class／aria 狀態也算進快照 */
  const sel = [...document.querySelectorAll('button,[role=tab],[role=switch]')].map(e =>
    [e.className, e.getAttribute('aria-pressed'), e.getAttribute('aria-selected'), e.getAttribute('aria-checked')].join('/')).join('|');
  return document.body.innerText.replace(/\s+/g, ' ') + ' ⟦' + vals + '⟧ ⟦' + sel + '⟧';
};

module.exports = {
  id: 'C9', title: '切換要切過去再切回來',
  async run({ page, base }) {
    const rows = [];
    for (const c of CASES) {
      await H.open(page, base, c.q);
      if (c.expand) await H.clickByText(page, c.expand);
      if (c.fill) {
        /* 台幣總額＋各自金額前兩格（各自金額格在「各自多少？」那一區） */
        await page.evaluate(f => {
          const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
          const ins = [...document.querySelectorAll('input[type=text],input:not([type])')];
          const twd = ins.find(i => !i.classList.contains('forcur') && /^0?$/.test(i.value) && i.closest('.fieldrow') && /台幣/.test(i.closest('.fieldrow').textContent));
          if (twd) set(twd, f.total);
          const zone = [...document.querySelectorAll('.fld')].find(x => x.textContent.includes('各自多少'));
          const each = zone ? [...zone.querySelectorAll('input')] : [];
          f.each.forEach((v, i) => each[i] && set(each[i], v));
        }, c.fill);
        await H.sleep(300);
      }
      const hitA0 = c.a ? (await H.clickByText(page, [c.a], 300)).length : 1;
      const A = await page.evaluate(SNAP);
      const hitB = (await H.clickByText(page, [c.b], 300)).length;
      const B = await page.evaluate(SNAP);
      const hitA = (await H.clickByText(page, [c.toggle ? c.b : c.a], 300)).length;
      const A2 = await page.evaluate(SNAP);
      const bad = [A, B, A2].map(s => (s.match(/NaN|undefined|Infinity/) || [])[0]).filter(Boolean);
      const found = hitA0 && hitB && hitA;
      let diffAt = '';
      if (A !== A2) { let i = 0; while (A[i] === A2[i]) i++; if (A.indexOf(' ⟦') < i) { diffAt = '文字相同、但輸入框的值或按鈕選取狀態不同：' + A.slice(i, i + 40) + ' → ' + A2.slice(i, i + 40); } else diffAt = `原本「…${A.slice(Math.max(0, i - 12), i + 20)}…」切回來變「…${A2.slice(Math.max(0, i - 12), i + 20)}…」`; }
      rows.push({ where: c.name, element: `切換鈕「${c.a || '（開關）'}」⇄「${c.b}」`,
        measured: !found ? `找不到切換鈕（A ${hitA0}／B ${hitB}／回 ${hitA}），這條等於沒驗`
          : [A === B ? '切到 B 畫面沒變' : '切到 B 有變', A === A2 ? '切回來一模一樣' : `切回來不一樣：${diffAt}`,
             bad.length ? `出現 ${bad.join('、')}` : ''].filter(Boolean).join('｜'),
        limit: 'B≠A、回來＝A、無 NaN', ok: found && A !== B && A === A2 && !bad.length });
    }
    return { rows };
  },
};
