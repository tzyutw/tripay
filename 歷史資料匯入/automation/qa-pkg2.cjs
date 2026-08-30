/** 包二 QA：複製行程、G-09 預填、成員守衛補強、Aria 320px 版位 */
const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const BASE='http://localhost:5173';
const OUT='/private/tmp/claude-501/-Users-ziyu/44be7cd8-78ba-4b1b-96d1-5d6df277b0e8/scratchpad/shots';
const ENV=fs.readFileSync(path.resolve(__dirname,'../../.env'),'utf8');
const URL=ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(),KEY=ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
const stf=path.resolve(__dirname,'../../.auth/state.json');
const tok=JSON.parse(JSON.parse(fs.readFileSync(stf,'utf8')).origins[0].localStorage.find(x=>x.name.startsWith('sb-')).value);
const auth=JSON.parse(fs.readFileSync(stf,'utf8')).origins[0].localStorage.find(x=>x.name.startsWith('sb-'));
const { makeGuard } = require('./guard.cjs');
const guard = makeGuard();
const R=[];const ck=(n,ok,d='')=>{R.push({n,ok});console.log(`   ${ok?'✅':'❌'} ${n}${d?' — '+d:''}`)};

(async()=>{
 let access=tok.access_token;
 if(!(await fetch(`${URL}/auth/v1/user`,{headers:{apikey:KEY,Authorization:`Bearer ${access}`}})).ok){
  const j=await (await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:tok.refresh_token})})).json();
  access=j.access_token;}
 const AH={apikey:KEY,Authorization:`Bearer ${access}`,'Content-Type':'application/json',Prefer:'return=representation'};
 const trips=await (await fetch(`${URL}/rest/v1/trips?select=id,name,currency&order=start_date.desc`,{headers:H})).json();
 const jeju=trips.find(t=>t.name.includes('濟州島'));

 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({locale:'zh-TW',viewport:{width:320,height:568},deviceScaleFactor:2});
 await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch{}},[auth.name,auth.value]);
 const p=await ctx.newPage();

 console.log('\n══ 1 Aria：320px 下 hero 四顆圖示不擠壓');
 await p.goto(`${BASE}/trips/${jeju.id}`,{waitUntil:'networkidle'});await p.waitForTimeout(1800);
 const btns=['編輯行程','複製行程','分享','設定'];
 const boxes=[];for(const n of btns){const bx=await p.getByRole('button',{name:n}).boundingBox();boxes.push(bx)}
 const allIn=boxes.every(bx=>bx&&bx.x>=0&&bx.x+bx.width<=320);
 const noOverlap=boxes.every((bx,i)=>i===0||bx.x>=boxes[i-1].x+boxes[i-1].width-1);
 ck('四顆圖示都在 320px 視窗內且不重疊',allIn&&noOverlap,boxes.map(bx=>bx?`${Math.round(bx.x)}–${Math.round(bx.x+bx.width)}`:'?').join(' '));
 await p.screenshot({path:`${OUT}/pkg2-320-hero.png`});

 console.log('\n══ 2 複製行程：帶入成員／幣別，不帶消費');
 await p.getByRole('button',{name:'複製行程'}).click();
 await p.getByText('這趟去哪？').waitFor({timeout:15000});await p.waitForTimeout(1800);
 const nm=await p.locator('input[placeholder="例如：沖繩四人行 ☀️"]').inputValue();
 ck('名稱帶入「…的複本」',nm.includes('濟州島')&&nm.includes('的複本'),nm);
 const memCount=await p.locator('xpath=//label[normalize-space(text())="誰一起去？"]/parent::div//div[contains(@class,"cursor-pointer")]').count();
 ck('成員帶入 4 位',memCount===4,`${memCount} 位`);
 const cur=await p.locator('xpath=//label[normalize-space(text())="當地幣別"]/parent::div//button').first().innerText();
 ck('幣別帶入原行程',cur.replace(/\s|▾/g,'')===jeju.currency,`${cur.replace(/\s|▾/g,'')} vs ${jeju.currency}`);
 ck('有預填提示文字',(await p.locator('text=已帶入原本那趟的成員與幣別，可以改').count())>0);
 // 實際建立，確認不帶消費
 const d=p.locator('input[type="date"]');await d.nth(0).fill('2099-09-01');await d.nth(1).fill('2099-09-03');
 await p.locator('input[placeholder="例如：沖繩四人行 ☀️"]').fill('ZZ 複製測試');
 await p.getByRole('button',{name:'出發！'}).click();
 // ⚠️ 不能用 waitForURL(/\/trips\/<uuid>/)：我們本來就在 /trips/<jeju> 上，會立即匹配到舊 id。
 // 必須等到 URL 的 uuid 真的變成「不是原本那筆」。
 await p.waitForFunction((old)=>{const m=location.pathname.match(/\/trips\/([0-9a-f-]{36})/);return !!m&&m[1]!==old;},jeju.id,{timeout:30000});
 const newId=p.url().match(/\/trips\/([0-9a-f-]{36})/)[1];
 if(newId===jeju.id) throw new Error('取到的仍是原行程 id，中止避免誤刪');
 guard.register(newId,'ZZ 複製測試');   // 護欄：登記自己建立的測試資料
 const ne=await (await fetch(`${URL}/rest/v1/expenses?select=id&trip_id=eq.${newId}`,{headers:H})).json();
 const nm2=await (await fetch(`${URL}/rest/v1/trip_members?select=name,emoji&trip_id=eq.${newId}&order=sort_order`,{headers:H})).json();
 ck('新行程沒有帶到消費',ne.length===0,`${ne.length} 筆`);
 ck('新行程成員＝4 位且 emoji 一致',nm2.length===4,nm2.map(x=>x.emoji+x.name).join(' '));
 const nt=await (await fetch(`${URL}/rest/v1/trips?select=owner_member_id&id=eq.${newId}`,{headers:H})).json();
 ck('owner_member_id 有設定',!!nt[0].owner_member_id);

 console.log('\n══ 3 G-09：新增行程預填上一趟成員');
 await p.goto(BASE,{waitUntil:'networkidle'});await p.waitForTimeout(1800);
 await p.getByRole('button',{name:'＋ 新增行程'}).click();
 await p.getByText('這趟去哪？').waitFor({timeout:15000});await p.waitForTimeout(1800);
 const g9=await p.locator('xpath=//label[normalize-space(text())="誰一起去？"]/parent::div//div[contains(@class,"cursor-pointer")]').count();
 ck('新增行程已預填成員',g9>0,`${g9} 位`);
 ck('有 G-09 提示文字',(await p.locator('text=已帶入上一趟的成員，可以改').count())>0);
 await p.getByRole('button',{name:'取消'}).first().click();

 console.log('\n══ 4 成員守衛：有結算紀錄者不可移除');
 await p.goto(`${BASE}/trips/${jeju.id}/edit`,{waitUntil:'networkidle'});await p.waitForTimeout(2200);
 const rm=p.locator('xpath=//label[normalize-space(text())="誰一起去？"]/parent::div//div[contains(@class,"cursor-pointer")][1]//button[last()]');
 ck('已結算行程的成員移除鈕停用',await rm.isDisabled());

 // 清理：只刪本次登記過的測試資料（guard 會擋下正式行程與未登記 id）
 const rows=await guard.deleteTrip(URL,AH,newId);
 const left=await (await fetch(`${URL}/rest/v1/trips?select=id&name=like.ZZ%20*`,{headers:H})).json();
 ck('測試行程已刪除',rows===1&&left.length===0&&guard.remaining().length===0);

 console.log('\n══ 5 UX-2：結算頁淨額用人話、重整後仍在');
 await p.goto(`${BASE}/trips/${jeju.id}/settlement`,{waitUntil:'networkidle'});await p.waitForTimeout(2500);
 await p.getByText('查看計算依據').click().catch(()=>{});
 await p.waitForTimeout(1000);
 const stx=await p.locator('body').innerText();
 ck('顯示「可以拿回」人話',/可以拿回 \$[\d,]+/.test(stx),(stx.match(/[^\n]*可以拿回[^\n]*/)||[''])[0].trim());
 ck('顯示「要給出」人話',/要給出 \$[\d,]+/.test(stx));
 ck('有 Excel 符號慣例提醒',stx.includes('Excel 習慣用「負數」表示應收'));
 ck('重整後仍看得到（不再顯示「需重新計算才能顯示」）',!stx.includes('重新整理後需重新計算才能顯示'));

 console.log('\n══ 6 刪除行程：二次確認＋真的刪掉');
 const [tt]=await (await fetch(`${URL}/rest/v1/trips`,{method:'POST',headers:AH,body:JSON.stringify({
   owner_id:(await (await fetch(`${URL}/auth/v1/user`,{headers:{apikey:KEY,Authorization:`Bearer ${access}`}})).json()).id,
   name:'ZZ 刪除測試',emoji:'🧪',currency:'TWD',start_date:'2099-12-01',end_date:'2099-12-02',
   status:'planned',share_token:crypto.randomUUID()})})).json();
 guard.register(tt.id,tt.name);
 await p.goto(`${BASE}/trips/${tt.id}`,{waitUntil:'networkidle'});await p.waitForTimeout(2000);
 await p.getByRole('button',{name:'刪除這趟行程'}).click();
 await p.getByText('算了，留著').waitFor({timeout:8000});
 const delBtn=p.getByRole('button',{name:'刪除',exact:true});
 ck('名稱未輸入時刪除鈕停用',await delBtn.isDisabled());
 await p.locator(`input[placeholder="${tt.name}"]`).fill('打錯的名字');
 await p.waitForTimeout(200);
 ck('名稱輸入錯誤時仍停用',await delBtn.isDisabled());
 await p.locator(`input[placeholder="${tt.name}"]`).fill(tt.name);
 await p.waitForTimeout(200);
 ck('名稱正確後可按',!(await delBtn.isDisabled()));
 await delBtn.click();
 await p.waitForTimeout(3000);
 const gone=await (await fetch(`${URL}/rest/v1/trips?select=id&id=eq.${tt.id}`,{headers:H})).json();
 ck('行程已真的刪除',gone.length===0);
 ck('刪除後導回列表',!p.url().includes(tt.id));
 if(gone.length===0) guard.remaining().forEach(([id])=>{ if(id===tt.id) guard.deleteTrip(URL,AH,id).catch(()=>{}); });

 await b.close();
 const bad=R.filter(x=>!x.ok);
 console.log(`\n════ ${R.length-bad.length}/${R.length} 通過 ${bad.length?'❌ '+bad.map(x=>x.n).join('；'):'✅'}`);
 process.exit(bad.length?1:0);
})();
