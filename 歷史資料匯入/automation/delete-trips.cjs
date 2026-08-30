/**
 * ⚠️ 一次性腳本（2026-08-30 一次性授權刪除舊展示行程，已執行完畢）——目標行程已不存在，重跑無效。
 * 不適用 guard.cjs 的 ZZ 前綴規則：這是經 Rozi 明列 id 拍板的正式資料刪除。
 *
 * Rozi 2026-08-30 正式拍板：刪除 5 筆舊展示行程。
 * 走資料層（UI 無刪除功能，本次特例授權）；用 Rozi 的登入 session，
 * 依 trips 的 owner delete RLS 政策執行；子表靠 FK ON DELETE CASCADE 連帶清除。
 */
const fs = require('fs'); const path = require('path');
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const st = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../.auth/state.json'), 'utf8'));
const tok = JSON.parse(st.origins[0].localStorage.find(x => x.name.startsWith('sb-')).value);
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../backup/deleted-trips-2026-08-30/_manifest.json'), 'utf8'));
const ck = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../checkpoint.json'), 'utf8'));
const KEEP = new Set(Object.values(ck).map(v => v.tripUuid));

(async () => {
  // 護欄：待刪清單絕不能碰到重謄的四趟
  const targets = manifest.trips;
  if (targets.length !== 5) { console.log('❌ 備份 manifest 不是 5 筆，中止'); process.exit(1); }
  for (const t of targets) if (KEEP.has(t.id)) { console.log(`❌ 待刪清單含重謄行程 ${t.id}，中止`); process.exit(1); }

  let access = tok.access_token;
  const probe = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } });
  if (!probe.ok) {
    const r = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tok.refresh_token }) });
    const j = await r.json();
    if (!j.access_token) { console.log('❌ refresh 失敗：', JSON.stringify(j).slice(0, 200)); process.exit(1); }
    access = j.access_token; console.log('（access_token 已過期，已用 refresh_token 換新）');
  }
  const AH = { apikey: KEY, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

  for (const t of targets) {
    const res = await fetch(`${URL}/rest/v1/trips?id=eq.${t.id}`, { method: 'DELETE', headers: AH });
    const body = await res.text();
    if (!res.ok) { console.log(`❌ ${t.name}：HTTP ${res.status} ${body.slice(0, 300)}`); console.log('→ 停止，不再繼續刪除'); process.exit(1); }
    const rows = JSON.parse(body || '[]');
    console.log(`  ${rows.length === 1 ? '✅' : '⚠️'} 已刪 ${t.name.padEnd(24)} (${rows.length} 列) ${t.id}`);
  }
  console.log('\n刪除完成。');
})();
