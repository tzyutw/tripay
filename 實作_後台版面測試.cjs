/* 後台的版面回歸：真實 Chromium、320／375／414 三種寬度，每一頁斷言不得橫向捲動，
 * 並掃出所有 scrollWidth > clientWidth 的元素（`.trunc` 這種本來就裁切的除外）。
 * 量測靶：src/test/harness/admin.html（`vite --mode harness` 開發伺服器）。
 * 截圖存到 SHOT_DIR（預設 /tmp/tripay-admin-shots），供逐張目視。
 *
 *   node 實作_後台版面測試.cjs
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 5199;
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/tripay-admin-shots';
const ROUTES = [
  ['A-總覽', '/admin'],
  ['B-行程詳情', '/admin/trips/t1'],
  ['B-已結算行程', '/admin/trips/t2'],
  ['C-操作紀錄', '/admin/log'],
  ['D-錯誤紀錄', '/admin/errors'],
  ['E-用人查-未選', '/admin/people'],
  ['E-用人查-已選', '/admin/people/u2'],
];
const WIDTHS = [320, 375, 414];

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const vite = spawn('npx', ['vite', '--mode', 'harness', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: 'x' } });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite 沒起來')), 30000);
    vite.stdout.on('data', d => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
  });
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  try {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      for (const [name, route] of ROUTES) {
        await page.goto(`http://localhost:${PORT}/src/test/harness/admin.html?route=${encodeURIComponent(route)}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-admin]', { timeout: 15000 });
        await page.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 15000 });
        const r = await page.evaluate(() => {
          const de = document.documentElement, b = document.body;
          const over = [];
          let scanned = 0;
          for (const el of document.querySelectorAll('[data-admin] *')) {
            scanned++;
            const cs = getComputedStyle(el);
            /* `.ic2` 的 42>40 是既有的透明擴張區（把可點範圍撐到 44px，CLAUDE.md「列內的動作」那節），
               不會撐開頁面——上面的文件／body 溢出才是判準。 */
            if (cs.overflowX === 'hidden' || el.classList.contains('trunc') || el.classList.contains('ic2')) continue;
            if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
              over.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}:${el.scrollWidth}>${el.clientWidth}`);
            const rc = el.getBoundingClientRect();
            if (rc.right > de.clientWidth + 1) over.push(`超出右緣 ${el.tagName.toLowerCase()} right=${Math.round(rc.right)}`);
          }
          return { doc: de.scrollWidth - de.clientWidth, body: b.scrollWidth - b.clientWidth, over, scanned,
                   text: (document.querySelector('[data-admin]')?.textContent ?? '').length };
        });
        const ok = r.doc <= 0 && r.body <= 0 && r.over.length === 0 && r.scanned > 10 && r.text > 20 && errs.length === 0;
        console.log(`${ok ? '[v]' : '[X]'} ${w}px ${name}  文件溢出=${r.doc} body溢出=${r.body} 掃了 ${r.scanned} 個元素`
          + (r.over.length ? `\n     溢出：${r.over.slice(0, 8).join(' ｜ ')}` : '') + (errs.length ? `\n     錯誤：${errs.join(' | ')}` : ''));
        ok ? pass++ : fail++;
        await page.screenshot({ path: `${SHOT_DIR}/${w}_${name}.png`, fullPage: true });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    vite.kill();
  }
  console.log(`\n通過 ${pass}　失敗 ${fail}　截圖：${SHOT_DIR}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
