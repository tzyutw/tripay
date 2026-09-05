/* 實作-C-3　版面回歸用的假資料：**與 fixtures/screens.json 同源的那一組**
 * （原型的 demoExpenses()）。版面測試量的是真實元件配真實 CSS，
 * 所以資料也要是真實形狀，不能用一兩筆敷衍——短內容量不出溢出。 */
import type { Trip, TripMember, ExpenseWithSplits } from '@/types/database';

export const M = ['m0', 'm1', 'm2', 'm3'];

export const members: TripMember[] = [
  { emoji: '🐵', name: 'Rozi' }, { emoji: '🐱', name: '小美' },
  { emoji: '🍋', name: '阿明' }, { emoji: '🐟', name: '小魚' },
].map((m, i) => ({
  id: M[i], trip_id: 't1', name: m.name, emoji: m.emoji, sort_order: i,
  linked_profile_id: null, person_id: null, user_id: null, role: null,
  created_at: '2026-03-01',
})) as TripMember[];

export const trip = {
  id: 't1', owner_id: 'u1', name: '2026 濟州島四寶團', emoji: '✈️', currency: 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: M[0], collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: ['現金', '信用卡'], cash_rate_twd: null, cash_rate_foreign: null,
  tone_seq: 0, created_at: '2026-03-01', updated_at: '2026-03-01',
  trip_members: members,
} as unknown as Trip & { trip_members: TripMember[] };

let seq = 0;
function mk(o: Record<string, unknown>): ExpenseWithSplits {
  seq += 1;
  const parts = (o.parts as string[]) ?? M;
  const indiv = (o.indiv as Record<string, number>) ?? {};
  return {
    id: `e${seq}`, trip_id: 't1', created_by: 'u1', title: '', category_emoji: '➕',
    expense_date: '2026-03-14', foreign_amount: null, twd_amount: null, exchange_rate: null,
    foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false,
    split_fill_currency: 'TWD', individual_member_id: null, payment_label: null,
    category_emoji_manual: false, updated_by: null, card_id: null, deleted_at: null,
    created_at: new Date(2026, 0, seq).toISOString(), updated_at: '2026-03-01',
    ...o,
    expense_splits: parts.map(id => ({
      id: `s${seq}-${id}`, expense_id: `e${seq}`, member_id: id, is_participating: true,
      split_amount: indiv[id] ?? null, split_amount_foreign: null,
      split_pending: !(id in indiv), created_at: '2026-03-01',
    })),
  } as unknown as ExpenseWithSplits;
}

export const expenses: ExpenseWithSplits[] = [
  mk({ title: '機票 ×4', category_emoji: '✈️', expense_date: '2026-02-10',
       twd_amount: 28400, payment_method: 'credit_card', payer_member_id: M[0] }),
  mk({ title: '黑豬肉晚餐', category_emoji: '🍜', expense_date: '2026-03-14',
       foreign_amount: 108000, twd_amount: 2480, payment_method: 'credit_card', payer_member_id: M[2] }),
  mk({ title: '藥妝店', category_emoji: '🛍️', expense_date: '2026-03-15',
       foreign_amount: 45000, twd_amount: 1035, payment_method: 'credit_card',
       expense_type: 'individual', indiv: { [M[0]]: 12000, [M[1]]: 18000 }, payer_member_id: M[1] }),
  mk({ title: '城山日出峰門票', category_emoji: '🎡', expense_date: '2026-03-15',
       foreign_amount: 20000, payer_member_id: M[3] }),
  mk({ title: '紀念品', category_emoji: '🛍️', expense_date: '2026-03-16',
       twd_amount: 860, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[1] }),
  mk({ title: '機場接送', category_emoji: '🚌', expense_date: '2026-03-18',
       twd_amount: 1600, payer_member_id: M[0], settled_on_spot: true }),
  mk({ title: '計程車', category_emoji: '🚕', expense_date: '2026-03-16', payer_member_id: M[0] }),
  mk({ title: '爸爸贊助', category_emoji: '💝', expense_date: '2026-03-14',
       twd_amount: 50000, payer_member_id: M[0], is_sponsor: true }),
];

export const settlementItems = [
  { id: 'i1', from_member_id: M[3], to_member_id: M[0], amount: 20220, is_cleared: true },
  { id: 'i2', from_member_id: M[2], to_member_id: M[0], amount: 17740, is_cleared: false },
  { id: 'i3', from_member_id: M[1], to_member_id: M[0], amount: 8220,  is_cleared: false },
];
