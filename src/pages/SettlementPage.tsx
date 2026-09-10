/* 實作-B-5　S-05 結算（30 項）。版面與文案逐字對齊原型的 renderS05()。
 *
 * **hub 模式的兩段式呈現（S-05-26）留到實作-C**，本節只做 direct——
 * 不過 `settleTrip()` 與 `TransferView` 兩邊本來就都含 hub 分支，
 * 硬把它們拆一半反而會製造第二份路徑。這裡照原型整套搬，C-2 負責驗與接引導。 */
import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabaseClient';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import { tripSummary, settleTrip, prepaidShare, calc, isSelfPaid, toSharedExpense } from '@/lib/summary';
import { money, memberLabel, firstGrapheme } from '@/lib/format';
import { isOffline, MSG_SETTLE_OFFLINE, MSG_SETTLE_FAIL } from '@/lib/messages';
import { Icon } from '@/components/Icon';
import TransferView from '@/components/shared/TransferView';
import SettleBreakdown from '@/components/shared/SettleBreakdown';
import type { TripWithMembers, SettlementItem, ExpenseWithSplits } from '@/types/database';
import Avatar from '@/components/shared/Avatar';
import { MemberTag } from '@/components/shared/Avatar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemberBalance {
  member_id: string; name: string; emoji: string;
  payout: number; cost: number; net_balance: number;
}

interface CalcData {
  settlement_id: string;
  member_balances?: MemberBalance[];
}

interface SettlementWithItems {
  id: string; trip_id: string; status: string; created_at: string;
  settlement_items: SettlementItem[];
}

// ── Main page ─────────────────────────────────────────────────────────────────

/** 一位成員的「應分攤怎麼來的」四行。實作-T-4 起用，實作-AB-2 拆成四行。 */
export interface Breakdown {
  shared: number; sharedN: number;   // 一起分的
  self: number;   selfN: number;     // 自己買給自己的（不進結算）
  each: number;   eachN: number;     // 各付各的
  paid: number;   paidN: number;     // 他付出去的**全部**（含自己買給自己的）
  /* 🔴 實作-AC-2　「他**幫大家**先付的」＝ `paid` 扣掉他自己買給自己的那幾筆。
     實測正式資料：Mei 的「他先付出去的 3 筆 −$2,299」**整筆都是她自己買的**，
     她一毛錢都沒幫大家墊——那個數字現在正在誤導使用者。 */
  fronted: number; frontedN: number;
  /* 🔴 贊助折抵（Rozi 2026-09-08）：「贊助的項目應該獨立出來，不要放在一起分的
     名目裡面」。她的「一起分的 1 筆 −$12,500」其實是贊助，畫面上看不出來。
     **正數**（那是替你抵掉的錢，不是你要付的）；行為本身不改，只是拆出來看得見。 */
  sponsor: number; sponsorN: number;
  /* 🔴 實作-AD-2（Rozi 拍板 B 案）：**收贊助的那個人拆兩行**。
     贊助折抵是「他被抵掉的那一份」（正）；這一個是「贊助給他、他要發出去的」（負）。
     併成一行的話 Ning 顯示 −$37,500，看不出那 5 萬是代收的。
     不是付款人時為 0，整行不顯示。 */
  sponsorHeld: number; sponsorHeldN: number;
  due: number;                       // 應分攤 ＝ shared + self + each
}
export const EMPTY_BREAKDOWN: Breakdown = {
  shared: 0, sharedN: 0, self: 0, selfN: 0, each: 0, eachN: 0,
  paid: 0, paidN: 0, fronted: 0, frontedN: 0,
  sponsor: 0, sponsorN: 0, sponsorHeld: 0, sponsorHeldN: 0, due: 0,
};

