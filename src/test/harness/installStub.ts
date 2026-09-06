/* 實作-C-3　量測靶的 supabase 樁：量版面不連網路，回傳形狀與真實查詢一致。
   這個檔要在任何畫面模組 evaluate 之前跑完，所以獨立成一個 import。 */
import { trip, expenses, members, settlementItems, noExpenses, tripMissing } from './fixtures';

/* `?state=settled`：讓 S-05 走到「已結算、逐筆標記付清」那一態，
   才畫得出「查看計算依據」的逐人列。預設維持 active，不動既有版面基準。 */
const settled = new URLSearchParams(location.search).get('state') === 'settled';
/* `?expenses=none` 由 fixtures 統一解析——同一個參數不要在兩個檔各判一次 */
const expenses2 = noExpenses ? [] : expenses;
const rows: Record<string, unknown[]> = {
  /* `?trip=missing`：查不到任何列——`.maybeSingle()` 會回 null，畫面要走「找不到」 */
  trips: tripMissing ? [] : [settled ? { ...trip, status: 'settled' } : trip],
  expenses: tripMissing ? [] : expenses2, trip_members: tripMissing ? [] : members,
  settlements: noExpenses ? [] : [{ id: 's1', trip_id: 't1', status: 'confirmed',
                  created_at: '2026-03-20', settlement_items: settlementItems }],
};
function chain(table: string) {
  const data = rows[table] ?? [];
  const result = { data, error: null, count: data.length };
  const c: Record<string, unknown> = {
    then: (r: (v: typeof result) => unknown) => Promise.resolve(result).then(r),
    single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
  };
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'range',
                   'filter', 'gte', 'lte', 'match', 'or', 'insert', 'update', 'upsert',
                   'delete', 'returns', 'abortSignal'])
    c[m] = () => c;
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
      settlement_items: noExpenses ? [] : settlementItems,
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

