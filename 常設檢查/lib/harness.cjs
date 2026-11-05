/* 常設檢查共用：建置量測靶、起本機 server、開瀏覽器、開畫面、展開條件式元素。
 *
 * 量測靶是 `harness.html`（`vite build --mode harness` → `dist-harness/`）：
 * 真實元件 ＋ 真實 CSS ＋ 假資料樁，正式 bundle 碰不到它。
 *
 * ⚠️ 不能用 file:// 開（ES module 被 CORS 擋，頁面靜靜地空白），所以一定起 http server。
 */
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

/** Chrome 的位置：環境變數 → 雲端容器 → Mac */
function chromePath() {
  const cands = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium',
    '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  /* 找不到就讓 puppeteer 自己報錯，訊息比較清楚 */
  return cands[0];
}

/** 建置量測靶到 `dir`（預設 dist-harness）。`STANDING_SKIP_BUILD=1` 跳過（用既有的建置）。 */
function buildHarness(cwd = ROOT) {
  if (process.env.STANDING_SKIP_BUILD === '1' && fs.existsSync(path.join(cwd, 'dist-harness', 'harness.html'))) return;
  execSync('npx vite build --mode harness --logLevel error', { cwd, stdio: 'inherit' });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

async function launch() {
  const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer-core'));
  return puppeteer.launch({ executablePath: chromePath(), headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 開一個畫面。`q` 是 `screen=...&...` 的查詢字串。 */
async function open(page, base, q, { width = 390, height = 844, wait = 300, beforeLoad } = {}) {
  await page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  if (beforeLoad) await beforeLoad(page);
  await page.goto(`${base}/harness.html?${q}`, { waitUntil: 'networkidle0' });
  await sleep(wait);
  /* 頁面整片空白＝靶壞了，不是「沒有問題」 */
  /* sheet 會 createPortal 到 body，所以數 body 底下、不只 #root */
  const n = await page.evaluate(() => ({ el: document.body.querySelectorAll('*').length, t: document.body.innerText.trim().length }));
  if (n.el < 3 || n.t === 0) throw new Error(`畫面 ${q} 掛不起來（body 底下 ${n.el} 個元素、${n.t} 個字）`);
}

/** 依文字點按鈕／分頁，回傳真的點到的清單（點不到的會在輸出裡少掉，看得出來）。 */
async function clickByText(page, labels, wait = 250) {
  const done = [];
  for (const t of labels) {
    const hit = await page.evaluate(t => {
      const norm = s => (s || '').replace(/\s+/g, '');
      const el = [...document.querySelectorAll('button,[role=tab],[role=button],summary,a,label')]
        .find(x => norm(x.textContent).includes(norm(t)) || norm(x.getAttribute('aria-label')).includes(norm(t)));
      if (!el) return false;
      el.scrollIntoView({ block: 'center' }); el.click(); return true;
    }, t);
    if (hit) { done.push(t); await sleep(wait); }
  }
  return done;
}

/** 依 CSS 選擇器點第一個符合的元素 */
async function clickSel(page, sel, wait = 250) {
  const hit = await page.evaluate(sel => {
    const el = document.querySelector(sel); if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, sel);
  if (hit) await sleep(wait);
  return hit;
}

/* ─────────────────────────────────────────────────────────────────────────
 * 常設掃描的畫面清單（C4／C5／C6／C2 共用）
 *
 * 「一個畫面有幾個狀態，掃描清單就要有幾個」（CLAUDE.md 2026-09-11）：
 * 每一列是一個狀態。`expand` 是量之前要先點開的條件式元素（點不到會印出來）。
 * `steps` 是更複雜的觸發（例如點下去才出現的就地編輯輸入框）。
 * 新增畫面或狀態時加在這裡，四條檢查會一起涵蓋。
 * ───────────────────────────────────────────────────────────────────────── */
const SCAN = [
  { q: 'screen=s00',                       name: 'S-00 登入' },
  { q: 'screen=s08',                       name: 'S-08 隱私權' },
  { q: 'screen=s09',                       name: 'S-09 條款' },
  { q: 'screen=s01',                       name: 'S-01 行程列表' },
  { q: 'screen=s01&expenses=none',         name: 'S-01 行程列表（0 筆消費）' },
  { q: 'screen=s02',                       name: 'S-02 建立行程 sheet' },
  { q: 'screen=s02',                       name: 'S-02 建立行程（新增成員輸入中）', steps: [{ text: '新增成員' }] },
  { q: 'screen=s02',                       name: 'S-02 建立行程（幣別選單打開）', steps: [{ sel: '.fld button[aria-haspopup], .curbtn, button.cur' }, { text: 'JPY▾' }] },
  { q: 'screen=s02b',                      name: 'S-02b 編輯行程 sheet' },
  { q: 'screen=s02b',                      name: 'S-02b 成員 emoji 就地編輯中',
    steps: [{ sel: '.avatar.tap44' }] },
  { q: 'screen=s03',                       name: 'S-03 消費列表（展開）', expand: ['總花費'] },
  { q: 'screen=s03',                       name: 'S-03 點開一筆（編輯消費 sheet）', steps: [{ sel: 'button.exprow' }] },
  { q: 'screen=s03&unsettled=all',         name: 'S-03 還沒算清楚' },
  { q: 'screen=s03&member=0',              name: 'S-03 某人的帳' },
  { q: 'screen=s03&state=archived',        name: 'S-03 已封存' },
  { q: 'screen=s03&state=settled',         name: 'S-03 已結算' },
  { q: 'screen=s03more',                   name: 'S-03 更多' },
  { q: 'screen=s03&expenses=none',         name: 'S-03 空狀態' },
  { q: 'screen=s04',                       name: 'S-04 記一筆（一起分＋排除）', expand: ['要排除誰？'] },
  { q: 'screen=s04',                       name: 'S-04 記一筆（各付各的）', expand: ['各付各的'] },
  { q: 'screen=s04',                       name: 'S-04 記一筆（只算一個人）', expand: ['只算一個人'] },
  { q: 'screen=s04',                       name: 'S-04 記一筆（類別 emoji 就地編輯中）',
    steps: [{ sel: '.fld .avatar.tap44, .catemoji, button[aria-label*="emoji"], button[aria-label*="類別"]' }] },
  { q: 'screen=s05',                       name: 'S-05 結算（未結算）', expand: ['查看計算依據'] },
  { q: 'screen=s05&state=settled',         name: 'S-05 結算（已結算、部分付清）', expand: ['查看計算依據'] },
  { q: 'screen=s05&state=done',            name: 'S-05 帳算清楚了', expand: ['查看計算依據'] },
  { q: 'screen=s05&state=stale',           name: 'S-05 已結算後又改帳', expand: ['查看計算依據'] },
  { q: 'screen=s05&settle=hub',            name: 'S-05 結算（中心人模式）', expand: ['查看計算依據'] },
  { q: 'screen=s06',                       name: 'S-06 分享頁', expand: ['總花費', '查看計算依據'] },
  { q: 'screen=s06&member=0',              name: 'S-06 分享頁・某人的帳' },
  { q: 'screen=s07',                       name: 'S-07 設定' },
];

/** 準備一個 SCAN 狀態：開頁 → 展開 → 跑 steps。回傳實際展開了什麼。 */
async function prepare(page, base, sc, opt = {}) {
  await open(page, base, sc.q, opt);
  const expanded = sc.expand ? await clickByText(page, sc.expand) : [];
  const stepped = [];
  for (const s of sc.steps || []) {
    if (s.sel && await clickSel(page, s.sel, 350)) stepped.push(s.sel);
    if (s.text) stepped.push(...await clickByText(page, [s.text], 350));
  }
  return { expanded, stepped };
}

function outDir() {
  const d = process.env.STANDING_OUT || path.join(os.tmpdir(), 'tripay-standing');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

module.exports = { ROOT, chromePath, buildHarness, serve, launch, open, prepare, clickByText, clickSel,
                   sleep, SCAN, outDir };
