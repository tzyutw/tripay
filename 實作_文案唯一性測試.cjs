/* 實作-A-4　「同一句文案只准寫一次」
 *
 * 佇列原文的停止條件是「三個常數各 ≥2 處引用同一個常數」。
 * **這一條現在還驗不了，而且不是漏做**：App 目前一個「未定案金額」的狀態都還沒畫
 * （那 212 項在實作-B），所以沒有第二處可以引用。
 * 為了湊數字而去製造引用，就是這個專案一路在防的「假通過」。
 *
 * 現在能驗、而且往後永遠該成立的是**唯一性本身**：
 *   ① 三句字串在 src/ 只能出現在 lib/messages.ts 這一個檔案裡
 *   ② 常數的內容與 Tripay_原型.html 逐字相同（原型是文案的唯一真相）
 * 實作-B 之後再把「≥2 處引用」加進來——那時候才有東西可以數。
 */
const fs = require('fs'), path = require('path');

const MSG_FILE = 'src/lib/messages.ts';
const MSGS = ['先記著了。設好這趟的現金匯率就會自動換算。',
              '先記著了。補上台幣金額就會算進結算。',
              '填一邊就好，另一邊會自動換算'];
const NAMES = ['MSG_NO_RATE', 'MSG_TWD_PENDING', 'MSG_FILL_ONE'];

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && files.push(p);
  }
})('src');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };

console.log('\n=== 1　三句文案在 src/ 只出現一次 ===');
for (const msg of MSGS) {
  const where = files.filter(f => fs.readFileSync(f, 'utf8').includes(msg));
  console.log(`   「${msg.slice(0, 14)}…」 出現在 ${where.length} 個檔案: ${where.join(' ') || '（無）'}`);
  ok(where.length === 1, `應該只有一個檔案有這句，實際 ${where.length}：${where.join(' ')}`);
  ok(where[0] === MSG_FILE, `這句應該只寫在 ${MSG_FILE}，實際在 ${where[0]}`);
}

console.log('\n=== 2　常數名稱與原型一致 ===');
const SRC = fs.readFileSync(MSG_FILE, 'utf8');
const PROTO = fs.readFileSync('Tripay_原型.html', 'utf8');
for (let i = 0; i < NAMES.length; i++) {
  const inSrc = new RegExp(`export const ${NAMES[i]} = '${MSGS[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(SRC);
  const inProto = PROTO.includes(`const ${NAMES[i]}`) && PROTO.includes(MSGS[i]);
  console.log(`   ${NAMES[i].padEnd(16)} src=${inSrc}　原型=${inProto}`);
  ok(inSrc, `${NAMES[i]} 的內容與原型不符`);
  ok(inProto, `原型裡找不到 ${NAMES[i]}——原型才是文案的唯一真相，先確認搬對了`);
}

console.log('\n=== 3　三個常數都有被匯出 ===');
const exported = NAMES.filter(n => new RegExp(`export const ${n}\\b`).test(SRC));
console.log('   匯出:', exported.join(' '));
ok(exported.length === 3, `三個都要 export，實際 ${exported.length}`);

/* 實作-B 之後這一段要改成硬性斷言 */
console.log('\n=== 4　引用數（實作-B 之後才會 >0，現在只記錄不判定）===');
for (const n of NAMES) {
  const refs = files.filter(f => f !== MSG_FILE && fs.readFileSync(f, 'utf8').includes(n));
  console.log(`   ${n.padEnd(16)} ${refs.length} 處引用${refs.length ? ': ' + refs.join(' ') : '（畫面還沒做，預期為 0）'}`);
}

console.log('\n============================');
console.log(`通過 ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
