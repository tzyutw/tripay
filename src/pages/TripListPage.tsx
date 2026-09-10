import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MSG_READ_FAIL_TRIPS_T, MSG_READ_FAIL_BODY, MSG_READ_FAIL_RETRY } from '@/lib/messages';
import { supabase } from '@/lib/supabaseClient';
import { deriveDisplayStatus, STATUS_LABEL, STATUS_BADGE_CLASS } from '@/lib/deriveStatus';
import { destinationOf } from '@/lib/destinations';
import type { TripWithMembers } from '@/types/database';
import TripFormSheet from '@/components/TripFormSheet';
import { Icon } from '@/components/Icon';
import { dateRange } from '@/lib/format';

export default function TripListPage() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const [formOpen, setFormOpen] = useState(false);
  const [editTripId, setEditTripId] = useState<string | undefined>();

  /* 使用者自己按「建立第一趟」／「新增行程」導到 /trips/new 時自動開表單。
     ⚠️ G-01（零行程時**自動**導向）已於 2026-09-10 拿掉，這裡只處理手動導向。 */
  useEffect(() => {
    if (location.pathname === '/trips/new') setFormOpen(true);
  }, [location.pathname]);

  const { data: trips = [], isLoading, isError, refetch } = useQuery<TripWithMembers[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_members!trip_members_trip_id_fkey(*)')
        // Phase 2：帳單週期（kind='statement'）不得混進旅遊列表
        .eq('kind', 'trip')
        .eq('owner_id', user.id)
        // S-01 排序規則：依出發日新→舊。準備旅遊的行程日期在未來，自然排最上，
        // 不需另做置頂邏輯。同日則以建立時間新→舊作次要排序（穩定順序）。
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TripWithMembers[];
    },
  });

  /* G-09「新增行程預填上一趟成員」**已於 2026-09-04 移除**（專案狀態.md:422 劃掉那一列），
     原型 S-02 裡也沒有這個行為。不要再接回來。 */

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
    <div className="min-h-screen bg-white flex flex-col animate-slide-in">
      {/* 實作-V-5　頂部列固定在頂端（改之前是 static，往下捲就看不到「新增行程」與設定）。
          底色必須不透明——不然捲過去的行程卡會透出來。
          🔴 實作-Z-2　安全區從 `.topbar` 搬到外面的 `.topbarwrap`：
          `env(safe-area-inset-top)` 在 iOS 上會隨網址列伸縮而變，放在 sticky 元素
          自己的 padding 裡，那一條的高度就會跟著跳——Rozi：「首頁放名稱的地方
          在滑動的時候會一直抖動，看得很不舒服」。
          ⚠️ `pt-4` 拿掉：`.topbar` 的 padding-top 由 CSS 給固定的 16px，
          留在這裡會被 utility 蓋回去，等於安全區白搬。 */}
      <div className="topbarwrap flex-shrink-0">
      <div className="topbar px-5 pb-0 flex items-center justify-between">
        <span className="font-sans text-title font-bold tracking-tight text-w">Tripay</span>
        <span className="flex items-center gap-2">
          {/* S-01-2　全形「＋」改用 Feather 的 add——同一個動作全站原本有兩種畫法 */}
          <button
            onClick={openNew}
            className="px-3 py-[7px] bg-w text-white rounded-base text-body font-semibold flex items-center gap-1 active:scale-95 transition-transform duration-100"
          >
            <Icon name="add" size={16} /> 新增行程
          </button>
          {/* S-01-15　設定入口（#28-6c）：從 S-03 行程頁移過來。那是 App 設定
              （登入帳號、我的資料），不是這趟行程的設定，掛在行程頁是層級錯位。
              排在「新增行程」之後——設定的使用頻率比新增行程低。 */}
          <button
            onClick={() => navigate('/settings')}
            className="ic2 text-md active:scale-95 transition-transform duration-100"
            aria-label="設定"
          >
            <Icon name="settings" size={20} />
          </button>
        </span>
      </div>
      </div>

      {/* Trip list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="px-5 py-4 flex flex-col gap-3">

          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-w border-t-transparent rounded-chip animate-spin" />
            </div>
          )}

          {/* 🔴 實作-讀-1　**讀不到 ≠ 還沒有**。查詢有錯誤時走這一段，
              查詢成功但結果是空的才走下面原本的空狀態。 */}
          {!isLoading && isError && (
            <div className="py-10 px-6 text-center">
              <p className="text-strong font-semibold">{MSG_READ_FAIL_TRIPS_T}</p>
              <p className="text-sub text-gr mt-[5px]">{MSG_READ_FAIL_BODY}</p>
              <button
                onClick={() => refetch()}
                className="mt-[14px] inline-flex items-center gap-1 px-[18px] py-[11px] bg-w text-white rounded-base text-body font-semibold active:scale-95 transition-transform duration-100"
                style={{ minHeight: 44 }}
              >
                {MSG_READ_FAIL_RETRY}
              </button>
            </div>
          )}

          {!isLoading && !isError && trips.length === 0 && (
            <div className="py-10 px-6 text-center">
              <p className="text-strong font-semibold">還沒有行程。</p>
              <p className="text-sub text-gr mt-[5px]">第一趟要去哪？</p>
              <button
                onClick={openNew}
                className="mt-[14px] inline-flex items-center gap-1 px-[18px] py-[9px] bg-w text-white rounded-base text-body font-semibold active:scale-95 transition-transform duration-100"
              >
                <Icon name="add" size={16} /> 建立第一趟
              </button>
            </div>
          )}

          {trips.map((trip) => {
            const display    = deriveDisplayStatus(trip);
            const dest = destinationOf(trip.name, trip.id);

            return (
              <div
                key={trip.id}
                onClick={() => navigate(`/trips/${trip.id}`)}
                className="rounded-panel overflow-hidden shadow-card cursor-pointer active:scale-[0.985] transition-transform"
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
                  <div className="relative">
                    <span
                      className={`inline-flex items-center px-[10px] py-[3px] rounded-chip text-tag font-bold tracking-[0.04em] w-fit mb-[6px] ${STATUS_BADGE_CLASS[display]}`}
                    >
                      {STATUS_LABEL[display]}
                    </span>

                    <p className="font-sans text-title font-bold text-white tracking-tight leading-snug">
                      {trip.name}
                    </p>

                    {/* S-01-13　成員識別「僅首頁不顯示」，其他頁照常——
                        首頁卡片是「哪一趟」，不是「誰在裡面」。 */}
                    <div className="text-sub text-white/90 mt-[3px] tabular-nums">
                      {dateRange(trip.start_date, trip.end_date)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* G-02 Ghost card */}
        <div
          className="mx-5 mb-5 rounded-panel overflow-hidden cursor-pointer animate-ghost-pulse"
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
              className="text-strong"
              style={{ color: 'rgba(80,55,42,0.72)' }}
            >
              你的下一趟在哪？
            </p>
          </div>
        </div>

        {/* S-01-9／S-01-10　G-06 分享橫幅與「複製連結」鈕已移除：
            首頁沒有「哪一趟」的 context，複製不出有意義的連結。 */}
      </div>

      {/* Trip form sheet */}
      {formOpen && (
        <TripFormSheet
          tripId={editTripId}
          onClose={closeForm}
          onCreated={(id) => navigate(`/trips/${id}`)}
        />
      )}
    </div>
  );
}
