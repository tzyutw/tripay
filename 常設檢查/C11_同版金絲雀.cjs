/* 常設 C11　對照組要用「同一版關掉某段程式」，不要用「保存的舊版建置」
 *
 * 這一條驗的是**檢查本身有沒有在抓**：每支檢查都要能在同一份程式上被弄紅。
 * 舊建置會隨假資料演進而失效（verify_V 0／0b／1b 就是這樣跑不動的），同版弄壞不會。
 *
 * 做法（每一隻金絲雀都是：先在原狀量一次＝綠，弄壞之後再量一次＝必須紅）：
 *   ① C6 可點區【暫時副本】：把專案複製到系統暫存區，在副本的量測靶進入點加一段，
 *      把 S-01「記新的一趟」強制成 20px 高，**在副本裡重新建置**，拿 C6 去量副本。
 *      量完整個副本刪掉，原專案一個字都沒動（C3 會證明）。
 *   ② C4 不橫向捲動【同版注入】：在 S-04 的 sheet 捲動容器裡塞一個 600px 寬的元素
 *   ③ C5 輸入框 16px【同版注入】：把 S-04 第一個輸入框字級改成 13px
 *   ④ C1 成員識別【同版注入】：把 S-03 一顆填色圓底的底色改成白色（沒 emoji 組）
 *   ⑤ C2 宣告＝渲染【同版注入】：把 S-01 一顆 `.ic2` 改成 36px 寬
 * 判定：每一隻「原狀全綠、弄壞後至少一列紅，而且紅的那一列講的就是被弄壞的那個東西」
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');
const H = require('./lib/harness.cjs');

const pick = name => H.SCAN.filter(s => s.name === name);
const badRows = r => r.rows.filter(x => !x.ok && x.where !== '全站' && !/全站/.test(x.where));

function makeCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tripay-canary-'));
  const skip = new Set(['node_modules', '.git', 'dist', 'dist-harness', 'Claude outputs', '歷史資料匯入', '常設檢查']);
  for (const f of fs.readdirSync(H.ROOT)) {
    if (skip.has(f)) continue;
    fs.cpSync(path.join(H.ROOT, f), path.join(dir, f), { recursive: true });
  }
  fs.symlinkSync(path.join(H.ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  /* 副本裡的量測靶進入點：持續把「記新的一趟」壓成 20px 高 */
  fs.appendFileSync(path.join(dir, 'src/test/harness/main.tsx'), `
/* ── 常設 C11 金絲雀（只存在於暫時副本）── */
const __canary = () => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('記新的一趟'));
  if (b && !b.dataset.canary) { b.dataset.canary = '1';
    b.style.cssText += ';height:20px!important;min-height:0!important;padding-top:0!important;padding-bottom:0!important;line-height:20px!important'; }
};
new MutationObserver(__canary).observe(document.documentElement, { childList: true, subtree: true });
`);
  return dir;
}

module.exports = {
  id: 'C11', title: '金絲雀：同版弄壞，檢查必須變紅',
  async run(ctx) {
    const rows = [];
    const C = n => require(`./${n}.cjs`);
    const judge = (name, before, after, mustMention) => {
      const b = badRows(before), a = badRows(after);
      const hit = a.filter(x => mustMention.test(`${x.where} ${x.element} ${x.measured}`));
      rows.push({ where: name, element: `原狀紅 ${b.length} 列 → 弄壞後紅 ${a.length} 列`,
        measured: hit.length ? `抓到了：${hit[0].measured.slice(0, 160)}` : `沒抓到（弄壞後的紅：${a.map(x => x.measured).join('；').slice(0, 160) || '無'}）`,
        limit: '原狀 0 紅、弄壞後抓到', ok: b.length === 0 && hit.length > 0 });
    };

    /* ① C6 暫時副本 */
    let dir;
    try {
      dir = makeCopy();
      /* 副本沒有 .git，vite.config 取版號會印一行 fatal，那是預期的，所以把輸出收起來 */
      execSync('npx vite build --mode harness --logLevel error', { cwd: dir, stdio: 'pipe' });
      const { srv, port } = await H.serve(path.join(dir, 'dist-harness'));
      const scan = pick('S-01 行程列表');
      const before = await C('C06_可點區').run({ ...ctx, scan });
      const after = await C('C06_可點區').run({ ...ctx, base: `http://127.0.0.1:${port}`, scan });
      srv.close();
      judge('① C6 可點區（暫時副本：「記新的一趟」改成 20px 高）', before, after, /記新的一趟.*×20/);
    } catch (e) {
      rows.push({ where: '① C6 暫時副本', element: '—', measured: '執行錯誤：' + e.message.slice(0, 200), limit: '—', ok: false });
    } finally {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }

    /* ②～⑤ 同版注入 */
    const inj = async (mod, scanName, fn, name, re, extra = {}) => {
      const scan = pick(scanName).map(s => ({ ...s, ...extra }));
      const before = await C(mod).run({ ...ctx, scan });
      const after = await C(mod).run({ ...ctx, scan, inject: p => p.evaluate(fn) });
      judge(name, before, after, re);
    };
    process.env.C4_WIDTHS_SAVED = process.env.C4_WIDTHS || '';
    process.env.C4_WIDTHS = '390';
    await inj('C04_不橫向捲動', 'S-04 記一筆（一起分＋排除）', () => {
      const s = [...document.querySelectorAll('.sheetbody, .overflow-y-auto')].pop();
      const d = document.createElement('div'); d.style.cssText = 'width:600px;height:4px'; s.appendChild(d);
    }, '② C4 不橫向捲動（sheet 裡塞 600px 寬的元素）', /靜態：.*多/);
    process.env.C4_WIDTHS = process.env.C4_WIDTHS_SAVED || '';
    if (!process.env.C4_WIDTHS) delete process.env.C4_WIDTHS;
    await inj('C05_輸入框16px', 'S-04 記一筆（一起分＋排除）', () => {
      const i = document.querySelector('input[type=text]'); i.style.setProperty('font-size', '13px', 'important');
    }, '③ C5 輸入框 16px（第一個輸入框改 13px）', /13px/);
    await inj('C01_成員識別', 'S-03 消費列表（展開）', () => {
      const a = document.querySelector('.avatar.letter'); if (a) a.style.setProperty('background', '#fff', 'important');
    }, '④ C1 成員識別（一顆填色圓底改成白色）', /白色/);
    await inj('C02_宣告與渲染尺寸', 'S-01 行程列表', () => {
      const a = document.querySelector('.ic2'); if (a) a.style.setProperty('width', '36px', 'important');
    }, '⑤ C2 宣告＝渲染（一顆 .ic2 改成 36px 寬）', /宣告 40×40，渲染 36/);
    return { rows };
  },
};
