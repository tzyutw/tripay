/* 後台測試用的假資料。成員與帳目沿用 SettlementPage.test.tsx 的濟州島 demo，
   另外補幾筆「有問題的帳」讓健康檢查有東西可抓（CLAUDE.md：假資料要涵蓋 fallback 與空值路徑）。 */
import type { ExpenseWithSplits, TripWithMembers } from '@/types/database';

export const M = ['m0', 'm1', 'm2', 'm3'];
export const members = [
  { emoji: '🐵', name: 'Rozi' }, { emoji: '🐱', name: '小美' },
  { emoji: '', name: '阿明' }, { emoji: '🐟', name: '小魚' },
].map((m, i) => ({
  id: M[i], trip_id: 't1', name: m.name, emoji: m.emoji, sort_order: i,
  linked_profile_id: null, person_id: null, user_id: i === 1 ? 'u2' : null, role: null,
  created_at: '2026-03-01',
}));

export const baseTrip = {
  id: 't1', owner_id: 'u1', name: 'ZZ 濟州島四寶團', emoji: '✈️', currency: 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: M[0], collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: ['現金', '信用卡'], cash_rate_twd: null, cash_rate_foreign: null,
  tone_seq: 0, created_at: '2026-03-01', updated_at: '2026-03-01', trip_members: members,
} as unknown as TripWithMembers;

let seq = 0;
export function mk(o: Record<string, unknown>): ExpenseWithSplits {
  seq += 1;
  const id = (o.id as string) ?? `e${seq}`;
  const parts = (o.parts as string[]) ?? M;
  const indiv = (o.indiv as Record<string, number>) ?? {};
  return {
    id, trip_id: 't1', created_by: 'u1', title: '', category_emoji: '➕',
    expense_date: '2026-03-14', foreign_amount: null, twd_amount: null, exchange_rate: null,
    foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false, note: null, twd_from_rate: false,
    split_fill_currency: 'TWD', individual_member_id: null, payment_label: null,
    category_emoji_manual: false, updated_by: null, card_id: null, deleted_at: null,
    created_at: new Date(2026, 0, seq).toISOString(), updated_at: new Date(2026, 0, seq).toISOString(),
    payer_member_id: M[0],
    ...o,
    expense_splits: parts.map(mid => ({
      id: `s${seq}-${mid}`, expense_id: id, member_id: mid, is_participating: true,
      split_amount: (indiv[mid] ?? null) as number | null,
      split_amount_foreign: null as number | null,
      split_pending: !(mid in indiv), created_at: '2026-03-01',
    })),
  } as unknown as ExpenseWithSplits;
}

/** 結算頁測試同一組：可以正常算出轉帳 */
export function demoExpenses(): ExpenseWithSplits[] {
  return [
    mk({ title: '機票 ×4', expense_date: '2026-02-10', twd_amount: 28400, payment_method: 'credit_card', payer_member_id: M[0] }),
    mk({ title: '黑豬肉晚餐', foreign_amount: 108000, twd_amount: 2480, payment_method: 'credit_card', payer_member_id: M[2] }),
    mk({ title: '藥妝店', expense_date: '2026-03-15', foreign_amount: 45000, twd_amount: 1035,
         payment_method: 'credit_card', expense_type: 'individual', indiv: { [M[0]]: 12000, [M[1]]: 18000 },
         payer_member_id: M[1] }),
    mk({ title: '城山日出峰門票', expense_date: '2026-03-15', foreign_amount: 20000, payer_member_id: M[3] }),
    mk({ title: '紀念品', twd_amount: 860, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[1] }),
    mk({ title: '幫小美買的藥', twd_amount: 500, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[0] }),
    mk({ title: '阿明的計程車', twd_amount: 300, parts: [], expense_type: 'personal', payer_member_id: M[2] }),
    mk({ title: '機場接送', twd_amount: 1600, payer_member_id: M[0], settled_on_spot: true }),
    mk({ title: '計程車', payer_member_id: M[0] }),
    mk({ title: '爸爸贊助', twd_amount: 50000, payer_member_id: M[0], is_sponsor: true }),
  ];
}
