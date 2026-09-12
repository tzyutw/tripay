import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import { getCurrencySymbol } from '@/lib/currencies';
import { destinationOf } from '@/lib/destinations';
import { dateRange, money } from '@/lib/format';
import { tripSummary, tripRate } from '@/lib/summary';
import { useToast } from '@/contexts/ToastContext';
import { MSG_SETTLED_STALE, MSG_ARCHIVED_TAP, MSG_DELETE_FAIL,
         MSG_READ_FAIL_EXP_T, guardedWrite,
         isDeviceOffline, MSG_SAVE_OFFLINE } from '@/lib/messages';
import ReadError from '@/components/shared/ReadError';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import type { TripWithMembers, ExpenseWithSplits } from '@/types/database';
import ExpenseFormSheet from '@/components/ExpenseFormSheet';
import TripFormSheet from '@/components/TripFormSheet';
import SettlementPage from '@/pages/SettlementPage';
import { Icon } from '@/components/Icon';
import Seg from '@/components/shared/Seg';
import MoreSheet from '@/components/shared/MoreSheet';
import NotFound from '@/components/shared/NotFound';
import ExpenseGroups from '@/components/shared/ExpenseGroups';
import MemberLedger from '@/components/shared/MemberLedger';
import { StatCardTotal, StatCardPerList, StatCardFoot } from '@/components/shared/StatCard';

