/* 實作-C-3　量測靶的 supabase 樁：量版面不連網路，回傳形狀與真實查詢一致。
   這個檔要在任何畫面模組 evaluate 之前跑完，所以獨立成一個 import。 */
import { trip, expenses, members, settlementItems, allSettlementItems, settlements,
         CONFIRMED_ID, noExpenses, tripMissing } from './fixtures';

/* `?state=settled`：讓 S-05 走到「已結算、逐筆標記付清」那一態，
   才畫得出「查看計算依據」的逐人列。預設維持 active，不動既有版面基準。 */
const st = new URLSearchParams(location.search).get('state');
const settled = st === 'settled';
/* `?state=archived`：封存態的列**維持唯讀**（決策 B），但點下去要有話講。
   已結算與封存是**兩件事**，所以兩個狀態都要有假資料走過。 */
const archived = st === 'archived';
/* `?expenses=none` 由 fixtures 統一解析——同一個參數不要在兩個檔各判一次 */
const expenses2 = noExpenses ? [] : expenses;
const rows: Record<string, unknown[]> = {
  /* `?trip=missing`：查不到任何列——`.maybeSingle()` 會回 null，畫面要走「找不到」 */
  trips: tripMissing ? [] : [settled ? { ...trip, status: 'settled' }
                           : archived ? { ...trip, status: 'archived' } : trip],
  expenses: tripMissing ? [] : expenses2, trip_members: tripMissing ? [] : members,
  /* 直接查表的路徑（S-05／ShareSheet）只會拿 confirmed 那一筆 */
  settlements: noExpenses ? [] : [{ id: CONFIRMED_ID, trip_id: 't1', status: 'confirmed',
                  created_at: '2026-03-20', settlement_items: settlementItems }],
};
/* 記下有沒有真的送出寫入。「必填沒填就不該送出」這種斷言，
   光看畫面沒變是不夠的——畫面沒變也可能是送出了但回來的資料一樣。 */
const writes: string[] = [];
(window as unknown as { __WRITES__: string[] }).__WRITES__ = writes;

function chain(table: string) {
  const data = rows[table] ?? [];
  const result = { data, error: null, count: data.length };
  const c: Record<string, unknown> = {
    then: (r: (v: typeof result) => unknown) => Promise.resolve(result).then(r),
    single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
  };
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'range',
                   'filter', 'gte', 'lte', 'match', 'or', 'returns', 'abortSignal'])
    c[m] = () => c;
  for (const m of ['insert', 'update', 'upsert', 'delete'])
    c[m] = () => { writes.push(`${m}:${table}`); return c; };
  return c;
}
const stub = {
  from: (t: string) => chain(t),
  rpc: (_fn: string) => Promise.resolve({
    /* 分享頁的 RPC 查不到 token 時回 null（get_shared_trip 的實際行為） */
    data: tripMissing ? null : {
      trip, members,
      expenses: expenses2.map(({ expense_splits: _s, ...e }) => e),
      splits: expenses2.flatMap(e => e.expense_splits),
      /* RPC 回的是這趟**所有**結算與**所有** items——分享頁自己挑 */
      settlements: noExpenses ? [] : settlements,
      settlement_items: noExpenses ? [] : allSettlementItems,
    },
    error: null,
  }),
  auth: {
    getUser: () => Promise.resolve({ data: { user: {
      id: 'u1', email: 'msziyu@gmail.com', user_metadata: { full_name: 'Rozi' },
    } }, error: null }),
    getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: () => Promise.resolve({ error: null }),
    signInWithOAuth: () => Promise.resolve({ error: null }),
  },
  functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: { signedUrl: '' }, error: null }) }) },
  channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
  removeChannel: () => {},
};
(window as unknown as { __SUPABASE_STUB__: unknown }).__SUPABASE_STUB__ = stub;
/* 把這一趟的 trip 掛出來給量測腳本查——只在量測靶裡，production bundle 碰不到 */
(window as unknown as { __TRIP__: unknown }).__TRIP__ = rows.trips[0];
/* **真正被端出去的那一份**（已套用 `?expenses=none`／`?trip=missing` 等開關）。
   `__HARNESS_FIXTURE__` 要照這一份掛，不能直接掛 fixtures 的原始清單——
   兩者不同時，「參數有沒有作用」的反向斷言會拿對照組當通過。 */
(window as unknown as { __SERVED__: unknown }).__SERVED__ = {
  trip: rows.trips[0], expenses: rows.expenses, members: rows.trip_members,
};

