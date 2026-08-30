/** Aria UI 審查用截圖：入口版位、badge 一致性、Emoji 選擇器小螢幕版面 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = '/private/tmp/claude-501/-Users-ziyu/44be7cd8-78ba-4b1b-96d1-5d6df277b0e8/scratchpad/shots';
const ENV = fs.readFileSync(path.resolve(__dirname,'../../.env'),'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const st = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.auth/state.json'),'utf8'));
const auth = st.origins[0].localStorage.find(x=>x.name.startsWith('sb-'));
(async()=>{
  const trips = await (await fetch(`${URL}/rest/v1/trips?select=id,name,status`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).json();
  const tokyo = trips.find(t=>t.name.includes('東京')&&t.name.includes('Excel重謄'));
  const b = await chromium.launch({headless:true});
  for (const [w,h,tag] of [[320,568,'320'],[390,844,'390']]) {
    const ctx = await b.newContext({viewport:{width:w,height:h},locale:'zh-TW',deviceScaleFactor:2});
    await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch{}},[auth.name,auth.value]);
    const p = await ctx.newPage();
    await p.goto(`http://localhost:5173/trips/${tokyo.id}`,{waitUntil:'networkidle'}); await p.waitForTimeout(1800);
    await p.screenshot({path:`${OUT}/${tag}-1-detail.png`});
    await p.goto(`http://localhost:5173/trips/${tokyo.id}/edit`,{waitUntil:'networkidle'}); await p.waitForTimeout(2000);
    await p.screenshot({path:`${OUT}/${tag}-2-edit.png`});
    // 成員 emoji 選擇器
    await p.locator('xpath=//label[normalize-space(text())="誰一起去？"]/parent::div//div[contains(@class,"cursor-pointer")][2]//button[1]').click();
    await p.waitForTimeout(1600);
    await p.screenshot({path:`${OUT}/${tag}-3-picker-member.png`});
    await p.getByRole('button',{name:'關閉'}).click();
    await p.waitForTimeout(500);
    // 封面選擇器
    await p.locator('xpath=//label[normalize-space(text())="封面"]/parent::div//button').first().click();
    await p.waitForTimeout(1600);
    await p.screenshot({path:`${OUT}/${tag}-4-picker-cover.png`});
    await ctx.close();
  }
  await b.close(); console.log('截圖完成');
})();
