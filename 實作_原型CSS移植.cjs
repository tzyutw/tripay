/* 實作-B-3　把 Tripay_原型.html 的 `.ui` 版面規則搬進 src/index.css。
 *
 * **手抄會走鐘**——#31-5／#32-1 那一輪 `.ic2` 的底色就是手抄抄反的。
 * 所以這一份用程式抽，抽出來的規則原封不動，只拿掉 `.ui ` 這個前綴
 * （App 的根節點不叫 .ui）。要改數值一律改原型，再重跑這支。
 *
 * 只搬「App 真的用得到」的選擇器：白名單由 src/ 裡實際出現的 className 決定，
 * 不是把 221 條全倒進來——沒人用的規則沒人維護。
 */
const fs = require('fs');

const PROTO = fs.readFileSync('Tripay_原型.html', 'utf8');
let css = PROTO.match(/<style>([\s\S]*?)<\/style>/)[1];
/* 註解與 @media／@keyframes 先拿掉——它們的巢狀大括號會把「一條規則」的切法弄歪，
   歪掉之後後面每一條的選擇器都對不上，而且**不會報錯**，只是靜靜少搬幾條。
   （少搬的那幾條正好是 .btn／.seg／.hero／.exprow 這種最基本的，第一次就踩到了。） */
css = css.replace(/\/\*[\s\S]*?\*\//g, '');
/* @media／@keyframes／@supports 從主體切出來另外處理。
   **不能整段丟掉**：`.fold` 的三拍動畫、`.spin` 的轉圈全都住在
   `@media(prefers-reduced-motion:no-preference)` 裡（reduce 時故意不套動畫，
   直接停在最終畫面）。丟掉它們＝動畫靜靜消失，測試也看不出來。 */
const atBlocks = [];
for (const at of ['@media', '@keyframes', '@supports']) {
  let i;
  while ((i = css.indexOf(at)) >= 0) {
    let d = 0, j = css.indexOf('{', i);
    for (let k = j; k < css.length; k++) {
      if (css[k] === '{') d++;
      else if (css[k] === '}' && --d === 0) { j = k; break; }
    }
    atBlocks.push(css.slice(i, j + 1));
    css = css.slice(0, i) + css.slice(j + 1);
  }
}

/* src/ 裡實際用到的 class（含共用元件） */
const used = new Set();
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = d + '/' + f;
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.tsx?$/.test(f)) continue;
    const src = fs.readFileSync(p, 'utf8');
    /* ⚠️ 只比對 `className="..."` 會漏掉 **把 class 名放進變數** 的寫法
       （ExpenseGroups 的 `const cls = \`exprow${pend ? ' pend' : ''}\``）。
       漏掉的後果不是報錯，是那一條規則靜靜沒被搬過來、版面壞掉沒人知道
       ——`.exprow` 第一次就是這樣漏的。
       所以改成掃**所有字串與樣板字面量**裡的 token，寧可多搬幾條沒用到的，
       也不要少搬一條在用的。反正還要跟原型的選擇器取交集。 */
    for (const m of src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g))
      for (const c of (m[1] || m[2] || m[3] || '').split(/[\s${}?:'"+()./[\]<>=]+/))
        if (/^[a-z][a-z0-9-]*$/.test(c)) used.add(c);
  }
})('src');

/* 逐條規則掃過去：選擇器裡出現任何一個用到的 class 就搬 */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const out = [];
let kept = 0, skipped = 0;
for (const [, selRaw, body] of rules) {
  const sel = selRaw.trim();
  if (!sel.startsWith('.ui ')) { skipped++; continue; }
  const classes = [...sel.matchAll(/\.([a-z][a-z0-9-]*)/g)].map(m => m[1]).filter(c => c !== 'ui');
  if (!classes.length || !classes.some(c => used.has(c))) { skipped++; continue; }
  out.push(`${sel.replace(/\.ui\s+/g, '')} { ${body.trim().replace(/\s*\n\s*/g, ' ')} }`);
  kept++;
}

/* at-rule 區塊：只搬「裡面提到的 class 有人用」的那些，同樣去掉 .ui 前綴。
   @keyframes 沒有 class，一律搬——動畫定義少一條，動畫就整個不會動。 */
let atKept = 0;
for (const blk of atBlocks) {
  const isKeyframes = blk.startsWith('@keyframes');
  const classes = [...blk.matchAll(/\.([a-z][a-z0-9-]*)/g)].map(m => m[1]).filter(c => c !== 'ui');
  if (!isKeyframes && !classes.some(c => used.has(c))) continue;
  out.push(blk.replace(/\.ui\s+/g, '').replace(/\s*\n\s*/g, ' '));
  atKept++;
}

console.log(`搬了 ${kept} 條規則 ＋ ${atKept} 個 at-rule 區塊，略過 ${skipped} 條`);
console.log(`src/ 用到的 class ${used.size} 個`);
fs.writeFileSync('/tmp/proto-rules.css', out.join('\n'));
console.log('→ /tmp/proto-rules.css');
