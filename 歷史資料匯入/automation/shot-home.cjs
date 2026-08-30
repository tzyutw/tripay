const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const OUT='/private/tmp/claude-501/-Users-ziyu/44be7cd8-78ba-4b1b-96d1-5d6df277b0e8/scratchpad/shots';
const auth=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.auth/state.json'),'utf8')).origins[0].localStorage.find(x=>x.name.startsWith('sb-'));
(async()=>{
 const b=await chromium.launch({headless:true});
 for(const [w,h,tag] of [[320,568,'320'],[390,844,'390']]){
  const ctx=await b.newContext({viewport:{width:w,height:h},locale:'zh-TW',deviceScaleFactor:2});
  await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch{}},[auth.name,auth.value]);
  const p=await ctx.newPage();
  await p.goto('http://localhost:5173/',{waitUntil:'networkidle'});await p.waitForTimeout(2500);
  await p.screenshot({path:`${OUT}/home-${tag}.png`,fullPage:tag==='390'});
  if(tag==='390'){
   const t=await p.locator('body').innerText();
   console.log('── 首頁文字 ──'); console.log(t.replace(/\n{2,}/g,'\n'));
   const dp=await p.locator('[data-photo]').evaluateAll(els=>els.map(e=>e.getAttribute('data-photo')));
   console.log('data-photo:',dp.join(' | '));
   console.log('含金額符號?',/\$\s*[\d,]/.test(t)?'❌ 有':'✅ 無');
  }
  await ctx.close();
 }
 await b.close();
})();
