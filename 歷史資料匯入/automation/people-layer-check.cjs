/**
 * D2 people 抽層 回歸測試（套用 006 前後各跑一次）
 * 套用前：people 表不存在 → 前段紅、後段（結算不變）綠
 * 套用後：應全綠
 */
const fs = require('fs'); const path = require('path');
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
// people 的 RLS 是 auth.uid() = owner_id（通訊錄不該公開可讀），
// 所以必須用登入者的 token，不能用 anon key。
const stFile = path.resolve(__dirname, '../../.auth/state.json');
const tok = JSON.parse(JSON.parse(fs.readFileSync(stFile, 'utf8')).origins[0].localStorage.find(x => x.name.startsWith('sb-')).value);
let H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const R = []; const ck = (n, ok, d = '') => { R.push({ n, ok }); console.log(`   ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const get = async (q) => { const r = await fetch(`${URL}/rest/v1/${q}`, { headers: H }); return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) }; };

(async () => {
  let access = tok.access_token;
  if (!(await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } })).ok) {
    const j = await (await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: tok.refresh_token }) })).json();
    access = j.access_token;
  }
  H = { apikey: KEY, Authorization: `Bearer ${access}` };

  console.log('\n══ 0 RLS：anon 不得讀到 people（通訊錄隱私）');
  const anonRead = await (await fetch(`${URL}/rest/v1/people?select=id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
  ck('anon key 讀 people 回 0 筆（RLS 正確擋住）', Array.isArray(anonRead) && anonRead.length === 0, `${Array.isArray(anonRead) ? anonRead.length : '?'} 筆`);

  console.log('\n══ 1 people 表與回填');
  const pe = await get('people?select=id,name,emoji,owner_id');
  ck('people 表存在且可讀', pe.ok, pe.ok ? `${pe.json.length} 筆` : `HTTP ${pe.status}`);
  if (pe.ok) {
    ck('去重後 5 個人', pe.json.length === 5, pe.json.map(x => `${x.emoji}${x.name}`).join(' '));
    const uniq = new Set(pe.json.map(x => `${x.owner_id}|${x.name}|${x.emoji}`));
    ck('無重複（owner+name+emoji）', uniq.size === pe.json.length);
  }

  console.log('\n══ 2 trip_members 全數掛上 person_id');
  const tm = await get('trip_members?select=id,name,emoji,person_id,trip_id');
  ck('trip_members 可讀', tm.ok, tm.ok ? `${tm.json.length} 筆` : `HTTP ${tm.status}`);
  if (tm.ok && pe.ok) {
    const unlinked = tm.json.filter(x => !x.person_id);
    ck('沒有未對應的成員', unlinked.length === 0, `未對應 ${unlinked.length} 筆`);
    const pmap = Object.fromEntries(pe.json.map(p => [p.id, p]));
    const wrong = tm.json.filter(x => x.person_id && pmap[x.person_id] &&
      (pmap[x.person_id].name !== x.name || pmap[x.person_id].emoji !== x.emoji));
    ck('對應的 name/emoji 一致', wrong.length === 0, `不一致 ${wrong.length} 筆`);
    const byPerson = {};
    for (const x of tm.json) if (x.person_id) byPerson[x.person_id] = (byPerson[x.person_id] || 0) + 1;
    ck('同一人跨多趟指向同一個 person', Object.values(byPerson).some(v => v > 1),
      Object.entries(byPerson).map(([k, v]) => `${pmap[k] ? pmap[k].emoji : '?'}×${v}`).join(' '));
  }

  console.log('\n══ 3 結算完全未受影響（settlement_items 仍指向 trip_members）');
  const si = await get('settlement_items?select=from_member_id,to_member_id,amount');
  const ids = tm.ok ? new Set(tm.json.map(x => x.id)) : new Set();
  ck('settlement_items 可讀', si.ok, si.ok ? `${si.json.length} 筆` : `HTTP ${si.status}`);
  if (si.ok && tm.ok) {
    const dangling = si.json.filter(x => !ids.has(x.from_member_id) || !ids.has(x.to_member_id));
    ck('無指向不存在成員的結算項', dangling.length === 0, `${dangling.length} 筆`);
  }

  const bad = R.filter(x => !x.ok);
  console.log(`\n════ ${R.length - bad.length}/${R.length} 通過 ${bad.length ? '❌ ' + bad.map(x => x.n).join('；') : '✅'}`);
  process.exit(bad.length ? 1 : 0);
})();
