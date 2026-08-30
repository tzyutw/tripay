/** 刪除前完整備份 5 筆行程（trips／trip_members／expenses／expense_splits／settlements／settlement_items）。 */
const fs = require('fs'); const path = require('path');
const ENV = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const URL = ENV.match(/VITE_SUPABASE_URL=(.+)/)[1].trim(), KEY = ENV.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const OUT = path.resolve(__dirname, '../backup/deleted-trips-2026-08-30');
const ck = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../checkpoint.json'), 'utf8'));
const KEEP = new Set(Object.values(ck).map(v => v.tripUuid));

const get = async (t, q) => { const r = await fetch(`${URL}/rest/v1/${t}?${q}`, { headers: H }); const j = await r.json(); if (!Array.isArray(j)) throw new Error(`${t}: ${JSON.stringify(j)}`); return j; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const trips = (await get('trips', 'select=*&order=created_at')).filter(t => !KEEP.has(t.id));
  if (trips.length !== 5) { console.log(`❌ 待刪不是 5 筆（${trips.length}），中止`); process.exit(1); }

  const manifest = { exportedAt: new Date().toISOString(), reason: 'Rozi 2026-08-30 正式拍板刪除舊展示行程', trips: [] };
  for (const t of trips) {
    const members = await get('trip_members', `select=*&trip_id=eq.${t.id}`);
    const expenses = await get('expenses', `select=*&trip_id=eq.${t.id}`);
    const splits = expenses.length ? await get('expense_splits', `select=*&expense_id=in.(${expenses.map(e => e.id).join(',')})`) : [];
    const settlements = await get('settlements', `select=*&trip_id=eq.${t.id}`);
    const items = settlements.length ? await get('settlement_items', `select=*&settlement_id=in.(${settlements.map(s => s.id).join(',')})`) : [];
    const bundle = { trip: t, trip_members: members, expenses, expense_splits: splits, settlements, settlement_items: items };
    const safe = t.name.replace(/[^\w一-鿿]+/g, '_');
    const file = `${safe}__${t.id}.json`;
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(bundle, null, 2));
    manifest.trips.push({ id: t.id, name: t.name, status: t.status, file,
      counts: { trip_members: members.length, expenses: expenses.length, expense_splits: splits.length, settlements: settlements.length, settlement_items: items.length } });
    console.log(`  ✅ ${t.name.padEnd(24)} 成員 ${members.length}／消費 ${expenses.length}／分帳 ${splits.length}／結算 ${settlements.length}(${items.length} 項) → ${file}`);
  }
  fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n備份完成：${OUT}`);
})();