// ── Helpers ────────────────────────────────────────────────────────────────────

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

  // BASE_URL 在 production 是 '/tripay/'、dev 是 '/'（結尾一定有斜線）。
  // 原本漏掉它，複製出去的連結變成 tzyutw.github.io/share/… 少了 /tripay，開起來是空白頁。
  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}share/${trip.share_token}`;
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

  /* S-03b-2／3／4　逐字對齊 Tripay_原型.html:2866–2868。
     #25-5 兩句灰字砍掉——它們在**講好處**，不是「使用者不做就不會知道的限制」
     也不是隱私告知，不符合「灰字只留兩種」。留下的那一句講的是
     「對方不用登入」，那是使用者不點下去就不會知道的事。 */
  const opts = [
    { title: '複製文字摘要', sub: '',                        action: copySummary },
    { title: '複製分享連結', sub: '不用登入就看得到消費明細', action: copyLink },
    { title: '預覽分享頁面', sub: '',                        action: () => { window.open(shareUrl, '_blank'); onClose(); } },
  ];

  /* Sheet 一律 portal 到 body：頁面根層的 animate-slide-in 帶 transform，
     會讓 position:fixed 的定位基準變成那個元素而不是視窗，整個彈層跑掉。 */
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" style={{ backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-panel shadow-sheet animate-sheet-up p-5 pb-10">
        <div className="w-9 h-1 bg-[#D0CBC5] rounded-chip mx-auto mb-5" />
        {opts.map(opt => (
          <button
            key={opt.title}
            onClick={opt.action}
            className="w-full flex items-center gap-3 py-4 border-b border-[#EFEBE6] last:border-0 active:bg-black/5 transition-colors text-left"
          >
            <div className="flex-1">
              <p className="text-body font-semibold text-ink">{opt.title}</p>
              {opt.sub && <p className="text-tag text-gr mt-[2px]">{opt.sub}</p>}
            </div>
          </button>
        ))}
        <button onClick={onClose} className="w-full h-[50px] mt-4 rounded-base border-[1.5px] border-[#E4DFD9] text-md font-bold text-body">取消</button>
      </div>
    </div>,
    document.body,
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExpenseListPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const navigate       = useNavigate();
  const location       = useLocation();
  const qc             = useQueryClient();

  /* 「記一筆」（新增）留在 state；**編輯既有消費與「還沒算清楚」改走 query**——
     S-05 的結算前檢查層要能直接帶進來（實作-Q-3）。
     用 query 不用 state 的理由與實作-O-8 相同：跨 route 的 state 會被丟掉。 */
  const [sp, setSp] = useSearchParams();
  const [newOpen,         setNewOpen]         = useState(false);
  /* 量測靶要能直接進「整頁只有外幣」的視角（實作-S-7 的反向斷言要用）。
     production bundle 讀不到這個參數也不會怎樣——預設仍是 TWD。 */
  const [currencyMode,    setCurrencyMode]    = useState<'TWD' | 'FOR'>(
    () => (new URLSearchParams(window.location.search).get('view') === 'foreign' ? 'FOR' : 'TWD'));
  const [deleteConfirm,   setDeleteConfirm]   = useState('');
  /* S-03-33 分段控制：切換檢視不是動作。「結算」分頁的內容就是 S-05 整頁 */
  const [tab,             setTab]             = useState<'exp' | 'settle'>('exp');
  const [statOpen,        setStatOpen]        = useState(false);   // #17-2 每人分擔預設收合
  /* S-03d 未定案清單：null＝不在該畫面；'all'＝全部；否則是成員 id */
  const qExpense     = sp.get('expense');
  const unsettledView = sp.get('unsettled');
  /* 🔴 實作-U-2　點成員金額列 → **這個人的帳**（三段），不是「還沒算清楚」的篩選。
     兩個版本從此不同頁，不再共用同一段渲染。 */
  const memberView = sp.get('member');
  /* 🔴 實作-X-1　「只看共同的帳」。自己買給自己的那幾筆對結算完全沒有影響
     （Rozi 的濟州島 132 筆裡有 41 筆是），清單上三成的列跟「誰要給誰多少」無關。
     ⚠️ 預設是**關**（看全部）；按過之後記住**這一趟**的選擇，不同行程各自記。
        存 localStorage 就夠了——不為了這個加資料庫欄位。
     量測靶用 `?onlyshared=1` 直接以開啟狀態載入（與 `?view=foreign` 同一個做法）：
     靠腳本去點按鈕再等 render，量到的會是動畫中途的狀態。 */
  /* 🔴 實作-Z-2　收合狀態由門檻切換決定，不用捲動驅動動畫（見下面 hero 的註解）。
     ⚠️ **用 callback ref 不用 `useRef` ＋ `useEffect([])`**：這一頁在資料回來之前
     會先 `return <spin>`，那時哨兵還沒進 DOM，`ref.current` 是 null，
     而空依賴的 effect 之後**不會再跑一次**——觀察器就永遠沒掛上。
     callback ref 是在節點真的接上時才被呼叫的，沒有這個時序問題。 */
  const [compact, setCompact] = useState(false);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    ioRef.current?.disconnect();
    ioRef.current = null;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    ioRef.current = io;
  }, []);
  useEffect(() => () => ioRef.current?.disconnect(), []);

  const swKey = `tripay.onlyshared.${tripId}`;
  const [onlyShared, setOnlyShared] = useState<boolean>(() => {
    if (new URLSearchParams(window.location.search).get('onlyshared') === '1') return true;
    try { return localStorage.getItem(swKey) === '1'; } catch { return false; }
  });
  const toggleOnlyShared = () => setOnlyShared(v => {
    try { localStorage.setItem(swKey, v ? '0' : '1'); } catch { /* 隱私模式寫不進去就算了 */ }
    return !v;
  });
  /* 摘要行點進去的那一頁：被收起來的那幾筆 */
  const selfView = sp.get('self') === '1';
  const formOpen      = newOpen || Boolean(qExpense);
  const editExpenseId = qExpense ?? undefined;
  const setUnsettledView = (v: string | null) => setSp(v ? { unsettled: v } : {}, { replace: true });
  const openMember = (id: string) => setSp({ member: id }, { replace: true });
  const { toast: showToast } = useToast();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: trip, isLoading: tripLoading,
          isError: tripError, refetch: refetchTrip } = useQuery<TripWithMembers | null>({
    queryKey: ['trip', tripId],
    /* 🔴 修-7　`signal` 交給 PostgREST，下拉逾時中止時請求要真的斷掉 */
    queryFn: async ({ signal }) => {
      if (!tripId) return null;
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_members!trip_members_trip_id_fkey(*)')
        .abortSignal(signal)
        .eq('id', tripId)
        /* `.single()` 查不到列時回 **406 並拋錯**，畫面就只能一直轉 spinner。
           `.maybeSingle()` 回 `data: null`，才有東西可以判斷「查不到」。 */
        .maybeSingle();
      if (error) throw error;
      return (data as TripWithMembers) ?? null;
    },
    enabled: Boolean(tripId),
  });

  const { data: expenses = [], isLoading: expLoading,
          isError: expError, refetch: refetchExpenses } = useQuery<ExpenseWithSplits[]>({
    queryKey: ['expenses', tripId],
    queryFn: async ({ signal }) => {
      if (!tripId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .abortSignal(signal)
        .eq('trip_id', tripId)
        .is('deleted_at', null)
        .order('expense_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExpenseWithSplits[];
    },
    enabled: Boolean(tripId),
  });

  // Archive (direct DB write — owner can update their own trip)
  // 刪除行程（Phase 1.5）。硬刪：trips 沒有 deleted_at 欄位，加欄屬 schema 變更；
  // 而「留著但不想看到」的需求已由封存負責，軟刪會與封存語意重疊。
  // migration 005 之後子表靠 FK CASCADE 連帶清除，不留孤兒。
  const deleteTripMutation = useMutation({
    mutationFn: guardedWrite(async () => {
      // 先刪 settlements：settlement_items 對 trip_members 的 FK 雖已改 CASCADE，
      // 顯式先刪可讓「影響列數」可被斷言，避免又一次靜默失敗。
      const { data: sDel, error: sErr } = await supabase
        .from('settlements').delete().eq('trip_id', tripId!).select();
      if (sErr) throw sErr;
      /* 帳務鐵律：每個 DELETE 都要斷言實際影響列數。RLS 會把不符政策的 DELETE
         靜默過濾成「影響 0 列」而仍回 200——這一類根因已咬過三次。
         這裡本來就可能是 0 列（還沒結算過），所以只要求「查得到結果」，不要求 >0。 */
      if (sDel == null) throw new Error('刪除結算沒有回傳影響列數，無法確認是否生效');
      const { data, error } = await supabase.from('trips').delete().eq('id', tripId!).select();
      if (error) throw error;
      if (!data || data.length !== 1) throw new Error('刪除沒有生效（影響 0 列），請重試或回報');
      return data;
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] });
      showToast('行程已刪除');
      navigate('/', { replace: true });
    },
    /* 實作-文-1　後端原文留給 console，畫面只講下一步 */
    onError: (e: Error) => { console.error(e); showToast(MSG_DELETE_FAIL); },
  });

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

  /* 🔴 實作-AF-7　下拉重新整理。離線時維持看得到上次的資料，只跳一次 toast。 */
  const ptr = usePullToRefresh(async signal => {
    if (isDeviceOffline()) { showToast(MSG_SAVE_OFFLINE); return; }
    /* 🔴 修-7　逾時的 abort 接到 react-query，兩條查詢都要真的中止 */
    signal.addEventListener('abort', () => {
      void qc.cancelQueries({ queryKey: ['trip', tripId] });
      void qc.cancelQueries({ queryKey: ['expenses', tripId] });
    }, { once: true });
    await Promise.all([refetchTrip(), refetchExpenses()]);
  });

  // ── 行程層彙總（規格 §5.1 §5.2）──────────────────────────────────────────────
  const display = trip ? deriveDisplayStatus(trip) : 'active';
  const S = useMemo(
    () => trip ? tripSummary(trip, expenses, display, { onlyShared }) : null,
    [trip, expenses, display, onlyShared],
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (tripLoading) {
    return (
      <div className="spin">
        <i />
        <div className="text-sub text-gr mt-2">載入中</div>
      </div>
    );
  }
  /* 🔴 實作-AF-3　**連不上 ≠ 被刪掉**。Rozi 開飛航模式點進一趟行程，
     畫面說「找不到這趟行程／可能已經被刪掉了」——她的行程好好的。
     根因：`!trip` 同時涵蓋「查不到」與「查詢失敗」兩種完全不同的情況。
     ⚠️ **順序不可對調**：先判連不上，再判真的查不到。
     ⚠️ `NotFound` 的文案一個字都不要改——要修的是「什麼情況下才顯示它」。 */
  if (tripError) return (
    <div className="min-h-screen bg-bg flex flex-col">
      <ReadError title={MSG_READ_FAIL_EXP_T} onRetry={() => refetchTrip()} />
    </div>
  );

  /* 查不到（連結失效／已被刪／書籤過期／PWA 記住上次的頁面）。
     這一條**必須排在「載入中」之後**——不然載入期間會先閃一下「找不到」。 */
  if (!trip || !S) return <NotFound onBack={() => navigate('/')} />;

  const isArchived = display === 'archived';
  const isSettled  = display === 'settled';
  const symbol     = getCurrencySymbol(trip.currency);
  const rateNow    = tripRate(trip);
  /* 沒有匯率就沒有外幣可切——切了也算不出來，所以強制留在台幣 */
  const curMode    = rateNow ? currencyMode : 'TWD';
  const moneyOpts  = curMode === 'TWD' ? undefined : { sym: symbol, rate: rateNow };
  const nUn        = S.unsettledList.length;

  /* #30-6 只數「因為沒設匯率而算不出台幣」的那幾筆——有外幣金額、缺台幣金額。
     完全沒填金額的不算在這裡：補上匯率也救不回來，而且 S-03-29 已經在講它們了。
     這樣「補上匯率 → 這條消失」才成立。 */
  const nGap = expenses.filter(
    e => S.calcOf({ id: e.id } as never).twdPending && Number.isFinite(e.foreign_amount as number),
  ).length;

  // /trips/:id/edit → 開啟行程編輯
  const tripFormOpen = location.pathname.endsWith('/edit');
  /* 🔴「分享」「複製成新的一趟」「刪除行程」按了完全沒反應的根因：
     它們原本是 `back(); setXxxOpen(true)`，而 `/trips/:id` 與 `/trips/:id/more`
     是兩個各自帶 element 的 sibling `<Route>`——React Router 會**卸載一個、
     掛載另一個新的實例**，即使是同一個元件型別。state 設在正要被卸載的實例上，
     新實例起來時全部回到 false。
     一律改走 route：裝置的返回鍵也才會如預期。 */
  const shareSheetOpen = location.pathname.endsWith('/share');
  const copyOpen       = location.pathname.endsWith('/copy');
  const deleteOpen     = location.pathname.endsWith('/delete');
  const backToTrip = () => navigate(`/trips/${tripId}`, { replace: true });
  /* S-03-31「⋯」是**獨立頁面**（Rozi 2026-09-06），不是彈層——所以看 route 不看 state。
     按裝置返回鍵也就自然回到 S-03。 */
  const menuOpen = location.pathname.endsWith('/more');
  const setMenuOpen = (v: boolean) =>
    v ? navigate(`/trips/${tripId}/more`) : navigate(`/trips/${tripId}`, { replace: true });
  function openTripEdit() { navigate(`/trips/${tripId}/edit`); }
  function closeTripEdit() { navigate(`/trips/${tripId}`, { replace: true }); }

  function openNew() { setNewOpen(true); }
  /* 🔴 實作-R-4　**已結算的消費列點得進編輯，這是規格不是 bug。**
     `畫面地圖.md:118` 的行程狀態表白紙黑字寫「已結算 → 列表唯讀
     （**點擊仍可編輯，重新計算**）」，封存那一列才沒有那個括號；
     `規格_金額未定案與幣別.md` §5.6 對已結算／已封存只規定「不顯示約、
     不顯示未定案入口、不做結算前檢查」，**一個字都沒提唯讀**。
     這裡原本的註解寫「既有 bug：已結算仍點得進編輯」——那不是 bug，
     是實作把正確行為當成 bug 修掉了。封存維持唯讀（決策 B）。 */
  function openEdit(eid: string) {
    if (isArchived) return;
    setSp({ expense: eid }, { replace: true });
  }

  /* ── S-03-31／32　「⋯」是**獨立頁面**（Rozi 2026-09-06）──────────────────
     原本是底部彈層，改成整頁之後左上有返回鍵、底部不再有「取消」。
     用 route 而不是 state，所以裝置的返回鍵也會回到 S-03。 */
  if (menuOpen) {
    const back = backToTrip;
    return (
      <MoreSheet
        status={display as 'planned' | 'active' | 'settled' | 'archived'}
        onEdit={openTripEdit}
        onShare={() => navigate(`/trips/${tripId}/share`)}
        onCopy={() => navigate(`/trips/${tripId}/copy`)}
        /* 封存走的是 mutation 不是彈層，本來就會動——不要跟著改成 route */
        onArchive={() => { back(); archiveMutation.mutate(); }}
        onDelete={() => { setDeleteConfirm(''); navigate(`/trips/${tripId}/delete`); }}
        onClose={back}
      />
    );
  }

  /* 🔴 實作-X-1　摘要行。**S-03 與「{名字} 的帳」共用同一個**——
     同一句文案不准寫兩次（CLAUDE.md：兩處分開寫遲早會走鐘）。
     金額＝被收起來、而且**算得出台幣**的那幾筆的合計；算不出來的只報筆數，
     不把它們的金額混進上面那個數字，否則「總花費(關) − 共同的帳(開) ＝ 這一行」
     這條恆等式就不成立。 */
  const selfBucket = S.self ?? { list: [], total: 0, pending: 0, forRaw: 0, forBackTwd: 0, hasRaw: false };
  const selfMoneyOpts = moneyOpts?.sym && moneyOpts.rate && selfBucket.hasRaw
    ? { ...moneyOpts, raw: selfBucket.forRaw + Math.round(selfBucket.forBackTwd * moneyOpts.rate) }
    : moneyOpts;
  const SelfSummaryRow = () => (
    <button className="selfsum" onClick={() => setSp({ self: '1' }, { replace: true })}>
      <span>
        另有 {selfBucket.list.length} 筆自己買的 ·{' '}
        <span className="money">{money(selfBucket.total, selfMoneyOpts)}</span>
        {selfBucket.pending > 0 &&
          <span className="pend">（另有 {selfBucket.pending} 筆還沒算清楚）</span>}
      </span>
      <Icon name="next" size={16} />
    </button>
  );

  /* ── 🔴 實作-X-1　摘要行點進去：被收起來的那幾筆 ─────────────────────── */
  if (selfView) {
    const rows = selfBucket.list;
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <div className="bar">
          <button className="ic2" aria-label="返回" onClick={() => setSp({}, { replace: true })}>
            <Icon name="back" size={20} />
          </button>
          <span className="ttl">自己買的</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sec">自己買的 · {rows.length} 筆</div>
        {rows.length
          ? <ExpenseGroups S={{ ...S, list: rows }} readonly={isArchived} money={moneyOpts}
              onEdit={openEdit}
              /* 🔴 實作-AE-1　封存態的消費列**不可點**（`畫面地圖.md:119`「列表唯讀」）。
                 原本傳 `onReadonlyTap` 是為了「點了有話講」，但那會把列渲染成
                 `<button>`——`畫面地圖.md:118` 的**已結算**才是「點擊仍可編輯」，
                 封存不是。兩者不同，不要順手把已結算也鎖掉。 */
              onReadonlyTap={undefined} />
          : <div className="empty"><p>沒有自己買給自己的消費。</p></div>}
        <div style={{ height: 18 }} />
      </div>
    );
  }

  /* ── 🔴 實作-U-2　`{名字} 的帳`：這個人的消費明細，分三段 ────────────────
     Rozi 2026-09-07 在真機上點 `Ning $74,565` 進去看到「影響 Ning 的 · 0 筆」，
     那是「還沒算清楚」的篩選檢視——她要的是這個人的帳怎麼算出來的。 */
  if (memberView) {
    const m = S.t.members.find(x => x.id === memberView);
    if (!m) return <NotFound onBack={() => navigate('/')} />;
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <div className="bar">
          <button className="ic2" aria-label="返回" onClick={() => setSp({}, { replace: true })}>
            <Icon name="back" size={20} />
          </button>
          <span className="ttl">{m.name} 的帳</span>
          <span style={{ width: 40 }} />
        </div>
        {/* 實作-W-3　三段結構搬進共用元件（分享頁要用同一份）。
            ⚠️ 自己這一頁的「你付的」文案這一輪**維持原樣**（Rozi 還沒拍板
            ——她的行程 `owner_member_id` 是 null，系統分不出哪一位是她本人）。 */}
        <MemberLedger S={S} memberId={memberView}
          onRowTap={id => (isArchived ? showToast(MSG_ARCHIVED_TAP) : openEdit(id))}
          footer={/* 實作-X-2　開關開著的時候這一頁也少了幾筆，
                     不說一聲的話三段加總跟剛剛點的那個數字就對不起來 */
            onlyShared && selfBucket.list.length > 0 ? <SelfSummaryRow /> : null} />
        <div style={{ height: 18 }} />
      </div>
    );
  }

  /* ── S-03d 未定案清單（只剩「還沒算清楚」這一個入口）────────────────── */
  if (unsettledView) {
    const rows = S.unsettledList;
    const title = `還沒算清楚 · ${rows.length} 筆`;

    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <div className="bar">
          <button className="ic2" aria-label="返回" onClick={() => setUnsettledView(null)}>
            <Icon name="back" size={20} />
          </button>
          <span className="ttl">{title.split(' · ')[0]}</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sec">{title}</div>
        {rows.length
          ? /* 🔴 實作-T-1　這一頁的列**原本是 `readonly` 的 `<div>`，點下去完全沒反應**。
               Rozi：「『還沒算清楚』，這個消費紀錄點不進去，應該要可以點進去。」
               這一頁本來就是要她去補資料的，不給點等於這一頁沒有用。
               封存態仍維持唯讀（與 S-03 一致）。 */
            <ExpenseGroups
              S={{ ...S, list: rows.map(r => r.e) }}
              readonly={isArchived} money={moneyOpts}
              onEdit={openEdit}
              /* 🔴 實作-AE-1　封存態的消費列**不可點**（`畫面地圖.md:119`「列表唯讀」）。
                 原本傳 `onReadonlyTap` 是為了「點了有話講」，但那會把列渲染成
                 `<button>`——`畫面地圖.md:118` 的**已結算**才是「點擊仍可編輯」，
                 封存不是。兩者不同，不要順手把已結算也鎖掉。 */
              onReadonlyTap={undefined} />
          : <div className="empty"><p>都算清楚了。</p><p>沒有需要補的筆數</p></div>}
        <div style={{ height: 18 }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col" style={{ position: 'relative' }} ref={ptr.ref}>
      {/* 🔴 實作-AF-7　下拉重新整理（消費分頁）。回饋沿用既有的 `.spin`。 */}
      {ptr.visible && (
        <div className="flex justify-center overflow-hidden" style={ptr.indicatorStyle}>
          <div className="spin" style={{ padding: 0, alignSelf: 'center' }}><i /></div>
        </div>
      )}

      {/* 🔴 實作-Z-2　收合的哨兵。放在**捲得走**的地方（sticky 的 wrapper 裡面的
          東西會跟著黏住，永遠不會離開視窗）。越過 110px 就切 `.is-compact`。
          用 IntersectionObserver 不用捲動事件／捲動驅動動畫：後者的進度綁在
          捲動範圍上，iOS Safari 的網址列一伸縮，範圍就變、進度就跳——
          Rozi 看到的抖動與「名字停在淡出到一半」都是這麼來的。 */}
      <div ref={sentinelRef} aria-hidden
        style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 110, pointerEvents: 'none' }} />

      {/* S-03-1　hero：目的地色調。副標只有日期區間，沒有成員 emoji */}
      {/* 🔴 實作-Z-2　外面包一層 `.herowrap` 承擔安全區的留白與塗色，
          `.hero` 本身高度固定——`env(safe-area-inset-top)` 在 iOS 上會變，
          放進 sticky 元素自己的 padding 就會讓那一條的高度跟著跳。
          漸層畫在 wrapper 上，一路蓋滿安全區，所以沒有接縫。
          🔴 實作-Z-1　收合時 `backgroundImage` 要**真的拿掉**：Y-2 只設了
          `background-color`，而漸層是 `background-image`、蓋在它上面，
          畫出來還是綠漸層。
          ⚠️ 這裡與 CSS 的 `.herowrap.is-compact{background-image:none !important}`
          **兩道都在**，而且**各自都夠**（`!important` 蓋得過 inline style，
          實測拿掉任一道都還是純藍，兩道都拿掉才會變回漸層）。
          留兩道是因為 inline style 這一端最容易在改版時被順手加回來。 */}
      <div className={`herowrap${compact ? ' is-compact' : ''}`}
        style={compact ? undefined : { backgroundImage: destinationOf(trip.name, trip.id).gradient }}>
        <div className="hero">
          <div className="sc" />
          <div className="navrow">
            {/* #28-6b hero 右上只留「返回」與「⋯」。編輯／複製／分享／封存／刪除全部進 ⋯ 選單 */}
            <button className="ic2" aria-label="返回" onClick={() => navigate('/')}>
              <Icon name="back" size={20} />
            </button>
            {/* 收合之後大標會縮掉，行程名改在這一列顯示——不然只剩兩顆鍵，不知道在哪一趟。
                ⚠️ Z-2：收合時它就是要在，**不透明、不做淡入淡出** */}
            <span className="navttl">{trip.name}</span>
            <button className="ic2" aria-label="更多" onClick={() => setMenuOpen(true)}>
              <Icon name="more" size={20} />
            </button>
          </div>
          <div className="tt">{trip.name}</div>
          <div className="dt tnum">{dateRange(trip.start_date, trip.end_date)}</div>
        </div>
      </div>

      {/* S-03-33　分段控制 */}
      <div className="fld" style={{ paddingTop: 12 }}>
        <Seg
          options={[{ value: 'exp', label: '消費' }, { value: 'settle', label: '結算' }]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'settle' ? (
        /* 「結算」分頁的內容就是 S-05 整頁，**一個字都沒動**。
           S-05 自己帶著導覽列（‹ 結算），放進分頁裡會變成兩顆返回鍵疊在一起——
           用 CSS 收起來（.settlepane > .bar），不動 S-05 的輸出。 */
        <div className="settlepane"><SettlementPage /></div>
      ) : (
        <>
          {/* S-03-9／27／28　統計卡：與 S-06 共用同一份 */}
          <div className="statcard">
            <StatCardTotal S={S} open={statOpen} money={moneyOpts}
              onToggleTotal={() => setStatOpen(o => !o)} />
            {statOpen && <StatCardPerList S={S} money={moneyOpts}
              onPickMember={openMember} />}
            {statOpen && <StatCardFoot S={S} />}
          </div>

          {/* S-03-12　整頁金額可切外幣。結算恆為台幣，不受影響（既有決策） */}
          <div className="curswitch">
            <Seg
              options={[
                { value: 'TWD', label: '$ 台幣' },
                { value: 'FOR', label: `${symbol} ${trip.currency}`, disabled: !rateNow },
              ]}
              value={curMode}
              onChange={setCurrencyMode}
            />
            {nGap > 0 && (
              <p className="hint">
                總花費還少了 {nGap} 筆，它們只填了外幣。
                {!rateNow && (
                  <button className="ratelink" onClick={openTripEdit}>
                    設現金匯率 <Icon name="next" size={13} />
                  </button>
                )}
              </p>
            )}
          </div>

          {/* 🔴 實作-Z-3　「只看共同的帳」搬進清單標頭那一行的右邊
              （Rozi：「按鈕有點太大了，長得太明顯」）。字級與左邊的標頭同一級、
              不粗體、不填色；開著時只有文字變成工作色。
              可點區靠 `::after` 撐到 44，不是把字或按鈕撐大。 */}
          <div className="listhd">
            <span>消費紀錄 · {S.list.length} 筆</span>
            <button className={`swchip${onlyShared ? ' on' : ''}`}
              aria-pressed={onlyShared} onClick={toggleOnlyShared}>
              只看共同的帳
            </button>
          </div>

          {/* S-03-29　未定案入口。N＝0 整條不顯示 */}
          {nUn > 0 && !S.readonly && (
            <button className="unsettled" onClick={() => setUnsettledView('all')}>
              <span><Icon name="warn" size={16} /> 有 {nUn} 筆還沒算清楚</span>
              <Icon name="next" size={16} />
            </button>
          )}

          {expLoading && <div className="spin"><i /></div>}

          {/* 🔴 實作-讀-1　**讀不到 ≠ 還沒記帳**。查詢有錯誤時走這一段——
              舊畫面會說「第一筆從哪裡開始？」，那是在告訴使用者他的帳不見了。 */}
          {!expLoading && expError && (
            <ReadError title={MSG_READ_FAIL_EXP_T} onRetry={() => refetchExpenses()} />
          )}

          {!expLoading && !expError && !S.list.length ? (
            /* 實作-X-1　開關把清單篩空時要說一句為什麼，不得是一片空白——
               不然看起來像資料不見了。 */
            onlyShared && selfBucket.list.length > 0 ? (
              <div className="empty">
                <p style={{ marginTop: 10 }}>這趟還沒有共同的帳。</p>
                <p>記的每一筆都是自己買給自己的</p>
              </div>
            ) : (
              <div className="empty">
                <p style={{ marginTop: 10 }}>第一筆從哪裡開始？</p>
                <p>早餐、計程車、門票，都可以記</p>
              </div>
            )
          ) : (
            /* ⚠️ `S.readonly`（summary.ts）同時在管 §5.6 的「不顯示約／不顯示未定案入口」，
               那對已結算是**成立的**，一個字都不要動。
               這裡只換「消費列能不能點」這一件事的依據。 */
            <ExpenseGroups S={S} readonly={isArchived} money={moneyOpts}
              onEdit={openEdit}
              /* 🔴 實作-AE-1　封存態的消費列**不可點**（`畫面地圖.md:119`「列表唯讀」）。
                 原本傳 `onReadonlyTap` 是為了「點了有話講」，但那會把列渲染成
                 `<button>`——`畫面地圖.md:118` 的**已結算**才是「點擊仍可編輯」，
                 封存不是。兩者不同，不要順手把已結算也鎖掉。 */
              onReadonlyTap={undefined} />
          )}

          {/* 實作-X-1　被收起來的那幾筆的去處。錢不會憑空消失：
              總花費(關) − 共同的帳(開) 就等於這一行的金額。 */}
          {onlyShared && selfBucket.list.length > 0 && <SelfSummaryRow />}

          {/* 🔴 實作-S-6　主鈕**貼在畫面下緣**（`.btnrow.sticky`）。
              Rozi：「消費紀錄變多之後就會被排擠到後面」——量到的是
              y=1457／視窗只有 844，要捲到底才看得到。
              清單底部要留白，否則最後一筆會被蓋住；留白跟著 `.btnrow` 存不存在走
              （已結算態沒有主鈕，那時不需要留白）。
              #28-6b 底部只留一顆主鈕，且依狀態變。 */}
          {(isArchived || !isSettled) && <div className="btnpad" />}
          {isArchived && (
            <div className="btnrow sticky">
              <button className="btn gh" disabled={unarchiveMutation.isPending}
                onClick={() => unarchiveMutation.mutate()}>
                {unarchiveMutation.isPending ? '處理中…' : '重新開啟行程'}
              </button>
            </div>
          )}
          {!isArchived && !isSettled && (
            <div className="btnrow sticky">
              <button className="btn" onClick={openNew}>
                <Icon name="add" size={16} /> 記一筆
              </button>
            </div>
          )}
        </>
      )}

      {/* S-03-25　刪除確認：打「刪除」二字才 enable。
          全站只有這裡用 --dg 實心——刪除是不可逆的，語彙不與其他動作共用。 */}
      {deleteOpen && (
        <>
          <div className="scrim" onClick={backToTrip} />
          <div className="dlgwrap">
            <div className="dlg">
              <p className="dlgt">刪除「{trip.name}」？</p>
              {/* S-03c-2／3／4　逐字對齊 Tripay_原型.html:2875–2878 */}
              <p className="dlgs">刪掉就<b>救不回來</b>：</p>
              <ul className="dlglist">
                <li>{expenses.length} 筆消費與分帳紀錄</li>
                <li>{trip.trip_members.length} 位成員</li>
                <li>結算結果與分享連結</li>
              </ul>
              <p className="dlgs">請輸入「刪除」兩個字</p>
              <input
                type="text" className="dlginput" value={deleteConfirm}
                placeholder="刪除" autoComplete="off"
                onChange={e => setDeleteConfirm(e.target.value)}
              />
              <div className="dlgrow">
                <button className="btn qt" onClick={backToTrip}>算了，留著</button>
                <button
                  className="btn dg"
                  disabled={deleteConfirm.trim() !== '刪除' || deleteTripMutation.isPending}
                  onClick={() => deleteTripMutation.mutate()}
                >
                  {deleteTripMutation.isPending ? '刪除中…' : '刪除'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Expense form sheet */}
      {tripFormOpen && !isArchived && (
        <TripFormSheet
          tripId={tripId}
          onClose={closeTripEdit}
          onCreated={() => closeTripEdit()}
        />
      )}

      {/* 複製行程：以這趟為範本開新行程（成員／幣別／封面帶過去，消費不帶） */}
      {copyOpen && (
        <TripFormSheet
          prefill={{ tripId: tripId!, mode: 'full' }}
          onClose={backToTrip}
          onCreated={(id) => navigate(`/trips/${id}`)}
        />
      )}

      {formOpen && trip && (
        <ExpenseFormSheet
          tripId={tripId!}
          trip={trip}
          expenseId={editExpenseId}
          onClose={(saved?: boolean) => {
            setNewOpen(false);
            if (qExpense) setSp({}, { replace: true });
            /* 已結算的行程改了帳，結算數字就過期了——講出來，但**不自動重算**：
               自動作廢會抹掉已經「標記付清」的紀錄，而且不可逆。 */
            if (saved && isSettled) showToast(MSG_SETTLED_STALE);
          }}
        />
      )}

      {/* Share action sheet */}
      {shareSheetOpen && trip && (
        <ShareSheet
          trip={trip}
          members={trip.trip_members.sort((a, b) => a.sort_order - b.sort_order)}
          onClose={backToTrip}
          onToast={showToast}
        />
      )}

    </div>
  );
}
