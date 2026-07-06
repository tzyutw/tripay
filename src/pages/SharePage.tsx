import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { getCurrencySymbol } from '@/lib/currencies';
import type { TripWithMembers, Expense, SettlementItem, TripMember } from '@/types/database';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SettlementWithItems {
  id: string;
  status: string;
  settlement_items: SettlementItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function categoryFromTitle(title: string): string {
  if (/餐|吃|食/i.test(title))   return '🍜';
  if (/交通|車|巴士/i.test(title)) return '🚌';
  if (/住|飯店/i.test(title))     return '🏨';
  if (/票|景點/i.test(title))     return '🎡';
  if (/買|購物/i.test(title))     return '🛍️';
  return '➕';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [pwaPrompt, setPwaPrompt] = useState<Event | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  // Capture PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setPwaPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── Queries (anon — no auth required) ────────────────────────────────────────

  const { data: trip, isLoading: tripLoading, isError: tripError } = useQuery<TripWithMembers | null>({
    queryKey: ['share-trip', token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_members(*)')
        .eq('share_token', token)
        .single();
      if (error) throw error;
      return data as TripWithMembers;
    },
    enabled: Boolean(token),
    retry: false,
  });

  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ['share-expenses', trip?.id],
    queryFn: async () => {
      if (!trip) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('trip_id', trip.id)
        .is('deleted_at', null)
        .order('expense_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
    enabled: Boolean(trip?.id),
  });

  const { data: settlement } = useQuery<SettlementWithItems | null>({
    queryKey: ['share-settlement', trip?.id],
    queryFn: async () => {
      if (!trip) return null;
      const { data } = await supabase
        .from('settlements')
        .select('id, status, settlement_items(*)')
        .eq('trip_id', trip.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as SettlementWithItems | null;
    },
    enabled: Boolean(trip?.id),
  });

  // ── Loading / Error ───────────────────────────────────────────────────────────

  if (tripLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (tripError || !trip) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-8 text-center gap-3">
        <span className="text-4xl">🔍</span>
        <p className="text-ink font-semibold">找不到這個行程</p>
        <p className="text-muted text-sm">連結可能已失效或被移除。</p>
      </div>
    );
  }

  // ── Computed ──────────────────────────────────────────────────────────────────

  const members     = trip.trip_members.sort((a, b) => a.sort_order - b.sort_order);
  const memberMap   = Object.fromEntries(members.map(m => [m.id, m]));
  const symbol      = getCurrencySymbol(trip.currency);
  const memberEmojis = members.map(m => m.emoji).join('');

  const activeExpenses = expenses.filter(e => !e.twd_pending && e.twd_amount !== null);
  const totalTwd       = activeExpenses.reduce((s, e) => s + (e.twd_amount ?? 0), 0);
  const perPerson      = members.length > 0 ? Math.round(totalTwd / members.length) : 0;

  const settleItems = settlement?.settlement_items ?? [];

  function handleInstall() {
    if (!pwaPrompt) return;
    (pwaPrompt as BeforeInstallPromptEvent).prompt?.();
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header hero */}
      <div
        className="flex-shrink-0 pt-12 pb-4 px-5 relative"
        style={{ background: 'linear-gradient(148deg, #1A3558 0%, #2B5590 42%, #684533 100%)' }}
      >
        {/* Read-only badge */}
        <div className="absolute top-4 right-5">
          <span className="inline-flex items-center gap-1 bg-white/20 text-white/80 text-xs font-semibold px-3 py-1 rounded-full border border-white/25">
            朋友檢視
          </span>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{trip.emoji}</span>
          <div>
            <h1 className="font-sans text-[24px] font-bold text-white tracking-tight leading-tight">
              {trip.name}
            </h1>
            <p className="text-sm text-white/70 mt-1">
              {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)} · {memberEmojis}
            </p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex-shrink-0 bg-white shadow-sm">
        <div className="flex">
          <div className="flex-1 text-center py-3 border-r border-[#EFEBE6]">
            <p className="text-[18px] font-bold text-ink tabular-nums">$ {totalTwd.toLocaleString()}</p>
            <p className="text-[11px] text-muted mt-[2px]">總花費</p>
          </div>
          <div className="flex-1 text-center py-3 border-r border-[#EFEBE6]">
            <p className="text-[18px] font-bold text-ink tabular-nums">
              {symbol} {symbol === '$' ? totalTwd.toLocaleString() : '—'}
            </p>
            <p className="text-[11px] text-muted mt-[2px]">{trip.currency}</p>
          </div>
          <div className="flex-1 text-center py-3">
            <p className="text-[18px] font-bold text-ink tabular-nums">$ {perPerson.toLocaleString()}</p>
            <p className="text-[11px] text-muted mt-[2px]">人均</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">

        {/* 誰付給誰 */}
        {settleItems.length > 0 && (
          <div className="px-5 mt-5">
            <SectionTitle title="誰付給誰" />
            {settleItems.map(item => {
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
                    {item.is_cleared && (
                      <p className="text-[11px] font-bold text-ok">✅ 已付清</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 結算尚未執行 */}
        {!settlement && (
          <div className="px-5 mt-5">
            <SectionTitle title="誰付給誰" />
            <div className="bg-white rounded-xl shadow-card p-4 text-center">
              <p className="text-muted text-[13px]">這趟旅程還沒結算。</p>
            </div>
          </div>
        )}

        {/* 消費明細 */}
        <div className="px-5 mt-5">
          <SectionTitle title="消費明細" />
          {expenses.length === 0 && (
            <p className="text-muted text-sm py-4 text-center">還沒有消費紀錄。</p>
          )}
          {expenses.map(exp => {
            const payer = memberMap[exp.payer_member_id] as TripMember | undefined;
            return (
              <div key={exp.id} className="bg-white rounded-xl shadow-card p-[11px] flex items-center gap-[10px] mb-2">
                <span className="text-[20px] w-[32px] text-center flex-shrink-0">
                  {exp.category_emoji || categoryFromTitle(exp.title)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-ink truncate">{exp.title}</p>
                  <p className="text-[11px] text-muted mt-[2px]">
                    {payer?.emoji} {payer?.name} · {exp.expense_date}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[15px] font-bold text-ink tabular-nums">
                    {exp.twd_pending || exp.twd_amount === null
                      ? '—'
                      : `$ ${exp.twd_amount.toLocaleString()}`}
                  </p>
                  {exp.twd_pending && (
                    <p className="text-[10px] text-warn">待補填</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* G-06 Footer CTA */}
      <div className="flex-shrink-0 bg-surface border-t border-[#E7E5E4] px-5 py-4 pb-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-mid leading-snug flex-1">
            想自己記帳？下載 Tripay
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={copyLink}
              className="h-9 px-3 rounded-xl border border-[#E4DFD9] text-mid text-xs font-semibold"
            >
              {copiedToast ? '已複製 ✓' : '複製連結'}
            </button>
            {pwaPrompt && (
              <button
                onClick={handleInstall}
                className="h-9 px-3 rounded-xl bg-primary text-white text-xs font-bold"
              >
                安裝
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <p className="text-[11px] font-bold text-muted tracking-widest uppercase mb-3">{title}</p>
  );
}

// BeforeInstallPromptEvent type
interface BeforeInstallPromptEvent extends Event {
  prompt?: () => Promise<void>;
}
