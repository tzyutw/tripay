const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const OUT='/private/tmp/claude-501/-Users-ziyu/44be7cd8-78ba-4b1b-96d1-5d6df277b0e8/scratchpad/shots';
const ck=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../checkpoint.json'),'utf8'));
(async()=>{
 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({storageState:path.resolve(__dirname,'../../.auth/state.json'),locale:'zh-TW',viewport:{width:390,height:844},deviceScaleFactor:2});
 const p=await ctx.newPage();
 await p.goto(`https://tzyutw.github.io/tripay/trips/${ck.jeju.tripUuid}/settlement`,{waitUntil:'networkidle',timeout:60000});
 await p.waitForTimeout(3500);
 await p.getByText('查看計算依據').click().catch(()=>{});
 await p.waitForTimeout(1200);
 await p.screenshot({path:`${OUT}/jeju-settlement.png`,fullPage:true});
 const t=await p.locator('body').innerText();
 console.log('── 結算頁全文 ──');
 console.log(t.replace(/\n{2,}/g,'\n'));
 await b.close();
})();
