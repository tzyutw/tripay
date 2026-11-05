/* 後台的版面量測靶（只在 `vite --mode harness` 的開發伺服器下用，不進正式建置）。
 * `?route=/admin/trips/t1` 指定要量哪一頁。假資料刻意塞長字串、沒 emoji 的成員、
 * 外幣、沒填完的帳、長錯誤訊息——**塞爆版面的那幾種都要有**。 */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import '@/index.css';
import { baseTrip, demoExpenses, mk, M } from '@/test/fixtures/adminFixture';

const LONG = '超級無敵長的行程名稱用來測試會不會把畫面撐開到左右可以滑動的程度';
const trips = [
  { ...baseTrip, name: LONG, last_activity_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
    deleted_expense_count: 3, recent_error_count: 2,
    trip_members: baseTrip.trip_members.map((m, i) => i === 3
      ? { ...m, name: '名字超級長的表姊夫的大舅子', emoji: '' } : m) },
  ...[1, 2, 3].map(i => ({ ...baseTrip, id: `t${i + 1}`, name: `ZZ 第 ${i + 1} 趟`,
    status: i === 1 ? 'settled' : i === 2 ? 'archived' : 'active',
    start_date: i === 3 ? '2027-01-01' : baseTrip.start_date,
    trip_members: baseTrip.trip_members.map(m => ({ ...m, trip_id: `t${i + 1}` })),
    last_activity_at: new Date(Date.now() - i * 86400e3).toISOString(),
    deleted_expense_count: 0, recent_error_count: 0 })),
];
const expenses = [
  ...demoExpenses(),
  mk({ title: '一個品項名稱非常非常非常長而且中間沒有任何空白的帳目AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
       foreign_amount: 123456789, twd_amount: 2876543, payment_label: 'LinePay 超長自訂付款方式名稱', payer_member_id: M[3] }),
];
const users = [
  { id: 'u1', email: 'owner-with-a-really-long-address@example.test', display_name: 'Rozi',
    created_at: '2026-07-01T00:00:00Z', last_sign_in_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(), is_admin: true },
  { id: 'u2', email: 'mei@example.test', display_name: '小美本人', created_at: '2026-07-02T00:00:00Z',
    last_sign_in_at: '2026-11-01T00:00:00Z', last_active_at: '2026-11-02T00:00:00Z', is_admin: false },
];
const now = Date.now();
const audit = [
  { id: 3, at: new Date(now - 60e3).toISOString(), actor: 'u2', table_name: 'expenses', op: 'UPDATE',
    row_id: 'e1', trip_id: 't1', expense_id: 'e1',
    old_row: { title: '機票 ×4', twd_amount: 28400, note: null },
    new_row: { title: '機票 ×4', twd_amount: 28500, note: '一段很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長的備註' } },
  { id: 2, at: new Date(now - 3600e3).toISOString(), actor: 'u1', table_name: 'trip_members', op: 'DELETE',
    row_id: 'mx', trip_id: 't1', expense_id: null, old_row: { name: '被移除的阿姨' }, new_row: null },
  { id: 1, at: new Date(now - 7200e3).toISOString(), actor: 'u2', table_name: 'expense_splits', op: 'DELETE',
    row_id: 's1', trip_id: 't1', expense_id: 'e1',
    old_row: { member_id: M[2], is_participating: true, split_amount: null }, new_row: null },
];
const errors = [
  { id: 1, at: new Date(now - 30e3).toISOString(), occurred_at: new Date(now - 600e3).toISOString(),
    user_id: 'u2', trip_id: 't1', screen: '記帳頁', path: '/trips/t1', kind: 'save',
    message: 'new row violates row-level security policy for table "expense_splits" · code=42501 · ' + 'x'.repeat(200),
    user_agent: 'Mozilla/5.0', app_version: 'abc1234' },
  { id: 2, at: new Date(now - 90e3).toISOString(), occurred_at: null, user_id: 'u1', trip_id: null,
    screen: '行程列表', path: '/', kind: 'sync', message: 'Failed to fetch', user_agent: 'x', app_version: 'abc' },
];
const snapshot = { audit_started_at: new Date(now - 86400e3).toISOString(), trips, expenses, settlements: [], users };

const ok = (data: unknown) => Promise.resolve({ data, error: null });
(window as unknown as { __SUPABASE_STUB__: unknown }).__SUPABASE_STUB__ = {
  rpc: (fn: string) => fn === 'admin_check' ? ok(true) : fn === 'admin_snapshot' ? ok(snapshot)
    : fn === 'admin_audit' ? ok(audit) : fn === 'admin_errors' ? ok(errors) : ok(null),
  from: () => { throw new Error('後台不應該直接查資料表'); },
  auth: { getSession: () => ok({ session: { user: { id: 'u1' } } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
};

const { default: AdminPage } = await import('@/pages/admin/AdminPage');
const route = new URLSearchParams(location.search).get('route') ?? '/admin';
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <ToastProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="/" element={<div>行程列表</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);