/**
 * 🔴 實作-T-4　把「應分攤」拆成組成。
 *
 * Rozi：「應該要看得到怎麼算出來的細節，例如第一段四人均分的費用，
 * 第二段是幫人代墊、被代墊的費用」。
 *
 * ⚠️ **不准改任何計算**——這裡只是把 `calc()` 已經算好的 `shares[id]` 分堆，
 * 加起來一定等於原本的應分攤。「他先付出去的」就是原本那張表的「實際付出」。
 *
 * 🔴 實作-AB-2　原本「指名算他的」把兩種東西併成一行。用正式資料量：
 * Ning 那一行 $41,131 裡有 $39,278 是他**自己買給自己的**——那筆錢他自己付、
 * 也算他自己，跟「他先付出去的」左右抵消，**對結算完全沒有影響**。
 * 真正影響結算的只有 $1,853，差二十幾倍，會被讀成「我要分攤這麼多」。
 * ⚠️ 判定**直接接 `summary.ts` 的 `isSelfPaid()`**（「只看共同的帳」開關用的
 *    就是這一個）。在這裡另寫一套，同一個概念在兩個畫面會給出不同答案。
 *
 * **模組層級的純函式**，單元測試直接打——`breakdownOf` 只負責快取。
 */
export function breakdownFor(
  expenses: ExpenseWithSplits[],
  trip: TripWithMembers,
  id: string,
): Breakdown {
  let shared = 0, sharedN = 0, self = 0, selfN = 0, each = 0, eachN = 0;
  let paid = 0, paidN = 0, fronted = 0, frontedN = 0;
  let sponsor = 0, sponsorN = 0, sponsorHeld = 0, sponsorHeldN = 0;
  for (const e of expenses) {
    const c = calc(e, trip, trip.trip_members);
    const mine = isSelfPaid(e, toSharedExpense(e, trip.trip_members));
    /* 「他付出去的」＝**代別人墊的**。`personal`（自己的）那幾筆沒有任何人分攤，
       算進來的話 `實際付出 − 應分攤` 就對不上 `差額`（實測差 300，就是那一筆）。 */
    /* ⚠️ 贊助**不算「他付出去的」**：它的 `twd_amount` 是負數（錢是進來的，
       不是他墊出去的），算進來會讓 Alex 的「幫大家先付」變成 −21,100。
       與 `personal`／`當場就清了` 同一類：不進這一欄。 */
    if (!e.settled_on_spot && e.expense_type !== 'personal' && !e.is_sponsor
        && e.payer_member_id === id && !c.twdPending) {
      paid += c.twdTotal; paidN += 1;
      /* 🔴 AC-2　他自己買給自己的那幾筆**不算幫大家墊**——錢左手換右手，
         對誰欠誰一點影響都沒有。 */
      if (!mine) { fronted += c.twdTotal; frontedN += 1; }
    }
    const share = c.shares[id];
    /* 分攤是 0 的**這一筆**不算一段——「指名算他的 1 筆 $ 0」讀起來像壞掉。
       ⚠️ 這是針對單筆，不是針對整行：整行為 0 時仍然要顯示（AB-2，Rozi 拍板）。 */
    if (share == null || share === 0 || e.settled_on_spot) continue;
    if (mine) { self += share; selfN += 1; }
    /* 🔴 贊助**先攔下來**，不要併進「一起分的」，而且**拆成兩行**（AD-2，B 案）：
         ① `sponsor`     他被抵掉的那一份（`-share`，正的）
         ② `sponsorHeld` 他若是收下贊助的那個人，那筆替大家收的錢（`twdTotal`，負的）
       ⚠️ ② **不能省**：只算 ① 的話收款人那一側 50,000 憑空消失，
          四人差額加總會變成 50,000 而不是 0（實測過）。
       ⚠️ 這只是把既有的 `shares`／`twdTotal` 換一個位置呈現，**沒有改任何計算**。 */
    else if (e.is_sponsor) {
      sponsor += -share; sponsorN += 1;
      if (e.payer_member_id === id) { sponsorHeld += c.twdTotal; sponsorHeldN += 1; }
    }
    else if (e.individual_member_id || e.expense_type === 'individual') { each += share; eachN += 1; }
    else { shared += share; sharedN += 1; }
  }
  /* 應分攤 ＝ 前三行相加。**數值與拆之前逐元相同**，這一節只換呈現不改計算。 */
  /* ⚠️ `due`（應分攤）維持原意＝一起分＋自己買＋各付各的**再加回贊助的負額**，
     這樣拆出贊助之後總額還是與拆之前逐元相同（這一節不准改計算）。 */
  return { shared, sharedN, self, selfN, each, eachN, paid, paidN, fronted, frontedN,
           sponsor, sponsorN, sponsorHeld, sponsorHeldN,
           due: shared + self + each - sponsor };
}

