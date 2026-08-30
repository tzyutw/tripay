const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const OUT='/private/tmp/claude-501/-Users-ziyu/44be7cd8-78ba-4b1b-96d1-5d6df277b0e8/scratchpad/shots';
const ENV=fs.readFileSync(path.resolve(__dirname,'../../.env'),'utf8');
const URL=ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(),KEY=ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const st=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.auth/state.json'),'utf8'));
const auth=st.origins[0].localStorage.find(x=>x.name.startsWith('sb-'));
(async()=>{
 const trips=await (await fetch(`${URL}/rest/v1/trips?select=id,name&name=like.*東京*Excel*`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).json();
 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({viewport:{width:320,height:568},locale:'zh-TW',deviceScaleFactor:2});
 await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch{}},[auth.name,auth.value]);
 const p=await ctx.newPage();
 await p.goto(`http://localhost:5173/trips/${trips[0].id}/edit`,{waitUntil:'networkidle'});
 await p.waitForTimeout(2500);
 await p.locator('xpath=//label[normalize-space(text())="封面"]/parent::div//button').first().click();
 await p.waitForTimeout(2000);
 const open = await p.getByPlaceholder('搜尋，或直接貼上').count();
 console.log('封面選擇器開啟：', open>0 ? '✅' : '❌');
 // 確認「就用這個」在視窗內
 const btn = p.getByRole('button',{name:'就用這個'});
 const box = await btn.boundingBox();
 const vp = p.viewportSize();
 console.log(`「就用這個」按鈕 y=${box && Math.round(box.y)}~${box && Math.round(box.y+box.height)}　視窗高=${vp.height}　${box && box.y+box.height<=vp.height ? '✅ 在視窗內' : '❌ 被切掉'}`);
 await p.screenshot({path:`${OUT}/320-4-picker-cover.png`});
 await b.close();
})();
