import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { searchCurrencies } from '@/lib/currencies';
import { Icon } from '@/components/Icon';
import PaymentMethods from '@/components/shared/PaymentMethods';
import CashRate from '@/components/shared/CashRate';
import SettleMode from '@/components/shared/SettleMode';
import { useInlineEdit } from '@/components/shared/useInlineEdit';
import Avatar from '@/components/shared/Avatar';
import { nextToneSeq } from '@/lib/tones';
import type { TripWithMembers, SettlementMode } from '@/types/database';

/** id 存在＝資料庫既有成員；不存在＝本次新加的 */
interface MemberEntry { id?: string; emoji: string; name: string; }

interface Props {
  tripId?: string;
  /** 新行程的預填來源：'full'＝複製行程（名稱/幣別/成員）；'members'＝G-09 只帶成員 */
  /* 只剩「複製成新的一趟」這一條路。
     `mode:'members'`（G-09 預填上一趟成員）已於 2026-09-04 移除，不要加回來。 */
  prefill?: { tripId: string; mode: 'full' };
  onClose: () => void;
  onCreated: (id: string) => void;
}

export default function TripFormSheet({ tripId, prefill, onClose, onCreated }: Props) {
  const isEdit = Boolean(tripId);
  const qc     = useQueryClient();

  // ── Load existing trip for edit ──────────────────────────────────────────────
  const { data: existingTrip } = useQuery<TripWithMembers | null>({
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
    enabled: isEdit,
  });

  // ── Form state ───────────────────────────────────────────────────────────────
  // Bug 2 fix: default to empty array — no pre-filled blank member
  const initialMembers: MemberEntry[] = existingTrip
    ? existingTrip.trip_members.sort((a, b) => a.sort_order - b.sort_order).map(m => ({ id: m.id, emoji: m.emoji, name: m.name }))
    : [];

  const [name,          setName]          = useState(existingTrip?.name ?? '');
  const [currency,      setCurrency]      = useState(existingTrip?.currency ?? 'JPY');
  const [startDate,     setStartDate]     = useState(existingTrip?.start_date ?? '');
  const [endDate,       setEndDate]       = useState(existingTrip?.end_date ?? '');
  const [members,       setMembers]       = useState<MemberEntry[]>(initialMembers);
  const [myMemberIdx,   setMyMemberIdx]   = useState<number | null>(
    existingTrip?.owner_member_id
      ? existingTrip.trip_members.findIndex(m => m.id === existingTrip.owner_member_id)
      : null
  );
  /* B-1 的三段新區塊：支付方式、現金匯率、結算模式。都存在 trips 上 */
  const [pays, setPays] = useState<string[]>([]);
  const [rateTwd, setRateTwd] = useState('');
  const [rateFor, setRateFor] = useState('');
  const [settleMode, setSettleMode] = useState<SettlementMode>('direct');
  const [hubMember, setHubMember] = useState<string | null>(null);
  const [payBlocked, setPayBlocked] = useState('');

  const [currencySearch,  setCurrencySearch]  = useState('');
  const [showCurrency,    setShowCurrency]    = useState(false);
  const currencyInputRef = useRef<HTMLInputElement | null>(null);
  const [addingMember,    setAddingMember]    = useState(false);
  /* 預設**留空**，不是 '🙂'——填了預設值的話 Avatar 的第二層（名字第一個字）
     永遠走不到，三層 fallback 等於只有一層。 */
  const [newMemberEmoji,  setNewMemberEmoji]  = useState('');
  const [newMemberName,   setNewMemberName]   = useState('');
  const addMemberInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  /* emoji 就地編輯（A-4 共用元件）。key 是 `m:<index>` 或 'new' */
  const inline = useInlineEdit((key, one) => {
    if (key === 'new') { setNewMemberEmoji(one); return; }
    const i = Number(key.split(':')[1]);
    setMembers(prev => prev.map((m, k) => (k === i ? { ...m, emoji: one } : m)));
  });
  const [hydrated, setHydrated] = useState(false);

  // 編輯模式：existingTrip 是非同步載入的，useState 初始值抓不到，
  // 必須在資料到位後補灌一次（否則編輯表單會是空白）。
  useEffect(() => {
    if (!isEdit || !existingTrip || hydrated) return;
    setName(existingTrip.name);
    setCurrency(existingTrip.currency);
    setStartDate(existingTrip.start_date);
    setEndDate(existingTrip.end_date);
    const ms = [...existingTrip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
    setMembers(ms.map(m => ({ id: m.id, emoji: m.emoji, name: m.name })));
    const oi = ms.findIndex(m => m.id === existingTrip.owner_member_id);
    setMyMemberIdx(oi >= 0 ? oi : null);
    setPays(Array.isArray(existingTrip.payment_methods)
      ? (existingTrip.payment_methods as string[]) : ['現金', '信用卡']);
    setRateTwd(existingTrip.cash_rate_twd == null ? '' : String(existingTrip.cash_rate_twd));
    setRateFor(existingTrip.cash_rate_foreign == null ? '' : String(existingTrip.cash_rate_foreign));
    setSettleMode(existingTrip.settlement_mode);
    setHubMember(existingTrip.hub_member_id);
    setHydrated(true);
  }, [isEdit, existingTrip, hydrated]);

  // 預填來源（複製行程 / G-09 帶上趟成員）
  const { data: prefillTrip } = useQuery<TripWithMembers | null>({
    queryKey: ['trip-prefill', prefill?.tripId],
    queryFn: async () => {
      if (!prefill) return null;
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_members!trip_members_trip_id_fkey(*)')
        .eq('id', prefill.tripId)
        .single();
      if (error) throw error;
      return data as TripWithMembers;
    },
    enabled: !isEdit && !!prefill,
  });

  useEffect(() => {
    if (isEdit || !prefill || !prefillTrip || hydrated) return;
    const ms = [...prefillTrip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
    setMembers(ms.map(m => ({ emoji: m.emoji, name: m.name })));   // 不帶 id＝一律新建
    const oi = ms.findIndex(m => m.id === prefillTrip.owner_member_id);
    if (oi >= 0) setMyMemberIdx(oi);
    if (prefill.mode === 'full') {
      setName(`${prefillTrip.name} 的複本`);
      setCurrency(prefillTrip.currency);
    }
    setHydrated(true);
  }, [isEdit, prefill, prefillTrip, hydrated]);

  /* 每種支付方式被幾筆消費用到——「已經有消費在用的不能刪」要靠它。
     讀的是這趟自己的消費，不是全站。 */
  const { data: payUsage = {} } = useQuery<Record<string, number>>({
    queryKey: ['trip-pay-usage', tripId],
    queryFn: async () => {
      if (!tripId) return {};
      const { data } = await supabase
        .from('expenses').select('payment_method, payment_label')
        .eq('trip_id', tripId).is('deleted_at', null);
      const u: Record<string, number> = {};
      const NAME: Record<string, string> = {
        cash: '現金', credit_card: '信用卡', stored_value: '儲值卡',
      };
      for (const e of data ?? []) {
        const label = e.payment_label || NAME[e.payment_method] || e.payment_method;
        u[label] = (u[label] ?? 0) + 1;
      }
      return u;
    },
    enabled: isEdit,
  });

  /* 建立新行程時要算循環色號，需要知道目前有幾趟 */
  const { data: tripCount = 0 } = useQuery<number>({
    queryKey: ['trip-count'],
    queryFn: async () => {
      const { count } = await supabase.from('trips').select('id', { count: 'exact', head: true });
      return count ?? 0;
    },
    enabled: !isEdit,
  });

  // 編輯模式：查每位成員是否已有消費／分帳紀錄——有的話不准移除，避免 splits 變孤兒
  const { data: memberUsage = {} } = useQuery<Record<string, number>>({
    queryKey: ['trip-member-usage', tripId],
    queryFn: async () => {
      if (!tripId) return {};
      const [{ data: exp }, { data: mem }] = await Promise.all([
        supabase.from('expenses').select('id, payer_member_id').eq('trip_id', tripId).is('deleted_at', null),
        supabase.from('trip_members').select('id').eq('trip_id', tripId),
      ]);
      const usage: Record<string, number> = {};
      for (const m of mem ?? []) usage[m.id] = 0;
      const liveIds = (exp ?? []).map(e => e.id);
      for (const e of exp ?? []) usage[e.payer_member_id] = (usage[e.payer_member_id] ?? 0) + 1;
      if (liveIds.length) {
        const { data: sp } = await supabase
          .from('expense_splits').select('member_id').in('expense_id', liveIds);
        for (const s of sp ?? []) usage[s.member_id] = (usage[s.member_id] ?? 0) + 1;
      }
      // 結算項目也要算——migration 005 會讓 settlement_items 對 trip_members CASCADE，
      // 少了這道守衛，刪成員會連帶把結算紀錄悄悄刪掉。
      /* B-1 第三種情形：有一筆消費「只算他一個人」。
         012 給了 individual_member_id 一個 on delete restrict 的 FK，
         少了這道 UI 守衛，使用者會看到資料庫層的錯誤而不是那句話。 */
      const { data: indiv } = await supabase
        .from('expenses').select('individual_member_id')
        .eq('trip_id', tripId).is('deleted_at', null).not('individual_member_id', 'is', null);
      for (const x of indiv ?? [])
        if (x.individual_member_id) usage[x.individual_member_id] = (usage[x.individual_member_id] ?? 0) + 1;

      const { data: stl } = await supabase.from('settlements').select('id').eq('trip_id', tripId);
      const sIds = (stl ?? []).map(x => x.id);
      if (sIds.length) {
        const { data: si } = await supabase
          .from('settlement_items').select('from_member_id, to_member_id').in('settlement_id', sIds);
        for (const x of si ?? []) {
          usage[x.from_member_id] = (usage[x.from_member_id] ?? 0) + 1;
          usage[x.to_member_id]   = (usage[x.to_member_id]   ?? 0) + 1;
        }
      }
      return usage;
    },
    enabled: isEdit,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登入');

      if (isEdit && tripId) {
        const { error } = await supabase
          .from('trips')
          .update({
            name, currency, start_date: startDate, end_date: endDate || startDate,
            payment_methods: pays,
            cash_rate_twd: rateTwd.trim() === '' ? null : Number(rateTwd),
            cash_rate_foreign: rateFor.trim() === '' ? null : Number(rateFor),
            settlement_mode: settleMode,
            hub_member_id: settleMode === 'hub' ? hubMember : null,
          })
          .eq('id', tripId);
        if (error) throw error;

        // 成員異動：更新既有、新增、刪除（刪除前擋掉已有紀錄者）
        const kept = members.filter(m => m.name.trim());
        const originalIds = (existingTrip?.trip_members ?? []).map(m => m.id);
        const keptIds = kept.map(m => m.id).filter(Boolean) as string[];
        const removed = originalIds.filter(id => !keptIds.includes(id));

        for (const id of removed) {
          if ((memberUsage[id] ?? 0) > 0) throw new Error('有成員已存在消費紀錄，無法移除');
        }

        for (let i = 0; i < kept.length; i++) {
          const m = kept[i];
          if (!m.id) continue;
          const orig = existingTrip?.trip_members.find(x => x.id === m.id);
          if (!orig || orig.name !== m.name.trim() || orig.emoji !== m.emoji || orig.sort_order !== i) {
            const { error: uErr } = await supabase
              .from('trip_members')
              .update({ name: m.name.trim(), emoji: m.emoji, sort_order: i })
              .eq('id', m.id);
            if (uErr) throw uErr;
          }
        }

        const toAdd = kept.map((m, i) => ({ m, i })).filter(x => !x.m.id);
        let addedIds: string[] = [];
        if (toAdd.length) {
          const { data: created, error: iErr } = await supabase
            .from('trip_members')
            .insert(toAdd.map(({ m, i }) => ({ trip_id: tripId, name: m.name.trim(), emoji: m.emoji, sort_order: i })))
            .select();
          if (iErr) throw iErr;
          addedIds = (created ?? []).map(c => c.id);
        }

        if (removed.length) {
          /* 帳務鐵律：每個 DELETE 都要斷言實際影響列數。RLS 會把不符政策的 DELETE
             靜默過濾成「影響 0 列」而仍回 200——刪不掉卻以為刪掉了，
             下一步的 owner_member_id 就會指向一個還在的成員。 */
          const { data: dRows, error: dErr } = await supabase
            .from('trip_members').delete().in('id', removed).select();
          if (dErr) throw dErr;
          if ((dRows ?? []).length !== removed.length)
            throw new Error(`成員沒刪乾淨（要刪 ${removed.length} 位，實際 ${(dRows ?? []).length} 位）`);
        }

        // owner_member_id 跟著走
        if (myMemberIdx !== null && kept[myMemberIdx]) {
          const target = kept[myMemberIdx].id ?? addedIds[toAdd.findIndex(x => x.i === myMemberIdx)];
          if (target && target !== existingTrip?.owner_member_id) {
            await supabase.from('trips').update({ owner_member_id: target }).eq('id', tripId);
          }
        }
        return tripId;
      }

      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          owner_id:    user.id,
          name,
          currency,
          start_date:  startDate,
          /* 回程留空＝當天來回，不是漏填 */
          end_date:    endDate || startDate,
          status:      'planned',
          share_token: crypto.randomUUID(),
          /* 循環色號在建立當下就決定並存起來——用「清單第幾筆」算的話，
             刪掉一趟，後面所有行程的顏色會集體位移 */
          tone_seq:    nextToneSeq(tripCount),
          payment_methods: ['現金', '信用卡'],
        })
        .select()
        .single();
      if (tripErr) throw tripErr;

      const memberRows = members
        .filter(m => m.name.trim())
        .map((m, i) => ({
          trip_id:    trip.id,
          name:       m.name.trim(),
          emoji:      m.emoji,
          sort_order: i,
        }));

      let ownerMemberId: string | null = null;
      if (memberRows.length > 0) {
        const { data: createdMembers, error: memErr } = await supabase
          .from('trip_members')
          .insert(memberRows)
          .select();
        if (memErr) throw memErr;

        if (myMemberIdx !== null && createdMembers && createdMembers[myMemberIdx]) {
          ownerMemberId = createdMembers[myMemberIdx].id;
        }
      }

      if (ownerMemberId) {
        await supabase.from('trips').update({ owner_member_id: ownerMemberId }).eq('id', trip.id);
      }

      return trip.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['trips'] });
      if (!isEdit) onCreated(id);
      else {
        qc.invalidateQueries({ queryKey: ['trip', tripId] });
        qc.invalidateQueries({ queryKey: ['trip-member-usage', tripId] });
        qc.invalidateQueries({ queryKey: ['expenses', tripId] });
        onClose();
      }
    },
  });

  // ── Validation & submit ───────────────────────────────────────────────────────
  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim())      errs.name      = '這欄還沒填喔';
    if (!startDate)        errs.startDate = '這欄還沒填喔';
    if (members.filter(m => m.name.trim()).length === 0) errs.members = '至少要有一位成員';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (validate()) mutation.mutate();
  }

  // ── Member helpers ────────────────────────────────────────────────────────────
  function addMember() {
    if (!newMemberName.trim()) return;
    setMembers(prev => [...prev, { emoji: newMemberEmoji, name: newMemberName.trim().slice(0, 10) }]);
    setNewMemberName('');
    setNewMemberEmoji('');
    setAddingMember(false);
  }

  function removeMember(i: number) {
    const m = members[i];
    const used = m?.id ? (memberUsage[m.id] ?? 0) : 0;
    if (used > 0) {
      setErrors(e => ({ ...e, members: `${m.name} 已經有消費或分帳紀錄，不能移除。要拿掉的話，請先刪掉相關消費。` }));
      return;
    }
    setErrors(e => ({ ...e, members: '' }));
    setMembers(prev => prev.filter((_, idx) => idx !== i));
    if (myMemberIdx === i) setMyMemberIdx(null);
    else if (myMemberIdx !== null && myMemberIdx > i) setMyMemberIdx(myMemberIdx - 1);
  }

  const filteredCurrencies = searchCurrencies(currencySearch);

  // Sheet 一律 portal 到 body，避開祖先 transform 造成的 fixed 定位錯亂
  return createPortal(
    <>
      {/* ── Main sheet ──────────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 animate-fade-in"
          style={{ backdropFilter: 'blur(3px)' }}
          onClick={onClose}
        />

        {/* Sheet */}
        <div className="relative bg-white rounded-t-panel shadow-sheet max-h-[93%] flex flex-col animate-sheet-up">
          {/* Drag bar */}
          <div className="w-9 h-1 bg-[#D0CBC5] rounded-chip mx-auto mt-3 flex-shrink-0" />

          {/* Header */}
          <div className="px-5 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
            <h2 className="text-strong font-bold text-ink">
              {isEdit ? '編輯行程' : '這趟去哪？'}
            </h2>
            <button onClick={onClose} className="ic2" aria-label="關閉">
              <Icon name="close" size={20} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pt-4 pb-0">


            {/* 編輯模式沒有名稱／幣別／日期——那些在建立時就定了，
                這一頁管的是「這趟怎麼記帳」。照原型 S-02b。 */}
            {!isEdit && <>
            {/* Trip name */}
            <div className="mb-5">
              <label className="block text-sub font-bold text-md tracking-wide mb-2">去哪？</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(ev => ({ ...ev, name: '' })); }}
                placeholder="例如：沖繩四人行 ☀️"
                className="w-full h-[46px] px-[14px] bg-white rounded-base border-[1.5px] border-[#E4DFD9] text-input text-ink placeholder-gr outline-none focus:border-w transition-colors"
              />
              {errors.name && <p className="text-tag text-out mt-1">{errors.name}</p>}
            </div>

            {/* Currency */}
            <div className="mb-5">
              <label className="block text-sub font-bold text-md tracking-wide mb-2">當地幣別</label>
              <button
                onClick={() => setShowCurrency(v => {
                  /* 使用者真的要搜尋時才聚焦——不用 autofocus */
                  if (!v) requestAnimationFrame(() => currencyInputRef.current?.focus());
                  return !v;
                })}
                className="w-full h-[46px] px-[14px] bg-white rounded-base border-[1.5px] border-[#E4DFD9] text-left text-input text-ink flex items-center justify-between"
              >
                <span>{currency}</span>
                <span className="text-gr text-sm">▾</span>
              </button>
              {showCurrency && (
                <div className="mt-2 bg-white rounded-base border border-[#E4DFD9] max-h-52 overflow-y-auto scrollbar-hide">
                  <div className="p-3 border-b border-[#E4DFD9]">
                    {/* **禁止 autofocus**：它綁的是「元素被放進 DOM」，不是「使用者要編輯」。
                        只要有任何一次重繪把它插回畫面，瀏覽器就再聚焦一次——
                        手機上就是鍵盤關掉又跳出來。改由使用者按下「幣別」時才 focus。 */}
                    <input
                      ref={currencyInputRef}
                      type="text"
                      value={currencySearch}
                      onChange={e => setCurrencySearch(e.target.value)}
                      placeholder="搜尋幣別名稱或代碼"
                      className="w-full h-9 px-3 bg-[#F5F4F2] rounded-base text-sm outline-none"
                    />
                  </div>
                  {filteredCurrencies.map(c => (
                    <button
                      key={c.code}
                      onClick={() => { setCurrency(c.code); setShowCurrency(false); setCurrencySearch(''); }}
                      className={`w-full px-4 py-[11px] text-left text-body flex items-center justify-between hover:bg-[#F5F4F2] ${c.code === currency ? 'text-w font-bold' : 'text-ink'}`}
                    >
                      <span>{c.code} · {c.name}</span>
                      <span className="text-gr text-sm">{c.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* S-02-9 日期列。結構與原型 Tripay_原型.html:1195–1200 相同。
                **高度、外觀、日曆 icon 全部交給 `.datefield`**（index.css，整組移植自原型）：
                iOS Safari 的原生 `input[type=date]` 在**沒有** `-webkit-appearance:none` 時，
                寬度由作業系統決定、還會用 zh-TW 長格式（`2026年9月24日`），比半欄還寬 →
                整列撐出 sheet。這是 Rozi 在 iPhone 上看到「兩欄黏在一起、日期被切掉」的原因。
                #34-4（第三次修同一個地方）：高度必須明確給——關掉外觀後**空值裡面什麼都不畫**，
                那一行會塌成 0，變成「回程比出發矮一截」。 */}
            <div className="mb-5 flex" style={{ gap: 9 }}>
              <div className="flex-1 min-w-0">
                <label className="lbl">出發</label>
                <span className="datefield">
                  <input
                    type="date"
                    aria-label="出發"
                    value={startDate}
                    onChange={e => { setStartDate(e.target.value); setErrors(ev => ({ ...ev, startDate: '' })); }}
                  />
                  <Icon name="calendar" size={16} />
                </span>
                {errors.startDate && <p className="text-tag text-out mt-1">{errors.startDate}</p>}
              </div>
              <div className="flex-1 min-w-0">
                <label className="lbl">回程</label>
                <span className="datefield">
                  <input
                    type="date"
                    aria-label="回程"
                    value={endDate}
                    min={startDate}
                    onChange={e => { setEndDate(e.target.value); setErrors(ev => ({ ...ev, endDate: '' })); }}
                  />
                  <Icon name="calendar" size={16} />
                </span>
                <p className="hint">不填就是當天來回</p>
              </div>
            </div>

            </>}

            {/* Members */}
            <div className="mb-5">
              <label className="block text-sub font-bold text-md tracking-wide mb-1">誰一起去？</label>
              {!isEdit && prefill && members.length > 0 && (
                <p className="text-tag text-w mb-3 -mt-2">
                  已帶入原本那趟的成員與幣別，可以改
                </p>
              )}

              <div className="flex flex-col gap-2">
                {members.map((m, i) => {
                  const used = m.id ? (memberUsage[m.id] ?? 0) : 0;
                  return (
                  <div key={m.id ?? `new-${i}`} className="rowb">
                    {/* emoji 就地編輯：不開第二個畫面，點了直接在原位改（B-1 共用元件）*/}
                    {inline.editing === `m:${i}` ? (
                      <input
                        ref={inline.inputRef}
                        type="text"
                        maxLength={4}
                        defaultValue=""
                        aria-label={`換 ${m.name} 的 emoji`}
                        className="text-strong w-8 h-8 rounded-base border-[1.5px] border-w bg-white text-center flex-shrink-0 outline-none"
                        onBlur={e => inline.commit(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') inline.commit((e.target as HTMLInputElement).value);
                          if (e.key === 'Escape') inline.cancel();
                        }}
                      />
                    ) : (
                      /* S-02c-10 三層 fallback：有 emoji → emoji；沒 emoji 但有名字 →
                         名字第一個 grapheme ＋ 填色圓底；兩者皆無 → 🙂。
                         S-02 建立與 S-02b 編輯走的是同一個元件。 */
                      <Avatar
                        emoji={m.emoji}
                        name={m.name}
                        index={i}
                        aria-label={`換 ${m.name} 的 emoji`}
                        onClick={() => inline.begin(`m:${i}`)}
                      />
                    )}
                    <span className="flex-1 text-input font-semibold text-ink">{m.name}</span>
                    {myMemberIdx === i && (
                      <span className="text-tag font-bold text-w bg-w/10 px-2 py-[2px] rounded-chip">這是我</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); removeMember(i); }}
                      disabled={used > 0}
                      title={used > 0 ? '這位已經有消費紀錄，不能移除' : '移除'}
                      className={`text-sm ml-1 w-6 h-6 flex items-center justify-center ${used > 0 ? 'text-[#D8D2CC] cursor-not-allowed' : 'text-gr'}`}
                    >
                      ✕
                    </button>
                  </div>
                  );
                })}
              </div>

              {errors.members && <p className="text-tag text-out mt-1">{errors.members}</p>}

              {/* Add member inline form */}
              {addingMember ? (
                <div className="mt-3 bg-white rounded-base p-3 border border-[#E4DFD9]">
                  <p className="text-sub font-bold text-md mb-2">加一個人</p>
                  <div className="flex items-center gap-3 mb-3">
                    {inline.editing === 'new' ? (
                      <input
                        ref={inline.inputRef}
                        type="text"
                        maxLength={4}
                        defaultValue=""
                        aria-label="換 emoji"
                        className="w-12 h-12 rounded-base border-[1.5px] border-w bg-white text-title text-center flex-shrink-0 outline-none"
                        onBlur={e => inline.commit(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') inline.commit((e.target as HTMLInputElement).value);
                          if (e.key === 'Escape') inline.cancel();
                        }}
                      />
                    ) : (
                      <Avatar
                        emoji={newMemberEmoji}
                        name={newMemberName}
                        index={members.length}
                        aria-label="選新成員的 emoji"
                        onClick={() => inline.begin('new')}
                      />
                    )}
                  </div>
                  <input
                    ref={addMemberInputRef}
                    type="text"
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value.slice(0, 10))}
                    onKeyDown={e => e.key === 'Enter' && addMember()}
                    placeholder="叫什麼名字？"
                    className="w-full h-[42px] px-3 bg-[#F5F4F2] rounded-base text-body text-ink outline-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingMember(false)}
                      className="flex-1 h-10 rounded-base border-[1.5px] border-[#E4DFD9] text-md text-sm font-bold"
                    >
                      取消
                    </button>
                    <button
                      onClick={addMember}
                      disabled={!newMemberName.trim()}
                      className="flex-1 h-10 rounded-base bg-w text-white text-sm font-bold disabled:opacity-45"
                    >
                      加進來
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingMember(true)}
                  className="mt-3 w-full h-11 rounded-base border-[1.5px] border-dashed border-[#C8BFB8] text-md text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Icon name="add" size={16} /> 新增成員
                </button>
              )}
            </div>

            {isEdit && <>
              <SettleMode
                mode={settleMode}
                hubMember={hubMember}
                members={members.filter(m => m.id).map(m => ({ id: m.id!, name: m.name, emoji: m.emoji }))}
                onMode={setSettleMode}
                onHub={setHubMember}
              />
              <PaymentMethods
                pays={pays}
                used={payUsage}
                onChange={setPays}
                onBlocked={label => setPayBlocked(`${label} 已經有消費在用，不能刪。`)}
              />
              {payBlocked && <p className="hint" style={{ color: 'var(--md)' }}>{payBlocked}</p>}
              <CashRate
                currency={currency}
                rateTwd={rateTwd}
                rateFor={rateFor}
                onChange={(side, v) => (side === 'twd' ? setRateTwd(v) : setRateFor(v))}
              />
            </>}
          </div>

          {/* Action buttons */}
          <div className="px-5 pt-[14px] pb-8 flex gap-[10px] flex-shrink-0 border-t border-black/[0.05]">
            <button
              onClick={onClose}
              className="flex-1 h-[50px] bg-white text-w rounded-base border-[1.5px] border-w text-body font-bold active:scale-[0.97] transition-transform duration-100"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="flex-1 h-[50px] bg-w text-white rounded-base text-body font-bold active:scale-[0.97] transition-transform duration-100 disabled:opacity-60"
              style={{ boxShadow: '0 3px 14px rgba(124,45,18,0.36)' }}
            >
              {mutation.isPending ? '儲存中…' : isEdit ? '儲存' : '出發！'}
            </button>
          </div>
        </div>
      </div>

    </>,
    document.body,
  );
}
