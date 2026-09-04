/* 原型批二回歸測試（S-03 / S-03d / S-04 / S-05）
 *
 * 行為以 規格_金額未定案與幣別.md 為準，逐節斷言：
 *   §2.2 比例回推換算｜§2.3 外幣總額空白且有人沒填就不猜｜§2b 現金匯率（刷卡不套用）
 *   §3 未定案判定（0／1 人不標記，2 人以上標記）｜§4 四種存檔提示
 *   §5.1 「約」只標受影響的人｜§5.2 同筆只算一次｜§5.4 消費列樣式｜§5.5 placeholder
 *   §5.6 已結算不提醒｜§6 結算前檢查層（「就這樣結算」必須真的能結算）
 * 另檢查批二四頁的徽章與編號清單逐一對得起來。
 *
 * 用法：node 原型_批二回歸測試.cjs
 *   需要 jsdom：npm i jsdom --prefix /tmp/x && JSDOM_PATH=/tmp/x/node_modules/jsdom node ...
 */
const fs=require('fs');let JSDOM, VirtualConsole;
try { ({JSDOM, VirtualConsole} = require('jsdom')); }
catch (e) {
  if (process.env.JSDOM_PATH) ({JSDOM, VirtualConsole} = require(process.env.JSDOM_PATH));
  else { console.error('需要 jsdom：npm i jsdom --prefix /tmp/x 後用 JSDOM_PATH 指過來'); process.exit(2); }
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('   ❌ '+m));};
const errs=[];
const dom=new JSDOM(fs.readFileSync('Tripay_原型.html','utf8'),{runScripts:'dangerously',
  virtualConsole:new VirtualConsole().on('jsdomError',e=>errs.push(e.message))});
const w=dom.window,d=w.document,E=x=>w.eval(x);
w.Element.prototype.scrollIntoView=function(){};
const H=k=>d.querySelector('#scr-'+k).innerHTML;

console.log('=== 載入 ==='); ok(errs.length===0,'JS 錯誤：'+errs.slice(0,2).join('|')); console.log('   錯誤',errs.length);

console.log('\n=== §3 未定案判定：0/1/2/3 人未輸入 ===');
const mk=(n)=>E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  var ind={}; for(var i=0;i<4-${n};i++) ind[M[i]]=String(10000);
  var e=exp({title:'測',forAmt:'40000',twdAmt:'1000',pay:'card',type:'individual',parts:M,indiv:ind,payer:M[0]});
  var c=calc(e,t); return {blanks:c.blanks.length, est:Object.keys(c.estimated).length, uns:c.unsettled};})()`);
[0,1,2,3].forEach(n=>{const r=mk(n);
  console.log(`   ${n} 人未輸入 → 標記 ${r.est} 人，未定案 ${r.uns}`);
  ok(r.blanks===n,`未輸入人數應為 ${n}`);
  ok(n<=1 ? r.est===0 : r.est===n, `${n} 人未輸入時標記數不對（0/1 人不標記）`);
  ok(n<=1 ? !r.uns : r.uns, `${n} 人未輸入的未定案判定不對`);});

console.log('\n=== §2.3 外幣總額空白且有人沒填 → 不自動均分 ===');
const r23=E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  var e=exp({forAmt:'',twdAmt:'3400',pay:'card',type:'individual',parts:M,indiv:{[M[0]]:'4000'},payer:M[0]});
  var c=calc(e,t); return {reason:c.noAutoReason, vals:M.map(id=>c.valInCur[id])};})()`);
console.log('   noAutoReason =',r23.reason,'｜各人值 =',JSON.stringify(r23.vals));
ok(r23.reason==='noForeignTotal','應標示無法自動均分');
ok(r23.vals.filter(v=>v!==null).length===1,'不該替沒填的人猜值（會嚴重算錯）');

