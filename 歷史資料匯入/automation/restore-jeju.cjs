/** 濟州島復原收尾：走 UI 結算確認 → 改名去後綴。只碰 checkpoint 裡的 jeju。 */
const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const APP='https://tzyutw.github.io/tripay/';
const STATE=path.resolve(__dirname,'../../.auth/state.json');
const ck=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../checkpoint.json'),'utf8'));
const uuid=ck.jeju.tripUuid;
const ENV=fs.readFileSync(path.resolve(__dirname,'../../.env'),'utf8');
const URL=ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(),KEY=ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
(async()=>{
 if(!uuid){console.log('checkpoint 沒有 jeju tripUuid');process.exit(1);}
 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({storageState:STATE,locale:'zh-TW',viewport:{width:480,height:900}});
 const p=await ctx.newPage();

 // 1) 結算確認
 await p.goto(`${APP}trips/${uuid}/settlement`,{waitUntil:'networkidle',timeout:60000});
 await p.waitForTimeout(1800);
 const calc=p.getByRole('button',{name:'算清楚'});
 if(await calc.count()){
   await calc.click();
   const warn=p.getByRole('button',{name:'先這樣算'});
   try{await warn.waitFor({timeout:5000});console.log('  （有待填筆數，選「先這樣算」）');await warn.click();}catch{}
   await p.waitForTimeout(4500);
 }
 const st1=await (await fetch(`${URL}/rest/v1/trips?select=status,name&id=eq.${uuid}`,{headers:H})).json();
 console.log(`  結算後狀態：${st1[0].status} ${st1[0].status==='settled'?'✅':'❌'}`);

 // 2) 改名去後綴
 await p.goto(`${APP}trips/${uuid}`,{waitUntil:'networkidle',timeout:60000});
 await p.waitForTimeout(1500);
 await p.getByRole('button',{name:'編輯行程'}).click();
 const input=p.locator('input[placeholder="例如：沖繩四人行 ☀️"]');
 await input.waitFor({timeout:15000});await p.waitForTimeout(1500);
 const before=await input.inputValue();
 const after=before.replace(/（Excel重謄）\s*$/,'').trim();
 if(before!==after){await input.fill(after);await p.getByRole('button',{name:'儲存'}).click();await p.waitForTimeout(2800);}
 const st2=await (await fetch(`${URL}/rest/v1/trips?select=name,status&id=eq.${uuid}`,{headers:H})).json();
 console.log(`  改名：「${before}」→「${st2[0].name}」${st2[0].name===after?'✅':'❌'}`);
 await b.close();
})();
