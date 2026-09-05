import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { deriveDisplayStatus } from '@/lib/deriveStatus';
import { getCurrencySymbol } from '@/lib/currencies';
import { destinationOf } from '@/lib/destinations';
import { dateRange } from '@/lib/format';
import { tripSummary, tripRate } from '@/lib/summary';
import { useToast } from '@/contexts/ToastContext';
import type { TripWithMembers, ExpenseWithSplits } from '@/types/database';
import ExpenseFormSheet from '@/components/ExpenseFormSheet';
import TripFormSheet from '@/components/TripFormSheet';
import SettlementPage from '@/pages/SettlementPage';
import { Icon } from '@/components/Icon';
import Seg from '@/components/shared/Seg';
import MoreSheet from '@/components/shared/MoreSheet';
import ExpenseGroups from '@/components/shared/ExpenseGroups';
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

  const [formOpen,        setFormOpen]        = useState(false);
  const [editExpenseId,   setEditExpenseId]   = useState<string | undefined>();
  const [currencyMode,    setCurrencyMode]    = useState<'TWD' | 'FOR'>('TWD');
  const [shareSheetOpen,  setShareSheetOpen]  = useState(false);
  const [copyOpen,        setCopyOpen]        = useState(false);
  const [deleteOpen,      setDeleteOpen]      = useState(false);
  const [deleteConfirm,   setDeleteConfirm]   = useState('');
  /* S-03-33 分段控制：切換檢視不是動作。「結算」分頁的內容就是 S-05 整頁 */
  const [tab,             setTab]             = useState<'exp' | 'settle'>('exp');
  const [statOpen,        setStatOpen]        = useState(false);   // #17-2 每人分擔預設收合
  const [menuOpen,        setMenuOpen]        = useState(false);   // S-03-31 ⋯ 選單
  /* S-03d 未定案清單：null＝不在該畫面；'all'＝全部；否則是成員 id */
  const [unsettledView,   setUnsettledView]   = useState<string | null>(null);
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
  // 刪除行程（Phase 1.5）。硬刪：trips 沒有 deleted_at 欄位，加欄屬 schema 變更；
  // 而「留著但不想看到」的需求已由封存負責，軟刪會與封存語意重疊。
  // migration 005 之後子表靠 FK CASCADE 連帶清除，不留孤兒。
  const deleteTripMutation = useMutation({
    mutationFn: async () => {
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] });
      showToast('行程已刪除');
      navigate('/', { replace: true });
    },
    onError: (e: Error) => showToast(e.message || '刪不掉，請再試一次'),
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

  // ── 行程層彙總（規格 §5.1 §5.2）──────────────────────────────────────────────
  const display = trip ? deriveDisplayStatus(trip) : 'active';
  const S = useMemo(
    () => trip ? tripSummary(trip, expenses, display) : null,
    [trip, expenses, display],
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (tripLoading || !trip || !S) {
    return (
      <div className="spin">
        <i />
        <div className="text-sub text-gr mt-2">載入中</div>
      </div>
    );
  }

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
  function openTripEdit() { navigate(`/trips/${tripId}/edit`); }
  function closeTripEdit() { navigate(`/trips/${tripId}`, { replace: true }); }

  function openNew() { setEditExpenseId(undefined); setFormOpen(true); }
  /* 既有 bug：封存／已結算的行程原本仍點得進編輯。封存＝預設只讀，是既有決策。 */
  function openEdit(eid: string) {
    if (isArchived || isSettled) return;
    setEditExpenseId(eid); setFormOpen(true);
  }

  /* ── S-03d 未定案清單 ──────────────────────────────────────────────────────
     兩種進入方式（點統計卡的人／點列表上方入口）走同一個畫面，
     只有標題與範圍不同。規格就是原型的 renderS03d()。 */
  if (unsettledView) {
    const byMember = unsettledView !== 'all';
    const m = S.t.members.find(x => x.id === unsettledView);
    const rows = byMember
      ? S.unsettledList.filter(({ e, c }) =>
          (e.parts ?? []).includes(unsettledView) && (c.twdPending || c.estimated[unsettledView]))
      : S.unsettledList;
    const title = byMember
      ? `影響 ${m?.name ?? ''} 的 · ${rows.length} 筆`
      : `還沒算清楚 · ${rows.length} 筆`;

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
          ? <ExpenseGroups
              S={{ ...S, list: rows.map(r => r.e) }}
              readonly money={moneyOpts} />
          : <div className="empty"><p>都算清楚了。</p><p>沒有需要補的筆數</p></div>}
        <div style={{ height: 18 }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">

      {/* S-03-1　hero：目的地色調。副標只有日期區間，沒有成員 emoji */}
      <div className="hero" style={{ background: destinationOf(trip.name, trip.id).gradient }}>
        <div className="sc" />
        <div className="navrow">
          {/* #28-6b hero 右上只留「返回」與「⋯」。編輯／複製／分享／封存／刪除全部進 ⋯ 選單 */}
          <button className="ic2" aria-label="返回" onClick={() => navigate('/')}>
            <Icon name="back" size={20} />
          </button>
          <button className="ic2" aria-label="更多" onClick={() => setMenuOpen(true)}>
            <Icon name="more" size={20} />
          </button>
        </div>
        <div className="tt">{trip.name}</div>
        <div className="dt tnum">{dateRange(trip.start_date, trip.end_date)}</div>
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
              onPickMember={id => setUnsettledView(id)} />}
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
                有 {nGap} 筆還沒換算成台幣，上面的總花費不含它們。
                {!rateNow && (
                  <button className="ratelink" onClick={openTripEdit}>
                    設現金匯率 <Icon name="next" size={13} />
                  </button>
                )}
              </p>
            )}
          </div>

          <div className="listhd"><span>消費紀錄 · {S.list.length} 筆</span></div>

          {/* S-03-29　未定案入口。N＝0 整條不顯示 */}
          {nUn > 0 && !S.readonly && (
            <button className="unsettled" onClick={() => setUnsettledView('all')}>
              <span><Icon name="warn" size={16} /> 有 {nUn} 筆還沒算清楚</span>
              <Icon name="next" size={16} />
            </button>
          )}

          {expLoading && <div className="spin"><i /></div>}

          {!expLoading && !S.list.length ? (
            <div className="empty">
              <p style={{ marginTop: 10 }}>第一筆從哪裡開始？</p>
              <p>早餐、計程車、門票，都可以記</p>
            </div>
          ) : (
            <ExpenseGroups S={S} readonly={S.readonly} money={moneyOpts} onEdit={openEdit} />
          )}

          {/* #28-6b 底部只留一顆主鈕，且依狀態變。已結算態沒有主鈕——
              那時的主要動作是「逐筆標記付清」，在結算分頁裡做，不在這裡。 */}
          {isArchived && (
            <div className="btnrow">
              <button className="btn gh" disabled={unarchiveMutation.isPending}
                onClick={() => unarchiveMutation.mutate()}>
                {unarchiveMutation.isPending ? '處理中…' : '重新開啟行程'}
              </button>
            </div>
          )}
          {!isArchived && !isSettled && (
            <div className="btnrow">
              <button className="btn" onClick={openNew}>
                <Icon name="add" size={16} /> 記一筆
              </button>
            </div>
          )}
        </>
      )}

      {/* S-03-31／32　⋯ 選單 */}
      {menuOpen && (
        <MoreSheet
          status={display as 'planned' | 'active' | 'settled' | 'archived'}
          onEdit={() => { setMenuOpen(false); openTripEdit(); }}
          onShare={() => { setMenuOpen(false); setShareSheetOpen(true); }}
          onCopy={() => { setMenuOpen(false); setCopyOpen(true); }}
          onArchive={() => { setMenuOpen(false); archiveMutation.mutate(); }}
          onDelete={() => { setMenuOpen(false); setDeleteConfirm(''); setDeleteOpen(true); }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {/* S-03-25　刪除確認：打「刪除」二字才 enable。
          全站只有這裡用 --dg 實心——刪除是不可逆的，語彙不與其他動作共用。 */}
      {deleteOpen && (
        <>
          <div className="scrim" onClick={() => setDeleteOpen(false)} />
          <div className="dlgwrap">
            <div className="dlg">
              <p className="dlgt">刪除「{trip.name}」？</p>
              <p className="dlgs">
                這會一併刪掉 {expenses.length} 筆消費、{trip.trip_members.length} 位成員，
                以及結算結果與分享連結。
              </p>
              <p className="dlgs">確定的話，請在下面打「刪除」兩個字。</p>
              <input
                type="text" className="dlginput" value={deleteConfirm}
                placeholder="刪除" autoComplete="off"
                onChange={e => setDeleteConfirm(e.target.value)}
              />
              <div className="dlgrow">
                <button className="btn qt" onClick={() => setDeleteOpen(false)}>算了，留著</button>
                <button
                  className="btn dg"
                  disabled={deleteConfirm.trim() !== '刪除' || deleteTripMutation.isPending}
                  onClick={() => deleteTripMutation.mutate()}
                >
                  {deleteTripMutation.isPending ? '刪除中…' : '刪除行程'}
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
          onClose={() => setCopyOpen(false)}
          onCreated={(id) => { setCopyOpen(false); navigate(`/trips/${id}`); }}
        />
      )}

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