console.log('\n=== §2.2 比例回推換算 ===');
const r22=E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  var e=exp({forAmt:'45000',twdAmt:'1035',pay:'card',type:'individual',parts:M,
    indiv:{[M[0]]:'12000',[M[1]]:'18000',[M[2]]:'15000'},payer:M[1]});
  var c=calc(e,t); return {shares:M.map(id=>c.shares[id]), sum:M.reduce((a,id)=>a+(c.shares[id]||0),0)};})()`);
console.log('   各人台幣 =',JSON.stringify(r22.shares),'總和 =',r22.sum);
ok(r22.sum===1035,'Σ各人台幣應恰等於台幣總額，實際 '+r22.sum);

console.log('\n=== #17-4 換算規則：與支付方式無關 ===');
E("var t=tripOf('t1'); t.rateTwd='1'; t.rateFor='45';");
const conv=E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  var mk=function(o){return calc(exp(Object.assign({type:'shared',parts:M,payer:M[0]},o)),t);};
  return {
    cashOnlyFor: mk({forAmt:'20000',pay:'cash'}).twdTotal,
    cardOnlyFor: mk({forAmt:'20000',pay:'card'}).twdTotal,
    storedOnlyFor: mk({forAmt:'20000',pay:'stored'}).twdTotal,
    bothCard: mk({forAmt:'20000',twdAmt:'500',pay:'card'}).twdTotal,
    bothCash: mk({forAmt:'20000',twdAmt:'500',pay:'cash'}).twdTotal,
    fromRate: mk({forAmt:'20000',pay:'card'}).twdFromRate,
  };})()`);
console.log('   只有外幣：現金',conv.cashOnlyFor,'／刷卡',conv.cardOnlyFor,'／儲值卡',conv.storedOnlyFor);
console.log('   兩者都有：刷卡',conv.bothCard,'／現金',conv.bothCash);
ok(conv.cashOnlyFor===444 && conv.cardOnlyFor===444 && conv.storedOnlyFor===444,
   '只有外幣時三種支付方式都該用行程匯率換算（#17-4 已改為與支付方式無關）');
ok(conv.bothCard===500 && conv.bothCash===500,'兩者都有時一律用台幣（實付最準）');
ok(conv.fromRate===true,'應標示為由匯率換算而來');

console.log('\n=== #17-4 只有外幣且還沒設匯率 ===');
E("var t=tripOf('t1'); t.rateTwd=undefined; t.rateFor=undefined;");
const nr=E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  var c=calc(exp({forAmt:'20000',pay:'cash',type:'shared',parts:M,payer:M[0]}),t);
  return {pend:c.twdPending, link:c.needRateLink};})()`);
console.log('   twd_pending =',nr.pend,'｜顯示去設定的連結 =',nr.link);
ok(nr.pend && nr.link,'應標 twd_pending 並顯示連結');
E("var t=tripOf('t1'); t.rateTwd='1'; t.rateFor='45';");

console.log('\n=== §5.1 「約」只標受影響的人 ===');
const ap=E(`(function(){store.expenses.t1=demoExpenses(); var S=tripSummary('t1');
  return {approx:S.t.members.map(m=>[m.name,S.approx[m.id]]), n:S.unsettledList.length};})()`);
console.log('   ',JSON.stringify(ap.approx),'｜未定案筆數',ap.n);
ok(ap.approx.some(x=>x[1]),'應該有人被標「約」');
ok(ap.n>0,'應該有未定案筆數');

console.log('\n=== §5.2 同筆同時符合兩條件只算一次 ===');
const once=E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  store.expenses.t1=[exp({title:'雙重',pay:'card',type:'individual',parts:M,indiv:{},payer:M[0]})];
  var S=tripSummary('t1'); var c=calc(S.list[0],t);
  return {twdPending:c.twdPending, blanks:c.blanks.length, n:S.unsettledList.length};})()`);
console.log('   整筆未定 =',once.twdPending,'且',once.blanks,'人未填 → 入口計數',once.n);
ok(once.n===1,'同一筆重複計數了，應為 1');

