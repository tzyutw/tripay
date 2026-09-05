/* 實作-A-3　全域 token 掃描
 *
 * 掃描範圍＝src/ ＋ index.html ＋ package.json ＋ tailwind.config.js
 * 不含 Tripay_原型.html、不含 supabase/
 *
 * ⚠️ 佇列原文寫的是「src/ 內 font-size: 出現次數 ≥30，且每一處都是 var(--fs-…)」。
 * 這個專案的 src/ 是 Tailwind class，**一個 `font-size:` 都沒有**（改動前後都是 0），
 * 照字面驗會永遠是 0/0——「查了但沒查到」與「沒有問題」長得一模一樣。
 * 所以同一個保證改成兩段一起驗：
 *   ① src/ 內不得出現任何寫死的字級／圓角（text-[Npx]、rounded-lg…）
 *   ② 建置產物的 CSS 裡，每一個 font-size／border-radius 都必須是 var(--fs-*)／var(--r-*)
 * ②才是使用者實際下載到的東西，比掃原始碼更接近真相。
 */
const fs = require('fs'), path = require('path'), cp = require('child_process');

const SRC_DIR = 'src';
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css)$/.test(f) && files.push(p);
  }
})(SRC_DIR);
const SRC = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const CSS_SRC = fs.readFileSync('src/index.css', 'utf8');
const TW = fs.readFileSync('tailwind.config.js', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');
const PKG = JSON.parse(fs.readFileSync('package.json', 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };

console.log(`\n=== 掃描範圍 ===\n   ${files.length} 個檔案（${SRC_DIR}/）＋ index.html ＋ package.json ＋ tailwind.config.js`);

/* 1　九個字級：定義、數值、用量 */
console.log('\n=== 1　字級 ===');
const WANT_FS = { tag: '12px', sub: '13px', body: '15px', input: '16px', strong: '17px',
                  title: '20px', money: '16px', 'money-lg': '26px', logo: '44px' };
const defined = {};
for (const m of CSS_SRC.matchAll(/--fs-([a-z-]+):\s*([0-9]+px)/g)) defined[m[1]] = m[2];
console.log('   定義:', Object.entries(defined).map(([k, v]) => `${k}=${v}`).join(' '));
for (const [k, v] of Object.entries(WANT_FS))
  ok(defined[k] === v, `--fs-${k} 應為 ${v}，實際 ${defined[k] || '（沒定義）'}`);
ok(Object.keys(defined).length === 9, `應該正好九階，實際 ${Object.keys(defined).length} 階`);
for (const k of Object.keys(WANT_FS))
  /* 帶連字號的鍵在 JS 物件裡要加引號（'money-lg'），兩種寫法都要認 */
  ok(new RegExp(`['"]?${k}['"]?:\\s*'var\\(--fs-${k}\\)'`).test(TW),
    `tailwind.config 沒有把 ${k} 接到 var(--fs-${k})`);

const hardFs = [...SRC.matchAll(/text-\[[0-9.]+px\]/g)].map(m => m[0]);
const usedFs = [...SRC.matchAll(/\btext-(tag|sub|body|input|strong|title|money-lg|money|logo)\b/g)];
console.log(`   寫死的字級 ${hardFs.length} 處｜token 字級 ${usedFs.length} 處`);
ok(hardFs.length === 0, `src/ 仍有寫死的字級：${[...new Set(hardFs)].join(' ')}`);
ok(usedFs.length >= 30, `token 字級用量 ${usedFs.length} 處，低於下限 30——目標不存在時不得算通過`);

/* 2　四個圓角 */
console.log('\n=== 2　圓角 ===');
const WANT_R = { base: '10px', panel: '20px', icon: '50%', chip: '999px' };
const rdef = {};
for (const m of CSS_SRC.matchAll(/--r-([a-z]+):\s*([0-9]+px|50%)/g)) rdef[m[1]] = m[2];
console.log('   定義:', Object.entries(rdef).map(([k, v]) => `${k}=${v}`).join(' '));
for (const [k, v] of Object.entries(WANT_R))
  ok(rdef[k] === v, `--r-${k} 應為 ${v}，實際 ${rdef[k] || '（沒定義）'}`);
const hardR = [...SRC.matchAll(/rounded(-t|-b|-l|-r)?-\[[^\]]+\]|rounded(-(sm|md|lg|xl|2xl|3xl|full|none))?(?![\w-])/g)]
  .map(m => m[0]).filter(x => !/rounded$/.test(x) || true);
const usedR = [...SRC.matchAll(/rounded(-[tblr])?-(base|panel|icon|chip)\b/g)];
console.log(`   寫死的圓角 ${hardR.length} 處｜token 圓角 ${usedR.length} 處`);
ok(hardR.length === 0, `src/ 仍有寫死的圓角：${[...new Set(hardR)].join(' ')}`);
ok(usedR.length >= 20, `token 圓角用量 ${usedR.length} 處，低於下限 20`);

/* 3　等寬字體：禁字清單 */
console.log('\n=== 3　全站移除等寬 ===');
const BAN = ['monospace', 'IBM Plex Mono', 'ui-monospace', 'SFMono', 'Menlo', 'Consolas', 'font-mono'];
const hits = BAN.filter(w => (SRC + TW + HTML).includes(w));
console.log('   命中:', hits.length ? hits.join(' ') : '（無）');
ok(hits.length === 0, `等寬禁字命中：${hits.join(' ')}`);
const tnum = (SRC.match(/tabular-nums/g) || []).length;
console.log('   金額改靠 tabular-nums：', tnum, '處');
ok(tnum >= 8, `金額要靠字重＋tabular-nums，實際只有 ${tnum} 處`);

/* 4　字體不得走 Google Fonts CDN */
console.log('\n=== 4　字體來源 ===');
const g = (SRC + HTML).match(/fonts\.(googleapis|gstatic)\.com/g) || [];
console.log('   Google Fonts 命中:', g.length, '｜@fontsource/onest:', !!PKG.dependencies['@fontsource/onest']);
ok(g.length === 0, `Google Fonts 被 egress 擋住，不得使用：${g.length} 處`);
ok(!!PKG.dependencies['@fontsource/onest'], 'Onest 要走 npm 套件');
/* @import 排在 @tailwind 之後會被 PostCSS 整段丟掉，只留一行警告、建置照樣成功 */
const iAt = CSS_SRC.indexOf('@import'), tAt = CSS_SRC.indexOf('@tailwind');
console.log(`   @import 位置 ${iAt} < @tailwind 位置 ${tAt}`);
ok(iAt >= 0 && iAt < tAt, '@import 必須排在 @tailwind 之前，否則字體會靜靜地沒載到');
ok(/--sans:[^;]*Onest/.test(CSS_SRC), '--sans 要以 Onest 開頭');

/* 5　沒有深色模式 */
console.log('\n=== 5　沒有深色模式 ===');
const dark = (SRC.match(/\[data-theme|prefers-color-scheme|\bdark:/g) || []);
console.log('   命中:', dark.length);
ok(dark.length === 0, `本專案沒有深色模式的決策，不得帶進來：${dark.length} 處`);

/* 6　輸入框 ≥16px（iOS 一聚焦就放大整頁） */
console.log('\n=== 6　輸入框字級下限 ===');
ok(/input[^{]*\{[^}]*font-size:\s*var\(--fs-input\)/.test(CSS_SRC.replace(/\n/g, ' ')),
  'input／textarea／select 要硬性吃 --fs-input');
ok(defined.input === '16px', 'iOS 的下限是 16px，不得再小');

/* 7　icon：唯一來源、線寬、三個層級 */
console.log('\n=== 7　icon ===');
const ICON_SRC = fs.readFileSync('src/components/Icon.tsx', 'utf8');
const keys = [...ICON_SRC.matchAll(/^\s{2}([a-z]+):\s*'/gm)].map(m => m[1]);
const proto = fs.readFileSync('Tripay_原型.html', 'utf8');
const pkeys = [...proto.matchAll(/^\s{2}([a-z]+):\s*'</gm)].map(m => m[1]);
console.log(`   ${keys.length} 個鍵:`, keys.join(' '));
ok(keys.length === 17, `應有 17 個鍵，實際 ${keys.length}`);
ok(keys.every(k => pkeys.includes(k)), '只准搬原型 ICON 表裡有的鍵');
ok(/strokeWidth=\{ICON_STROKE\}/.test(ICON_SRC) && /ICON_STROKE = 1\.7/.test(ICON_SRC), '線寬要是唯一的 1.7');
ok(/fill="none"/.test(ICON_SRC) && /stroke="currentColor"/.test(ICON_SRC), 'fill:none ＋ stroke:currentColor');
ok(!/SF Symbols|apple\.com\/design\/resources/i.test(ICON_SRC), 'Apple 的系統圖示不在授權範圍內');
for (const [cls, desc] of [['.ic2', '畫面層級動作'], ['.rmbtn', '列內動作'], ['.chev', '方向指示']])
  ok(CSS_SRC.includes(cls), `icon 按鈕的三個層級要各有一個 class：缺 ${cls}（${desc}）`);
ok(/\.ic2::after[^}]*var\(--h-tap\)/.test(CSS_SRC.replace(/\n/g, ' ')) &&
   /\.rmbtn::after[^}]*var\(--h-tap\)/.test(CSS_SRC.replace(/\n/g, ' ')),
  '可點區要用透明擴張區補到 44，不是放大看得見的圖形');
ok(/rgba\(0, 0, 0, \.05\)/.test(CSS_SRC) && /rgba\(255, 255, 255, \.14\)/.test(CSS_SRC),
  '.ic2 的底色是半透明薄膜，不得寫成實色');

/* 8　建置產物：使用者真正下載到的 CSS */
console.log('\n=== 8　建置產物 ===');
const dist = 'dist/assets';
if (!fs.existsSync(dist)) { console.log('   （沒有 dist/，先跑 vite build）'); ok(false, '缺 dist/'); }
else {
  const css = fs.readdirSync(dist).filter(f => f.endsWith('.css'))
    .map(f => path.join(dist, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const OUT = fs.readFileSync(css, 'utf8');
  const varFs = (OUT.match(/font-size:var\(--fs-[a-z-]+\)/g) || []);
  const hardOut = (OUT.match(/font-size:[0-9.]+px/g) || []);
  const varR = (OUT.match(/radius:var\(--r-[a-z]+\)/g) || []);
  console.log(`   ${path.basename(css)}`);
  console.log(`   font-size:var(--fs-*) ${varFs.length} 處｜寫死 ${hardOut.length} 處`);
  console.log(`   radius:var(--r-*) ${varR.length} 處`);
  console.log(`   @font-face ${(OUT.match(/@font-face/g) || []).length} 條｜woff2 ${fs.readdirSync(dist).filter(f => f.endsWith('.woff2')).length} 個`);
  ok(hardOut.length === 0, `產出的 CSS 仍有寫死的字級：${[...new Set(hardOut)].join(' ')}`);
  ok(varFs.length >= 8, `產出的 CSS 應有 ≥8 種 var(--fs-*)，實際 ${varFs.length}`);
  ok(varR.length >= 3, `產出的 CSS 應有 ≥3 種 var(--r-*)，實際 ${varR.length}`);
  ok((OUT.match(/@font-face/g) || []).length > 0, 'Onest 沒有進到產出的 CSS——@import 位置錯了會這樣');
  ok(fs.readdirSync(dist).some(f => f.endsWith('.woff2')), '字檔沒有被打包');
}

/* 9　型別與建置 */
console.log('\n=== 9　型別與建置 ===');
const tsc = cp.spawnSync('npx', ['tsc', '--noEmit'], { encoding: 'utf8' });
console.log('   tsc --noEmit exit =', tsc.status);
ok(tsc.status === 0, `tsc 有型別錯誤：\n${(tsc.stdout || '').slice(0, 600)}`);

console.log('\n============================');
console.log(`通過 ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
