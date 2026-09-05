/* 原型批三回歸測試（S-02c / S-03b / S-03c / S-06 / S-07）＋ #23
 *
 * 用法：node 原型_批三回歸測試.cjs
 *   需要 jsdom：npm i jsdom --prefix /tmp/x && JSDOM_PATH=/tmp/x/node_modules/jsdom node ...
 */
const fs=require('fs');
let JSDOM, VirtualConsole;
try { ({JSDOM, VirtualConsole} = require('jsdom')); }
catch (e) {
  if (process.env.JSDOM_PATH) ({JSDOM, VirtualConsole} = require(process.env.JSDOM_PATH));
  else { console.error('需要 jsdom'); process.exit(2); }
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('   ❌ '+m));};
const errs=[];
const dom=new JSDOM(fs.readFileSync('Tripay_原型.html','utf8'),{runScripts:'dangerously',
  virtualConsole:new VirtualConsole().on('jsdomError',e=>errs.push(e.message))});
const w=dom.window,d=w.document,E=x=>w.eval(x);
w.Element.prototype.scrollIntoView=function(){};
const H=k=>d.querySelector('#scr-'+k).innerHTML;

console.log('=== 載入 ==='); ok(errs.length===0,'JS 錯誤：'+errs.slice(0,2).join('|')); console.log('   錯誤',errs.length);

console.log('\n=== 批三四頁都有渲染 ===');
['s02c','s03b','s06','s07'].forEach(k=>{
  const n=d.querySelector('#scr-'+k);
  ok(n && n.innerHTML.length>800, `#scr-${k} 沒渲染`);
  console.log(`   #scr-${k}: ${n?n.innerHTML.length:0} chars`);});

console.log('\n=== #23 Google 登入鈕 ===');
const btn=d.querySelector('#s00login');
const fills=[...btn.querySelectorAll('path')].map(p=>p.getAttribute('fill')).filter(Boolean);
console.log('   文案:',btn.textContent.trim(),'｜fill:',fills.join(','));
ok(btn.textContent.trim()==='用 Google 繼續','文案應為「用 Google 繼續」');
ok(new Set(fills).size===4,'應為官方四色，實際 '+new Set(fills).size+' 色');
ok(['#4285F4','#34A853','#FBBC05','#EA4335'].every(c=>fills.includes(c)),'四色須與官方一致');
ok(!btn.innerHTML.includes('currentColor'),'不得被 currentColor 壓成單色');
ok(!/[◉◎●○]/.test(btn.textContent),'不得再用文字符號充當 icon');

console.log('\n=== #23-7 S-02b-13 排在成員之後 ===');
const html02b=H('s02b');
const iMember=html02b.indexOf('誰一起去'), iMode=html02b.indexOf('這趟怎麼結算');
console.log('   成員位置',iMember,'｜結算模式位置',iMode);
ok(iMember>0 && iMode>iMember,'結算模式必須排在成員之後（選中心人依賴成員）');
const iPays=html02b.indexOf('這趟的支付方式'), iRate=html02b.indexOf('這趟的現金匯率');
ok(iMode<iPays && iPays<iRate,'一趟設一次的三項應相鄰成組');

console.log('\n=== #23-8 S-04 誰付的排在分帳方式之前 ===');
E("(function(){var M=tripOf('t1').members.map(m=>m.id);g=exp({twdAmt:'1000',type:'shared',parts:M,payer:M[0]});renderS04();})()");
const h04=H('s04');
const iPayer=h04.indexOf('誰付的'), iSplit=h04.indexOf('分帳方式');
console.log('   誰付的位置',iPayer,'｜分帳方式位置',iSplit);
ok(iPayer>0 && iPayer<iSplit,'「只算一個人」預設帶付款人，所以誰付的要在分帳方式之前');

