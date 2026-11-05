/* 常設 C3　檔案白名單：「沒點名的東西不要碰」
 *
 * 每一節指令都有自己的白名單。這支讀 `C3_ALLOW`（逗號分隔的 glob）或
 * `常設檢查/C03_白名單.txt`（一行一個 glob，# 開頭是註解），
 * 比對「這個分支相對於 main 的分岔點」以來所有變動過的檔案（含未 commit 的）。
 *
 *   C3_BASE      比對基準，預設 `origin/main`（取 merge-base）
 *   C3_ALLOW     覆寫白名單
 *   C3_MAX_LINES 增刪行數上限（預設不設上限）
 *
 * 掃哪些東西：`git diff --name-only <merge-base>`＋未追蹤檔案
 * 判定：每個變動檔案都要命中白名單；有設上限時總行數 ≤ 上限
 * ⚠️ 在 main 本身跑會是「0 個檔案變動」——那是正確的結果，不是沒驗（輸出會寫明基準與檔案數）。
 */
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const H = require('./lib/harness.cjs');

const sh = c => execSync(c, { cwd: H.ROOT, encoding: 'utf8' }).trim();
function globRe(g) {
  return new RegExp('^' + g.split('**').map(p => p.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');
}

module.exports = {
  id: 'C3', title: '檔案白名單', browser: false,
  async run() {
    const baseRef = process.env.C3_BASE || 'origin/main';
    let base;
    try { base = sh(`git merge-base HEAD ${baseRef}`); } catch { base = sh('git rev-parse HEAD'); }
    const allowFile = path.join(__dirname, 'C03_白名單.txt');
    const allow = (process.env.C3_ALLOW ? process.env.C3_ALLOW.split(',')
      : fs.readFileSync(allowFile, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')));
    const res = allow.map(globRe);
    const q = s => s.replace(/^"|"$/g, '');
    const changed = [...new Set([
      ...sh(`git -c core.quotepath=off diff --name-only ${base}`).split('\n'),
      ...sh('git -c core.quotepath=off ls-files --others --exclude-standard').split('\n'),
    ].map(q).filter(Boolean))];
    const out = changed.filter(f => !res.some(r => r.test(f)));
    const stat = sh(`git diff --shortstat ${base}`);
    const lines = (stat.match(/(\d+) insertion/)?.[1] | 0) + (stat.match(/(\d+) deletion/)?.[1] | 0);
    const rows = [{ where: `相對 ${baseRef} 分岔點 ${base.slice(0, 7)}`, element: `變動檔案 ${changed.length} 個`,
      measured: out.length ? `白名單外：${out.join('、')}` : '全部在白名單內', limit: `白名單 ${allow.length} 條`, ok: out.length === 0 }];
    const max = Number(process.env.C3_MAX_LINES || 0);
    if (max) rows.push({ where: '同上', element: '增刪行數', measured: `${lines} 行`, limit: `≤ ${max}`, ok: lines <= max });
    return { rows };
  },
};
