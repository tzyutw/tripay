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
ok(H('s03b').includes('刪除」二字'),'提示應為輸入「刪除」二字，不是行程名');

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
['通訊錄','卡片管理','帳單週期'].forEach(x=>ok(H('s07').includes(x),`設定頁應有「${x}」入口`));
E("store.s07dlg=false; renderS07()");
ok(!d.querySelector('#scr-s07 .dlg'),'登出確認框預設不顯示');
d.querySelector('#s07logout2').click();
ok(!!d.querySelector('#scr-s07 .dlg'),'點登出應跳確認框');
console.log('   登出確認框:',!!d.querySelector('#scr-s07 .dlg'));
ok(!H('s07').includes('btn dg" id="s07logout2"'),'登出可復原，不該用實心填底');

console.log('\n=== 徽章 vs 編號清單（批三四頁）===');
const IDX=E('INDEX'); const seen=new Set();
const snap=()=>d.querySelectorAll('.bdg').forEach(x=>seen.add(x.dataset.copy));
E("store.s03bView='share'; store.s07dlg=true; render()"); snap();
E("store.s03bView='del'; renderS03b()"); snap();
E("store.expenses.t1=[]; renderS06()"); snap();
E("store.expenses.t1=demoExpenses(); tripOf('t1').settleMode='direct'; renderS06()"); snap();
let missing=[],unexpected=[];
['s02c','s03b','s06','s07'].forEach(k=>IDX[k].forEach(([id,el,kind])=>{
  const has=seen.has(id);
  if((kind==='op'||kind==='st')&&!has) missing.push(id);
  if((kind==='del'||kind==='inv')&&has) unexpected.push(id);}));
console.log('   應有卻從未出現：',missing.length?missing.join(','):'（無）');
console.log('   不該有卻出現：',unexpected.length?unexpected.join(','):'（無）');
ok(missing.length===0,'缺徽章：'+missing.join(','));
ok(unexpected.length===0,'不該有徽章：'+unexpected.join(','));

console.log('\n════════════════════════════');
console.log(`通過 ${pass}　失敗 ${fail}`);
process.exit(fail?1:0);
