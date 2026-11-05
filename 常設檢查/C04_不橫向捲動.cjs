/* 常設 C4　手機上不能橫向捲動
 *
 * 寬度：375／390／430（`C4_WIDTHS=320,375,...` 可覆寫）
 * 掃哪些畫面：SCAN 全部狀態
 * 掃哪些元素（量「真正會捲動的那個容器」，不是只量最外層）：
 *   ① `document.documentElement` 與 `body`
 *   ② 每一個會直向捲動的容器（overflow-y 是 auto／scroll——sheet、表單本體都是這種）
 *      → 它們橫向也不得溢出
 *   ③ 刻意做成橫向捲動的容器（overflow-x auto 但 overflow-y 不捲）**允許**，只列出來不判紅
 * 什麼時間點：
 *   a. 靜態：載入＋展開＋條件式步驟之後
 *   b. 動畫中：`?anim=1`（包進正式的 `.animate-slide-in`），從頁面一開始逐幀取樣到 600ms，
 *      條件式步驟（開 sheet、展開）之後再逐幀取樣 600ms——
 *      由來：`translateX(100%)` 讓文件在進場那 200ms 變 780px，只在動畫結束後量會漏掉。
 * 判定：所有量到的 scrollWidth − clientWidth ≤ 1px（取整誤差）
 */
const H = require('./lib/harness.cjs');

/* 逐幀取樣器：在頁面最早的時間點就開始量，存進 window.__C4__ */
const SAMPLER = () => {
  const rec = { max: 0, at: -1, who: '', frames: 0 };
  window.__C4__ = rec;
  const measure = t0 => {
    const de = document.documentElement;
    const cand = [de, document.body, ...document.querySelectorAll('body *')];
    for (const e of cand) {
      if (!e) continue;
      let over;
      if (e === de || e === document.body) over = e.scrollWidth - de.clientWidth;
      else {
        const cs = getComputedStyle(e);
        if (!/(auto|scroll)/.test(cs.overflowY) || e.clientWidth === 0) continue;
        over = e.scrollWidth - e.clientWidth;
      }
      if (over > rec.max) { rec.max = over; rec.at = Math.round(performance.now() - t0);
        rec.who = e === de ? 'html' : e === document.body ? 'body' : `${e.tagName.toLowerCase()}.${String(e.className).split(/\s+/).slice(0, 3).join('.')}`; }
    }
    rec.frames++;
  };
  window.__C4start = () => {
    const t0 = performance.now();
    const loop = () => { if (!document.body) return requestAnimationFrame(loop); measure(t0); if (performance.now() - t0 < 600) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  };
  window.__C4start();
};

async function staticMeasure(page) {
  return page.evaluate(() => {
    const de = document.documentElement, bad = [], allowed = [];
    let n = 2;
    const push = (who, sw, cw) => bad.push(`${who} ${sw}>${cw}（多 ${sw - cw}px）`);
    if (de.scrollWidth > de.clientWidth + 1) push('html', de.scrollWidth, de.clientWidth);
    if (document.body.scrollWidth > de.clientWidth + 1) push('body', document.body.scrollWidth, de.clientWidth);
    for (const e of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || e.clientWidth === 0) continue;
      const ys = /(auto|scroll)/.test(cs.overflowY), xs = /(auto|scroll)/.test(cs.overflowX);
      if (!ys && !xs) continue;
      const who = `${e.tagName.toLowerCase()}.${String(e.className).split(/\s+/).slice(0, 3).join('.')}`;
      if (!ys && xs) { if (e.scrollWidth > e.clientWidth + 1) allowed.push(who); continue; }
      n++;
      if (e.scrollWidth > e.clientWidth + 1) push(who, e.scrollWidth, e.clientWidth);
    }
    return { n, bad, allowed };
  });
}

module.exports = {
  id: 'C4', title: '不橫向捲動（含動畫中）',
  async run({ browser, base, scan, inject }) {
    const widths = (process.env.C4_WIDTHS || '375,390,430').split(',').map(Number);
    const rows = [];
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(SAMPLER);
    for (const sc of scan || H.SCAN) {
      for (const w of widths) {
        /* a. 靜態 */
        await H.prepare(page, base, sc, { width: w });
        if (inject) await inject(page, sc);
        const s = await staticMeasure(page);
        /* b. 動畫中 */
        await H.open(page, base, sc.q + '&anim=1', { width: w, wait: 650 });
        const load = await page.evaluate(() => ({ ...window.__C4__ }));
        let post = { max: 0, frames: 0 };
        if ((sc.expand || []).length || (sc.steps || []).length) {
          await page.evaluate(() => { window.__C4start(); });
          if (sc.expand) await H.clickByText(page, sc.expand, 50);
          for (const st of sc.steps || []) { if (st.sel) await H.clickSel(page, st.sel, 50); if (st.text) await H.clickByText(page, [st.text], 50); }
          await H.sleep(650);
          post = await page.evaluate(() => ({ ...window.__C4__ }));
        }
        const anim = load.max >= post.max ? load : post;
        const ok = s.bad.length === 0 && anim.max <= 1 && s.n >= 2 && load.frames > 3;
        rows.push({ where: `${sc.name} @${w}`, element: `捲動容器 ×${s.n}（動畫取樣 ${load.frames + post.frames} 幀）`,
          measured: [s.bad.length ? '靜態：' + s.bad.slice(0, 3).join('；') : '靜態 0px',
                     anim.max > 1 ? `動畫中最多多 ${anim.max}px（${anim.who}，第 ${anim.at}ms）` : '動畫中 0px',
                     s.allowed.length ? `刻意橫捲 ${s.allowed.length} 個（允許）` : ''].filter(Boolean).join('｜'),
          limit: '≤ 1px', ok });
      }
    }
    await page.close();
    return { rows };
  },
};
