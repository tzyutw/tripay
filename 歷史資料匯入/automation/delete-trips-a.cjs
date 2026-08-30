/**
 * ⚠️ 一次性腳本（2026-08-30 方案 A 一次性授權刪除，已執行完畢）——目標行程已不存在，重跑無效。
 * 不適用 guard.cjs 的 ZZ 前綴規則：這是經 Rozi 明列 id 拍板的正式資料刪除。
 *
 * 方案 A（Rozi 2026-08-30 拍板）：刪除剩餘 2 筆舊展示行程。
 * 授權補充：刪 trip 前可先刪「該 trip 自己的」settlements（連帶 settlement_items）。
 * 除此之外不多刪任何一列；保留的四趟重謄行程絕對不可動。
 */
const fs = require('fs'); const path = require('path');
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const st = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../.auth/state.json'), 'utf8'));
const tok = JSON.parse(st.origins[0].localStorage.find(x => x.name.startsWith('sb-')).value);
const ck = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../checkpoint.json'), 'utf8'));
const KEEP = new Set(Object.values(ck).map(v => v.tripUuid));

// 授權範圍：只有這兩筆，寫死
const TARGETS = [
  { id: '4890b28d-b032-4856-b22b-133bf364d76a', name: '2023 福岡（舊展示，archived）' },
  { id: 'a5423e83-ad42-49d0-8776-0eb09cef54a3', name: '2024 慢遊首爾 7Days' },
];

(async () => {
  for (const t of TARGETS) if (KEEP.has(t.id)) { console.log(`❌ 目標含重謄行程 ${t.id}，中止`); process.exit(1); }

  let access = tok.access_token;
  const probe = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } });
  if (!probe.ok) {
    const r = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tok.refresh_token }) });
    const j = await r.json();
    if (!j.access_token) { console.log('❌ refresh 失敗'); process.exit(1); }
    access = j.access_token; console.log('（access_token 已過期，已用 refresh_token 換新）');
  }
  const AH = { apikey: KEY, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const del = async (q) => { const r = await fetch(`${URL}/rest/v1/${q}`, { method: 'DELETE', headers: AH }); const b = await r.text(); return { ok: r.ok, status: r.status, rows: r.ok ? JSON.parse(b || '[]') : [], body: b }; };

  for (const t of TARGETS) {
    // 1) 先刪該 trip 自己的 settlements（連帶 settlement_items）
    const s = await del(`settlements?trip_id=eq.${t.id}`);
    if (!s.ok) { console.log(`❌ ${t.name} 刪 settlements 失敗：HTTP ${s.status} ${s.body.slice(0, 250)}`); process.exit(1); }
    console.log(`  · ${t.name}：先刪 settlements ${s.rows.length} 筆`);

    // 2) 再刪 trip（其餘子表靠 CASCADE）
    const d = await del(`trips?id=eq.${t.id}`);
    if (!d.ok) { console.log(`❌ ${t.name} 刪 trip 失敗：HTTP ${d.status} ${d.body.slice(0, 300)}`); process.exit(1); }
    console.log(`  ${d.rows.length === 1 ? '✅' : '⚠️'} 已刪 ${t.name} (${d.rows.length} 列) ${t.id}`);
  }
  console.log('\n刪除完成。');
})();
