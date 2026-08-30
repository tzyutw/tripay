const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const ENV=fs.readFileSync(path.resolve(__dirname,'../../.env'),'utf8');
const URL=ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(),KEY=ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const st=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.auth/state.json'),'utf8'));
const auth=st.origins[0].localStorage.find(x=>x.name.startsWith('sb-'));
(async()=>{
 const trips=await (await fetch(`${URL}/rest/v1/trips?select=id&name=like.*東京*Excel*`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).json();
 const b=await chromium.launch({headless:true});
 const ctx=await b.newContext({viewport:{width:320,height:568},locale:'zh-TW'});
 await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch{}},[auth.name,auth.value]);
 const p=await ctx.newPage();
 await p.goto(`http://localhost:5173/trips/${trips[0].id}/edit`,{waitUntil:'networkidle'});
 await p.waitForTimeout(2500);
 await p.locator('xpath=//label[normalize-space(text())="封面"]/parent::div//button').first().click();
 await p.waitForTimeout(2000);
 const info = await p.evaluate(() => {
   const btn = [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='就用這個');
   const out = { vh: innerHeight, scrollY, btn: btn.getBoundingClientRect().top };
   const chain = [];
   let el = btn;
   while (el && el !== document.documentElement) {
     const cs = getComputedStyle(el);
     chain.push({ cls: (el.className||'').toString().slice(0,52), pos: cs.position, tr: cs.transform === 'none' ? '-' : 'HAS-TRANSFORM', h: Math.round(el.getBoundingClientRect().height), maxh: cs.maxHeight, of: cs.overflowY });
     el = el.parentElement;
   }
   out.chain = chain.slice(0,7);
   return out;
 });
 console.log('viewport h =', info.vh, ' scrollY =', info.scrollY, ' 按鈕 top =', Math.round(info.btn));
 for (const c of info.chain) console.log(`  pos=${c.pos.padEnd(8)} ${c.tr.padEnd(14)} h=${String(c.h).padStart(5)} maxH=${c.maxh.padEnd(10)} of=${c.of.padEnd(7)} ${c.cls}`);
 await b.close();
})();
