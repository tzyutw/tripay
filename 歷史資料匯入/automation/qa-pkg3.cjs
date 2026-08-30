/** 包三 QA：首頁目的地照片卡 */
const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const BASE='http://localhost:5173';
const ENV=fs.readFileSync(path.resolve(__dirname,'../../.env'),'utf8');
const URL=ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(),KEY=ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
const auth=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.auth/state.json'),'utf8')).origins[0].localStorage.find(x=>x.name.startsWith('sb-'));
const R=[];const ck=(n,ok,d='')=>{R.push({n,ok});console.log(`   ${ok?'✅':'❌'} ${n}${d?' — '+d:''}`)};
(async()=>{
 const trips=await (await fetch(`${URL}/rest/v1/trips?select=id,name,start_date&order=start_date.desc`,{headers:H})).json();
 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({locale:'zh-TW',viewport:{width:320,height:568}});
 await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch{}},[auth.name,auth.value]);
 const p=await ctx.newPage();
 await p.goto(BASE,{waitUntil:'networkidle'});await p.waitForTimeout(2500);
 const t=await p.locator('body').innerText();

 console.log('\n══ 1 不顯示金額');
 ck('首頁完全沒有金額',!/\$\s*[\d,—]/.test(t),(t.match(/\$\s*[\d,—]+/g)||[]).join(',')||'無');

 console.log('\n══ 2 目的地照片卡');
 const dp=await p.locator('[data-photo]').evaluateAll(e=>e.map(x=>x.getAttribute('data-photo')));
 ck('每張卡都有 data-photo 佔位',dp.length===trips.length&&dp.every(Boolean),dp.join(' | '));
 ck('目的地各自對應、非重複雜湊',new Set(dp).size===dp.length,`${new Set(dp).size}/${dp.length} 種`);
 const grads=await p.locator('[data-photo]').evaluateAll(e=>e.map(x=>getComputedStyle(x).backgroundImage));
 ck('每張卡 gradient 都不同',new Set(grads).size===grads.length,`${new Set(grads).size} 種`);

 console.log('\n══ 3 卡片資訊完整');
 for(const tr of trips) ck(`「${tr.name}」有出現`,t.includes(tr.name));
 ck('顯示成員 emoji',/🍋|🐟|🐵|🐱/.test(t));
 ck('顯示日期區間',/\d+\/\d+ – \d+\/\d+ · \d{4}/.test(t));
 ck('顯示狀態 badge',t.includes('已結算'));

 console.log('\n══ 4 排序仍為出發日新→舊');
 const pos=trips.map(x=>t.indexOf(x.name));
 ck('順序正確',pos.every((v,i)=>v>=0&&(i===0||v>pos[i-1])),trips.map(x=>x.name.slice(0,9)).join(' → '));

 console.log('\n══ 5 導航仍正常');
 await p.locator('[data-photo]').first().click();
 await p.waitForTimeout(2000);
 ck('點卡片進得去行程詳情',p.url().includes(`/trips/${trips[0].id}`),p.url().split('/').slice(-1)[0]);
 const dt=await p.locator('body').innerText();
 ck('金額仍在詳情頁看得到',/總花費/.test(dt)&&/\$\s*[\d,]+/.test(dt));

 console.log('\n══ 6 Aria：G-02 幽靈卡可讀');
 await p.goto(BASE,{waitUntil:'networkidle'});await p.waitForTimeout(2000);
 const ghost=p.locator('text=你的下一趟在哪？').first();
 const st=await ghost.evaluate(el=>{const c=el.closest('[style*="blur"]');return {blur:c?getComputedStyle(c).filter:'',op:c?getComputedStyle(c).opacity:'',color:getComputedStyle(el).color}});
 const blurPx=parseFloat((st.blur.match(/blur\(([\d.]+)px\)/)||[0,9])[1]);
 ck('幽靈卡 blur 已降到可讀範圍',blurPx<=1.0,`blur=${blurPx}px opacity=${st.op}`);
 ck('幽靈卡仍可點（＝新增行程入口）',await ghost.isVisible());

 await b.close();
 const bad=R.filter(x=>!x.ok);
 console.log(`\n════ ${R.length-bad.length}/${R.length} 通過 ${bad.length?'❌ '+bad.map(x=>x.n).join('；'):'✅'}`);
 process.exit(bad.length?1:0);
})();
