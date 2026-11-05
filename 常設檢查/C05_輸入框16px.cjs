/* 常設 C5　輸入框字級維持 16px（iOS 聚焦時不得整頁放大）
 *
 * 掃哪些畫面：SCAN 全部狀態（包含點下去才會出現的就地編輯輸入框、新增成員輸入框）
 * 掃哪些元素：所有看得見的文字類 `input`（排除 checkbox／radio／range／color／file／hidden／按鈕型）、
 *            `textarea`、`select`
 * 什麼時間點：載入＋展開＋條件式步驟之後
 * 判定：computed font-size ≥ 16px；全站至少掃到 20 個（否則等於沒驗）
 */
const H = require('./lib/harness.cjs');

module.exports = {
  id: 'C5', title: '輸入框字級 ≥ 16px',
  async run({ page, base, scan, inject }) {
    const rows = []; let total = 0;
    for (const sc of scan || H.SCAN) {
      await H.prepare(page, base, sc);
        if (inject) await inject(page, sc);
      const m = await page.evaluate(() => {
        const skip = /^(checkbox|radio|range|color|file|hidden|button|submit|reset|image)$/;
        const els = [...document.querySelectorAll('input,textarea,select')].filter(e => {
          if (e.tagName === 'INPUT' && skip.test(e.type)) return false;
          const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
        });
        return els.map(e => ({ who: `${e.tagName.toLowerCase()}[${e.type || ''}]${e.placeholder ? '「' + e.placeholder.slice(0, 8) + '」' : ''}`,
                               fs: parseFloat(getComputedStyle(e).fontSize) }));
      });
      total += m.length;
      if (!m.length) continue;
      const bad = m.filter(x => x.fs < 16);
      rows.push({ where: sc.name, element: `輸入框 ×${m.length}`,
        measured: bad.length ? bad.map(x => `${x.who} ${x.fs}px`).join('；') : `最小 ${Math.min(...m.map(x => x.fs))}px`,
        limit: '≥ 16px', ok: bad.length === 0 });
    }
    rows.push({ where: '全站', element: '輸入框合計（下限）', measured: `${total} 個`, limit: '≥ 20', ok: total >= 20 });
    return { rows };
  },
};
