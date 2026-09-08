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
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { destinationOf } from '@/lib/destinations';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import { dateRange } from '@/lib/format';
import { tripSummary, settleTrip } from '@/lib/summary';
import ExpenseGroups from '@/components/shared/ExpenseGroups';
import MemberLedger from '@/components/shared/MemberLedger';
import SettleBreakdown from '@/components/shared/SettleBreakdown';
import { breakdownFor } from '@/pages/SettlementPage';
import { Icon } from '@/components/Icon';
import TransferView from '@/components/shared/TransferView';
import NotFound from '@/components/shared/NotFound';
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
  /* 實作-AC-5　分享頁的「查看計算依據」。預設收合，與 S-05 一致。 */
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  /* 實作-W-3　`?member=<id>` → 唯讀版的「{名字} 的帳」。
     走 query 不走 state：裝置的返回鍵才會如預期回到分享頁。 */
  const [sp, setSp] = useSearchParams();
  const memberView = sp.get('member');

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
  /* 與 S-03 共用同一份文案。**分享頁不放任何按鈕**——
     訪客沒有帳號，「回到我的行程」是假出口；「開一趟自己的」則已裁示延到共編階段。 */
  if (isError || !data?.trip) return <NotFound />;

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
  const frozenItems = confirmed
    ? data.settlement_items.filter(i => i.settlement_id === confirmed.id)
    : [];
  const live = settleTrip(S, expenses, trip as never);
  const tx = confirmed
    ? frozenItems.map(i => ({ from: i.from_member_id, to: i.to_member_id, amount: i.amount }))
    : live.tx;
  /* 實作-AC-4／AC-5　與 S-05 同一套規則：已確認就用凍結值，未結算用即時值。
     凍結值反推淨額＝收到的 − 給出去的（與 `SettlementPage` 的 `netFromItems` 同義）。 */
  const netNow: Record<string, number> = confirmed
    ? Object.fromEntries(S.t.members.map(m => [m.id,
        frozenItems.reduce((a, i) =>
          a + (i.to_member_id === m.id ? i.amount : 0) - (i.from_member_id === m.id ? i.amount : 0), 0)]))
    : live.net;

  /* 🔴 實作-W-3　唯讀版的「{名字} 的帳」。
     ⚠️ 這一頁**不得有任何編輯入口**（驗收案例 A9）：消費列是 `<div>`、沒有
        輸入欄位、沒有「編輯／刪除／記一筆」。三段結構與自己那邊是**同一支元件**。
     ⚠️ 文案用「{名字}付的」不用「你付的」——分享連結的觀看者不是任何一位成員，
        「你」指誰講不通。 */
  if (memberView) {
    const m = t.members.find(x => x.id === memberView);
    if (!m) return <NotFound />;
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <div className="bar">
          <button className="ic2" aria-label="返回" onClick={() => setSp({}, { replace: true })}>
            <Icon name="back" size={20} />
          </button>
          <span className="ttl">{m.name} 的帳</span>
          <span style={{ width: 40 }} />
        </div>
        <MemberLedger S={S} memberId={memberView} readonly payerName={m.name} />
        <div style={{ height: 18 }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">

      {/* S-06-1／2／3 */}
      <div className="hero" style={{
        background: destinationOf(trip.name, trip.id).gradient,
        /* Y-1　viewport-fit=cover 之後 hero 會延伸到瀏海底下，22px 要含安全區 */
        paddingTop: 'calc(22px + var(--sat))',
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
      {/* 🔴 實作-W-3　成員列改成點得進去（Rozi 2026-09-07：「沒辦法點各自成員
          看他個人的消費紀錄」）。**「看某個人的帳怎麼算出來」不是編輯，是閱讀**
          ——驗收案例 A9 要守的是「不得有編輯入口」，不是「不得有任何連結」。
          `readonly` 拿掉之後 `StatCardFoot` 也會換成「點名字看這個人的帳
          是怎麼算出來的」，與 S-03 同一句。 */}
      <div className="statcard">
        <StatCardTotal S={S} open={statOpen} readonly onToggleTotal={() => setStatOpen(o => !o)} />
        {statOpen && <StatCardPerList S={S} onPickMember={id => setSp({ member: id }, { replace: true })} />}
        {statOpen && <StatCardFoot S={S} />}
      </div>

      {/* S-06-7／8　與 S-05 共用同一個 TransferView（arrows 變體）——
          兩處分開寫遲早會走鐘，理由與 statCard()／expenseGroups() 相同。 */}
      <div className="sec">誰付給誰</div>
      <TransferView t={t} tx={tx} variant="arrows" />

      {/* 🔴 實作-AC-5　分享頁也要看得到計算依據。**與 S-05 同一支元件**
          （`SettleBreakdown`）——分享頁另寫一套就是「移植檢查」那條陷阱。
          唯讀：這一段裡不得出現任何按鈕或輸入框（「標記付清」「重新計算」都不准）。
          資料來源用 RPC 已經有的 `expenses`／`splits`，不改 RPC、不改資料庫。 */}
      <button className="detailtoggle" onClick={() => setBreakdownOpen(o => !o)}>
        查看計算依據 <Icon name={breakdownOpen ? 'up' : 'down'} size={16} />
      </button>
      {breakdownOpen && (
        <div className="fld">
          {/* `net` 一律即時（與 S-05 同一套理由），`tx` 已確認時用凍結值 */}
          <SettleBreakdown t={t} tx={tx} net={live.net} breakdownOf={id => breakdownFor(expenses, trip as never, id)} />
          <p className="hint">待填的筆不進結算，所以這裡的數字可能小於總花費</p>
        </div>
      )}

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
