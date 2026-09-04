/* 原型輸入欄位回歸測試
 *
 * 起因：2026-09-04 Rozi 在原型金額欄輸入 2389，畫面顯示 9832（阻斷測試）。
 * 根因：每次 input 事件都重繪整塊 DOM，輸入框被重建；舊碼想用 setSelectionRange
 *       還原游標，但 <input type="number"> 不支援 selection API，會拋
 *       InvalidStateError 被 try/catch 吞掉，游標停在 0 → 每個新字插到最前面。
 * 修法：打字時走 refresh()，只更新衍生內容（自動值、提示、比對列、即時結果），
 *       輸入框節點完全不動。
 *
 * 用法：node 原型_輸入回歸測試.cjs [檔案路徑]
 * 這份測試在修正前會失敗並重現「9832」，修正後 34 項全過。
 */
const fs = require('fs');
// jsdom 不是專案相依（只有這個測試用得到）。找不到就給指引，不要讓人卡住。
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  const alt = process.env.JSDOM_PATH;
  if (alt) { ({ JSDOM } = require(alt)); }
  else {
    console.error('需要 jsdom。任選一種：');
    console.error('  npm i -D jsdom            （加進專案）');
    console.error('  npm i jsdom --prefix /tmp/x && JSDOM_PATH=/tmp/x/node_modules/jsdom node ' + __filename.split('/').pop());
    process.exit(2);
  }
}

const file = process.argv[2] || require('path').join(__dirname, '分帳模型原型.html');
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; } else { fail++; console.log('   ❌ ' + msg); } };

function boot() {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { runScripts: 'dangerously' });
  return dom.window;
}

/* 模擬瀏覽器：在游標處插入字元、派發 input，再回報「事件後這個節點還在不在」 */
function typeInto(win, sel, text, startCaret) {
  const doc = win.document;
  let el = doc.querySelector(sel);
  if (!el) return { ok: false, reason: 'selector 找不到: ' + sel };
  el.focus();
  let caret = startCaret == null ? el.value.length : startCaret;
  const replaced = [];
  for (const ch of text) {
    el.value = el.value.slice(0, caret) + ch + el.value.slice(caret);
    caret++;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    // 事件處理完後，原節點是否還在文件裡？被重建就代表游標會被瀏覽器重置
    // 忠實模擬瀏覽器：節點被重建 → 焦點與選取位置一併消失。
    // <input type="number"> 不支援 selection API，舊碼的 setSelectionRange 會拋錯被吞掉，
    // 游標因此停在 0，下一個字就插到最前面（使用者看到的「9832」）。
    if (!doc.contains(el)) { replaced.push(ch); el = doc.querySelector(sel); if (!el) break; caret = 0; }
  }
  return { ok: true, value: el ? el.value : null, caret, replaced, el };
}

function backspace(win, sel, times) {
  const doc = win.document;
  let el = doc.querySelector(sel);
  let caret = el.value.length;
  for (let i = 0; i < times; i++) {
    if (caret === 0) break;
    el.value = el.value.slice(0, caret - 1) + el.value.slice(caret);
    caret--;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    if (!doc.contains(el)) { el = doc.querySelector(sel); caret = 0; }
  }
  return { value: el.value, caret, stillThere: doc.contains(el) };
}

function scenario(label, fn) { console.log('\n── ' + label + ' ──'); fn(); }

/* ══ 測試 ══ */
console.log('測試檔案：' + file);

scenario('版本一 · 台幣總額輸入 2389', () => {
  const win = boot();
  const r = typeInto(win, '#f-twd', '2389');
  console.log('   value =', JSON.stringify(r.value), '| caret =', r.caret, '| 節點被重建次數 =', r.replaced.length);
  ok(r.value === '2389', `台幣總額應為 "2389"，實際 "${r.value}"`);
  ok(r.caret === 4, `游標應在末端 4，實際 ${r.caret}`);
  ok(r.replaced.length === 0, `輸入中節點不得被重建（被重建 ${r.replaced.length} 次）`);
});

scenario('版本一 · 外幣總額輸入 45000', () => {
  const win = boot();
  const r = typeInto(win, '#f-for', '45000');
  console.log('   value =', JSON.stringify(r.value), '| caret =', r.caret, '| 重建 =', r.replaced.length);
  ok(r.value === '45000', `外幣總額應為 "45000"，實際 "${r.value}"`);
  ok(r.caret === 5, `游標應在末端 5，實際 ${r.caret}`);
  ok(r.replaced.length === 0, '外幣總額輸入中節點被重建');
});

scenario('版本一 · 標題（text）輸入', () => {
  const win = boot();
  const r = typeInto(win, '#f-title', '藥妝店');
  console.log('   value =', JSON.stringify(r.value), '| 重建 =', r.replaced.length);
  ok(r.value === '藥妝店', `標題應為 "藥妝店"，實際 "${r.value}"`);
  ok(r.replaced.length === 0, '標題輸入中節點被重建');
});

