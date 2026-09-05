/* 實作-C-5-3　分享頁端到端：**只讀，不寫，不刪。**
 *
 * 用 anon key（未登入者拿得到的那把）直接打 production 的 `get_shared_trip()`：
 *   ① 正確 token → 看得到那一趟
 *   ② token 改掉一個字元 → 什麼都看不到
 *
 * 這一條是實作-A 的權限收斂（migration 013）與實作-B 的畫面改動**合起來**才成立的，
 * 所以要在上線前驗一次。
 *
 * ⚠️ 刪除守則：這支腳本**一次刪除都不做**，也不建立任何資料。
 *    它只發 GET 性質的 RPC。
 */
const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };

async function rpc(token) {
  const r = await fetch(`${URL}/rest/v1/rpc/get_shared_trip`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

(async () => {
  console.log('\n=== 實作-C-5-3　分享頁端到端（未登入者的視角）===');
  if (!URL || !KEY) { console.log('   .env 沒有 URL／anon key，跳過'); process.exit(0); }

  /* 先用 anon 身分確認「直接查表」確實已經被 013 收掉 */
  const direct = await fetch(`${URL}/rest/v1/trips?select=id,name&limit=3`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const directBody = await direct.json().catch(() => null);
  const directRows = Array.isArray(directBody) ? directBody.length : -1;
  console.log(`   ① anon 直接查 trips：HTTP ${direct.status}，拿到 ${directRows} 列`);
  ok(directRows === 0 || direct.status >= 400,
    `anon 還讀得到 trips（${directRows} 列）——013 的權限收斂沒生效`);

  /* 找一個真的存在的 token：用 anon 打 RPC 沒辦法列舉，所以從 checkpoint 讀正式行程。
     **只讀，不動任何資料。** */
  let token = process.env.SHARE_TOKEN || null;
  if (!token) {
    console.log('   （沒有給 SHARE_TOKEN，只驗「錯的 token 看不到」這個方向）');
  } else {
    const good = await rpc(token);
    const name = good.body && good.body.trip && good.body.trip.name;
    console.log(`   ② 正確 token：HTTP ${good.status}，行程「${name || '(沒有)'}」`);
    ok(good.status === 200 && !!name, '正確的 token 看不到行程');
  }

  /* 錯的 token：把最後一個字元換掉 */
  const bad = (token || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const flipped = bad.slice(0, -1) + (bad.slice(-1) === 'z' ? 'y' : 'z');
  const res = await rpc(flipped);
  const got = res.body && res.body.trip ? res.body.trip.name : null;
  console.log(`   ③ 改掉一個字元的 token：HTTP ${res.status}，回 ${JSON.stringify(res.body)?.slice(0, 60)}`);
  ok(res.status === 200 && (res.body === null || !got),
    `改過的 token 竟然看得到「${got}」——這是資料外洩`);

  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