console.log('\n=== §5.4 消費列樣式 ===');
E("store.expenses.t1=demoExpenses(); renderS03()");
ok(!H('s03').includes('待補填'),'「待補填」badge 應已移除');
ok(H('s03').includes('還沒填'),'整筆未定的金額欄應顯示「還沒填」');
ok(!H('s03').includes('數字僅供參考'),'統計卡的「N 筆待填，數字僅供參考」應整條移除');
console.log('   待補填:',H('s03').includes('待補填'),'｜還沒填:',H('s03').includes('還沒填'));

console.log('\n=== §5.6 已結算不提醒 ===');
E("tripOf('t1').status='settled'; renderS03()");
ok(!H('s03').includes('還沒算清楚'),'已結算的行程不該顯示未定案入口與註腳');
console.log('   已結算時出現「還沒算清楚」:',H('s03').includes('還沒算清楚'));
E("tripOf('t1').status='planned'; renderS03()");

console.log('\n=== §6 結算前檢查層 ===');
d.querySelector('#s03settle').click();
ok(!!d.querySelector('#s05anyway'),'有未定案時按結算應先出檢查層');
console.log('   檢查層出現:',!!d.querySelector('#s05anyway'),'｜清單筆數',d.querySelectorAll('#scr-s05 [data-editexp]').length);
d.querySelector('#s05anyway').click();
ok(E("store.s05")==='partial','「就這樣結算」必須真的能結算');
console.log('   按「就這樣結算」後狀態:',E("store.s05"));

console.log('\n=== §4 四種存檔提示 ===');
const cases=[['整筆未填',0,'','',['這筆金額還沒填']],['1 人未輸入',3,'40000','1000',['的金額由總額推算']],
             ['2 人未輸入',2,'40000','1000',['和','先照均分算']],['3 人未輸入',1,'40000','1000',['還有 3 人']]];
cases.forEach(([label,filled,fa,ta,expect])=>{
  E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);var ind={};
    for(var i=0;i<${filled};i++) ind[M[i]]='10000';
    g=exp({title:'測',forAmt:'${fa}',twdAmt:'${ta}',pay:'card',type:'individual',parts:M,indiv:ind,payer:M[0]});
    renderS04();})()`);
  d.querySelector('#s04save').click();
  const msg=(d.querySelector('#s04toast .toast')||{textContent:''}).textContent;
  console.log('  ',label,'→',msg);
  expect.forEach(x=>ok(msg.includes(x),`${label} 的文案不對：${msg}`));
});

console.log('\n=== §5.5 自動值只用 placeholder，不寫進 value ===');
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({title:'測',forAmt:'40000',twdAmt:'1000',pay:'card',type:'individual',parts:M,indiv:{},payer:M[0]});
  renderS04();})()`);
const ins=[...d.querySelectorAll('input[data-eindiv]')];
console.log('   value =',JSON.stringify(ins.map(x=>x.value)),'｜placeholder =',JSON.stringify(ins.map(x=>x.placeholder)));
ok(ins.every(x=>x.value===''),'自動值不得寫進 value');
ok(ins.every(x=>/^\d+$/.test(x.placeholder)),'自動值應出現在 placeholder');
const first=ins[0]; first.value='12000'; first.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(d.contains(first),'打字時輸入框被重建（#13 的教訓）');
console.log('   打字後節點仍在:',d.contains(first),'｜其餘 placeholder =',
  JSON.stringify([...d.querySelectorAll('input[data-eindiv]')].slice(1).map(x=>x.placeholder)));

