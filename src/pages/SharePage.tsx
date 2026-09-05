/* 實作-B-6　S-06 分享頁（15 項）。
 *
 * ⚠️ 資料來源是 `get_shared_trip()` RPC，**不要改回直接查表**——
 * migration 013 已經把 anon 對 trips／expenses 的直接讀取收掉了，
 * 直接查表在正式站會拿到空資料（而且不會報錯，只是整頁空白）。
 *
 * 統計卡與消費列表用 A-4 的共用元件，結果是「外幣格與人均消失」（S-06-5／6 標為移除）、
 * 消費明細改日期分組、列上不寫日期、待填列補左邊框。**這是預期的，不要補回去。**
 */
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { destinationOf } from '@/lib/destinations';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import { dateRange } from '@/lib/format';
import { tripSummary, settleTrip } from '@/lib/summary';
import ExpenseGroups from '@/components/shared/ExpenseGroups';
import TransferView from '@/components/shared/TransferView';
import { StatCardTotal, StatCardPerList, StatCardFoot } from '@/components/shared/StatCard';
import { useState } from 'react';
import type { Trip, TripMember, ExpenseWithSplits } from '@/types/database';

interface SharedPayload {
  trip: Trip;
  members: TripMember[];
  expenses: Omit<ExpenseWithSplits, 'expense_splits'>[];
  splits: ExpenseWithSplits['expense_splits'];
  /* RPC 回的是**這趟全部的結算**：superseded／draft／confirmed 都在裡面 */
  settlements: { id: string; trip_id: string; status: string; settled_at: string | null }[];
  settlement_items: {
    id: string; settlement_id: string;
    from_member_id: string; to_member_id: string; amount: number;
  }[];
}

/**
 * 從一趟的全部結算裡挑出**唯一該顯示的那一次**。
 *
 * ⚠️ `get_shared_trip()` 回的是這趟**所有**結算（實測北海道那趟有 12 筆：
 * 10 superseded ＋ 1 confirmed ＋ 1 draft），不挑就會把同樣三筆轉帳畫 12 遍。
 * 挑法與 `SettlementPage` 一致：只認 `confirmed`，多筆時取 `settled_at` 最新的
 * （`settled_at` 為 null 視為最舊）。
 */
export function pickConfirmed(
  settlements: SharedPayload['settlements'],
): SharedPayload['settlements'][number] | null {
  const done = settlements.filter(x => x.status === 'confirmed');
  if (!done.length) return null;
  return done.reduce((a, b) =>
    (b.settled_at ?? '') > (a.settled_at ?? '') ? b : a);
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [statOpen, setStatOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<SharedPayload | null>({
    queryKey: ['share', token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase.rpc('get_shared_trip', { p_token: token });
      if (error) throw error;
      return (data ?? null) as SharedPayload | null;
    },
    enabled: Boolean(token),
  });

  if (isLoading) return <div className="spin"><i /></div>;
  if (isError || !data?.trip) {
    return (
      <div className="empty">
        <p>找不到這趟行程。</p>
        <p>連結可能已經失效</p>
      </div>
    );
  }

  /* RPC 把 expenses 與 splits 分兩袋回來，這裡接回成引擎吃的形狀 */
  const expenses: ExpenseWithSplits[] = data.expenses.map(e => ({
    ...e,
    expense_splits: data.splits.filter(s => s.expense_id === e.id),
  })) as ExpenseWithSplits[];

  const trip = { ...data.trip, trip_members: data.members };
  /* 彙總用**行程真正的狀態**（「約」的判定跟著它走）；
     「這一頁不能點」是另一回事，由各元件的 readonly prop 表達。 */
  const S = tripSummary(trip as never, expenses, deriveDisplayStatus(trip as never));
  const t = S.t;

  /* 已確認的轉帳用後端那一次的；挑不到 confirmed 就走前端預覽 */
  const confirmed = pickConfirmed(data.settlements ?? []);
  const tx = confirmed
    ? data.settlement_items
        .filter(i => i.settlement_id === confirmed.id)
        .map(i => ({ from: i.from_member_id, to: i.to_member_id, amount: i.amount }))
    : settleTrip(S, expenses, trip as never).tx;

  return (
    <div className="min-h-screen bg-bg flex flex-col">

      {/* S-06-1／2／3 */}
      <div className="hero" style={{
        background: destinationOf(trip.name, trip.id).gradient, paddingTop: 22,
      }}>
        <div className="sc" />
        <span className="viewtag"><span className="stamp">朋友檢視</span></span>
        <div style={{ position: 'relative' }}>
          <div className="tt">{trip.name}</div>
          {/* 成員 emoji 已拿掉，與 S-03 一致——同一段 join('') 的問題 */}
          <div className="dt">{dateRange(trip.start_date, trip.end_date)}</div>
        </div>
      </div>

      {/* S-06-4／14／15　與 S-03-9／27／28 共用 statCard()。
          S-06-5 外幣格與 S-06-6 人均因此消失——每人分擔列已經取代它們。 */}
      <div className="statcard">
        <StatCardTotal S={S} open={statOpen} readonly onToggleTotal={() => setStatOpen(o => !o)} />
        {statOpen && <StatCardPerList S={S} readonly />}
        {statOpen && <StatCardFoot S={S} readonly />}
      </div>

      {/* S-06-7／8　與 S-05 共用同一個 TransferView（arrows 變體）——
          兩處分開寫遲早會走鐘，理由與 statCard()／expenseGroups() 相同。 */}
      <div className="sec">誰付給誰</div>
      <TransferView t={t} tx={tx} variant="arrows" />

      {/* S-06-9／10／11 */}
      <div className="sec">消費明細</div>
      {S.list.length
        ? <ExpenseGroups S={S} readonly />
        : <div className="empty"><p>還沒有消費紀錄。</p></div>}

      {/* S-06-12　旅伴看到帳算得清清楚楚，是 Phase 1 唯一的獲客時機——但不說沒有的事。
          #27-1 S-06-13「安裝」鈕整顆移除：它綁在瀏覽器的 PWA 安裝事件上，
          iOS Safari 不支援該事件，Tripay 使用者以 iPhone 為主，
          等於多數人看不到卻要維護一條分支。編號保留、標為移除。 */}
      <div className="sharefoot">
        <p>這趟帳是用 Tripay 記的</p>
        <a href={import.meta.env.BASE_URL} className="clearbtn">開一趟自己的</a>
      </div>
    </div>
  );
}
