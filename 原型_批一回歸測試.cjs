/* 原型批一回歸測試（S-00 / S-01 / S-02 / S-02b）
 *
 * 用法：node 原型_批一回歸測試.cjs
 *   需要 jsdom：npm i jsdom --prefix /tmp/x && JSDOM_PATH=/tmp/x/node_modules/jsdom node ...
 * 版面（不得橫向捲動）另見 原型_版面回歸測試.cjs，那支用真實 Chrome 量測。
 */
const fs=require('fs');
let JSDOM, VirtualConsole;
try { ({JSDOM, VirtualConsole} = require('jsdom')); }
catch (e) {
  if (process.env.JSDOM_PATH) ({JSDOM, VirtualConsole} = require(process.env.JSDOM_PATH));
  else { console.error('需要 jsdom：npm i jsdom --prefix /tmp/x 後用 JSDOM_PATH 指過來'); process.exit(2); }
}
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log('   ❌ '+m));};
const errs=[];
const dom=new JSDOM(fs.readFileSync('Tripay_原型.html','utf8'),{runScripts:'dangerously',
  virtualConsole:new VirtualConsole().on('jsdomError',e=>errs.push(e.message))});
const w=dom.window, d=w.document;
w.Element.prototype.scrollIntoView=function(){};
w.HTMLElement.prototype.scrollIntoView=function(){};

console.log('=== 載入 ===');
ok(errs.length===0,'載入有 JS 錯誤：'+errs.join(' | '));
console.log('   JS 錯誤：',errs.length);

console.log('\n=== 四個畫面都有渲染 ===');
['s00','s01','s02','s02b'].forEach(k=>{
  const n=d.querySelector('#scr-'+k);
  ok(n && n.innerHTML.trim().length>200, `#scr-${k} 沒渲染`);
  console.log(`   #scr-${k}: ${n?n.innerHTML.length:0} chars`);
});

console.log('\n=== 徽章 vs 編號清單（逐一觸發狀態後檢查）===');
const E=x=>w.eval(x);
const IDX=E('INDEX');
// 收集所有狀態下曾出現過的徽章
const seen=new Set();
const snap=()=>d.querySelectorAll('.bdg').forEach(x=>seen.add(x.dataset.copy));
snap();
E("store.s01='loading'; renderS01()"); snap();          // S-01-3
E("store.s01='empty';   renderS01()"); snap();          // S-01-4
E("store.s01='list';    renderS01()"); snap();
E("f=blankForm(store.trips[0].members); f.owner=0; renderS02()"); snap();   // S-02-11
E("f.showCur=true; renderS02()"); snap();               // S-02-8
E("f.adding=true; renderS02()"); snap();                // S-02-15
E("f.name='測試'; f.start=today(); f.end=''; f.dlg=true; renderS02()"); snap(); // S-02-20
E("fb=null; renderS02b(); fb.tonePick=true; renderS02b()"); snap();          // S-02b-10
E("fb.errs.members='測試訊息'; renderS02b()"); snap();   // S-02b-8
E("f=blankForm(); f.dlg=false; renderS02()"); E("fb=null; renderS02b()");

let missing=[],unexpected=[];
// 只檢查批一四頁；批二的編號由 原型_批二回歸測試.cjs 負責
['s00','s01','s02','s02b'].forEach(k=>IDX[k].forEach(([id,el,kind])=>{
  const has=seen.has(id);
  if((kind==='op'||kind==='st')&&!has) missing.push(id);
  if((kind==='del'||kind==='inv')&&has) unexpected.push(id);
}));
console.log('   曾出現的徽章數：',seen.size);
console.log('   應有卻從未出現：',missing.length?missing.join(','):'（無）');
console.log('   不該有卻出現：',unexpected.length?unexpected.join(','):'（無）');
ok(missing.length===0,'有區塊缺徽章：'+missing.join(','));
ok(unexpected.length===0,'已移除／隱形項不該有徽章：'+unexpected.join(','));

console.log('\n=== 模式切換 ===');
ok(d.documentElement.classList.contains('anno'),'預設應為標註模式');
d.querySelector('#modesw button[data-m="op"]').click();
ok(!d.documentElement.classList.contains('anno'),'切到操作模式後 anno class 應移除');
d.querySelector('#modesw button[data-m="anno"]').click();
ok(d.documentElement.classList.contains('anno'),'切回標註模式失敗');

