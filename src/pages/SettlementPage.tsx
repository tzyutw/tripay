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
import { tripSummary, settleTrip, prepaidShare, calc } from '@/lib/summary';
import { money, memberLabel, firstGrapheme } from '@/lib/format';
import { Icon } from '@/components/Icon';
import TransferView from '@/components/shared/TransferView';
import type { TripWithMembers, SettlementItem, ExpenseWithSplits } from '@/types/database';

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
        .eq('id', tripId).single();
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
      else                                      showToast('結算失敗，請稍後再試');
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
      <div className="note calm">
        <Icon name="warn" size={14} /> 這趟有 {Math.round(prepaid.ratio * 100)}% 是{' '}
        {memberLabel(t.members.find(m => m.id === prepaid.top)!)} 先付的。
        改成「都轉給同一個人」的話，每個人只要轉一次。
        <button className="ratelink" onClick={() => navigate(`/trips/${tripId}/edit`)}>
          去設定 <Icon name="next" size={13} />
        </button>
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
            {S.unsettledList.map(({ e, c }) => (
              <button key={e.id} className="rowb"
                onClick={() => navigate(`/trips/${tripId}`)}>
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
          <button className="btn" onClick={() => navigate(`/trips/${tripId}`)}>先去看一下</button>
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
              <span className="flex-1 text-body">
                {memberLabel(t.members.find(m => m.id === x.from)!)}
                {' '}<span className="text-gr">→</span>{' '}
                {memberLabel(t.members.find(m => m.id === x.to)!)}
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

      {/* S-05-10 */}
      <button className="detailtoggle" onClick={() => setShowDetails(o => !o)}>
        查看計算依據 <Icon name={showDetails ? 'up' : 'down'} size={16} />
      </button>

      {showDetails && (
        <div className="fld">
          {/* S-05-11　人話淨額。由多筆轉帳組成時**對象要全部列出**。 */}
          <div className="gap">
            {t.members.map(m => {
              const v = netFromItems.find(x => x.id === m.id)?.net ?? net[m.id] ?? 0;
              const mine = (items.length
                ? items.map(i => ({ from: i.from_member_id, to: i.to_member_id, amount: i.amount }))
                : tx).filter(x => x.from === m.id || x.to === m.id);
              return (
                <div className="netcard" key={m.id}>
                  <div className="netrow">
                    <span className="text-title">{m.emoji || firstGrapheme(m.name)}</span>
                    <span className="flex-1 text-body font-semibold">{m.name}</span>
                    <span className="money"
                      style={{ color: v > 0 ? 'var(--in)' : v < 0 ? 'var(--out)' : 'var(--gr)' }}>
                      {v > 0 ? `可以拿回 ${money(v)}` : v < 0 ? `要給出 ${money(-v)}` : '剛好打平'}
                    </span>
                  </div>
                  {mine.length > 0 && (
                    <div className="netwho">
                      {mine.map(x => (
                        <div key={`${x.from}>${x.to}`}>
                          {x.from === m.id
                            ? <>給 {memberLabel(t.members.find(y => y.id === x.to)!)}{' '}
                                <span className="money inline">{money(x.amount)}</span></>
                            : <>{memberLabel(t.members.find(y => y.id === x.from)!)} 給你{' '}
                                <span className="money inline">{money(x.amount)}</span></>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* S-05-13　對帳表 */}
          <div className="detailtable">
            <div className="detailhd">
              <span>成員</span><span>實際付出</span><span>應分攤</span><span>差額</span>
            </div>
            {t.members.map(m => {
              const v = netFromItems.find(x => x.id === m.id)?.net ?? net[m.id] ?? 0;
              const paid = expenses
                .filter(e => e.payer_member_id === m.id && !e.settled_on_spot)
                .reduce((a, e) => a + (calc(e, trip, trip.trip_members).twdTotal || 0), 0);
              return (
                <div className="detailrow tnum" key={m.id}>
                  <span style={{ fontFamily: 'var(--sans)' }}>
                    {m.emoji || firstGrapheme(m.name)} {m.name}
                  </span>
                  <span>{paid.toLocaleString()}</span>
                  <span>{(paid - v).toLocaleString()}</span>
                  <span style={{ color: v >= 0 ? 'var(--in)' : 'var(--out)' }}>
                    {v >= 0 ? '+' : ''}{v.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* S-05-14。S-05-12（Excel 正負號提醒）已移除 */}
          <p className="hint">待填的筆不進結算，所以這裡的數字可能小於總花費</p>
        </div>
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