console.log('\n=== S-02c 成員識別 ===');
ok(H('s02c').includes('三層 fallback')||H('s02c').includes('fallback'),'應有三層 fallback 區');
ok(d.querySelectorAll('#scr-s02c .avatar').length>=4,'應列出各層的識別樣式');
ok(d.querySelectorAll('#scr-s02c .avatar.letter').length>=1,'應有名字首字的填色圓底');
console.log('   識別樣式:',d.querySelectorAll('#scr-s02c .avatar').length,'個（含首字圓底',d.querySelectorAll('#scr-s02c .avatar.letter').length,'個）');
ok(E("firstGrapheme('👨‍👩‍👧 一家')")==='👨‍👩‍👧','ZWJ 組合不得被切斷');

console.log('\n=== S-03c 刪除確認：打對字才可按 ===');
E("store.s03bView='del'; store.delText=''; renderS03b()");
let del=d.querySelector('#scr-s03b .btn.dg');
console.log('   未輸入時 disabled:',del.hasAttribute('disabled'));
ok(del.hasAttribute('disabled'),'沒打字時刪除鈕應不可按');
const inp=d.querySelector('#delconfirm');
inp.value='刪'; inp.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(d.querySelector('#scr-s03b .btn.dg').disabled,'打錯字仍不可按');
ok(d.contains(inp),'打字時輸入框不得被重建');
inp.value='刪除'; inp.dispatchEvent(new w.Event('input',{bubbles:true}));
console.log('   打對「刪除」後 disabled:',d.querySelector('#scr-s03b .btn.dg').disabled);
ok(!d.querySelector('#scr-s03b .btn.dg').disabled,'打對「刪除」才可按');
// #25-6 文案改為「請輸入「刪除」兩個字」（「二字」是書面語）。
// 這條測試守的是「要打的是『刪除』兩個字，不是行程名」，那件事沒變。
ok(H('s03b').includes('請輸入「刪除」兩個字'),'提示應為輸入「刪除」兩個字，不是行程名');

console.log('\n=== S-06 分享頁與 S-03 資料連動 ===');
E("store.s03bView='share'; store.expenses.t1=demoExpenses(); render()");
const total=E("tripSummary('t1').total");
ok(H('s06').includes(String(total.toLocaleString())),'分享頁總花費應與行程頁同一個算法');
console.log('   總花費一致:',total.toLocaleString());
ok(!H('s06').includes('待補填'),'不得再有「待補填」badge');
ok(H('s06').includes('還沒填'),'還沒填的列應顯示「還沒填」');
ok(H('s06').includes('exprow pend'),'還沒填的列應有橘紅左邊框（讀碼發現 #6）');
ok(!/外幣格|KRW<\/span>\s*<\/div>\s*<div><b class="money">—/.test(H('s06')),'廢版位的外幣格應已移除');

console.log('\n=== S-07 設定是四個新畫面的入口 ===');
// #30-4 S-07-4「我的資料」整段從稿上拿掉——Phase 1 不會出這一段，留著只會讓 Rozi
// 每次檢視都要重新想一次「這個到底要不要」。Phase 2 的位置等批四畫 S-08～S-11 時再標。
['通訊錄','卡片管理','帳單週期'].forEach(x=>ok(!H('s07').includes(x),`設定頁不該還有「${x}」`));
E("store.s07dlg=false; renderS07()");
ok(!d.querySelector('#scr-s07 .dlg'),'登出確認框預設不顯示');
d.querySelector('#s07logout2').click();
ok(!!d.querySelector('#scr-s07 .dlg'),'點登出應跳確認框');
console.log('   登出確認框:',!!d.querySelector('#scr-s07 .dlg'));
ok(!H('s07').includes('btn dg" id="s07logout2"'),'登出可復原，不該用實心填底');


