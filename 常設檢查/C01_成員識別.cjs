/* 常設 C1　成員識別全站一致（S-02c-10）
 *
 * Rozi：「如果沒有輸入 emoji 就會抓第一個字加底色」。
 * 定案：有 emoji 用 emoji；沒有就用名字第一個字＋填色圓底；**一律走 `Avatar.tsx`**；
 *       獨立識別位 28px、chip／列內 20px；句子裡的成員只寫名字、不放識別圖（2026-09-08 縮限）。
 *
 * 掃哪些畫面：lib/harness.cjs 的 SCAN 全部狀態，各跑兩組假資料
 *            （預設＝有 emoji、`members=noemoji`＝全部沒 emoji）
 * 掃哪些元素：① 每一顆 `.avatar`  ② 「長得像識別圖、但不是 `.avatar`」的元素（反向：另寫一套就會被抓）
 *            ③ 轉帳句子 `.netwho div`（裡面不得有識別圖）
 * 什麼時間點：畫面載入、條件式面板展開之後（展開清單照 SCAN）
 *
 * 判定：
 *   a. noemoji 時每顆 `.avatar` 都是 `.letter`、底色不是白／透明、字＝某位成員名字的第一個字
 *   b. 有 emoji 時每顆 `.avatar` 的字＝某位成員的 emoji
 *   c. 全站 🙂 出現 0 次
 *   d. 仿冒品 0 個：非 `.avatar`、寬高 16–32px 近正方、圓角、只有一個字、而且那個字是成員名字的第一個字
 *   e. 句子裡的識別圖 0 個
 *   （消費類別的 emoji 圓框 aria-label 帶「類別」，不是成員識別，排除）
 *   f. 數量下限：noemoji 組全站 `.avatar.letter` 合計 ≥ 40（掃不到東西＝這條沒驗）
 */
const H = require('./lib/harness.cjs');

module.exports = {
  id: 'C1', title: '成員識別全站一致',
  async run({ page, base, scan, inject }) {
    const rows = []; let letters = 0;
    for (const mode of ['', '&members=noemoji']) {
      for (const sc of scan || H.SCAN) {
        const where = sc.name + (mode ? '（沒 emoji）' : '（有 emoji）');
        await H.prepare(page, base, { ...sc, q: sc.q + mode });
        if (inject) await inject(page, sc);
        const m = await page.evaluate(noemoji => {
          const fx = window.__HARNESS_FIXTURE__ || {};
          const mem = fx.members || [];
          const seg = s => { try { return [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(s)][0]?.segment || ''; } catch { return s[0] || ''; } };
          const firsts = new Set(mem.map(x => seg((x.name || '').trim())));
          const emojis = new Set(mem.map(x => x.emoji).filter(Boolean));
          const bad = [];
          /* 消費類別的 emoji 也借用 `.avatar` 的圓框（aria-label 帶「類別」），那是類別不是成員，不算 */
          const av = [...document.querySelectorAll('.avatar')].filter(e => e.getBoundingClientRect().width > 0
            && !/類別/.test(e.getAttribute('aria-label') || '') && !e.closest('[aria-label*="類別"]'));
          let letterN = 0;
          for (const e of av) {
            const t = (e.textContent || '').trim();
            if (e.querySelector('input')) continue;            // 就地編輯中，不是顯示態
            const bg = getComputedStyle(e).backgroundColor;
            if (noemoji) {
              if (!e.classList.contains('letter')) { bad.push(`.avatar 不是填色字母「${t}」`); continue; }
              letterN++;
              if (bg === 'rgb(255, 255, 255)' || bg === 'rgba(0, 0, 0, 0)') bad.push(`「${t}」圓底是白色／透明`);
              if (!firsts.has(t)) bad.push(`「${t}」不是任何成員名字的第一個字`);
            } else if (!emojis.has(t) && !e.classList.contains('letter')) {
              /* 有 emoji 組也可能有「沒 emoji 的成員」（例：分享頁訪客），字母合法 */
              bad.push(`.avatar 內容「${t}」不是任何成員的 emoji`);
            }
          }
          const smile = (document.body.innerText.match(/🙂/g) || []).length;
          /* 仿冒品：看起來像識別圖但沒走 Avatar 元件 */
          const fakes = [];
          for (const e of document.querySelectorAll('body *')) {
            if (e.closest('.avatar')) continue;
            if (e.children.length) continue;
            const t = (e.textContent || '').trim();
            if (!t || [...t].length > 2 || !firsts.has(t)) continue;
            const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
            if (r.width < 16 || r.width > 32 || Math.abs(r.width - r.height) > 3) continue;
            if (parseFloat(cs.borderTopLeftRadius) < 4) continue;
            fakes.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}「${t}」`);
          }
          const inSentence = [...document.querySelectorAll('.netwho div')].filter(d => d.querySelector('.avatar')).length;
          return { n: av.length, letterN, bad, smile, fakes, inSentence };
        }, Boolean(mode));
        letters += m.letterN;
        rows.push({ where, element: `.avatar ×${m.n}`, measured: m.bad.length ? m.bad.slice(0, 3).join('；') : '全部正確',
                    limit: '0 處不符', ok: m.bad.length === 0 });
        if (m.smile) rows.push({ where, element: '🙂', measured: `${m.smile} 次`, limit: '0 次', ok: false });
        if (m.fakes.length) rows.push({ where, element: '沒走 Avatar 的識別圖', measured: m.fakes.slice(0, 3).join('；'), limit: '0 個', ok: false });
        if (m.inSentence) rows.push({ where, element: '轉帳句子裡的識別圖', measured: `${m.inSentence} 句`, limit: '0 句', ok: false });
      }
    }
    rows.push({ where: '全站（沒 emoji 組）', element: '.avatar.letter 合計（下限）', measured: `${letters} 顆`, limit: '≥ 40', ok: letters >= 40 });
    return { rows };
  },
};
