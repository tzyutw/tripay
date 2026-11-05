/* 後台-B3　結算結果的選擇規則（凍結 vs 即時）＝ SettlementPage 的規則。 */
import { describe, it, expect } from 'vitest';
import { familySettlementView } from './settlementView';
import { tripSummary, settleTrip } from '@/lib/summary';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import { baseTrip, demoExpenses, M } from '@/test/fixtures/adminFixture';

describe('結算結果', () => {
  it('還沒確認：就是前台 settleTrip 的即時結果（不是另寫一套）', () => {
    const ex = demoExpenses();
    const S = tripSummary(baseTrip, ex, deriveDisplayStatus(baseTrip));
    const live = settleTrip(S, ex, baseTrip);
    const v = familySettlementView(baseTrip, ex, null);
    expect(v.pageState).toBe('pending');
    expect(v.tx).toEqual(live.tx);
    expect(v.net).toEqual(live.net);
    expect(v.total).toBe(S.total);
    expect(v.unsettledCount).toBe(S.unsettledList.length);
  });

  it('已結算、有人沒付清：顯示凍結的那份；帳沒改過就不標「帳改過」', () => {
    const ex = demoExpenses();
    const S = tripSummary(baseTrip, ex, 'active');
    const settled = { ...baseTrip, status: 'settled' as const };
    const live = settleTrip(S, ex, baseTrip);
    const items = live.tx.map((t, i) => ({ id: `i${i}`, settlement_id: 's1', from_member_id: t.from,
      to_member_id: t.to, amount: t.amount, is_cleared: i === 0, cleared_at: null }));
    const v = familySettlementView(settled, ex,
      { id: 's1', trip_id: 't1', status: 'confirmed', created_at: '2026-03-20', settlement_items: items });
    expect(v.pageState).toBe('partial');
    expect(v.tx).toEqual(items.map(i => ({ from: i.from_member_id, to: i.to_member_id, amount: i.amount })));
    expect(v.stale).toBe(false);
  });

  it('確認之後帳又改了：凍結金額不變、標「帳改過」，家人畫面上也有提示', () => {
    const ex = demoExpenses();
    const items = [{ id: 'i1', settlement_id: 's1', from_member_id: M[3], to_member_id: M[0],
                     amount: 999, is_cleared: false, cleared_at: null }];
    const v = familySettlementView({ ...baseTrip, status: 'settled' }, ex,
      { id: 's1', trip_id: 't1', status: 'confirmed', created_at: '2026-03-20', settlement_items: items });
    expect(v.tx).toEqual([{ from: M[3], to: M[0], amount: 999 }]);
    expect(v.stale).toBe(true);
    expect(v.staleShownToFamily).toBe(true);
  });

  it('全部付清：結算頁「誰付給誰」畫的是即時 tx，這裡也一樣', () => {
    const ex = demoExpenses();
    const S = tripSummary(baseTrip, ex, 'settled');
    const live = settleTrip(S, ex, baseTrip);
    const items = [{ id: 'i1', settlement_id: 's1', from_member_id: M[3], to_member_id: M[0],
                     amount: 999, is_cleared: true, cleared_at: null }];
    const v = familySettlementView({ ...baseTrip, status: 'settled' }, ex,
      { id: 's1', trip_id: 't1', status: 'confirmed', created_at: '2026-03-20', settlement_items: items });
    expect(v.pageState).toBe('done');
    expect(v.tx).toEqual(live.tx);
    expect(v.staleShownToFamily).toBe(false);
  });

  it('有已確認結算、但行程不是已結算（重新開啟過）：回到即時試算', () => {
    const ex = demoExpenses();
    const items = [{ id: 'i1', settlement_id: 's1', from_member_id: M[3], to_member_id: M[0],
                     amount: 999, is_cleared: false, cleared_at: null }];
    const v = familySettlementView(baseTrip, ex,
      { id: 's1', trip_id: 't1', status: 'confirmed', created_at: '2026-03-20', settlement_items: items });
    expect(v.pageState).toBe('pending');
    expect(v.tx.some(t => t.amount === 999)).toBe(false);
  });
});