console.log('\n=== #24 S-05 結算頁重新對齊 ===');
E("window.M=tripOf('t1').members.map(m=>m.id)");
const setMode=(m)=>E(`tripOf('t1').settleMode='${m}'; tripOf('t1').hubMember=${m==='hub'?"M[0]":'null'}`);
const base=()=>E("store.expenses.t1=[exp({twdAmt:'8000',pay:'card',type:'shared',parts:M,payer:M[0]}),exp({twdAmt:'2000',pay:'card',type:'shared',parts:M,payer:M[1]})]");

// 5：空引導與 Excel 提醒都不在了
base(); setMode('direct'); E("store.s05='pending'; renderS05()");
const h1=()=>d.querySelector('#scr-s05').innerHTML;
ok(!h1().includes('準備好了嗎'),'S-05-1 空引導應已移除');
E("store.s05='partial'; store.s05open=true; renderS05()");
ok(!d.querySelector('#scr-s05').innerHTML.includes('Excel'),'S-05-12 Excel 提醒應已移除');
console.log('   空引導與 Excel 提醒都不在了 ✓');

// 2：未結算態顯示完整轉帳明細
E("store.s05='pending'; renderS05()");
ok(h1().includes('現在的狀況'),'標題應為「現在的狀況」');
ok(h1().includes('還會變 —— 之後記帳會影響這裡'),'說明文案應已更新');
ok(h1().includes('結算後金額固定，可以逐筆標記付清'),'按鈕下方應說明結算會做什麼');
ok(d.querySelectorAll('#scr-s05 .txrow').length>0,'未結算態應顯示轉帳明細');
console.log('   未結算轉帳列數:',d.querySelectorAll('#scr-s05 .txrow').length);

// 3：切換模式時明細變、淨額不變
const netD=E("settleTrip('t1').net"); const txD=d.querySelectorAll('#scr-s05 .txrow').length;
const flatD=h1().includes('txhead');
setMode('hub'); E("renderS05()");
const netH=E("settleTrip('t1').net");
console.log('   direct 淨額', JSON.stringify(netD), '\n   hub    淨額', JSON.stringify(netH));
ok(JSON.stringify(netD)===JSON.stringify(netH),'切換模式時每人淨額必須完全相同');
ok(!flatD && h1().includes('txhead'),'hub 才有「都跟 X 結算」的標頭，direct 沒有');

// 3b：hub 分兩段、direct 平鋪
E("store.expenses.t1=[exp({twdAmt:'8000',pay:'card',type:'shared',parts:M,payer:M[0]}),exp({twdAmt:'2000',pay:'card',type:'shared',parts:M,payer:M[1]}),exp({twdAmt:'1200',pay:'card',type:'shared',parts:M,payer:M[2]})]");
setMode('hub'); E("renderS05()");
const secs=[...d.querySelectorAll('#scr-s05 .txsec')].map(x=>x.textContent.trim());
console.log('   hub 分段:', secs.join(' / '));
ok(h1().includes('都跟'),'hub 應有「都跟 X 結算」標頭');
setMode('direct'); E("renderS05()");
ok(!h1().includes('都跟') && d.querySelectorAll('#scr-s05 .txsec').length===0,'direct 應為平鋪，無分段標題');
console.log('   direct 分段數:',d.querySelectorAll('#scr-s05 .txsec').length);

// 3c：邊界
setMode('hub'); base(); E("renderS05()");
const s1=[...d.querySelectorAll('#scr-s05 .txsec')].map(x=>x.textContent.trim());
console.log('   中心人只收不撥 → 分段:',s1.join(' / ')||'（只有一段或無）');
ok(s1.length<=1,'中心人只收不撥時不得留空標題');
const hubName=E("tripOf('t1').members[0].name");
ok(![...d.querySelectorAll('#scr-s05 .txrow')].some(r=>{
  const w=[...r.querySelectorAll('.who')].map(x=>x.textContent);
  return w.length===2 && w[0]===w[1];}),'中心人不得出現在自己給自己的列');
