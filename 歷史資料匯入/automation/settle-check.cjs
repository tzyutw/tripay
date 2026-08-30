/**
 * 呼叫 Tripay 真正的 calculate-settlement Edge Function，取「產品自己算出來」的每人淨額，
 * 與已凍結的基準 B 對照。只算 draft、不 confirm、不封存，只動本次新建的（Excel重謄）行程。
 */
const fs = require('fs');
const path = require('path');

const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const state = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../.auth/state.json'), 'utf8'));
const tok = JSON.parse(state.origins[0].localStorage.find(x => x.name.startsWith('sb-')).value);
const FIX = path.resolve(__dirname, '../fixtures');
const ckpt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../checkpoint.json'), 'utf8'));
const bTwd = JSON.parse(fs.readFileSync(path.join(FIX, 'baseline-b-twd.json'), 'utf8'));
const r2 = (n) => Math.round(n * 100) / 100;

(async () => {
  let access = tok.access_token;
  // token 可能已過期 → 用 refresh_token 換新的
  const probe = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${access}` } });
  if (!probe.ok) {
    const r = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tok.refresh_token }),
    });
    const j = await r.json();
    if (!j.access_token) { console.log('❌ refresh 失敗：', JSON.stringify(j).slice(0, 200)); process.exit(1); }
    access = j.access_token;
    console.log('（access_token 已過期，已用 refresh_token 換新）');
  }

  const results = {};
  for (const trip of ['fukuoka', 'tokyo', 'hokkaido', 'jeju']) {
    const uuid = ckpt[trip].tripUuid;
    const res = await fetch(`${URL}/functions/v1/calculate-settlement`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: uuid }),
    });
    const j = await res.json();
    if (!res.ok) { console.log(`\n══ ${trip}: ❌ HTTP ${res.status} ${JSON.stringify(j).slice(0, 300)}`); results[trip] = { error: j }; continue; }

    const plan = JSON.parse(fs.readFileSync(path.join(FIX, `plan-${trip}.json`), 'utf8'));
    const keyOf = (name) => (plan.trip.members.find(m => m.name === name) || {}).key;
    const frozen = bTwd[trip] ? bTwd[trip].net_twd : null;
    const tol = plan.trip.members.length;

    console.log(`\n══ ${trip}　Tripay calculate-settlement（產品自己算的）`);
    console.log(`   轉帳筆數 ${j.items.length}　待填 ${j.pending_count}`);
    console.log('   成員       Tripay 淨額      凍結基準B        差');
    let ok = true;
    for (const b of j.member_balances) {
      const base = frozen ? frozen[keyOf(b.name)] : null;
      if (base == null) { console.log(`   ${b.emoji} ${b.name.padEnd(6)} ${String(r2(b.net_balance)).padStart(13)}         （基準 B 不適用）`); continue; }
      const d = r2(b.net_balance - base);
      if (Math.abs(d) > tol) ok = false;
      console.log(`   ${b.emoji} ${b.name.padEnd(6)} ${String(r2(b.net_balance)).padStart(13)} ${String(r2(base)).padStart(14)} ${String(d).padStart(9)}  ${Math.abs(d) <= tol ? '✅' : '❌'}`);
    }
    const sum = r2(j.member_balances.reduce((s, b) => s + b.net_balance, 0));
    console.log(`   Σ淨額 = ${sum} ${Math.abs(sum) < 1 ? '✅' : '❌'}　判定：${frozen ? (ok ? '✅ 通過' : '❌ 未過') : '（基準 B 不適用）'}`);
    console.log('   轉帳路徑：' + j.items.map(i => {
      const f = j.member_balances.find(x => x.member_id === i.from_member_id);
      const t = j.member_balances.find(x => x.member_id === i.to_member_id);
      return `${f.emoji}→${t.emoji} $${i.amount}`;
    }).join('　'));
    results[trip] = { balances: j.member_balances, items: j.items, ok, sum };
  }
  fs.writeFileSync(path.join(FIX, 'settlement-actual.json'), JSON.stringify(results, null, 2));
})();
