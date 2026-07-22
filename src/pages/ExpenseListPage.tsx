import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import { getCurrencySymbol } from '@/lib/currencies';
import { useToast } from '@/contexts/ToastContext';
import type { TripWithMembers, ExpenseWithSplits } from '@/types/database';
import ExpenseFormSheet from '@/components/ExpenseFormSheet';

// ── Day grouping ──────────────────────────────────────────────────────────────

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function groupKey(expenseDate: string, trip: TripWithMembers): string {
  if (expenseDate < trip.start_date) return '出發前';
  const start   = new Date(trip.start_date);
  const expDate = new Date(expenseDate);
  const dayDiff = Math.floor((expDate.getTime() - start.getTime()) / 86_400_000);
  const n       = dayDiff + 1;
  const wd      = WEEKDAY[expDate.getDay()];
  const m       = expDate.getMonth() + 1;
  const d       = expDate.getDate();
  return `第 ${n} 天 · ${m}/${d}（${wd}）`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtAmount(val: number | null, pending: boolean, symbol: string) {
  if (pending || val === null) return '—';
  return `${symbol} ${val.toLocaleString()}`;
}

function categoryFromTitle(title: string): string {
  if (/餐|吃|食|lunch|dinner|food/i.test(title))          return '🍜';
  if (/交通|車|巴士|bus|train|地鐵|metro/i.test(title))    return '🚌';
  if (/住|飯店|hotel|旅館|hostel/i.test(title))            return '🏨';
  if (/票|景點|ticket|入場|樂園/i.test(title))             return '🎡';
  if (/買|購物|shop|便利|超市/i.test(title))               return '🛍️';
  return '➕';
}

// ── Share action sheet ────────────────────────────────────────────────────────

function ShareSheet({
  trip, members, onClose, onToast,
}: {
  trip: TripWithMembers;
  members: ReturnType<typeof trip.trip_members.sort>;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const { data: settlement } = useQuery({
    queryKey: ['settlement', trip.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('settlements')
        .select('*, settlement_items(*)')
        .eq('trip_id', trip.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 30_000,
  });

  const shareUrl = `${window.location.origin}/share/${trip.share_token}`;
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  function buildSummary(): string {
    const items = (settlement as { settlement_items?: Array<{ from_member_id: string; to_member_id: string; amount: number }> } | null)
      ?.settlement_items ?? [];
    const lines = items.map(i => {
      const from = memberMap[i.from_member_id];
      const to   = memberMap[i.to_member_id];
      return `${from?.emoji}${from?.name} 付給 ${to?.emoji}${to?.name}：$ ${i.amount.toLocaleString()}`;
    });
    return [`${trip.name} 結算`, ...lines].join('\n');
  }

  function copySummary() {
    navigator.clipboard.writeText(buildSummary()).then(() => {
      onToast('已複製 ✓');
      onClose();
    });
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      onToast('連結已複製 ✓');
      onClose();
    });
  }

  const opts = [
    { title: '複製結算摘要', sub: '貼到 LINE 群組，讓大家知道誰付誰', action: copySummary },
    { title: '複製分享連結', sub: '任何人打開都能看消費明細，不用登入', action: copyLink },
    { title: '預覽分享頁面', sub: '看看對方收到連結會看到什麼', action: () => { window.open(shareUrl, '_blank'); onClose(); } },
  ];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" style={{ backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-[22px] shadow-sheet animate-sheet-up p-5 pb-10">
        <div className="w-9 h-1 bg-[#D0CBC5] rounded-full mx-auto mb-5" />
        {opts.map(opt => (
          <button
            key={opt.title}
            onClick={opt.action}
            className="w-full flex items-center gap-3 py-4 border-b border-[#EFEBE6] last:border-0 active:bg-black/5 transition-colors text-left"
          >
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-ink">{opt.title}</p>
              <p className="text-[12px] text-muted mt-[2px]">{opt.sub}</p>
            </div>
          </button>
        ))}
        <button onClick={onClose} className="w-full h-[50px] mt-4 rounded-xl border-[1.5px] border-[#E4DFD9] text-mid font-bold text-[15px]">取消</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExpenseListPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const navigate       = useNavigate();
  const qc             = useQueryClient();

  const [formOpen,        setFormOpen]        = useState(false);
  const [editExpenseId,   setEditExpenseId]   = useState<string | undefined>();
  const [currencyMode,    setCurrencyMode]    = useState<'twd' | 'foreign'>('twd');
  const [shareSheetOpen,  setShareSheetOpen]  = useState(false);
  const [g05Dismissed,    setG05Dismissed]    = useState(() => sessionStorage.getItem('g05-dismissed') === '1');
  const { toast: showToast } = useToast();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: trip, isLoading: tripLoading } = useQuery<TripWithMembers | null>({
    queryKey: ['trip', tripId],
    queryFn: async () => {
      if (!tripId) return null;
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_members!trip_members_trip_id_fkey(*)')
        .eq('id', tripId)
        .single();
      if (error) throw error;
      return data as TripWithMembers;
    },
    enabled: Boolean(tripId),
  });

  const { data: expenses = [], isLoading: expLoading } = useQuery<ExpenseWithSplits[]>({
    queryKey: ['expenses', tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('trip_id', tripId)
        .is('deleted_at', null)
        .order('expense_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExpenseWithSplits[];
    },
    enabled: Boolean(tripId),
  });

  // Archive (direct DB write — owner can update their own trip)
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('trips').update({ status: 'archived' }).eq('id', tripId!);
      if (error) throw error;
    },
    onSuccess: () => {
      showToast('這趟封存了。下次再出發！');
      qc.invalidateQueries({ queryKey: ['trip', tripId] });
      qc.invalidateQueries({ queryKey: ['trips'] });
    },
  });

  // Unarchive via Edge Function (reopen-settlement mode=unarchive)
  const unarchiveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke(
        'reopen-settlement', { body: { trip_id: tripId, mode: 'unarchive' } }
      );
      if (error) throw new Error(error.message ?? '重新開啟失敗');
    },
    onSuccess: () => {
      showToast('重新開啟了，繼續記吧');
      qc.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  // ── Computed stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const myMemberId    = trip?.owner_member_id ?? null;
    const activeExpenses = expenses.filter(e => !e.twd_pending && e.twd_amount !== null);
    const totalTwd      = activeExpenses.reduce((s, e) => s + (e.twd_amount ?? 0), 0);
    const pendingCount  = expenses.filter(e => e.twd_pending || e.foreign_pending).length;

    let myCost = 0;
    if (myMemberId) {
      for (const exp of activeExpenses) {
        if (exp.expense_type === 'personal') continue;
        const splits = exp.expense_splits ?? [];
        const mySplit = splits.find(s => s.member_id === myMemberId && s.is_participating);
        if (!mySplit) continue;
        if (exp.expense_type === 'shared') {
          const n = splits.filter(s => s.is_participating).length;
          if (n > 0) myCost += Math.round((exp.twd_amount ?? 0) / n);
        } else if (exp.expense_type === 'individual') {
          if (!mySplit.split_pending && mySplit.split_amount !== null) myCost += mySplit.split_amount;
        }
      }
    }

    return { totalTwd, myCost, pendingCount };
  }, [expenses, trip]);

  // ── Grouped expenses ──────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    if (!trip) return [];
    const map = new Map<string, ExpenseWithSplits[]>();
    for (const e of expenses) {
      const k = groupKey(e.expense_date, trip);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries());
  }, [expenses, trip]);

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (tripLoading || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const display      = deriveDisplayStatus(trip);
  const isArchived   = display === 'archived';
  const isSettled    = display === 'settled';
  const isActive     = display === 'active' || display === 'planned';
  const symbol       = getCurrencySymbol(trip.currency);
  const todayYmd     = new Date().toISOString().slice(0, 10);
  const beforeTrip   = todayYmd < trip.start_date;
  const memberEmojis = trip.trip_members.sort((a, b) => a.sort_order - b.sort_order).map(m => m.emoji).join('');
  const memberMap    = Object.fromEntries(trip.trip_members.map(m => [m.id, m]));
  const showG05      = !g05Dismissed && expenses.length === 1;

  function openNew() { setEditExpenseId(undefined); setFormOpen(true); }
  function openEdit(eid: string) { setEditExpenseId(eid); setFormOpen(true); }
  function dismissG05() { sessionStorage.setItem('g05-dismissed', '1'); setG05Dismissed(true); }

  return (
    <div className="min-h-screen bg-surface flex flex-col animate-slide-in">

      {/* Hero */}
      <div
        className="flex-shrink-0 relative pt-[64px] px-5 pb-4"
        style={{
          background: 'linear-gradient(148deg, #1A3558 0%, #2B5590 42%, #684533 100%)',
          minHeight: 156,
        }}
      >
        {/* Nav bar */}
        <div className="absolute top-3 left-4 right-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-white/90 text-[13px] font-medium"
          >
            ‹ 返回
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setShareSheetOpen(true)}
              className="w-[34px] h-[34px] rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
              aria-label="分享"
            >
              <span className="text-white text-base">↑</span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="w-[34px] h-[34px] rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
              aria-label="設定"
            >
              <span className="text-white text-sm">⚙</span>
            </button>
          </div>
        </div>

        <h1 className="font-sans text-[26px] font-bold text-white tracking-tight">{trip.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[17px]">{memberEmojis}</span>
          <span className="text-[13px] text-white/70">{trip.start_date} – {trip.end_date}</span>
        </div>
      </div>

      {/* Stats strip */}
      <div className="bg-white flex-shrink-0 flex" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div className="flex-1 text-center py-3 px-2">
          <p className="text-[17px] font-bold text-ink tabular-nums">
            $ {stats.totalTwd.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted mt-[2px]">總花費</p>
          {stats.pendingCount > 0 && (
            <p className="text-[10px] text-warn mt-[3px]">⚠️ 含 {stats.pendingCount} 筆待填</p>
          )}
        </div>
        <div className="flex-1 text-center py-3 px-2 border-l border-[#EFEBE6]">
          <p className="text-[17px] font-bold text-ink tabular-nums">
            $ {stats.myCost.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted mt-[2px]">我的花費</p>
        </div>
        {/* Currency toggle */}
        <div className="w-[68px] flex-shrink-0 border-l border-[#EFEBE6] flex flex-col items-center justify-center gap-1 py-2 px-1">
          {(['twd', 'foreign'] as const).map(m => (
            <button
              key={m}
              onClick={() => setCurrencyMode(m)}
              className={`w-14 h-[22px] rounded-md text-[11px] font-bold transition-colors ${currencyMode === m ? 'bg-primary text-white' : 'text-muted'}`}
            >
              {m === 'twd' ? `$ 台幣` : `${symbol} 外幣`}
            </button>
          ))}
        </div>
      </div>

      {/* G-05 Share banner (one-time) */}
      {showG05 && (
        <div className="mx-5 mt-4 bg-[#FFF5F0] border border-[#FFD9C0] rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">🎉</span>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-ink">記完了嗎？讓大家看看。</p>
            <p className="text-[12px] text-mid mt-1">把這趟的消費明細分享給大家，一起確認。</p>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button
              onClick={() => setShareSheetOpen(true)}
              className="px-3 py-1 bg-primary text-white text-xs font-bold rounded-xl"
            >
              分享給大家
            </button>
            <button onClick={dismissG05} className="text-muted text-xs text-right">之後再說</button>
          </div>
        </div>
      )}

      {/* Expense list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
        {expLoading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!expLoading && expenses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <p className="text-ink font-semibold text-[16px] leading-snug">
              {beforeTrip ? '出發前的費用也先記' : '第一筆從哪裡開始？'}
            </p>
            <p className="text-muted text-[13px] mt-2">
              {beforeTrip
                ? '訂票、換外幣、買行李，都算這趟的帳'
                : '早餐、計程車、門票，都可以記'}
            </p>
          </div>
        )}

        {groups.map(([groupLabel, groupExpenses]) => (
          <div key={groupLabel} className="px-5">
            <p className="text-[11px] font-bold text-muted tracking-widest uppercase py-[14px] pb-2">
              {groupLabel}
            </p>
            <div className="flex flex-col gap-2">
              {groupExpenses.map(exp => {
                const payer   = memberMap[exp.payer_member_id];
                const isPend  = exp.twd_pending || exp.foreign_pending;
                const showAmt = currencyMode === 'twd'
                  ? fmtAmount(exp.twd_amount, exp.twd_pending, '$')
                  : fmtAmount(exp.foreign_amount, exp.foreign_pending, symbol);

                return (
                  <button
                    key={exp.id}
                    onClick={() => openEdit(exp.id)}
                    className={`bg-white rounded-xl p-[11px] flex items-center gap-[10px] shadow-card text-left w-full relative overflow-hidden ${isPend ? 'border-l-[3px] border-warn' : ''}`}
                  >
                    <span className="text-[22px] w-[34px] text-center flex-shrink-0">
                      {exp.category_emoji || categoryFromTitle(exp.title)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold text-ink truncate">{exp.title}</p>
                      <div className="flex items-center gap-[6px] mt-[3px] flex-wrap">
                        <span className="text-[11px] text-muted">{payer?.emoji} {payer?.name}</span>
                        {exp.expense_type === 'individual' && (
                          <span className="text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] px-[7px] py-[2px] rounded-full">各付各的</span>
                        )}
                        {exp.expense_type === 'personal' && (
                          <span className="text-[10px] font-bold bg-[#FEF2F2] text-[#991B1B] px-[7px] py-[2px] rounded-full">只算我</span>
                        )}
                        {isPend && (
                          <span className="text-[10px] font-bold bg-[#FFF7ED] text-warn px-[7px] py-[2px] rounded-full">待補填</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[16px] font-bold text-ink tabular-nums">{showAmt}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom action bar */}
      {!isArchived && (
        <div className="fixed bottom-0 inset-x-0 px-5 py-3 pb-8 bg-surface border-t border-black/[0.05] flex gap-[10px]">
          {isActive && (
            <>
              <button
                onClick={() => navigate(`/trips/${tripId}/settlement`)}
                className="flex-1 h-[50px] bg-white text-primary rounded-xl border-[1.5px] border-primary text-[15px] font-bold active:scale-[0.97] transition-transform"
              >
                前往結算
              </button>
              <button
                onClick={openNew}
                className="flex-1 h-[50px] bg-primary text-white rounded-xl text-[15px] font-bold active:scale-[0.97] transition-transform"
                style={{ boxShadow: '0 3px 14px rgba(124,45,18,0.36)' }}
              >
                ＋ 新增消費
              </button>
            </>
          )}
          {isSettled && (
            <>
              <button
                onClick={() => navigate(`/trips/${tripId}/settlement`)}
                className="flex-1 h-[50px] bg-white text-primary rounded-xl border-[1.5px] border-primary text-[15px] font-bold active:scale-[0.97] transition-transform"
              >
                查看結算
              </button>
              <button
                onClick={() => archiveMutation.mutate()}
                disabled={archiveMutation.isPending}
                className="flex-1 h-[50px] bg-[#F5F4F2] text-mid rounded-xl text-[15px] font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
              >
                {archiveMutation.isPending ? '封存中…' : '封存行程'}
              </button>
            </>
          )}
        </div>
      )}

      {isArchived && (
        <div className="fixed bottom-0 inset-x-0 px-5 py-3 pb-8 bg-surface border-t border-black/[0.05]">
          <button
            onClick={() => unarchiveMutation.mutate()}
            disabled={unarchiveMutation.isPending}
            className="w-full h-[50px] bg-white text-primary rounded-xl border-[1.5px] border-primary text-[15px] font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
          >
            {unarchiveMutation.isPending ? '處理中…' : '重新開啟'}
          </button>
        </div>
      )}

      {/* Expense form sheet */}
      {formOpen && trip && (
        <ExpenseFormSheet
          tripId={tripId!}
          trip={trip}
          expenseId={editExpenseId}
          onClose={() => { setFormOpen(false); setEditExpenseId(undefined); }}
        />
      )}

      {/* Share action sheet */}
      {shareSheetOpen && trip && (
        <ShareSheet
          trip={trip}
          members={trip.trip_members.sort((a, b) => a.sort_order - b.sort_order)}
          onClose={() => setShareSheetOpen(false)}
          onToast={showToast}
        />
      )}

    </div>
  );
}