scenario('版本一 · 各自金額（切到「各付各的」後逐欄輸入）', () => {
  const win = boot();
  const doc = win.document;
  doc.querySelector('#f-twd').value = '3308';
  doc.querySelector('#f-twd').dispatchEvent(new win.Event('input', { bubbles: true }));
  doc.querySelector('[data-act="type"][data-v="individual"]').click();
  doc.querySelector('[data-act="payer"][data-id="ning"]').click();
  const ids = ['ning', 'ziyu', 'xiu', 'mei'];
  const vals = ['2389', '45000', '100', '7'];
  ids.forEach((id, i) => {
    const sel = `input[data-act="indiv"][data-id="${id}"]`;
    const r = typeInto(win, sel, vals[i]);
    console.log(`   ${id}: value = ${JSON.stringify(r.value)} | caret = ${r.caret} | 重建 = ${r.replaced.length}`);
    ok(r.value === vals[i], `${id} 應為 "${vals[i]}"，實際 "${r.value}"`);
    ok(r.caret === vals[i].length, `${id} 游標應在末端 ${vals[i].length}，實際 ${r.caret}`);
    ok(r.replaced.length === 0, `${id} 輸入中節點被重建 ${r.replaced.length} 次`);
  });
});

scenario('版本一 · 刪除（Backspace）', () => {
  const win = boot();
  typeInto(win, '#f-twd', '2389');
  const r = backspace(win, '#f-twd', 2);
  console.log('   刪 2 次後 value =', JSON.stringify(r.value), '| caret =', r.caret);
  ok(r.value === '23', `刪 2 次應剩 "23"，實際 "${r.value}"`);
  ok(r.caret === 2, `游標應在 2，實際 ${r.caret}`);
  ok(r.stillThere, '刪除過程節點被重建');
});

scenario('版本一 · 中間插入', () => {
  const win = boot();
  typeInto(win, '#f-twd', '2389');
  const r = typeInto(win, '#f-twd', '55', 2);   // 在 "23|89" 中間插入 55
  console.log('   插入後 value =', JSON.stringify(r.value), '| caret =', r.caret);
  ok(r.value === '235589', `應為 "235589"，實際 "${r.value}"`);
  ok(r.caret === 4, `游標應在 4，實際 ${r.caret}`);
  ok(r.replaced.length === 0, '中間插入時節點被重建');
});

scenario('自動均分在連續輸入時不覆蓋使用者的字', () => {
  const win = boot();
  const doc = win.document;
  doc.querySelector('#f-twd').value = '3308';
  doc.querySelector('#f-twd').dispatchEvent(new win.Event('input', { bubbles: true }));
  doc.querySelector('[data-act="type"][data-v="individual"]').click();
  doc.querySelector('[data-act="payer"][data-id="ning"]').click();
  const sel = 'input[data-act="indiv"][data-id="ning"]';
  const r = typeInto(win, sel, '1000');
  const others = ['ziyu', 'xiu', 'mei'].map(id =>
    doc.querySelector(`input[data-act="indiv"][data-id="${id}"]`));
  console.log('   Ning value =', JSON.stringify(r.value));
  console.log('   其餘三人 value（應為空）=', JSON.stringify(others.map(e => e.value)));
  console.log('   其餘三人 placeholder（自動值）=', JSON.stringify(others.map(e => e.placeholder)));
  ok(r.value === '1000', `Ning 應為 "1000"，實際 "${r.value}"`);
  ok(others.every(e => e.value === ''), '自動均分把值寫進了其他人的 value（應只改 placeholder）');
  ok(others.every(e => /^\d+$/.test(e.placeholder)), '其他人的自動值沒有出現在 placeholder');
  ok(others.some(e => e.classList.contains('auto')), '自動欄位沒有套上 .auto 樣式');
});

scenario('版本二 · 同樣可連續輸入', () => {
  const win = boot();
  const doc = win.document;
  doc.querySelector('#vsw button[data-v="v2"]').click();
  const r1 = typeInto(win, '#f-twd', '2389');
  ok(r1.value === '2389', `v2 台幣總額應為 "2389"，實際 "${r1.value}"`);
  ok(r1.replaced.length === 0, 'v2 台幣總額輸入中節點被重建');
  doc.querySelector('#f-twd').value = '3308';
  doc.querySelector('#f-twd').dispatchEvent(new win.Event('input', { bubbles: true }));
  doc.querySelector('[data-act="how"][data-v="each"]').click();
  doc.querySelector('[data-act="payer"][data-id="ning"]').click();
  const r2 = typeInto(win, 'input[data-act="indiv"][data-id="ziyu"]', '45000');
  console.log('   v2 各自金額 value =', JSON.stringify(r2.value), '| 重建 =', r2.replaced.length);
  ok(r2.value === '45000', `v2 各自金額應為 "45000"，實際 "${r2.value}"`);
  ok(r2.replaced.length === 0, 'v2 各自金額輸入中節點被重建');
});

console.log('\n════════════════════════════');
console.log(`通過 ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
