/* 實作-C-3　量測靶的 supabase 樁：量版面不連網路，回傳形狀與真實查詢一致。
   這個檔要在任何畫面模組 evaluate 之前跑完，所以獨立成一個 import。 */
import { trip, expenses, members, settlementItems } from './fixtures';

const rows: Record<string, unknown[]> = {
  trips: [trip], expenses, trip_members: members,
  settlements: [{ id: 's1', trip_id: 't1', status: 'confirmed',
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
    data: {
      trip, members,
      expenses: expenses.map(({ expense_splits: _s, ...e }) => e),
      splits: expenses.flatMap(e => e.expense_splits),
      settlement_items: settlementItems,
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

