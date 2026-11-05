/* 後台-B3　結算結果：**家人手機上看到的那一份**。
 *
 * ⚠️ 計算一律呼叫前台既有的 `tripSummary()`＋`settleTrip()`（`@/lib/summary`），
 *    不另寫一套。這裡只做「結算頁在哪個狀態、顯示哪一份」——
 *    規則逐行對照 `src/pages/SettlementPage.tsx`：
 *
 *    pageState（同 SettlementPage 的 `pageState`）
 *      pending  行程不是「已結算」，或沒有已確認的結算 → 「誰給誰」顯示即時試算 `tx`
 *      partial  已結算、還有沒付清的                     → 顯示已確認那份的 items（沒有 items 才退回 tx）
 *      done     已結算、全部付清                         → 「誰付給誰」顯示即時 `tx`（結算頁就是這樣寫的）
 *    每人差額：結算頁的「計算依據」一律傳即時 `net`（AC-4），這裡也一樣。
 *    帳改過（staleSettlement）：有凍結 items、且任一人即時淨額與凍結值差 > 1 元；
 *      結算頁只在 partial 狀態顯示這句提示。
 *
 * 結算頁那段若改了，這裡要跟著改；`AdminPage.test.tsx` 會用同一份資料
 * 分別渲染結算頁與後台，比對轉帳金額，對不上就紅。
 */
import { tripSummary, settleTrip, type Tx } from '@/lib/summary';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import type { ExpenseWithSplits, SettlementItem, TripWithMembers } from '@/types/database';

export interface ConfirmedSettlement {
  id: string;
  trip_id: string;
  status: string;
  created_at: string;
  settled_at?: string | null;
  settlement_items: SettlementItem[];
}

export type PageState = 'pending' | 'partial' | 'done';

export const PAGE_STATE_LABEL: Record<PageState, string> = {
  pending: '還沒結算，家人看到的是即時試算',
  partial: '已結算，還有人沒付清',
  done: '已結算，全部付清了',
};

export interface FamilySettlementView {
  pageState: PageState;
  /** 結算頁「誰給誰」畫的那一份 */
  tx: Tx[];
  /** 結算頁「計算依據」用的每人差額（即時；正＝可以拿回、負＝要給出） */
  net: Record<string, number>;
  /** 已確認那次的轉帳（含有沒有付清） */
  items: SettlementItem[];
  /** 已確認之後帳又改過 */
  stale: boolean;
  /** 家人畫面上會不會出現「帳有變動」那句提示 */
  staleShownToFamily: boolean;
  total: number;
  unsettledCount: number;
  confirmedAt: string | null;
}

export function familySettlementView(
  trip: TripWithMembers,
  expenses: ExpenseWithSplits[],
  confirmed: ConfirmedSettlement | null,
): FamilySettlementView {
  const display = deriveDisplayStatus(trip);
  const S = tripSummary(trip, expenses, display);
  const { net, tx } = settleTrip(S, expenses, trip);
  const members = S.t.members;
  const items = confirmed?.settlement_items ?? [];

  /* 同 SettlementPage 的 pageState */
  const pageState: PageState =
    display !== 'settled' || !confirmed ? 'pending'
      : items.length === 0 || items.every(i => i.is_cleared) ? 'done' : 'partial';

  /* 同 SettlementPage 的 netFromItems／staleSettlement */
  const fromItems: Record<string, number> = {};
  for (const m of members) fromItems[m.id] = 0;
  for (const i of items) {
    fromItems[i.from_member_id] = (fromItems[i.from_member_id] ?? 0) - i.amount;
    fromItems[i.to_member_id]   = (fromItems[i.to_member_id]   ?? 0) + i.amount;
  }
  const frozen = items.length > 0;
  const stale = frozen && members.some(m => Math.abs((net[m.id] ?? 0) - (fromItems[m.id] ?? 0)) > 1);

  const shownTx: Tx[] = pageState === 'partial' && items.length
    ? items.map(i => ({ from: i.from_member_id, to: i.to_member_id, amount: i.amount }))
    : tx;

  return {
    pageState, tx: shownTx, net, items, stale,
    staleShownToFamily: stale && pageState === 'partial',
    total: S.total, unsettledCount: S.unsettledList.length,
    confirmedAt: confirmed ? (confirmed.settled_at ?? confirmed.created_at) : null,
  };
}