console.log('\n=== #17-4 沒設匯率時只給連結，不在記帳頁設定 ===');
E("var t=tripOf('t1'); t.rateTwd=undefined; t.rateFor=undefined;");
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({title:'門票',forAmt:'20000',pay:'cash',type:'shared',parts:M,payer:M[0]}); renderS04();})()`);
ok(!d.querySelector('#scr-s04 .rateinput'),'記帳頁不得出現匯率輸入框（#17-4）');
ok(d.querySelector('#scr-s04').innerHTML.includes('ratelink'),'應顯示跳去 S-02b 設定的連結');
console.log('   記帳頁匯率輸入框:',d.querySelectorAll('#scr-s04 .rateinput').length,
            '｜去設定的連結:',d.querySelector('#scr-s04').innerHTML.includes('ratelink'));
E("var t=tripOf('t1'); t.rateTwd='1'; t.rateFor='45';");

console.log('\n=== #17 停止條件 ===');
E("store.expenses.t1=demoExpenses(); store.s03StatOpen=false; store.s03Cur='TWD'; render()");
const H03=()=>d.querySelector('#scr-s03').innerHTML, H04=()=>d.querySelector('#scr-s04').innerHTML;

// 2 統計卡預設收合
ok(!d.querySelector('#scr-s03 .perlist'),'統計卡應預設收合');
d.querySelector('#s03stat').click();
ok(!!d.querySelector('#scr-s03 .perlist'),'點總花費應展開每人分擔列');
console.log('   統計卡：預設收合 ✓，點開後每人列出現',!!d.querySelector('#scr-s03 .perlist'));
ok(H03().includes('approxdot')||!E("tripSummary('t1').t.members.some(m=>tripSummary('t1').approx[m.id])"),
   '收合時若有人被標「約」，收合列上要有提示');
d.querySelector('#s03stat').click();

// 3 幣別切換可操作
const before=H03().includes('$ ');
d.querySelector('[data-s03cur="FOR"]').click();
console.log('   幣別切到 KRW：',E("store.s03Cur"),'｜畫面出現 ₩ =',H03().includes('₩'));
ok(E("store.s03Cur")==='FOR' && H03().includes('₩'),'幣別切換應真的換算整頁金額');
d.querySelector('[data-s03cur="TWD"]').click();
ok(E("store.s03Cur")==='TWD','應能切回台幣');

// 6 一起分預設不展開名單
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({title:'測',twdAmt:'4000',type:'shared',parts:M,payer:M[0]}); renderS04();})()`);
ok(!d.querySelector('[data-epart]'),'「一起分」預設不得展開成員名單（定案的 R2）');
ok(H04().includes('要排除誰？'),'應有「要排除誰？」的展開控制');
d.querySelector('[data-eexpand]').click();
ok(!!d.querySelector('[data-epart]'),'點「要排除誰？」才展開');
console.log('   一起分：預設收合 ✓，點開後成員列出現',!!d.querySelector('[data-epart]'));

// 5 選取樣式全站單一套
const sel=d.querySelectorAll('.selchip').length, old2=d.querySelectorAll('.mechip, .ck').length;
console.log('   選取樣式：selchip',sel,'個｜舊語彙',old2,'個');
ok(old2===0,'不得同時存在兩套選取語彙');
ok(sel>0,'選取語彙應統一為 selchip');

// 4 記帳頁無匯率設定入口 ＋ 全站只有一個入口
ok(!d.querySelector('#scr-s04 .rateinput'),'記帳頁不得有匯率輸入框');
const rateInputs=d.querySelectorAll('.rateinput').length;
console.log('   全站匯率輸入框：',rateInputs,'個（應為 2，都在 S-02b）');
ok(rateInputs===2 && d.querySelectorAll('#scr-s02b .rateinput').length===2,'匯率只能有 S-02b 一個入口');

// 10 大家各付各的在「誰付的？」且三型都可選
['shared','individual','single'].forEach(ty=>{
  E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
    g=exp({title:'測',twdAmt:'4000',type:'${ty}',parts:${JSON.stringify(1)}===1?M:M,payer:M[0]});
    if('${ty}'==='single') g.parts=[M[0]];
    renderS04();})()`);
  const inPayer=[...d.querySelectorAll('#scr-s04 .chips')].some(c=>c.innerHTML.includes('大家各付各的'));
  ok(inPayer,`${ty} 型也要能選「大家各付各的」`);
});
console.log('   「大家各付各的」三型皆可選 ✓');
ok(!H04().includes('記錄但不算欠款'),'「記錄但不算欠款」灰字應已移除');

// 11 被砍的句子不得再出現
const cut=['沒填的先照均分算','剩下的平均分給','加總剛好等於總額','先用各自金額加總','同一筆不混填','用這趟的現金匯率換算成'];
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({forAmt:'45000',twdAmt:'1035',type:'individual',parts:M,indiv:{[M[0]]:'12000'},payer:M[0]}); renderS04();})()`);
const all4=H04();
cut.forEach(x=>ok(!all4.includes(x),'砍掉的提示句又出現了：'+x));
console.log('   被砍的 6 句都不在了 ✓');

