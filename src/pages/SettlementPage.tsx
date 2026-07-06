import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabaseClient';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import { getCurrencySymbol } from '@/lib/currencies';
import type { TripWithMembers, SettlementItem } from '@/types/database';

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
        .from('trips').select('*, trip_members(*)')
        .eq('id', tripId).single();
      if (error) throw error;
      return data as TripWithMembers;
    },
    enabled: Boolean(tripId),
  });

  const { data: expenses = [] } = useQuery<Array<{ id: string; twd_amount: number | null; twd_pending: boolean; foreign_pending: boolean }>>({
    queryKey: ['expenses-light', tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const { data } = await supabase
        .from('expenses')
        .select('id, twd_amount, twd_pending, foreign_pending')
        .eq('trip_id', tripId)
        .is('deleted_at', null);
      return data ?? [];
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

  const pendingCount = useMemo(
    () => expenses.filter(e => e.twd_pending || e.foreign_pending).length,
    [expenses]
  );

  const progress = useMemo(() => {
    const items   = settlement?.settlement_items ?? [];
    const cleared = items.filter(i => i.is_cleared).length;
    return { cleared, total: items.length };
  }, [settlement]);

  const highlights = useMemo(() => {
    if (!trip) return null;
    const start     = new Date(trip.start_date);
    const end       = new Date(trip.end_date);
    const days      = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const active    = expenses.filter(e => !e.twd_pending && e.twd_amount !== null);
    const count     = active.length;
    const maxAmount = active.reduce((m, e) => Math.max(m, e.twd_amount ?? 0), 0);
    return { days, count, maxAmount };
  }, [trip, expenses]);

  const memberMap = useMemo(
    () => Object.fromEntries((trip?.trip_members ?? []).map(m => [m.id, m])),
    [trip]
  );

  const symbol = getCurrencySymbol(trip?.currency ?? 'TWD');

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

  // ── Warn sheet (有待填時) ──────────────────────────────────────────────────────

  if (showWarnSheet) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <NavBar tripId={tripId} onBack={() => navigate(-1)} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <span className="text-5xl">⚠️</span>
          <p className="text-lg font-bold text-ink">還有 {pendingCount} 筆沒填完</p>
          <p className="text-sm text-mid">結算數字可能不準確</p>
        </div>
        <div className="px-5 pb-10 pt-4 flex gap-3 flex-shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 h-[50px] bg-white text-primary rounded-xl border-[1.5px] border-primary text-[15px] font-bold active:scale-[0.97] transition-transform"
          >
            回去補填
          </button>
          <button
            onClick={() => { setShowWarnSheet(false); calculateMutation.mutate(); }}
            className="flex-1 h-[50px] bg-primary text-white rounded-xl text-[15px] font-bold active:scale-[0.97] transition-transform"
            disabled={calculateMutation.isPending}
          >
            先這樣算
          </button>
        </div>
        {/* Toast handled globally by ToastProvider */}
      </div>
    );
  }

  // ── State 1：未結算 ───────────────────────────────────────────────────────────

  if (pageState === 'pending') {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <NavBar tripId={tripId} onBack={() => navigate(-1)} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <span className="text-5xl">🧮</span>
          <p className="text-[15px] text-mid leading-relaxed max-w-xs">
            準備好了嗎？結算後可以標記付清，也可以隨時回來修改。
          </p>
          {pendingCount > 0 && (
            <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-4 py-3">
              <p className="text-warn text-[13px] font-semibold">
                ⚠️ 還有 {pendingCount} 筆沒填完，結算數字可能不準確
              </p>
            </div>
          )}
        </div>
        <div className="px-5 pb-10 pt-4 flex-shrink-0">
          <button
            onClick={() => {
              if (pendingCount > 0) setShowWarnSheet(true);
              else calculateMutation.mutate();
            }}
            disabled={calculateMutation.isPending}
            className="w-full h-[50px] bg-primary text-white rounded-xl text-[15px] font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
            style={{ boxShadow: '0 3px 14px rgba(124,45,18,0.36)' }}
          >
            {calculateMutation.isPending ? '計算中…' : '算清楚'}
          </button>
        </div>
        {/* Toast handled globally by ToastProvider */}
      </div>
    );
  }

  // ── State 3：全員付清（慶祝） ─────────────────────────────────────────────────

  if (pageState === 'done') {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <NavBar tripId={tripId} onBack={() => navigate(-1)} title="結算" />
        <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-6">
          {/* Celebration */}
          <div className="text-center py-8">
            <span className="text-[62px] block mb-4" style={{ animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              ✨
            </span>
            <h2 className="font-serif text-[30px] font-bold text-ink mb-2">帳算清楚了 ✨</h2>
            <p className="font-serif text-[18px] italic text-mid">下次去哪？</p>
          </div>

          {/* G-08 Highlights */}
          {highlights && (
            <div className="bg-white rounded-2xl shadow-card p-4 mb-5">
              <p className="text-[11px] font-bold text-muted tracking-widest uppercase text-center mb-4">
                這趟的回顧
              </p>
              <div className="grid grid-cols-3 divide-x divide-[#EEEBE6]">
                <HighlightCell
                  num={highlights.days}
                  unit="天"
                  label="出遊"
                />
                <HighlightCell
                  num={highlights.count}
                  unit="筆"
                  label="共記了"
                />
                <HighlightCell
                  num={highlights.maxAmount.toLocaleString()}
                  unit=""
                  label={`最大手筆 ${symbol}`}
                />
              </div>
            </div>
          )}

          {/* Settlement items (done) */}
          {(settlement?.settlement_items ?? []).length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] font-bold text-muted tracking-widest uppercase mb-3">誰付給誰</p>
              {(settlement?.settlement_items ?? []).map(item => {
                const from = memberMap[item.from_member_id];
                const to   = memberMap[item.to_member_id];
                return (
                  <div key={item.id} className="bg-white rounded-xl shadow-card p-4 mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[15px]">
                      <span>{from?.emoji} {from?.name}</span>
                      <span className="text-muted text-sm">→</span>
                      <span>{to?.emoji} {to?.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[17px] font-bold text-ok tabular-nums">
                        $ {item.amount.toLocaleString()}
                      </p>
                      <p className="text-[11px] font-bold text-ok">✅ 已付清</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="px-5 pb-10 pt-3 flex gap-3 flex-shrink-0 border-t border-black/[0.05]">
          <button
            onClick={() => navigate('/trips/new')}
            className="flex-1 h-[50px] bg-white text-primary rounded-xl border-[1.5px] border-primary text-[15px] font-bold active:scale-[0.97] transition-transform"
          >
            ＋ 建立新行程
          </button>
          <button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            className="flex-1 h-[50px] bg-primary text-white rounded-xl text-[15px] font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
          >
            {archiveMutation.isPending ? '封存中…' : '封存行程'}
          </button>
        </div>
        {/* Toast handled globally by ToastProvider */}
        <style>{`@keyframes popIn { from { transform: scale(0) rotate(-12deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }`}</style>
      </div>
    );
  }

  // ── State 2：部分付清 ─────────────────────────────────────────────────────────

  const items = settlement?.settlement_items ?? [];
  const clearedCount = items.filter(i => i.is_cleared).length;
  const pct = items.length > 0 ? (clearedCount / items.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <NavBar tripId={tripId} onBack={() => navigate(-1)} title="結算" />

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-24">
        {/* Progress */}
        <div className="bg-white rounded-xl shadow-card p-4 mb-4 mt-4">
          <p className="text-[13px] font-semibold text-mid mb-2">
            {clearedCount} / {items.length} 筆已確認
          </p>
          <div className="h-[6px] bg-[#F5F4F2] rounded-full overflow-hidden">
            <div
              className="h-full bg-ok rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Settlement items */}
        <div className="mb-4">
          {items.map(item => {
            const from = memberMap[item.from_member_id];
            const to   = memberMap[item.to_member_id];
            return (
              <div key={item.id} className="bg-white rounded-xl shadow-card p-4 mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[15px]">
                    <span>{from?.emoji} {from?.name}</span>
                    <span className="text-muted text-sm">→</span>
                    <span>{to?.emoji} {to?.name}</span>
                  </div>
                  <p className="text-[17px] font-bold text-ok tabular-nums">
                    $ {item.amount.toLocaleString()}
                  </p>
                </div>
                <div className="mt-2 flex justify-end">
                  {item.is_cleared ? (
                    <span className="text-[11px] font-bold text-ok">✅ 已付清</span>
                  ) : (
                    <button
                      onClick={() => clearItemMutation.mutate(item.id)}
                      disabled={clearItemMutation.isPending}
                      className="text-[11px] font-bold text-primary border-[1.5px] border-primary rounded-lg px-[10px] py-1 active:scale-95 transition-transform disabled:opacity-60"
                    >
                      標記付清
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 計算依據（折疊） */}
        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full text-left py-3 border-t border-[#EFEBE6] text-[13px] font-semibold text-mid flex items-center justify-between"
        >
          查看計算依據
          <span className="text-muted">{showDetails ? '▲' : '▼'}</span>
        </button>

        {showDetails && (
          <div className="mt-2">
            {/* Member balances from calculation result */}
            {(calcData?.member_balances ?? []).length > 0 ? (
              <div className="bg-white rounded-xl shadow-card overflow-hidden mb-4">
                <div className="grid grid-cols-4 text-[11px] font-bold text-muted px-4 py-2 border-b border-[#EFEBE6]">
                  <span>成員</span>
                  <span className="text-right">實際付出</span>
                  <span className="text-right">應分攤</span>
                  <span className="text-right">差額</span>
                </div>
                {(calcData?.member_balances ?? []).map(b => (
                  <div key={b.member_id} className="grid grid-cols-4 px-4 py-[10px] border-b border-[#F5F4F2] last:border-0">
                    <span className="text-[14px] font-semibold text-ink">{b.emoji} {b.name}</span>
                    <span className="text-right text-[13px] font-semibold tabular-nums">{b.payout.toLocaleString()}</span>
                    <span className="text-right text-[13px] tabular-nums">{b.cost.toLocaleString()}</span>
                    <span className={`text-right text-[13px] font-bold tabular-nums ${b.net_balance >= 0 ? 'text-ok' : 'text-warn'}`}>
                      {b.net_balance >= 0 ? '+' : ''}{b.net_balance.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted py-2">（依消費明細自動計算，重新整理後需重新計算才能顯示）</p>
            )}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 inset-x-0 px-5 pb-8 pt-3 bg-surface border-t border-black/[0.05] flex gap-3">
        <button
          onClick={() => reopenMutation.mutate('reopen')}
          disabled={reopenMutation.isPending}
          className="flex-1 h-[50px] bg-white text-mid rounded-xl border-[1.5px] border-[#E4DFD9] text-[14px] font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
        >
          {reopenMutation.isPending ? '處理中…' : '重新計算'}
        </button>
        <button
          onClick={() => archiveMutation.mutate()}
          disabled={archiveMutation.isPending}
          className="flex-1 h-[50px] bg-primary text-white rounded-xl text-[14px] font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
        >
          {archiveMutation.isPending ? '封存中…' : '封存行程'}
        </button>
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavBar({ tripId: _tripId, onBack, title }: { tripId?: string; onBack: () => void; title?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#EFEBE6] flex-shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-primary text-[13px] font-medium"
      >
        ‹ 返回
      </button>
      <span className="text-[14px] font-semibold text-mid">{title ?? '結算'}</span>
      <div className="w-12" />
    </div>
  );
}

function HighlightCell({ num, unit, label }: { num: number | string; unit: string; label: string }) {
  return (
    <div className="text-center px-2">
      <p className="text-[24px] font-extrabold text-ink leading-tight">
        {num}<span className="text-[14px] font-semibold text-mid">{unit}</span>
      </p>
      <p className="text-[10px] font-semibold text-muted mt-1">{label}</p>
    </div>
  );
}
