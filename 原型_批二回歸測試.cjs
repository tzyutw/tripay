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
// #20-4 後：這條只在「填寫幣別＝外幣」時成立，所以要明確指定 fillCur:'FOR'
const r23=E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  var e=exp({forAmt:'',twdAmt:'3400',fillCur:'FOR',pay:'card',type:'individual',parts:M,indiv:{[M[0]]:'4000'},payer:M[0]});
  var c=calc(e,t); return {reason:c.noAutoReason, vals:M.map(id=>c.valInCur[id])};})()`);
console.log('   noAutoReason =',r23.reason,'｜各人值 =',JSON.stringify(r23.vals));
ok(r23.reason==='noForeignTotal','應標示無法自動均分');
ok(r23.vals.filter(v=>v!==null).length===1,'不該替沒填的人猜值（會嚴重算錯）');

console.log('\n=== §2.2 比例回推換算 ===');
const r22=E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  var e=exp({forAmt:'45000',twdAmt:'1035',fillCur:'FOR',pay:'card',type:'individual',parts:M,
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


console.log('\n=== #20 補修 ===');
E("window.M0 = tripOf('t1').members.map(m=>m.id)");
const M0=E('M0');
const CALC=o=>E(`calc(exp(${JSON.stringify(Object.assign({type:'individual',parts:M0,payer:M0[0]},o))}),tripOf('t1'))`);

// #20-4 Rozi 實測到的錯誤，逐字對照
const bug=CALC({twdAmt:'2457',forAmt:'',fillCur:'TWD',parts:[M0[0],M0[1],M0[3]],
                indiv:{[M0[0]]:'1000',[M0[1]]:'400'}});
console.log('   台幣 2457｜1000/400/未填 → 未填者',bug.valInCur[M0[3]],
            '｜noAutoReason',bug.noAutoReason,'｜估計標記',Object.keys(bug.estimated).length);
ok(bug.valInCur[M0[3]]===1057,'未填者應為 2457−1400=1057，實際 '+bug.valInCur[M0[3]]);
ok(bug.noAutoReason===null,'填台幣時不得觸發 noForeignTotal');
ok(Object.keys(bug.estimated).length===0,'剩 1 人未填是唯一解，不得標記估計');

// #20-4 回歸：填台幣的各種情況
const t1=CALC({twdAmt:'3000',fillCur:'TWD',indiv:{[M0[0]]:'1000',[M0[1]]:'500',[M0[2]]:'500'}});
ok(t1.valInCur[M0[3]]===1000 && Object.keys(t1.estimated).length===0,'填台幣剩 1 人 → 唯一解不標記');
const t2=CALC({twdAmt:'3000',fillCur:'TWD',indiv:{[M0[0]]:'1000',[M0[1]]:'500'}});
console.log('   填台幣剩 2 人 → 各',t2.valInCur[M0[2]],t2.valInCur[M0[3]],'｜標記',Object.keys(t2.estimated).length);
ok(t2.valInCur[M0[2]]===750 && t2.valInCur[M0[3]]===750,'剩 2 人應平分餘額 1500');
ok(Object.keys(t2.estimated).length===2,'剩 2 人以上應全部標記估計');
const t3=CALC({twdAmt:'3000',forAmt:'',fillCur:'TWD',indiv:{[M0[0]]:'1000'}});
ok(t3.noAutoReason===null,'填台幣時外幣總額空白照常算得出來');

// #20-4 填外幣
const f1=CALC({twdAmt:'1035',forAmt:'',fillCur:'FOR',
  indiv:{[M0[0]]:'12000',[M0[1]]:'18000',[M0[2]]:'10000',[M0[3]]:'5000'}});
console.log('   填外幣全員填完、總額空白 → 自動補',f1.forTotalEff,'｜自動標記',f1.forTotalAuto);
ok(f1.forTotalAuto && f1.forTotalEff===45000,'全員填完時外幣總額應自動補為 Σ');
const f2=CALC({twdAmt:'1035',forAmt:'',fillCur:'FOR',indiv:{[M0[0]]:'12000'}});
ok(f2.noAutoReason==='noForeignTotal','填外幣、有人沒填、總額空白 → 不猜');
ok(f2.valInCur[M0[1]]===null,'停用自動值時不得給數字');

// #20-3 切換器存在且切換不清空
E(`(function(){var t=tripOf('t1');
  g=exp({twdAmt:'3000',forAmt:'45000',type:'individual',parts:M0,indiv:{[M0[0]]:'1000'},payer:M0[0],fillCur:'TWD'});
  renderS04();})()`);
ok(d.querySelectorAll('[data-fillcur]').length===2,'填寫幣別切換器應有兩顆按鈕');
d.querySelector('[data-fillcur="FOR"]').click();
console.log('   切到外幣後 fillCur =',E("g.fillCur"),'｜已填數字保留 =',E(`g.indiv['${M0[0]}']`));
ok(E("g.fillCur")==='FOR','切換器應能切到外幣');
ok(E(`g.indiv['${M0[0]}']`)==='1000','切換幣別不得清空已填數字');

// #20-2 互斥
E(`(function(){g=exp({twdAmt:'1600',type:'shared',parts:M0,payer:M0[0]}); renderS04();})()`);
d.querySelector('[data-eflag="onSpot"]').click();
ok(E("g.onSpot")===true,'應能選「大家各付各的」');
ok(!d.querySelector('#scr-s04 .chip.on[data-epayer]'),'選了大家各付各的，成員高亮應熄掉');
d.querySelector(`[data-epayer="${M0[1]}"]`).click();
console.log('   點成員後 onSpot =',E("g.onSpot"),'｜payer =',E("g.payer")===M0[1]);
ok(E("g.onSpot")===false,'點成員應自動取消「大家各付各的」');
ok(!!d.querySelector('#scr-s04 .chip.on[data-epayer]'),'點成員後該成員要亮起來');

// #20-1 金額欄一行
E("renderS04()");
const curLabel=d.querySelector('#scr-s04 .amtline .cur');
ok(!!curLabel,'金額欄應為一行版面（幣別標籤與輸入框同列）');
ok(d.querySelectorAll('#scr-s04 .amtline').length===2,'應有兩條金額列');
console.log('   金額列數:',d.querySelectorAll('#scr-s04 .amtline').length);

// #20-5 R9 差額三級皆可存檔
const d0=CALC({twdAmt:'3000',fillCur:'TWD',indiv:{[M0[0]]:'750',[M0[1]]:'750',[M0[2]]:'750',[M0[3]]:'750'}});
const dS=CALC({twdAmt:'3000',fillCur:'TWD',indiv:{[M0[0]]:'750',[M0[1]]:'750',[M0[2]]:'750',[M0[3]]:'730'}});
const dB=CALC({twdAmt:'3000',fillCur:'TWD',indiv:{[M0[0]]:'500',[M0[1]]:'500',[M0[2]]:'500',[M0[3]]:'500'}});
const lvl=c=>{const base=c.fillsAreForeign?c.forTotalEff:c.twdTotal;
  const sum=Object.values(c.valInCur).reduce((a,v)=>a+(v||0),0);const df=base-sum;
  return Math.abs(df)<1?'ok':(Math.abs(df)/base>0.01?'bad':'soft');};
console.log('   差額三級:',lvl(d0),lvl(dS),lvl(dB));
ok(lvl(d0)==='ok' && lvl(dS)==='soft' && lvl(dB)==='bad','差額分級不對');
E(`(function(){g=exp({twdAmt:'3000',fillCur:'TWD',type:'individual',parts:M0,
  indiv:{[M0[0]]:'500',[M0[1]]:'500',[M0[2]]:'500',[M0[3]]:'500'},payer:M0[0]}); renderS04();})()`);
ok(!d.querySelector('#s04save').disabled,'差額 >1% 也不得擋存檔');

// 五個情境
console.log('\n=== #20-7 五個情境（分帳模型原型的 SCENARIOS）===');
E("tripOf('t1').rateTwd='1'; tripOf('t1').rateFor='45'");
const SC=[
 ['① 四人吃飯 Ning 刷卡',{type:'shared',parts:M0,twdAmt:'3308',pay:'card',payer:M0[0]},3308,3],
 ['② 兩人汗蒸幕 Ziyu 付',{type:'shared',parts:[M0[1],M0[3]],twdAmt:'1240',pay:'card',payer:M0[1]},1240,1],
 ['③ 藥妝店 用韓圜填',{type:'individual',parts:M0,twdAmt:'1035',forAmt:'45000',fillCur:'FOR',
   indiv:{[M0[0]]:'12000',[M0[1]]:'18000',[M0[2]]:'15000'},pay:'card',payer:M0[2]},1035,2],
 ['④ Mei 個人購物',{type:'single',parts:[M0[3]],twdAmt:'860',pay:'cash',payer:M0[3]},860,0],
 ['⑤ 大家當場各付各的',{type:'shared',parts:M0,twdAmt:'1600',pay:'cash',payer:M0[1],onSpot:true},1600,3],
];
SC.forEach(([n,o,total,debts])=>{
  const c=E(`calc(exp(${JSON.stringify(o)}),tripOf('t1'))`);
  const ids=o.parts||M0, sum=ids.reduce((a,id)=>a+(c.shares[id]||0),0);
  console.log('  ',n,'→ Σ各人台幣',sum,'｜欠款',c.debts.length);
  ok(sum===total,`${n} 的 Σ各人台幣應等於 ${total}，實際 ${sum}`);
  ok(c.debts.length===debts,`${n} 的欠款筆數應為 ${debts}，實際 ${c.debts.length}`);
});
const s3=E(`calc(exp(${JSON.stringify(SC[2][1])}),tripOf('t1'))`);
console.log('   情境③ 比例回推:',M0.map(id=>s3.shares[id]).join(','),'（1035×各人韓圜÷45000）');
ok(s3.shares[M0[0]]===276 && s3.shares[M0[1]]===414,'情境③ 應依 R5 比例回推');

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
  g=exp({forAmt:'',twdAmt:'1035',fillCur:'FOR',pay:'card',type:'individual',parts:M,
    indiv:{[M[0]]:'12000',[M[1]]:'18000',[M[2]]:'10000',[M[3]]:'5000'},payer:M[0]}); renderS04();})()`); snap();
E(`(function(){var t=tripOf('t1'),M=t.members.map(m=>m.id);
  g=exp({forAmt:'',twdAmt:'1035',fillCur:'FOR',pay:'card',type:'individual',parts:M,
    indiv:{[M[0]]:'12000'},payer:M[0]}); renderS04();})()`); snap();
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