console.log('\n=== S-02 建立行程 → S-01 多一張卡 ===');
const before=E('store.trips.length');
const name=d.querySelector('#s02name'); name.value='2027 沖繩四人行';
name.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(d.contains(name),'打字時 s02name 節點被重建（#13 的教訓）');
d.querySelector('#s02add').click();
const nn=d.querySelector('#s02newname'); nn.value='阿華'; nn.dispatchEvent(new w.Event('input',{bubbles:true}));
d.querySelector('#s02adddo').click();
ok(E('f.members.length')===1,'新增成員失敗，members='+E('f.members.length'));
d.querySelector('#s02go').click();
ok(!!d.querySelector('#s02dlgyes'),'回程留空應跳單日確認');
console.log('   單日確認對話框：',!!d.querySelector('#s02dlgyes'));
d.querySelector('#s02dlgyes').click();
console.log('   trips：',before,'→',E('store.trips.length'));
ok(E('store.trips.length')===before+1,'行程沒有被建立');
ok(d.querySelector('#scr-s01').innerHTML.includes('2027 沖繩四人行'),'S-01 沒出現新卡片');
const added=E('store.trips[store.trips.length-1]');
ok(added.end===added.start,'單日行程的回程應等於出發日');

console.log('\n=== 色調由行程名判定 ===');
const tone=n=>w.eval('toneFor('+JSON.stringify(n)+')');
ok(tone('2027 沖繩四人行')===E("TONES.find(x=>x.k==='沖繩').g"),'沖繩沒對到色調');
ok(tone('隨便亂打')===E('FALLBACK_TONE'),'對不到關鍵字應落回預設色調');
console.log('   沖繩 →',tone('2027 沖繩四人行').slice(0,34)+'…');

console.log('\n=== 成員識別三層 fallback ===');
ok(E("firstGrapheme('阿華')")==='阿','firstGrapheme 取字失敗');
ok(E("firstGrapheme('👨‍👩‍👧 一家')")==='👨‍👩‍👧','ZWJ 組合被切斷');
console.log('   ZWJ：',JSON.stringify(E("firstGrapheme('👨‍👩‍👧 一家')")));

console.log('\n=== S-02b 支付方式：已被使用的不可刪 ===');
E("editTripId='t1'; fb=null; renderS02b()");
const paysBefore=E('fb.pays.length');
d.querySelector('[data-rmpay="0"]').click();     // 現金：3 筆在用
ok(E('fb.pays.length')===paysBefore,'已被使用的支付方式竟然被刪掉了');
console.log('   刪「現金」後仍為',E('fb.pays.length'),'項；提示：',!!d.querySelector('#s02btoast .toast'));
ok(!!d.querySelector('#s02btoast .toast'),'應顯示不可刪的提示');
const np=d.querySelector('#s02bnewpay'); np.value='交通卡'; np.dispatchEvent(new w.Event('input',{bubbles:true}));
d.querySelector('#s02baddpay').click();
ok(E("fb.pays.includes('交通卡')"),'新增支付方式失敗');
d.querySelector('[data-rmpay="2"]').click();
ok(!E("fb.pays.includes('交通卡')"),'沒被使用的支付方式應可刪');
console.log('   新增後可刪：',!E("fb.pays.includes('交通卡')"));

console.log('\n=== S-02b 已有紀錄的成員不可移除 ===');
E('fb=null; renderS02b()');
const memBefore=E('fb.members.length');
d.querySelector('[data-rm="b:0"]').click();      // Rozi used=1
ok(E('fb.members.length')===memBefore,'已有紀錄的成員竟被移除');
ok(!!E('fb.errs.members'),'應出現不可移除的說明');
console.log('   訊息：',(E('fb.errs.members')||'').slice(0,28)+'…');

console.log('\n=== 幣別搜尋 ===');
E('f=blankForm(); renderS02()');
d.querySelector('[data-curtoggle="f"]').click();
ok(!!d.querySelector('[data-curq="f"]'),'幣別下拉沒展開');
const cq=d.querySelector('[data-curq="f"]'); cq.value='泰'; cq.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(d.contains(cq),'搜尋框在輸入時被重建');
const opts=[...d.querySelectorAll('[data-cur]')].map(x=>x.dataset.cur);
console.log('   搜「泰」→',opts.join(','));
ok(opts.length===1&&opts[0]==='f:THB','泰銖沒被搜到，結果='+opts.join(','));

console.log('\n=== S-02b-12 現金匯率（#16 收斂後）===');
const rateRows = () => [...d.querySelectorAll('#scr-s02b .raterow')]
  .map(r => ({ side:r.dataset.side, code:r.querySelector('.code').textContent, val:r.querySelector('input').value }));
const setCur = (tripId, code) => E(`editTripId='${tripId}'; store.trips.find(x=>x.id==='${tripId}').currency='${code}';
  store.trips.find(x=>x.id==='${tripId}').rateTwd=undefined; store.trips.find(x=>x.id==='${tripId}').rateFor=undefined;
  fb=null; renderS02b()`);
const typeRate = (side, v) => { const el = d.querySelector('#rate-' + side);
  el.value = v; el.dispatchEvent(new w.Event('input',{bubbles:true})); return el; };

