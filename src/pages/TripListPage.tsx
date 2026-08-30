import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { deriveDisplayStatus, STATUS_LABEL, STATUS_BADGE_CLASS } from '@/lib/deriveStatus';
import { destinationOf } from '@/lib/destinations';
import type { TripWithMembers } from '@/types/database';
import TripFormSheet from '@/components/TripFormSheet';

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(s)} – ${fmt(e)} · ${s.getFullYear()}`;
}

export default function TripListPage() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const [formOpen, setFormOpen] = useState(false);
  const [editTripId, setEditTripId] = useState<string | undefined>();

  // Auto-open form when navigated to /trips/new (G-01)
  useEffect(() => {
    if (location.pathname === '/trips/new') setFormOpen(true);
  }, [location.pathname]);

  const { data: trips = [], isLoading } = useQuery<TripWithMembers[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_members!trip_members_trip_id_fkey(*)')
        .eq('owner_id', user.id)
        // S-01 排序規則：依出發日新→舊。準備旅遊的行程日期在未來，自然排最上，
        // 不需另做置頂邏輯。同日則以建立時間新→舊作次要排序（穩定順序）。
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TripWithMembers[];
    },
  });

  // G-09：新行程預填上一趟的成員（trips 已依出發日新→舊排序，取第一筆）
  const latestTripId = trips[0]?.id;

  function openNew() {
    setEditTripId(undefined);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditTripId(undefined);
    if (location.pathname === '/trips/new') navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col animate-slide-in">
      {/* Header */}
      <div className="px-5 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
        <span className="font-sans text-[28px] font-bold tracking-tight text-primary">Tripay</span>
        <button
          onClick={openNew}
          className="h-9 px-4 bg-primary text-white rounded-xl text-[13px] font-bold flex items-center gap-1 active:scale-95 transition-transform duration-100"
          style={{ boxShadow: '0 2px 8px rgba(124,45,18,0.32)' }}
        >
          ＋ 新增行程
        </button>
      </div>

      {/* Trip list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="px-5 py-4 flex flex-col gap-3">

          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && trips.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-ink font-semibold text-lg">還沒有行程。</p>
              <p className="text-muted text-sm">第一趟要去哪？</p>
            </div>
          )}

          {trips.map((trip) => {
            const display    = deriveDisplayStatus(trip);
            // simplified pending count via member count as proxy (replace with real query later)
            const memberEmojis = trip.trip_members
              .sort((a, b) => a.sort_order - b.sort_order)
              .map(m => m.emoji)
              .join('');
            const dest = destinationOf(trip.name, trip.id);

            return (
              <div
                key={trip.id}
                onClick={() => navigate(`/trips/${trip.id}`)}
                className="rounded-2xl overflow-hidden shadow-card cursor-pointer active:scale-[0.985] transition-transform"
              >
                {/* 目的地照片卡：gradient 為佔位，data-photo 標示該換上的實體照片 */}
                <div
                  data-photo={dest.photo}
                  className={`h-[184px] relative flex flex-col justify-end px-4 pb-4 ${display === 'archived' ? 'saturate-[0.55] brightness-90' : ''}`}
                  style={{ background: dest.gradient }}
                >
                  {/* 底部壓暗，確保文字在任何照片上都讀得到 */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 38%, rgba(0,0,0,0.46) 100%)' }}
                  />
                  <span className="absolute top-4 right-4 text-[34px] leading-none drop-shadow">{trip.emoji}</span>

                  <div className="relative">
                    <span
                      className={`inline-flex items-center px-[10px] py-[3px] rounded-full text-[11px] font-bold tracking-[0.04em] w-fit mb-[6px] ${STATUS_BADGE_CLASS[display]}`}
                    >
                      {STATUS_LABEL[display]}
                    </span>

                    <p className="font-sans text-[22px] font-bold text-white tracking-tight leading-snug">
                      {trip.name}
                    </p>

                    <div className="flex items-center gap-2 mt-[6px]">
                      <span className="text-[17px] tracking-wider">{memberEmojis}</span>
                      <span className="text-[12px] text-white/85 tabular-nums">
                        {formatDateRange(trip.start_date, trip.end_date)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* G-02 Ghost card */}
        <div
          className="mx-5 mb-5 rounded-2xl overflow-hidden cursor-pointer animate-ghost-pulse"
          // Aria 2026-08-30：原本 blur1.8/opacity.5 疊上低對比文字後幾乎看不見，
          // 但它是可點的「再開一趟」入口。保留幽靈感，調到讀得到。
          style={{ filter: 'blur(0.8px)', opacity: 0.72 }}
          onClick={openNew}
        >
          <div
            className="h-24 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #D6C4B5, #C2AFA0)' }}
          >
            <p
              className="font-serif text-[18px] italic"
              style={{ color: 'rgba(80,55,42,0.72)' }}
            >
              你的下一趟在哪？
            </p>
          </div>
        </div>

        {/* G-06 Share banner */}
        <div className="mx-5 mb-6 bg-surface border border-[#E7E5E4] rounded-2xl p-4 flex items-center gap-3">
          <span className="text-[28px] flex-shrink-0">🔗</span>
          <p className="flex-1 text-[13px] text-mid leading-snug">
            分享行程連結，朋友免下載就能看帳
          </p>
          <button className="flex-shrink-0 px-3 py-[7px] rounded-lg border-[1.5px] border-primary text-primary text-xs font-bold whitespace-nowrap">
            複製連結
          </button>
        </div>
      </div>

      {/* Trip form sheet */}
      {formOpen && (
        <TripFormSheet
          tripId={editTripId}
          prefill={!editTripId && latestTripId ? { tripId: latestTripId, mode: 'members' } : undefined}
          onClose={closeForm}
          onCreated={(id) => navigate(`/trips/${id}`)}
        />
      )}
    </div>
  );
}