// 2(stop) 全站不再有文字符號充當 icon
const phones=[...d.querySelectorAll('.ui')].map(x=>x.innerHTML).join('');
['‹','✎','⧉','⚙','▾','▲','▼'].forEach(ch=>ok(!phones.includes(ch),'手機框內仍有文字符號充當 icon：'+ch));
console.log('   手機框內文字符號：無 ✓｜SVG icon 數：',d.querySelectorAll('.ui svg.ic').length);
ok(d.querySelectorAll('.ui svg.ic').length>10,'icon 應已改為 SVG');

console.log('\n=== 徽章 vs 編號清單（批二四頁）===');
const IDX=E('INDEX'); const seen=new Set();
const snap=()=>d.querySelectorAll('.bdg').forEach(x=>seen.add(x.dataset.copy));
E("store.expenses.t1=demoExpenses(); store.s03Filter={kind:'all'}; store.s03StatOpen=true; render()"); snap();
E("store.s03StatOpen=false; renderS03()"); snap();
E("tripOf('t1').status='settled'; renderS03()"); snap();
E("tripOf('t1').status='archived'; renderS03()"); snap();
E("tripOf('t1').status='planned'; store.expenses.t1=[]; renderS03()"); snap();
E("store.expenses.t1=demoExpenses(); renderS03()"); snap();
E("store.s03Filter={kind:'member',memberId:tripOf('t1').members[0].id}; renderS03d()"); snap();
E("store.expenses.t1=[]; renderS03d()"); snap(); E("store.expenses.t1=demoExpenses()");
['pending','check','partial','done'].forEach(p=>{E(`store.s05='${p}'; renderS05()`); snap();});
E("store.s05='partial'; store.s05open=true; renderS05()"); snap();
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({forAmt:'45000',twdAmt:'1035',pay:'card',type:'individual',parts:M,indiv:{[M[0]]:'1'},payer:M[0]});renderS04();})()`); snap();
E("g.type='shared'; renderS04()"); snap();
E("g.type='single'; g.parts=[tripOf('t1').members[0].id]; renderS04()"); snap();
E("g._edit=true; renderS04()"); snap();
E("g.pay='cash'; tripOf('t1').rateTwd=undefined; tripOf('t1').rateFor=undefined; renderS04()"); snap();
E("g.forAmt=''; g.twdAmt=''; g.type='individual'; g.indiv={}; renderS04()"); snap();
E("tripOf('t1').rateTwd=undefined; tripOf('t1').rateFor=undefined");
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({forAmt:'20000',pay:'cash',type:'shared',parts:M,payer:M[0]}); renderS04();})()`); snap();
E("tripOf('t1').rateTwd='1'; tripOf('t1').rateFor='45'");
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({forAmt:'',twdAmt:'1000',pay:'card',type:'individual',parts:M,indiv:{[M[0]]:'100'},payer:M[0]}); renderS04();})()`); snap();
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({forAmt:'40000',twdAmt:'1000',pay:'card',type:'individual',parts:M,
    indiv:{[M[0]]:'9000',[M[1]]:'9000',[M[2]]:'9000',[M[3]]:'9000'},payer:M[0]}); renderS04();})()`); snap();
E("g.sponsor=true; renderS04()"); snap();
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({forAmt:'',twdAmt:'1035',pay:'card',type:'individual',parts:M,
    indiv:{[M[0]]:'12000',[M[1]]:'18000',[M[2]]:'10000',[M[3]]:'5000'},payer:M[0]}); renderS04();})()`); snap();
d.querySelector('#s04save').click(); snap();
let missing=[],unexpected=[];
['s03','s03d','s04','s05'].forEach(k=>IDX[k].forEach(([id,el,kind])=>{
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
