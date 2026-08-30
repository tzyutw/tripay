const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const st=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.auth/state.json'),'utf8'));
(async()=>{
 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({storageState:path.resolve(__dirname,'../../.auth/state.json'),locale:'zh-TW',viewport:{width:480,height:900}});
 const p=await ctx.newPage();
 await p.goto('https://tzyutw.github.io/tripay/',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
 const t=await p.locator('body').innerText();
 const order=['2026 濟州島四寶團','2025 北海道四寶團','2024 東京富士山五寶團','2023 福岡'];
 const pos=order.map(n=>t.indexOf(n));
 console.log(`   ${pos.every((v,i)=>v>=0&&(i===0||v>pos[i-1]))?'✅':'❌'} 排序依出發日新→舊`);
 console.log(`   ${!/[¥₩]\s*[\d—]/.test(t)?'✅':'❌'} 卡片金額用 $、無外幣符號`);
 console.log(`   線上卡片金額：${(t.match(/\$ [\d,]+/g)||[]).join('  ')}`);
 await b.close();
})();
