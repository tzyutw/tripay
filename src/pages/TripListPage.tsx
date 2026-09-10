import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MSG_READ_FAIL_TRIPS_T } from '@/lib/messages';
import ReadError from '@/components/shared/ReadError';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useToast } from '@/contexts/ToastContext';
import { isDeviceOffline, MSG_SAVE_OFFLINE } from '@/lib/messages';
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

  /* 使用者自己按「建立第一趟」或幽靈卡導到 /trips/new 時自動開表單。
     ⚠️ G-01（零行程時**自動**導向）已於 2026-09-10 拿掉，這裡只處理手動導向。 */
  useEffect(() => {
    if (location.pathname === '/trips/new') setFormOpen(true);
  }, [location.pathname]);

  const { data: trips = [], isLoading, isError, refetch } = useQuery<TripWithMembers[]>({
    queryKey: ['trips'],
    /* 🔴 修-7　`signal` 要一路交到 PostgREST：下拉重新整理逾時中止時，
       這條請求要真的斷掉，不能放著它背景跑完再默默更新畫面。 */
    queryFn: async ({ signal }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_members!trip_members_trip_id_fkey(*)')
        .abortSignal(signal)
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

  /* 🔴 實作-AF-7　下拉重新整理。離線時不要擋——Rozi 要求維持看得到上次的資料，
     只跳一次 toast 說明為什麼沒更新。 */
  const { toast: showToast } = useToast();
  const qc = useQueryClient();
  const ptr = usePullToRefresh(async signal => {
    if (isDeviceOffline()) { showToast(MSG_SAVE_OFFLINE); return; }
    /* 🔴 修-7　十秒逾時的 abort 由 hook 發動，這裡把它接到 react-query：
       `cancelQueries` 會中止 queryFn 拿到的那個 signal（＝上面的 `.abortSignal`），
       並且**保留原本的資料**（cancel 預設 revert 回上一個成功狀態）。 */
    signal.addEventListener(
      'abort', () => { void qc.cancelQueries({ queryKey: ['trips'] }); }, { once: true });
    await refetch();
  });

  /* G-09「建立行程時預填上一趟成員」**已於 2026-09-04 移除**（專案狀態.md:422 劃掉那一列），
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
      {/* 實作-V-5　頂部列固定在頂端（改之前是 static，往下捲就看不到上面那一排）。
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
          {/* 🔴 實作-AF-1　頂部列**原本那顆建立行程的按鈕整顆移除**（Rozi 2026-09-10）。
              她的原話大意：既然幽靈卡點得下去，右上就不需要再放一顆做同一件事的。
              入口改由幽靈卡承擔——**同一個動作只留一個入口**（全站 UX 檢查第 6 條）。
              ⚠️ 連**註解裡都不要再寫那顆按鈕的字面文案**——停止條件是用
                 `git grep` 出現次數判定的（這一輪已經是第四次踩到同一種）。 */}
          {/* S-01-15　設定入口（#28-6c）：從 S-03 行程頁移過來。那是 App 設定
              （登入帳號、我的資料），不是這趟行程的設定，掛在行程頁是層級錯位。 */}
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
      {/* 🔴 實作-AF-7　下拉重新整理。回饋沿用既有的 `.spin`，沒有引入新套件。
          ⚠️ 離線時**維持看得到上次存的資料**（Rozi 明確要求），
             只在最上面跳一次 toast。 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide" ref={ptr.ref}>
        {/* 🔴 修-6　高度與回彈的 transition 都由 hook 給（兩頁共用一份，不各寫一個）。
            回彈期間指示器要**留在畫面上**，不然沒有東西可以跑那段動畫。 */}
        {ptr.visible && (
          <div className="flex justify-center overflow-hidden" style={ptr.indicatorStyle}>
            <div className="spin" style={{ padding: 0, alignSelf: 'center' }}><i /></div>
          </div>
        )}
        <div className="px-5 py-4 flex flex-col gap-3">

          {/* 🔴 實作-AF-1　G-02 幽靈卡**搬到第一張**（Rozi 2026-09-10）。
              她的原話：「我們的排序方式是最新的行程在最上面，所以幽靈卡也應該放在最上面。」
              間距交給容器的 `gap-3`，不再自己帶 `mx-5 mb-5`。

              **改成看得出可以點**：
              - 拿掉那個 `filter: blur(…)` 與 `opacity: 0.72`
              - 拿掉那支呼吸動畫的 class（連 CSS 裡的 keyframes 一起刪除）
                ⚠️ 由來：inline 寫 `opacity:0.72`，但那支動畫在 0.28–0.5 之間跑，
                   **動畫的優先級高於 inline style**——所以 2026-08-30 把 0.5 調成 0.72
                   那次修改**從來沒有生效**，跑了十天沒有人發現。
                   宣告值與畫面實際渲染值不一致，是這一類 bug 最難抓的形狀。
              - 原本那句問句**整句移除**（Rozi：「我不要那一句，請拿掉」）

              ⚠️ **零行程時不出現**：一趟都沒有的人沒有「記新的一趟」，
                 那張卡在空狀態語意錯誤，而且跟中間那顆「建立第一趟」重複。 */}
          {!isLoading && !isError && trips.length > 0 && (
            <button
              onClick={openNew}
              className="rounded-panel overflow-hidden cursor-pointer w-full text-left"
            >
              <div
                className="h-24 flex items-center justify-center gap-[10px]"
                style={{ background: 'linear-gradient(135deg, #EDE4DA, #E3D6C9)' }}
              >
                {/* AF-1-4（Rozi 選 A 案）：28×28 實心圓＋白色加號。
                    ⚠️ 加號的視覺中心要落在圓的**正中央**——圓用 flex 置中，
                       svg 不得有 margin／vertical-align 位移（`display:block` 擋掉
                       inline 元素的基線間隙，那正是「看起來沒對正」的來源）。 */}
                <span
                  className="flex items-center justify-center flex-none"
                  style={{ width: 28, height: 28, borderRadius: 'var(--r-icon)',
                           background: 'var(--md)', color: '#fff' }}
                >
                  <Icon name="add" size={15} />
                </span>
                <span className="text-strong font-semibold" style={{ color: 'var(--md)' }}>
                  記新的一趟
                </span>
              </div>
            </button>
          )}

          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-w border-t-transparent rounded-chip animate-spin" />
            </div>
          )}

          {/* 🔴 實作-讀-1　**讀不到 ≠ 還沒有**。查詢有錯誤時走這一段，
              查詢成功但結果是空的才走下面原本的空狀態。 */}
          {!isLoading && isError && (
            <ReadError title={MSG_READ_FAIL_TRIPS_T} onRetry={() => refetch()} />
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
