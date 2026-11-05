/* 常設 C14　全站字串盤點，每輪跟上一輪比對
 *
 * Rozi：「你們有檢查過文案或使用者體驗都是順暢的嗎？」
 * 機器能做的一半：把全站每一句話抓下來，跟上一輪 diff，**有變動的句子才需要人審三題**
 * （使用者看得懂嗎／是不是只描述系統處境／需要解釋才懂的互動是不是該修互動）。
 * 機器驗不到的另一半（讀起來順不順）寫在 README 的「機器驗不到」。
 *
 * 掃哪些畫面：SCAN 全部狀態 ＋ C12 的錯誤狀態（讀取失敗／離線）＋ 查不到行程
 * 抓哪些字：畫面上每一個文字節點、placeholder、aria-label、title
 * 什麼時間點：載入＋展開＋條件式步驟之後
 * 基準：`C14_BASELINE=<檔案>`；沒給就用 STANDING_OUT 裡上一輪留下的 copy.json
 * 判定：a. 字串裡沒有 NaN／undefined／null／[object／TODO（機器判紅）
 *       b. 跟基準比：新增／消失的句子列出來，狀態標「要人審」（不算紅，但要有人看過）
 *       c. 沒有基準（第一輪）＝ 存下這一輪當基準，狀態標「要人審」
 */
const fs = require('fs'), path = require('path');
const H = require('./lib/harness.cjs');

const EXTRA = [
  { q: 'screen=s01&fail=read', name: 'S-01 讀取失敗' }, { q: 'screen=s03&fail=offline', name: 'S-03 離線' },
  { q: 'screen=s05&fail=read', name: 'S-05 讀取失敗' }, { q: 'screen=s06&fail=read', name: 'S-06 讀取失敗' },
  { q: 'screen=s03&trip=missing', name: 'S-03 查不到行程' }, { q: 'screen=s06&trip=missing', name: 'S-06 查不到行程' },
];

module.exports = {
  id: 'C14', title: '文案盤點（跟上一輪比）',
  async run({ page, base, out }) {
    const dump = {};
    for (const sc of [...H.SCAN, ...EXTRA]) {
      await H.prepare(page, base, sc);
      dump[sc.name] = await page.evaluate(() => {
        const s = new Set();
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n; while ((n = w.nextNode())) {
          const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.tagName)) continue;
          const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) s.add(t);
        }
        for (const e of document.querySelectorAll('[placeholder],[aria-label],[title]'))
          for (const a of ['placeholder', 'aria-label', 'title']) { const v = e.getAttribute(a); if (v && v.trim()) s.add(`〔${a}〕${v.trim()}`); }
        /* email 一律遮掉：這個 repo 是公開的，先前已把 email 清乾淨過（Rozi 裁示「甲」），基準檔不能再帶回來 */
        /* 每次跑都會變的東西也遮掉，否則每一輪都誤報「有變動」：
           版號（7 碼 hex）、後台假資料用「現在」往回推的時間 */
        return [...s].map(t => t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '〔email〕')
          .replace(/^[0-9a-f]{7}$/, '〔版號〕')
          .replace(/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}/g, '〔時間〕'));
      });
    }
    const all = new Set(Object.values(dump).flat());
    const rows = [];
    const junk = [...all].filter(t => /NaN|undefined|\bnull\b|\[object|TODO/.test(t));
    rows.push({ where: `全站 ${Object.keys(dump).length} 個狀態`, element: `不重複字串 ${all.size} 句`,
      measured: junk.length ? `出現程式字樣：${junk.slice(0, 5).join('；')}` : '沒有 NaN／undefined 之類的字樣', limit: '0 句', ok: !junk.length });

    const cur = path.join(out, 'copy.json');
    /* 基準優先序：C14_BASELINE → 上一輪留在 STANDING_OUT 的 copy.json → repo 裡的 C14_文案基準.json */
    const repoBase = path.join(__dirname, 'C14_文案基準.json');
    const basePath = process.env.C14_BASELINE || (fs.existsSync(cur) ? cur : fs.existsSync(repoBase) ? repoBase : null);
    let status = '要人審', note;
    if (basePath) {
      const prev = new Set(Object.values(JSON.parse(fs.readFileSync(basePath, 'utf8'))).flat());
      const added = [...all].filter(t => !prev.has(t)), gone = [...prev].filter(t => !all.has(t));
      rows.push({ where: `對照基準 ${path.basename(basePath)}`, element: '新增／消失的句子',
        measured: added.length || gone.length ? `新增 ${added.length}：${added.slice(0, 8).join('／')}｜消失 ${gone.length}：${gone.slice(0, 8).join('／')}` : '沒有變動',
        limit: '有變動就要人審三題', ok: true });
      if (!added.length && !gone.length) status = undefined;
      note = `有變動的句子要人審：使用者看得懂嗎／是不是只描述系統處境／需要解釋才懂的互動是不是該修互動。完整清單在 ${cur}`;
      fs.copyFileSync(basePath, path.join(out, 'copy.prev.json'));
    } else {
      note = `第一輪沒有基準：這一輪的 ${all.size} 句已存成 ${cur}，下一輪起只看變動。這一輪要人審全部（或沿用上次人審過的版本當基準）。`;
    }
    fs.writeFileSync(cur, JSON.stringify(dump, null, 1));
    if (junk.length) status = '沒過';
    return { rows, status, note };
  },
};
