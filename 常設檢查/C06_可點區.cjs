/* 常設 C6　可點區
 *
 * Rozi：「按『換個方向』沒有反應」——功能正常，但按鈕只有 52×19，手指按不到。
 *
 * 掃哪些畫面：SCAN 全部狀態，寬 390（`C6_WIDTH` 可覆寫）
 *   ＊ 有 sheet／遮罩蓋在上面時（`body > .fixed.inset-0`），只量最上層那一片裡的元素——
 *     底下被蓋住的本來就不該點得到，會另外列出「被蓋住 N 個」
 * 掃哪些元素：button、a、input、select、textarea、[role=button]
 *   （排除 display:none／visibility:hidden／opacity 0／寬高 0／type=hidden，排除的數量會印出來）
 * 什麼時間點：載入＋展開＋條件式步驟（含點下去才出現的就地編輯框）之後；
 *   每個元素量之前先 scrollIntoView 到畫面中央
 * 判定（兩條都要過）：
 *   a. 有效可點區（元素本身 ∪ 它的 ::before／::after 透明擴張區）
 *      高 ≥ 44，或（高 ≥ 34 且面積 ≥ 1600 px²）
 *   b. 元素中心點 `elementFromPoint` 命中它自己或它的子孫（沒被鄰居或上層蓋掉）
 *   ＊ 輸入框沒過時，再實際點一下「外框的上緣內 3px」與「輸入框上方 8px」，看會不會聚焦到它——
 *     外框夠大而且點外框會聚焦，才算外框有幫上忙（會寫在量到的數字後面）
 * 數量下限：全站 ≥ 150 個（實際掃到幾個會印出來）
 *
 * 金絲雀（C11）：C11 會在**暫時副本**裡把「記新的一趟」改成 20px 高、重新建置，
 * 拿這支去量，必須變紅。
 */
const H = require('./lib/harness.cjs');

const MEASURE = () => {
  const SEL = 'button,a,input,select,textarea,[role=button]';
  const top = [...document.querySelectorAll('body > .fixed.inset-0')].pop();
  const root = top || document.body;
  const all = [...document.querySelectorAll(SEL)];
  const covered = top ? all.filter(e => !top.contains(e)).length : 0;
  const skipped = { 隱藏: 0 };
  const out = [];
  for (const e of all) {
    if (!root.contains(e)) continue;
    if (e.tagName === 'INPUT' && e.type === 'hidden') { skipped.隱藏++; continue; }
    /* ⚠️ opacity 0 **不能**當成隱藏：日期欄是「透明的 input 疊在整列上」，它就是真正被點的那個 */
    const cs = getComputedStyle(e), hidden = cs.display === 'none' || cs.visibility === 'hidden';
    e.scrollIntoView({ block: 'center', inline: 'center' });
    const r = e.getBoundingClientRect();
    if (hidden || r.width === 0 || r.height === 0) { skipped.隱藏++; continue; }
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (const ps of ['::before', '::after']) {
      const p = getComputedStyle(e, ps);
      if (!p.content || p.content === 'none' || p.content === 'normal' || p.display === 'none') continue;
      if (p.position !== 'absolute' && p.position !== 'fixed') continue;
      if (cs.position === 'static') continue;           // 定位基準不是它自己，算不準就不算
      const bx = r.left + e.clientLeft, by = r.top + e.clientTop;
      const pw = parseFloat(p.width), ph = parseFloat(p.height);
      const pl = parseFloat(p.left), pt = parseFloat(p.top);
      if (![pw, ph, pl, pt].every(Number.isFinite)) continue;
      L = Math.min(L, bx + pl); T = Math.min(T, by + pt);
      R = Math.max(R, bx + pl + pw); B = Math.max(B, by + pt + ph);
    }
    const w = R - L, h = B - T;
    const sizeOk = h >= 44 || (h >= 34 && w * h >= 1600);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const hitOk = !!hit && (hit === e || e.contains(hit));
    const txt = (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 14);
    const who = `${e.tagName.toLowerCase()}${e.type && e.tagName === 'INPUT' ? '[' + e.type + ']' : ''}.${String(e.className).split(/\s+/).filter(Boolean).slice(0, 2).join('.')}「${txt}」`;
    const hitWho = hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(/\s+/).slice(0, 2).join('.')}` : '（畫面外）';
    const i = out.length; e.setAttribute('data-c6', i);
    const pr = e.parentElement.getBoundingClientRect();
    out.push({ i, who, w: Math.round(w), h: Math.round(h), area: Math.round(w * h), sizeOk, hitOk, hitWho,
               isInput: /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName), parentH: Math.round(pr.height) });
  }
  window.scrollTo(0, 0);
  return { out, covered, skipped: skipped.隱藏 };
};

module.exports = {
  id: 'C6', title: '可點區 ≥ 44（或 ≥34 且 ≥1600px²）且中心點命中自己',
  async run({ page, base, scan, inject }) {
    const width = Number(process.env.C6_WIDTH || 390);
    const rows = []; let total = 0;
    for (const sc of scan || H.SCAN) {
      await H.prepare(page, base, sc, { width });
        if (inject) await inject(page, sc);
      const m = await page.evaluate(MEASURE);
      total += m.out.length;
      const bad = m.out.filter(x => !x.sizeOk || !x.hitOk);
      for (const x of bad.filter(x => x.isInput && !x.sizeOk && x.parentH >= 44)) {
        const pt = await page.evaluate(i => {
          const e = document.querySelector(`[data-c6="${i}"]`); e.scrollIntoView({ block: 'center' });
          document.activeElement && document.activeElement.blur();
          const r = e.parentElement.getBoundingClientRect(), er = e.getBoundingClientRect();
          /* 兩個點：外框上緣內 3px、輸入框上方 8px（44px 擴張區的範圍內） */
          return [{ x: er.left + er.width / 2, y: r.top + 3 }, { x: er.left + er.width / 2, y: er.top - 8 }];
        }, x.i);
        x.parentFocus = false;
        for (const q of pt) {
          await page.evaluate(() => document.activeElement && document.activeElement.blur());
          await page.touchscreen.tap(q.x, q.y); await H.sleep(80);
          if (await page.evaluate(i => document.activeElement === document.querySelector(`[data-c6="${i}"]`), x.i)) x.parentFocus = true;
        }
        if (x.parentFocus) { x.sizeOk = true; x.note = `外框 ${x.parentH}px 點了會聚焦`; }
        else x.note = `外框 ${x.parentH}px 但點外框不會聚焦`;
      }
      bad.splice(0, bad.length, ...bad.filter(x => !x.sizeOk || !x.hitOk));
      rows.push({ where: sc.name, element: `互動元素 ×${m.out.length}` + (m.skipped ? `（隱藏 ${m.skipped}）` : '') + (m.covered ? `（被 sheet 蓋住 ${m.covered}）` : ''),
        measured: bad.length ? `${bad.length} 個不過：` + bad.slice(0, 6).map(x =>
          `${x.who} ${x.w}×${x.h}${x.sizeOk ? '' : `（面積 ${x.area}${x.note ? '，' + x.note : ''}）`}${x.hitOk ? '' : `，中心點命中 ${x.hitWho}`}`).join('；') : '全部通過',
        limit: '高≥44 或 (高≥34 且 ≥1600px²)；中心點命中自己', ok: bad.length === 0, detail: bad });
    }
    rows.push({ where: '全站', element: '互動元素合計（下限）', measured: `${total} 個`, limit: '≥ 150', ok: total >= 150 });
    return { rows };
  },
};