export default function SettlementPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const navigate        = useNavigate();
  const qc              = useQueryClient();

  const [calcData,      setCalcData]      = useState<CalcData | null>(null);
  const [showDetails,   setShowDetails]   = useState(false);
  const { toast: showToast } = useToast();
  const [showWarnSheet, setShowWarnSheet] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: trip } = useQuery<TripWithMembers | null>({
    queryKey: ['trip', tripId],
    queryFn: async () => {
      if (!tripId) return null;
      const { data, error } = await supabase
        .from('trips').select('*, trip_members!trip_members_trip_id_fkey(*)')
        /* 同 ExpenseListPage：查不到要回 null，不要拋 406 */
        .eq('id', tripId).maybeSingle();
      if (error) throw error;
      return data as TripWithMembers;
    },
    enabled: Boolean(tripId),
  });

  /* 要整列（含 expense_splits）——預覽的淨額與轉帳是前端用同一支引擎算的 */
  const { data: expenses = [] } = useQuery<ExpenseWithSplits[]>({
    queryKey: ['expenses', tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const { data } = await supabase
        .from('expenses').select('*, expense_splits(*)')
        .eq('trip_id', tripId).is('deleted_at', null);
      return (data ?? []) as ExpenseWithSplits[];
    },
    enabled: Boolean(tripId),
  });

  const { data: settlement, refetch: refetchSettlement } = useQuery<SettlementWithItems | null>({
    queryKey: ['settlement', tripId],
    queryFn: async () => {
      if (!tripId) return null;
      const { data } = await supabase
        .from('settlements')
        .select('*, settlement_items(*)')
        .eq('trip_id', tripId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as SettlementWithItems | null;
    },
    enabled: Boolean(tripId),
  });

  // UX-2：從已確認的 settlement_items 反推每人淨額。
  // 原本的「計算依據」只吃「算清楚」那次 mutation 的暫存回應，重整後就空了，
  // 使用者回頭想看「我到底該收多少」只剩轉帳明細要自己加總。
  const netFromItems = useMemo(() => {
    const items = settlement?.settlement_items ?? [];
    if (!items.length || !trip) return [];
    const net: Record<string, number> = {};
    for (const m of trip.trip_members) net[m.id] = 0;
    for (const i of items) {
      net[i.from_member_id] = (net[i.from_member_id] ?? 0) - i.amount;
      net[i.to_member_id]   = (net[i.to_member_id]   ?? 0) + i.amount;
    }
    return [...trip.trip_members]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(m => ({ id: m.id, emoji: m.emoji, name: m.name, net: net[m.id] ?? 0 }));
  }, [settlement, trip]);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const pageState = useMemo<'pending' | 'partial' | 'done'>(() => {
    if (!trip) return 'pending';
    const display = deriveDisplayStatus(trip);
    if (display !== 'settled') return 'pending';
    if (!settlement) return 'pending';
    const items = settlement.settlement_items ?? [];
    if (items.length === 0) return 'done';
    return items.every(i => i.is_cleared) ? 'done' : 'partial';
  }, [trip, settlement]);

  const progress = useMemo(() => {
    const items   = settlement?.settlement_items ?? [];
    const cleared = items.filter(i => i.is_cleared).length;
    return { cleared, total: items.length };
  }, [settlement]);

  /* G-08 回顧卡（S-05-17）：數字帶符號，標籤純文字 */
  const highlights = useMemo(() => {
    if (!trip) return null;
    const days = Math.floor(
      (Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 86_400_000) + 1;
    const active = expenses.filter(e => !e.twd_pending && e.twd_amount !== null);
    return {
      days,
      count: active.length,
      maxAmount: active.reduce((m, e) => Math.max(m, e.twd_amount ?? 0), 0),
    };
  }, [trip, expenses]);

  /* 前端預覽用的彙總與轉帳。已確認之後改讀 settlement_items（後端才是權威）。 */
  const S = useMemo(
    () => trip ? tripSummary(trip, expenses, deriveDisplayStatus(trip)) : null,
    [trip, expenses]);
  const preview = useMemo(
    () => (trip && S) ? settleTrip(S, expenses, trip) : null,
    [S, expenses, trip]);
  const prepaid = useMemo(
    () => trip ? prepaidShare(expenses, trip) : null,
    [expenses, trip]);
  /* #22-6b 只引導，不在這裡提供設定。代墊比例 > 70% 且目前是 direct 才出現。 */
  const suggestHub = Boolean(
    trip && prepaid && trip.settlement_mode !== 'hub' && prepaid.top && prepaid.ratio > 0.7);

  const memberMap = useMemo(
    () => Object.fromEntries((trip?.trip_members ?? []).map(m => [m.id, m])),
    [trip]
  );

  /** 負數要寫成「−$ 9,605」，不要讓 `money()` 吐出「$ -9,605」——
   *  減號跑到貨幣符號後面，掃過去會看成一個奇怪的數字。 */
  const signed = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));

  const breakdownOf = useMemo(() => {
    const cache = new Map<string, Breakdown>();
    return (id: string) => {
      const hit = cache.get(id);
      if (hit) return hit;
      const out = trip ? breakdownFor(expenses, trip, id) : EMPTY_BREAKDOWN;
      cache.set(id, out);
      return out;
    };
  }, [expenses, trip]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const { data: cd, error: calcErr } = await supabase.functions.invoke(
        'calculate-settlement', { body: { trip_id: tripId } }
      );
      if (calcErr) throw new Error(calcErr.message ?? '結算計算失敗');

      const { error: confirmErr } = await supabase.functions.invoke(
        'confirm-settlement', { body: { settlement_id: (cd as CalcData).settlement_id } }
      );
      if (confirmErr) throw new Error(confirmErr.message ?? '確認結算失敗');

      return cd as CalcData;
    },
    onSuccess: (data) => {
      setCalcData(data);
      setShowWarnSheet(false);
      qc.invalidateQueries({ queryKey: ['trip', tripId] });
      qc.invalidateQueries({ queryKey: ['settlement', tripId] });
    },
    onError: (err: Error) => {
      const msg = err.message ?? '';
      if (msg.includes('archived'))             showToast('行程已封存，請先解除封存再結算');
      else if (msg.includes('invalid_amount'))  showToast('有消費金額有誤，請確認後再試');
      else if (msg.includes('invalid_expense')) showToast('有費用未設定分攤成員');
      /* 🔴 實作-文-1　只改這個 fallback；上面三個分支已經有具體資訊，不動。 */
      else { console.error(err); showToast(isOffline(err) ? MSG_SETTLE_OFFLINE : MSG_SETTLE_FAIL); }
    },
  });

  const clearItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('settlement_items')
        .update({ is_cleared: true, cleared_at: new Date().toISOString() })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchSettlement();
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (mode: 'reopen' | 'unarchive') => {
      const { error } = await supabase.functions.invoke(
        'reopen-settlement', { body: { trip_id: tripId, mode } }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, mode) => {
      if (mode === 'unarchive') showToast('重新開啟了，繼續記吧');
      qc.invalidateQueries({ queryKey: ['trip', tripId] });
      qc.invalidateQueries({ queryKey: ['settlement', tripId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('trips').update({ status: 'archived' }).eq('id', tripId!);
      if (error) throw error;
    },
    onSuccess: () => {
      showToast('這趟封存了。下次再出發！');
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['trip', tripId] });
      setTimeout(() => navigate('/'), 1500);
    },
  });

  if (!trip || !S || !preview) {
    return <div className="spin"><i /></div>;
  }

  const { net, tx } = preview;
  const t        = S.t;
  const nUn      = S.unsettledList.length;
  const items    = settlement?.settlement_items ?? [];
  const clearedIds = items.filter(i => i.is_cleared)
    .map(i => `${i.from_member_id}>${i.to_member_id}`);
  const itemOf = (from: string, to: string) =>
    items.find(i => i.from_member_id === from && i.to_member_id === to);

  /* 🔴 實作-AB-1　「查看計算依據」原本**只在已結算狀態出現**，
     Rozi 在還沒結算那一頁只看得到三個結果數字，沒有一句話說明它們怎麼來的。
     抽成變數讓兩個狀態掛**同一顆按鈕、同一個展開區塊、同一個 `breakdownOf`**——
     為未結算另寫一份就是「移植檢查」那條陷阱，兩套遲早分岔。 */
  const DetailsToggle = (
    <button className="detailtoggle" onClick={() => setShowDetails(o => !o)}>
      查看計算依據 <Icon name={showDetails ? 'up' : 'down'} size={16} />
    </button>
  );

  /* 🔴 實作-AC-4　**未結算一律用即時值**（`settleTrip` 的 `net`／`tx`），
     不准吃 `netFromItems`。Rozi 看到「Ziyu 要給出 $24,192」與上面「大家給 Ning
     $24,209」打架，就是因為差額讀的是**上一次已確認結算**存的凍結值，
     而「實際付出」「應分攤」是即時的。已結算則維持凍結值（那才是對的）。 */
  const frozen = items.length > 0;
  const netNow: Record<string, number> = frozen
    ? Object.fromEntries(t.members.map(m =>
        [m.id, netFromItems.find(x => x.id === m.id)?.net ?? net[m.id] ?? 0]))
    : net;
  const txNow = frozen
    ? items.map(i => ({ from: i.from_member_id, to: i.to_member_id, amount: i.amount }))
    : tx;
  /* 已結算之後帳又被改過：即時淨額與凍結值任一人差 > 1 元就算有變動。
     只提示，指向既有的「重新計算」，不新做按鈕。 */
  const staleSettlement = frozen
    && t.members.some(m => Math.abs((net[m.id] ?? 0) - (netNow[m.id] ?? 0)) > 1);

  const DetailsBlock = showDetails ? (
    <div className="fld">
      {/* ⚠️ `net` 一律傳**即時值**：卡片上的「要給出／可以拿回」必須跟卡片裡
          三行算出來的差額是同一個數字——Rozi 抱怨的就是同一張畫面兩個數字打架。
          `tx`（給誰多少）已結算時仍用凍結值，那是真的要照著轉的金額；
          兩者若對不上，上面的 `staleSettlement` 提示會說明。 */}
      <SettleBreakdown t={t} tx={txNow} net={net} breakdownOf={breakdownOf} />
      {/* S-05-14。S-05-12（Excel 正負號提醒）已移除 */}
      <p className="hint">待填的筆不進結算，所以這裡的數字可能小於總花費</p>
    </div>
  ) : null;

  const Nav = (
    <div className="bar">
      <button className="ic2" aria-label="返回" onClick={() => navigate(-1)}>
        <Icon name="back" size={20} />
      </button>
      <span className="ttl">結算</span>
      <span style={{ width: 40 }} />
    </div>
  );

  /* S-05-31　代墊集中時的引導：**只給連結不給設定**，
     設定的唯一入口是 S-02b-13（一個設定只有一個入口）。 */
  const HubHint = suggestHub && prepaid?.top ? (
    <div className="fld" style={{ paddingTop: 12 }}>
      {/* 實作-V-3　圖示與內文之間包一層：不包的話圖示與文字是兩個 flex item，
          文字放不下時**整個 item 換行**，圖示就孤零零留在上一行（Rozi 截圖到的）。
          `.note.warn` 只有圖示＋文字，光靠 CSS 的 nowrap 就夠；
          這裡多一顆「去設定」，要讓它跟著內文一起流，所以包起來。 */}
      <div className="note calm">
        <Icon name="warn" size={14} />
        <span className="notebody">
          這趟有 {Math.round(prepaid.ratio * 100)}% 是{' '}
          {memberLabel(t.members.find(m => m.id === prepaid.top)!)} 先付的。
          改成「都轉給同一個人」的話，每個人只要轉一次。
          <button className="ratelink" onClick={() => navigate(`/trips/${tripId}/edit`)}>
            去設定 <Icon name="next" size={13} />
          </button>
        </span>
      </div>
    </div>
  ) : null;

  // ── §6　結算前檢查層（S-05-4／30）─────────────────────────────────────────────
  // 這是**提醒不是禁止**：「就這樣結算」一定要能真的結算。
  if (showWarnSheet) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        {Nav}
        <div className="fld" style={{ paddingTop: 16 }}>
          <div className="text-strong font-bold mb-[5px]">有 {nUn} 筆還沒算清楚</div>
          <div className="text-body text-md mb-3">結算之後金額就固定了。要先去看一下嗎？</div>
          <div className="gap">
            {/* 🔴 實作-Q-3　點這一列**直接開那一筆的編輯表單**。
                原本是 `navigate('/trips/:id')`——它有反應，但回到的是整個消費列表，
                而她本來就是從那裡過來的、那一筆也沒有被標出來，
                所以看起來就像什麼都沒發生。 */}
            {S.unsettledList.map(({ e, c }) => (
              <button key={e.id} className="rowb"
                onClick={() => navigate(`/trips/${tripId}?expense=${e.id}`)}>
                <span className="text-title">{e.emoji}</span>
                <span className="flex-1 font-semibold">{e.title}</span>
                <span className="text-sub text-gr">
                  {c.twdPending ? '金額還沒填' : `${c.blanks.length} 人還沒填`}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="btnrow">
          <button className="btn qt" disabled={calculateMutation.isPending}
            onClick={() => calculateMutation.mutate()}>就這樣結算</button>
          {/* 帶到「還沒算清楚」的篩選清單（S-03d），不是整個消費列表 */}
          <button className="btn" onClick={() => navigate(`/trips/${tripId}?unsettled=all`)}>先去看一下</button>
        </div>
      </div>
    );
  }

  // ── 狀態 1　未結算：完整轉帳預覽（S-05-28）────────────────────────────────────
  if (pageState === 'pending') {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        {Nav}
        {/* #24-2 預覽直接給轉帳明細。統計卡展開看的是「分攤多少」，
            這裡是「該收該付多少」，兩者是不同的數字。 */}
        <div style={{ paddingTop: 14 }}>
          <div className="txtitle">現在的狀況</div>
          <div className="txsub">還會變 —— 之後記帳會影響這裡</div>
          <TransferView t={t} tx={tx} approx={nUn > 0} />
        </div>
        {HubHint}
        {/* 實作-AB-1　位置：轉帳卡片下面、「結算行程」按鈕上面 */}
        {DetailsToggle}
        {DetailsBlock}
        <div className="btnrow" style={{ flexDirection: 'column', gap: 6 }}>
          <button className="btn" disabled={calculateMutation.isPending}
            onClick={() => (nUn > 0 ? setShowWarnSheet(true) : calculateMutation.mutate())}>
            {calculateMutation.isPending ? '計算中…' : '結算行程'}
          </button>
          <p className="hint" style={{ textAlign: 'center', margin: 0 }}>
            結算後金額固定，可以逐筆標記付清
          </p>
        </div>
      </div>
    );
  }

  // ── 狀態 3　全員付清：摺紙 signature（S-05-16）＋ 回顧卡 ──────────────────────
  if (pageState === 'done') {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        {Nav}
        <div className="empty" style={{ padding: '30px 22px' }}>
          <FoldSignature />
          <p style={{ fontSize: 'var(--fs-title)', marginTop: 10 }}>帳算清楚了</p>
          <p>下次去哪？</p>
        </div>

        {/* S-05-17　G-08 回顧卡：數字帶符號，標籤純文字 */}
        {highlights && (
          <div className="fld">
            <div className="recap">
              {([
                [String(highlights.days), '天', '出遊'],
                [String(highlights.count), '筆', '共記了'],
                [money(highlights.maxAmount), '', '最大手筆'],
              ] as const).map(([n, u, l]) => (
                <div key={l}>
                  <div className="tnum n">{n}<span className="u">{u}</span></div>
                  <div className="l">{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="fld">
          <span className="lbl">誰付給誰</span>
          {tx.map(x => (
            <div className="rowb" key={`${x.from}>${x.to}`} style={{ marginBottom: 6 }}>
              <span className="flex-1 text-body arrowrow">
                <MemberTag m={t.members.find(m => m.id === x.from)}
                  index={t.members.findIndex(m => m.id === x.from)} />
                <span className="text-gr">→</span>
                <MemberTag m={t.members.find(m => m.id === x.to)}
                  index={t.members.findIndex(m => m.id === x.to)} />
              </span>
              <span className="money">{money(x.amount)}</span>
            </div>
          ))}
        </div>

        {/* S-05-29　分享 CTA 升為主要動作，「建立新行程／封存行程」降為次級 */}
        <div className="btnrow" style={{ flexDirection: 'column', gap: 6 }}>
          <button className="btn" onClick={() => navigate(`/trips/${tripId}`)}>分享給大家</button>
          <div className="flex gap-2 w-full">
            <button className="btn qt" onClick={() => navigate('/')}>建立新行程</button>
            <button className="btn qt" disabled={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate()}>封存行程</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 狀態 2　已結算、逐筆標記付清 ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {Nav}
      {HubHint}

      {/* S-05-6　進度 */}
      <div className="fld" style={{ paddingTop: 12 }}>
        <div className="progbox">
          <div className="progtxt">{progress.cleared} / {Math.max(1, progress.total)} 筆已確認</div>
          <div className="progbar">
            <div style={{ width: `${progress.total ? progress.cleared * 100 / progress.total : 0}%` }} />
          </div>
        </div>
      </div>

      {/* S-05-7　與 S-05-28 共用同一份 transferView */}
      <TransferView
        t={t}
        tx={items.length
          ? items.map(i => ({ from: i.from_member_id, to: i.to_member_id, amount: i.amount }))
          : tx}
        withClear
        clearedIds={clearedIds}
        onClear={x => {
          const it = itemOf(x.from, x.to);
          if (it) clearItemMutation.mutate(it.id);
        }}
      />

      {DetailsToggle}
      {DetailsBlock}

      {/* 🔴 實作-AC-4　已結算之後帳又被改過。凍結值本身是對的（錢就是照它轉的），
          但使用者會拿它跟現在的帳對，對不起來又沒人說一聲。
          **只提示，指向下面既有的「重新計算」**，不新做按鈕。 */}
      {staleSettlement && (
        <p className="note warn" style={{ margin: '0 14px 8px' }}>
          <Icon name="warn" size={14} />{' '}這次結算之後帳有變動，數字跟現在的帳不一樣了
        </p>
      )}

      <div className="btnrow">
        <button className="btn qt" disabled={reopenMutation.isPending}
          onClick={() => reopenMutation.mutate('reopen')}>重新計算</button>
        <button className="btn" disabled={archiveMutation.isPending}
          onClick={() => archiveMutation.mutate()}>封存行程</button>
      </div>
    </div>
  );
}

/* S-05-16　摺紙 signature：三拍、總長 1.4s、**只播一次**、forwards 停在最終畫面。
   `prefers-reduced-motion: reduce` 直接給最終畫面（CSS 負責，見 index.css 的 .fold）。 */
function FoldSignature() {
  return (
    <svg className="anim fold" viewBox="0 -6 102 82" style={{ width: 86, height: 69 }}
      aria-label="一疊帳摺起來寄出去">
      <g className="sheetline">
        <path d="M14 10 h54 l18 18 v40 h-72 z" fill="#fff" stroke="#0F5E9E"
          strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M68 10 v18 h18" fill="none" stroke="#0F5E9E"
          strokeWidth="1.6" strokeLinejoin="round" />
        <g className="lines">
          <path d="M26 26 h30 M26 36 h38 M26 46 h22" stroke="#9FB0BA"
            strokeWidth="1.4" strokeLinecap="round" />
        </g>
      </g>
      {/* 軌跡在 .plane 之外：飛機飛走之後它要留在原地，那才叫殘影 */}
      <path className="trail" d="M48 46 L84 22" fill="none" stroke="#9B1B14"
        strokeWidth="1" strokeDasharray="3 3" />
      <g className="plane">
        <path pathLength={100} d="M18 44 L84 22 L56 60 L48 46 Z" fill="none"
          stroke="#0F5E9E" strokeWidth="1.8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
