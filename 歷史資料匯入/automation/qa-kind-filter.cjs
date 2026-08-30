/** 驗證 kind 過濾：建一筆 statement，確認它不會出現在旅遊列表 */
const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const ENV=fs.readFileSync(path.resolve(__dirname,'../../.env'),'utf8');
const URL=ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(),KEY=ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const stf=path.resolve(__dirname,'../../.auth/state.json');
const tok=JSON.parse(JSON.parse(fs.readFileSync(stf,'utf8')).origins[0].localStorage.find(x=>x.name.startsWith('sb-')).value);
const auth=JSON.parse(fs.readFileSync(stf,'utf8')).origins[0].localStorage.find(x=>x.name.startsWith('sb-'));
const {makeGuard}=require('./guard.cjs'); const guard=makeGuard();
const R=[];const ck=(n,ok,d='')=>{R.push({n,ok});console.log(`   ${ok?'✅':'❌'} ${n}${d?' — '+d:''}`)};
(async()=>{
 let a=tok.access_token;
 if(!(await fetch(`${URL}/auth/v1/user`,{headers:{apikey:KEY,Authorization:`Bearer ${a}`}})).ok){
  const j=await (await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:tok.refresh_token})})).json();a=j.access_token;}
 const AH={apikey:KEY,Authorization:`Bearer ${a}`,'Content-Type':'application/json',Prefer:'return=representation'};
 const uid=(await (await fetch(`${URL}/auth/v1/user`,{headers:{apikey:KEY,Authorization:`Bearer ${a}`}})).json()).id;

 const [card]=await (await fetch(`${URL}/rest/v1/cards`,{method:'POST',headers:AH,body:JSON.stringify({owner_id:uid,nickname:'ZZ 過濾測試卡',last4:'0000',is_primary:true})})).json();
 const [st]=await (await fetch(`${URL}/rest/v1/trips`,{method:'POST',headers:AH,body:JSON.stringify({
   owner_id:uid,name:'ZZ 2099 年 9 月帳單',emoji:'💳',currency:'TWD',start_date:'2099-09-01',end_date:'2099-09-30',
   status:'planned',share_token:crypto.randomUUID(),kind:'statement',card_id:card.id})})).json();
 guard.register(st.id,'ZZ 2099 年 9 月帳單');

 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({locale:'zh-TW',viewport:{width:390,height:844}});
 await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch{}},[auth.name,auth.value]);
 const p=await ctx.newPage();
 await p.goto('http://localhost:5173/',{waitUntil:'networkidle'});await p.waitForTimeout(2500);
 const t=await p.locator('body').innerText();
 ck('帳單週期不出現在旅遊列表',!t.includes('ZZ 2099 年 9 月帳單'));
 ck('四趟旅遊仍正常顯示',['濟州島','北海道','東京','福岡'].every(x=>t.includes(x)));
 const cards=await p.locator('[data-photo]').count();
 ck('列表卡片數 = 4',cards===4,`${cards} 張`);
 await b.close();

 await guard.deleteTrip(URL,AH,st.id);
 await fetch(`${URL}/rest/v1/cards?id=eq.${card.id}`,{method:'DELETE',headers:AH});
 const left=await (await fetch(`${URL}/rest/v1/trips?select=id&kind=eq.statement`,{headers:{apikey:KEY,Authorization:`Bearer ${a}`}})).json();
 ck('測試資料清乾淨',left.length===0&&guard.remaining().length===0);
 const bad=R.filter(x=>!x.ok);
 console.log(`\n════ ${R.length-bad.length}/${R.length} 通過 ${bad.length?'❌':'✅'}`);
 process.exit(bad.length?1:0);
})();
