/* 常設 C2　元件宣告的尺寸 ＝ 畫面實際渲染的尺寸
 *
 * 由來：CSS 特異度陷阱已發生四次（`:where()` 降權重、搬移時掉了 `.ui` 前綴、
 *       裸元素選擇器壓過 `w-8`、移植區塊蓋掉手寫規則）——原始碼寫了，畫面沒生效。
 *
 * 掃哪些畫面：SCAN 全部狀態，寬 390
 * 掃哪些元素（三種宣告來源）：
 *   ① `.avatar` 宣告 28×28，`.avatar.sm` 宣告 20×20（`Avatar.tsx` 的 size prop）
 *   ② `.ic2` 宣告 40×40（index.css）
 *   ③ 帶 Tailwind 固定尺寸 class 的元素：`w-N`／`h-N`／`size-N`／`w-[Npx]`／`h-[Npx]`
 *      （N×0.25rem，以 html 的實際字級換算）
 * 什麼時間點：載入＋展開之後
 * 判定：渲染寬高（getBoundingClientRect）與宣告相差 ≤ 1px。
 *       `w-full` 這類相對值、帶 `sm:` 等斷點前綴的不算宣告。
 *       宣告了寬度卻是 inline 元素（寬度根本不會生效）＝ 不一致。
 */
const H = require('./lib/harness.cjs');

module.exports = {
  id: 'C2', title: '宣告尺寸＝渲染尺寸',
  async run({ page, base, scan, inject }) {
    const rows = []; let total = 0;
    for (const sc of scan || H.SCAN) {
      await H.prepare(page, base, sc);
        if (inject) await inject(page, sc);
      const m = await page.evaluate(() => {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const out = []; let n = 0;
        const label = e => `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 4).join('.')}` +
          (e.textContent.trim() ? `「${e.textContent.trim().slice(0, 8)}」` : '');
        for (const e of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = e.getBoundingClientRect();
          if (!r.width && !r.height) continue;
          const want = {};
          const cl = e.classList;
          if (cl.contains('avatar')) want.w = want.h = cl.contains('sm') ? 20 : 28;
          if (cl.contains('ic2')) want.w = want.h = 40;
          for (const c of cl) {
            let mm;
            if ((mm = c.match(/^(w|h|size)-(\d+(?:\.5)?)$/))) {
              const px = Number(mm[2]) * 0.25 * rem;
              if (mm[1] !== 'h') want.w = px; if (mm[1] !== 'w') want.h = px;
            } else if ((mm = c.match(/^(w|h|size)-\[(\d+(?:\.\d+)?)px\]$/))) {
              const px = Number(mm[2]);
              if (mm[1] !== 'h') want.w = px; if (mm[1] !== 'w') want.h = px;
            }
          }
          if (want.w == null && want.h == null) continue;
          n++;
          const dw = want.w == null ? 0 : Math.abs(r.width - want.w);
          const dh = want.h == null ? 0 : Math.abs(r.height - want.h);
          const inline = cs.display === 'inline';
          if (dw > 1 || dh > 1 || inline)
            out.push(`${label(e)} 宣告 ${want.w ?? '—'}×${want.h ?? '—'}，渲染 ${Math.round(r.width * 10) / 10}×${Math.round(r.height * 10) / 10}${inline ? '（inline，寬高不生效）' : ''}`);
        }
        return { n, out };
      });
      total += m.n;
      rows.push({ where: sc.name, element: `有宣告尺寸的元素 ×${m.n}`,
        measured: m.out.length ? `${m.out.length} 個不一致：` + m.out.slice(0, 4).join('；') : '全部一致',
        limit: '差 ≤ 1px', ok: m.out.length === 0, detail: m.out });
    }
    rows.push({ where: '全站', element: '有宣告尺寸的元素合計（下限）', measured: `${total} 個`, limit: '≥ 100', ok: total >= 100 });
    return { rows };
  },
};