E("store.expenses.t1=[]; renderS05()");
console.log('   全員打平:',d.querySelector('#scr-s05 .txempty')?d.querySelector('#scr-s05 .txempty').textContent.trim():'（無）');
ok(!!d.querySelector('#scr-s05 .txempty'),'全員打平時應顯示「大家剛好打平」');

// 3d：已結算與未結算用同一套呈現
base(); setMode('hub'); E("store.s05='pending'; renderS05()");
const previewHead=d.querySelector('#scr-s05 .txhead').textContent.trim();
E("store.s05='partial'; renderS05()");
const settledHead=d.querySelector('#scr-s05 .txhead').textContent.trim();
console.log('   預覽標頭 =',previewHead,'｜已結算標頭 =',settledHead);
ok(previewHead===settledHead,'已結算的明細與預覽必須用同一套呈現');
ok(d.querySelectorAll('#scr-s05 .clearbtn, #scr-s05 .cleared').length>0,'已結算態才有標記付清');
E("store.s05='pending'; renderS05()");
ok(d.querySelectorAll('#scr-s05 .clearbtn').length===0,'未結算的預覽不該有標記付清');

// 4：有未定案的帳時金額前有「約」
E("store.expenses.t1=demoExpenses(); store.s05='pending'; renderS05()");
const hasUn=E("tripSummary('t1').unsettledList.length")>0;
console.log('   有未定案:',hasUn,'｜預覽出現「約」:',d.querySelector('#scr-s05 .approx')!==null);
ok(hasUn && d.querySelector('#scr-s05 .approx'),'有未定案時預覽金額前應有「約」');
base(); E("renderS05()");
ok(!d.querySelector('#scr-s05 .approx'),'沒有未定案時不該出現「約」');

// #24-4：人話淨額補對象
setMode('direct'); E("store.s05='partial'; store.s05open=true; renderS05()");
const h11=d.querySelector('#scr-s05').innerHTML;
ok(/給 <span|給你/.test(h11),'人話淨額應列出對象');
console.log('   淨額列有對象 ✓');
E("store.expenses.t1=demoExpenses(); tripOf('t1').settleMode='direct'; tripOf('t1').hubMember=null; store.s05='pending'; store.s05open=false; render()");

console.log('\n=== 徽章 vs 編號清單（批三四頁）===');
const IDX=E('INDEX'); const seen=new Set();
const snap=()=>d.querySelectorAll('.bdg').forEach(x=>seen.add(x.dataset.copy));
E("store.s03bView='share'; store.s07dlg=true; render()"); snap();
E("store.s03bView='del'; renderS03b()"); snap();
E("store.expenses.t1=[]; renderS06()"); snap();
E("store.expenses.t1=demoExpenses(); tripOf('t1').settleMode='direct'; renderS06()"); snap();
// #29-10 S-06 的統計卡與 S-03 共用，每人分擔列只在展開時才在 DOM 上
E("store.s06StatOpen=true; renderS06()"); snap();
E("store.s06StatOpen=false; renderS06()"); snap();
let missing=[],unexpected=[];
['s02c','s03b','s06','s07'].forEach(k=>IDX[k].forEach(([id,el,kind])=>{
  const has=seen.has(id);
// #34-6 hid＝暫時隱藏（程式碼還在、由開關關掉），與 del 一樣不該出現徽章
  if((kind==='op'||kind==='st')&&!has) missing.push(id);
  if((kind==='del'||kind==='inv')&&has) unexpected.push(id);}));
console.log('   應有卻從未出現：',missing.length?missing.join(','):'（無）');
console.log('   不該有卻出現：',unexpected.length?unexpected.join(','):'（無）');
ok(missing.length===0,'缺徽章：'+missing.join(','));
ok(unexpected.length===0,'不該有徽章：'+unexpected.join(','));

console.log('\n════════════════════════════');
console.log(`通過 ${pass}　失敗 ${fail}`);
process.exit(fail?1:0);
