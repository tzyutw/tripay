/** 本輪 QA：排序、卡片金額、回歸、決策修正 */
const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const BASE='http://localhost:5173';
const ENV=fs.readFileSync(path.resolve(__dirname,'../../.env'),'utf8');
const URL=ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(),KEY=ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
const st=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.auth/state.json'),'utf8'));
const auth=st.origins[0].localStorage.find(x=>x.name.startsWith('sb-'));
const tok=JSON.parse(auth.value);
const R=[]; const ck=(n,ok,d='')=>{R.push(ok);console.log(`   ${ok?'✅':'❌'} ${n}${d?' — '+d:''}`)};
const r2=n=>Math.round(n*100)/100;
const { makeGuard } = require('./guard.cjs');
const guard = makeGuard();

(async()=>{
 // 取可寫 token（建測試行程用）
 let access=tok.access_token;
 if(!(await fetch(`${URL}/auth/v1/user`,{headers:{apikey:KEY,Authorization:`Bearer ${access}`}})).ok){
   const j=await (await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:tok.refresh_token})})).json();
   access=j.access_token;
 }
 const AH={apikey:KEY,Authorization:`Bearer ${access}`,'Content-Type':'application/json',Prefer:'return=representation'};
 const me=await (await fetch(`${URL}/auth/v1/user`,{headers:{apikey:KEY,Authorization:`Bearer ${access}`}})).json();

 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({locale:'zh-TW',viewport:{width:480,height:900}});
 await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch{}},[auth.name,auth.value]);
 const p=await ctx.newPage();

 console.log('\n══ 1 排序：依出發日新→舊');
 await p.goto(BASE,{waitUntil:'networkidle'}); await p.waitForTimeout(2000);
 const titles=await p.locator('h3, p.font-serif, [class*="font-serif"]').allInnerTexts().catch(()=>[]);
 const body=await p.locator('body').innerText();
 const order=['2026 濟州島四寶團','2025 北海道四寶團','2024 東京富士山五寶團','2023 福岡'];
 const pos=order.map(n=>body.indexOf(n));
 ck('四趟依出發日新→舊',pos.every((v,i)=>v>=0&&(i===0||v>pos[i-1])),pos.join(' < '));

 console.log('\n══ 2 未來日期行程排最上');
 const tRes=await fetch(`${URL}/rest/v1/trips`,{method:'POST',headers:AH,body:JSON.stringify({
   owner_id:me.id,name:'ZZ 排序測試行程',emoji:'🧪',currency:'TWD',
   start_date:'2099-01-01',end_date:'2099-01-05',status:'planned',share_token:crypto.randomUUID()})});
 const [test]=await tRes.json();
 guard.register(test.id, test.name);   // 護欄：登記自己建立的測試資料
 await p.goto(BASE,{waitUntil:'networkidle'}); await p.waitForTimeout(2000);
 const b2=await p.locator('body').innerText();
 ck('未來日期行程排在最上',b2.indexOf('ZZ 排序測試行程')>=0 && b2.indexOf('ZZ 排序測試行程')<b2.indexOf('2026 濟州島四寶團'));

 console.log('\n══ 3 卡片金額＝詳情頁 stats（且用 $ 符號）');
 const trips=(await (await fetch(`${URL}/rest/v1/trips?select=id,name&id=neq.${test.id}`,{headers:H})).json());
 let allEq=true;
 for(const t of trips){
   const exp=await (await fetch(`${URL}/rest/v1/expenses?select=twd_amount,twd_pending,is_sponsor,deleted_at&trip_id=eq.${t.id}`,{headers:H})).json();
   const expect=exp.reduce((s,e)=>(e.deleted_at||e.twd_pending||e.twd_amount===null)?s:s+(e.is_sponsor?0:Number(e.twd_amount)),0);
   await p.goto(`${BASE}/trips/${t.id}`,{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
   const dt=await p.locator('body').innerText();
   // 版面是「數字在上、標籤在下」，要取『總花費』前面最近的那個金額
   const m=dt.match(/\$\s*([\d,]+(?:\.\d+)?)\s*\n\s*總花費/) || dt.match(/\$\s*([\d,]+(?:\.\d+)?)[\s\S]{0,12}?總花費/);
   const detail=m?parseFloat(m[1].replace(/,/g,'')):null;
   const ok=detail!==null&&Math.abs(detail-Math.round(expect))<1.5;
   if(!ok)allEq=false;
   console.log(`      ${t.name.padEnd(22)} 期望 ${Math.round(expect)}　詳情頁 ${detail} ${ok?'✅':'❌'}`);
 }
 ck('四趟詳情頁總花費與加總邏輯一致',allEq);
 await p.goto(BASE,{waitUntil:'networkidle'}); await p.waitForTimeout(2000);
 const listTxt=await p.locator('body').innerText();
 ck('列表卡片用 $ 符號、無外幣符號',!/[¥₩]\s*[\d—]/.test(listTxt),(listTxt.match(/[¥₩]\s*[\d—]/g)||[]).join(',')||'無外幣符號');

 console.log('\n══ 4 決策修正');
 // settled 行程底部沒有記帳鈕，用仍在的測試行程（planned）驗
 await p.goto(`${BASE}/trips/${test.id}`,{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
 const dtl=await p.locator('body').innerText();
 ck('按鈕文案為「＋ 記一筆」（決策12）',dtl.includes('＋ 記一筆')&&!dtl.includes('新增消費'),(dtl.match(/＋[^\n]*/)||[''])[0]);
 const jeju=trips.find(t=>t.name.includes('濟州島'));
 await p.goto(`${BASE}/trips/${jeju.id}`,{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
 const jt=await p.locator('body').innerText();
 ck('待填警示含「數字僅供參考」（決策4）',/含 \d+ 筆待填，數字僅供參考/.test(jt),(jt.match(/含 \d+ 筆待填[^\n]*/)||[''])[0]);

 console.log('\n══ 5 分享唯讀頁不受影響');
 const share=await (await fetch(`${URL}/rest/v1/trips?select=share_token&id=eq.${jeju.id}`,{headers:H})).json();
 await p.goto(`${BASE}/share/${share[0].share_token}`,{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
 const sh=await p.locator('body').innerText();
 ck('分享頁正常渲染',sh.includes('濟州島')&&sh.length>200);

 // 清掉測試行程
 const rows=await guard.deleteTrip(URL,AH,test.id);
 const left=await (await fetch(`${URL}/rest/v1/trips?select=id&id=eq.${test.id}`,{headers:H})).json();
 ck('測試行程已刪除、不留殘料',rows===1&&left.length===0&&guard.remaining().length===0);

 await b.close();
 const bad=R.filter(x=>!x).length;
 console.log(`\n════ ${R.length-bad}/${R.length} 通過 ${bad?'❌':'✅'}`);
 process.exit(bad?1:0);
})();