setCur('t1','KRW');
let rows = rateRows();
console.log('   KRW 兩列：', rows.map(r => `${r.code}=${r.val||'(空)'}`).join(' / '));
ok(d.querySelectorAll('#scr-s02b .rateinput').length === 2, '該區塊的輸入框應為 2 個，實際 ' + d.querySelectorAll('#scr-s02b .rateinput').length);
ok(!d.querySelector('#rateDirect') && !d.querySelector('#rateNote'), '不該再有唯讀的匯率顯示列');
ok(!/≈/.test(d.querySelector('#scr-s02b').innerHTML), '不該再出現「≈」的唯讀算式');
ok(rows[0].side === 'twd' && rows[0].val === '1', 'KRW：「1」應在台幣欄且排在上面');
const keptEl = typeRate('for','45');
ok(d.contains(keptEl), '匯率欄在輸入時被重建');
console.log('   KRW 填 45 → 內部匯率', E('rateOf(fb)'), '（1 台幣換得到幾韓元）');
ok(Math.abs(E('rateOf(fb)') - 45) < 1e-9, 'KRW 匯率應為 45，實際 ' + E('rateOf(fb)'));

setCur('t2','JPY');
rows = rateRows();
console.log('   JPY 兩列：', rows.map(r => `${r.code}=${r.val||'(空)'}`).join(' / '));
ok(rows[0].side === 'for' && rows[0].val === '1', 'JPY：「1」應在外幣欄且排在上面');
typeRate('twd','0.22');
const twdPer = E('twdPerForeign(fb)');
console.log('   JPY 台幣欄填 0.22 → 1 JPY =', twdPer, '台幣');
ok(Math.abs(twdPer - 0.22) < 1e-9, 'JPY 應等價於 1 JPY = 0.22 台幣，實際 ' + twdPer);
ok(d.querySelector('#rate-twd').value === '0.22', '台幣欄應接受小數');

setCur('t3','THB');
rows = rateRows();
console.log('   THB 兩列：', rows.map(r => `${r.code}=${r.val||'(空)'}`).join(' / '));
ok(rows[0].side === 'for' && rows[0].val === '1', 'THB：「1」應在外幣欄');

console.log('\n=== 換錢金額寫法與「1 / 45」等價 ===');
setCur('t1','KRW');
typeRate('for','45');
const rA = E('rateOf(fb)');
typeRate('twd','10000'); typeRate('for','450000');
const rB = E('rateOf(fb)');
console.log('   1 / 45 →', rA, '｜ 10000 / 450000 →', rB);
ok(Math.abs(rA - rB) < 1e-9, '兩種填法應算出同一個匯率');

console.log('\n=== 兩欄都接受小數 ===');
typeRate('twd','1.5'); typeRate('for','67.5');
console.log('   1.5 / 67.5 →', E('rateOf(fb)'));
ok(d.querySelector('#rate-twd').value === '1.5' && d.querySelector('#rate-for').value === '67.5', '小數被吃掉了');
ok(Math.abs(E('rateOf(fb)') - 45) < 1e-9, '小數輸入算出的匯率不對');

console.log('\n=== 匯率區塊的灰字只留兩句 ===');
setCur('t1','KRW');
const rateHtml = d.querySelector('#scr-s02b').innerHTML;
ok(rateHtml.includes('在當地換錢後填一次就好'), '缺少區塊副標');
ok(rateHtml.includes('刷卡不用這個匯率，直接填台幣'), '缺少底部說明');
ok(!rateHtml.includes('現金與儲值卡用它換算'), '舊的重複灰字沒清掉');
console.log('   副標與底部說明都在，舊句已清');

console.log('\n=== 「這是我」標記常駐（不靠灰字說明）===');
E("f=blankForm(store.trips[0].members); renderS02()");
const chips=d.querySelectorAll('#scr-s02 .selchip');
console.log('   成員',E('f.members.length'),'人，常駐標記',chips.length,'個；已選',d.querySelectorAll('#scr-s02 .selchip.on').length);
ok(chips.length===E('f.members.length'),'每一列都要有常駐的「這是我」標記');
ok(!d.querySelector('#scr-s02').innerHTML.includes('點成員，標記哪位是你'),'說明性灰字沒有砍乾淨');
d.querySelector('[data-me="f:1"]').click();
ok(E('f.owner')===1,'點列沒有切換 owner');
ok(d.querySelectorAll('#scr-s02 .selchip.on').length===1,'選取後應只有一個填實');

console.log('\n=== 砍掉的灰字不得再出現 ===');
const html=d.querySelector('#scr-s02').innerHTML+d.querySelector('#scr-s02b').innerHTML;
const gone=['封面會依行程名自動套','預設今天','最多 10 個字','色調＝目的地色系預設盤','最後一個是','統計卡的「我的花費」','長邊 1600px'];
gone.forEach(g=>ok(!html.includes(g),'灰字未清除：'+g));
console.log('   逐條確認已清除：',gone.length,'條');
ok(d.querySelector('#scr-s02').innerHTML.includes('可留空'),'「可留空」應保留');
ok(d.querySelector('#scr-s02b').innerHTML.includes('只有你和拿到分享連結的人看得到'),'隱私告知應保留');

console.log('\n════════════════════════════');
console.log(`通過 ${pass}　失敗 ${fail}`);
process.exit(fail?1:0);
