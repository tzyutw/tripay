/* R-10（2026-11 產品負責人拍板）畫面計算那一側：
 *   ③ 0 人的舊帳整筆算付款人自己的——結算轉帳、統計卡、計算依據三處同一個答案，帳永遠平衡
 *   零頭：一起分時付款人沒參與，除不盡的零頭也歸付款人，每筆分攤加總 = 總額
 * 後端引擎那一側在 `supabase/functions/__tests__/settlement.test.ts` 的 R10 段。
 */
import { describe, it, expect, vi } from 'vitest';
import { calc, tripSummary, settleTrip } from './summary';
import { breakdownFor } from '@/pages/SettlementPage';
import type { TripWithMembers, ExpenseWithSplits } from '@/types/database';

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));

const members = ['Ning', 'Ziyu', 'Xiu', 'Mei'].map((name, i) => ({
  id: name.toLowerCase(), trip_id: 't', name, emoji: '', sort_order: i,
  linked_profile_id: null, person_id: null, user_id: null, role: null, created_at: '2026-01-01',
}));
const trip = {
  id: 't', name: 'ZZ', start_date: '2026-01-01', settlement_mode: 'direct', hub_member_id: null,
  cash_rate_twd: null, cash_rate_foreign: null, trip_members: members,
} as unknown as TripWithMembers;

let seq = 0;
function exp(payer: string, twd: number, on: string[],
             extra: Partial<ExpenseWithSplits> = {}): ExpenseWithSplits {
  const id = `e${++seq}`;
  return {
    id, title: id, category_emoji: '🍜', expense_date: '2026-01-02', created_at: '2026-01-02T00:00:00Z',
    payer_member_id: payer, twd_amount: twd, foreign_amount: null, expense_type: 'shared',
    individual_member_id: null, split_fill_currency: 'TWD', settled_on_spot: false, is_sponsor: false,
    /* 參與列一律四人都有，沒參與的是 false——跟正式資料「取消勾選」的形狀一樣 */
    expense_splits: members.map(m => ({
      expense_id: id, member_id: m.id, is_participating: on.includes(m.id),
      split_amount: null, split_amount_foreign: null, split_pending: false,
    })),
    ...extra,
  } as unknown as ExpenseWithSplits;
}

const sum = (o: Record<string, number | null>) =>
  Object.values(o).reduce((a: number, v) => a + (v ?? 0), 0);
const netSum = (n: Record<string, number>) => Object.values(n).reduce((a, v) => a + v, 0);

/** 每個人「實際付出 − 應分攤」要等於他的淨額——這就是畫面上計算依據那三行 */
function expectBreakdownMatchesNet(expenses: ExpenseWithSplits[]) {
  const S = tripSummary(trip as never, expenses, 'active');
  const { net } = settleTrip(S, expenses, trip as never);
  for (const m of members) {
    const b = breakdownFor(expenses, trip as never, m.id);
    expect(b.paid - b.due, `${m.name} 的計算依據對不上淨額`).toBeCloseTo(net[m.id], 6);
  }
  expect(netSum(net)).toBeCloseTo(0, 9);
  expect(sum(S.per)).toBeCloseTo(S.total, 6);
  return { S, net };
}

describe('R-10 ③　0 人的舊帳整筆算付款人', () => {
  it('一起分 0 人：分攤全歸付款人，加總 = 總額', () => {
    const e = exp('xiu', 5139, []);
    const c = calc(e, trip, members);
    expect(c.shares).toEqual({ xiu: 5139 });
    expect(c.debts, '算付款人自己的，不會產生任何人欠款').toEqual([]);
  });

  it('混在一般帳裡：轉帳等於把那筆拿掉、所有人淨額加總為 0、計算依據對得上', () => {
    const base = [exp('ning', 4000, ['ning', 'ziyu', 'xiu', 'mei']), exp('ziyu', 1200, ['ziyu', 'mei'])];
    const zero = exp('xiu', 5139, []);
    const a = settleTrip(tripSummary(trip as never, base, 'active'), base, trip as never);
    const { S, net } = expectBreakdownMatchesNet([...base, zero]);
    expect(net).toEqual(a.net);
    /* 統計卡：Xiu 那一份多了整筆 5,139（原本這筆在「每人」裡憑空消失） */
    expect(S.per.xiu).toBe(1000 + 5139);
  });

  it('打開表單不走這條：表單照實顯示 0 人（見 ExpenseFormSheet.r10.test.tsx）', () => {
    /* 這裡只確認資料本身沒被改——calc 的回推只在記憶體裡 */
    const e = exp('xiu', 5139, []);
    calc(e, trip, members);
    expect(e.expense_splits.filter(s => s.is_participating)).toHaveLength(0);
  });
});

describe('R-10 零頭：付款人沒參與、金額除不盡', () => {
  it('$1000 三人分、付款人 Ning 沒參與 → 333×3 + 零頭 1 歸 Ning，加總 = 1000', () => {
    const e = exp('ning', 1000, ['ziyu', 'xiu', 'mei']);
    const c = calc(e, trip, members);
    expect(c.shares).toEqual({ ziyu: 333, xiu: 333, mei: 333, ning: 1 });
    expect(sum(c.shares)).toBe(1000);
    expectBreakdownMatchesNet([e]);
  });

  it('正式資料那筆：$2,124.3 兩人分、付款人沒參與 → 零頭 0.3 歸付款人，加總 = 2,124.3', () => {
    const e = exp('ning', 2124.3, ['ziyu', 'mei']);
    const c = calc(e, trip, members);
    expect(c.shares.ziyu).toBe(1062);
    expect(c.shares.mei).toBe(1062);
    expect(c.shares.ning).toBeCloseTo(0.3, 9);
    expect(sum(c.shares)).toBeCloseTo(2124.3, 9);
    /* 轉帳不變：兩人各轉 1,062 給 Ning */
    const S = tripSummary(trip as never, [e], 'active');
    expect(settleTrip(S, [e], trip as never).tx).toEqual([
      { from: 'ziyu', to: 'ning', amount: 1062 }, { from: 'mei', to: 'ning', amount: 1062 },
    ]);
    expectBreakdownMatchesNet([e]);
  });

  it('除得盡時付款人沒參與 → 他名下不會多一筆 $0 的分攤', () => {
    const c = calc(exp('ning', 900, ['ziyu', 'xiu', 'mei']), trip, members);
    expect(c.shares).toEqual({ ziyu: 300, xiu: 300, mei: 300 });
  });

  it('付款人有參與時零頭照舊歸他（既有規則不變）', () => {
    const c = calc(exp('ning', 1000, ['ning', 'ziyu', 'xiu']), trip, members);
    expect(c.shares).toEqual({ ning: 334, ziyu: 333, xiu: 333 });
  });

  it('各付各的、付款人沒參與、各人加總少於總額 → 差額歸付款人，與後端同一條規則', () => {
    const e = exp('ning', 1000, ['ziyu', 'mei'], { expense_type: 'individual' } as never);
    e.expense_splits = e.expense_splits.map(s =>
      s.member_id === 'ziyu' ? { ...s, split_amount: 400 }
      : s.member_id === 'mei' ? { ...s, split_amount: 500 } : s);
    const c = calc(e, trip, members);
    expect(c.shares).toEqual({ ziyu: 400, mei: 500, ning: 100 });
    expectBreakdownMatchesNet([e]);
  });
});
