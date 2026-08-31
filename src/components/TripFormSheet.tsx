import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { searchCurrencies } from '@/lib/currencies';
import EmojiPicker from '@/components/EmojiPicker';
import type { TripWithMembers } from '@/types/database';

/** id 存在＝資料庫既有成員；不存在＝本次新加的 */
interface MemberEntry { id?: string; emoji: string; name: string; }

interface Props {
  tripId?: string;
  /** 新行程的預填來源：'full'＝複製行程（名稱/幣別/成員）；'members'＝G-09 只帶成員 */
  prefill?: { tripId: string; mode: 'full' | 'members' };
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
  const [currencySearch,  setCurrencySearch]  = useState('');
  const [showCurrency,    setShowCurrency]    = useState(false);
  const [addingMember,    setAddingMember]    = useState(false);
  const [newMemberEmoji,  setNewMemberEmoji]  = useState('🙂');
  const [newMemberName,   setNewMemberName]   = useState('');
  const addMemberInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emojiPickerFor, setEmojiPickerFor] = useState<null | { kind: 'member'; index: number } | { kind: 'new' }>(null);
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
          .update({ name, currency, start_date: startDate, end_date: endDate })
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
          const { error: dErr } = await supabase.from('trip_members').delete().in('id', removed);
          if (dErr) throw dErr;
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
          end_date:    endDate,
          status:      'planned',
          share_token: crypto.randomUUID(),
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
    if (!endDate)          errs.endDate   = '這欄還沒填喔';
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
    setNewMemberEmoji('🙂');
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

  // 同 EmojiPicker：portal 到 body，避開祖先 transform 造成的 fixed 定位錯亂
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
        <div className="relative bg-surface rounded-t-[22px] shadow-sheet max-h-[93%] flex flex-col animate-sheet-up">
          {/* Drag bar */}
          <div className="w-9 h-1 bg-[#D0CBC5] rounded-full mx-auto mt-3 flex-shrink-0" />

          {/* Header */}
          <div className="px-5 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
            <h2 className="text-[22px] font-bold text-ink">
              {isEdit ? '編輯行程' : '這趟去哪？'}
            </h2>
            <button
              onClick={onClose}
              className="w-[30px] h-[30px] rounded-full bg-[#EAE6E1] flex items-center justify-center text-mid text-[13px]"
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pt-4 pb-0">


            {/* Trip name */}
            <div className="mb-5">
              <label className="block text-[13px] font-bold text-mid tracking-wide mb-2">去哪？</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(ev => ({ ...ev, name: '' })); }}
                placeholder="例如：沖繩四人行 ☀️"
                className="w-full h-[46px] px-[14px] bg-white rounded-xl border-[1.5px] border-[#E4DFD9] text-[16px] text-ink placeholder-muted outline-none focus:border-primary transition-colors"
              />
              {errors.name && <p className="text-[11px] text-warn mt-1">{errors.name}</p>}
            </div>

            {/* Currency */}
            <div className="mb-5">
              <label className="block text-[13px] font-bold text-mid tracking-wide mb-2">當地幣別</label>
              <button
                onClick={() => setShowCurrency(v => !v)}
                className="w-full h-[46px] px-[14px] bg-white rounded-xl border-[1.5px] border-[#E4DFD9] text-left text-[16px] text-ink flex items-center justify-between"
              >
                <span>{currency}</span>
                <span className="text-muted text-sm">▾</span>
              </button>
              {showCurrency && (
                <div className="mt-2 bg-white rounded-xl border border-[#E4DFD9] max-h-52 overflow-y-auto scrollbar-hide">
                  <div className="p-3 border-b border-[#E4DFD9]">
                    <input
                      type="text"
                      value={currencySearch}
                      onChange={e => setCurrencySearch(e.target.value)}
                      placeholder="搜尋幣別名稱或代碼"
                      className="w-full h-9 px-3 bg-[#F5F4F2] rounded-lg text-sm outline-none"
                      autoFocus
                    />
                  </div>
                  {filteredCurrencies.map(c => (
                    <button
                      key={c.code}
                      onClick={() => { setCurrency(c.code); setShowCurrency(false); setCurrencySearch(''); }}
                      className={`w-full px-4 py-[11px] text-left text-[15px] flex items-center justify-between hover:bg-[#F5F4F2] ${c.code === currency ? 'text-primary font-bold' : 'text-ink'}`}
                    >
                      <span>{c.code} · {c.name}</span>
                      <span className="text-muted text-sm">{c.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dates — Bug 1 fix: lang="en" prevents zh-TW Chrome from mangling the format */}
            <div className="mb-5 flex gap-3">
              <div className="flex-1">
                <label className="block text-[13px] font-bold text-mid tracking-wide mb-2">出發</label>
                <input
                  type="date"
                  lang="en"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setErrors(ev => ({ ...ev, startDate: '' })); }}
                  className="w-full h-[46px] px-[14px] bg-white rounded-xl border-[1.5px] border-[#E4DFD9] text-[15px] text-ink outline-none focus:border-primary transition-colors"
                />
                {errors.startDate && <p className="text-[11px] text-warn mt-1">{errors.startDate}</p>}
              </div>
              <div className="flex-1">
                <label className="block text-[13px] font-bold text-mid tracking-wide mb-2">回程</label>
                <input
                  type="date"
                  lang="en"
                  value={endDate}
                  min={startDate}
                  onChange={e => { setEndDate(e.target.value); setErrors(ev => ({ ...ev, endDate: '' })); }}
                  className="w-full h-[46px] px-[14px] bg-white rounded-xl border-[1.5px] border-[#E4DFD9] text-[15px] text-ink outline-none focus:border-primary transition-colors"
                />
                {errors.endDate && <p className="text-[11px] text-warn mt-1">{errors.endDate}</p>}
              </div>
            </div>

            {/* Members */}
            <div className="mb-5">
              <label className="block text-[13px] font-bold text-mid tracking-wide mb-1">誰一起去？</label>
              <p className="text-[11px] text-muted mb-3">點成員，標記哪位是你</p>
              {!isEdit && prefill && members.length > 0 && (
                <p className="text-[11px] text-primary mb-3 -mt-2">
                  {prefill.mode === 'full' ? '已帶入原本那趟的成員與幣別，可以改' : '已帶入上一趟的成員，可以改'}
                </p>
              )}

              <div className="flex flex-col gap-2">
                {members.map((m, i) => {
                  const used = m.id ? (memberUsage[m.id] ?? 0) : 0;
                  return (
                  <div
                    key={m.id ?? `new-${i}`}
                    onClick={() => setMyMemberIdx(myMemberIdx === i ? null : i)}
                    className={`bg-white rounded-xl px-[14px] py-[10px] flex items-center gap-[10px] cursor-pointer border-[1.5px] transition-colors ${myMemberIdx === i ? 'border-primary bg-[#FFF6F1]' : 'border-transparent'}`}
                  >
                    <div
                      className={`w-[22px] h-[22px] rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[12px] font-bold text-white transition-colors ${myMemberIdx === i ? 'bg-primary border-primary' : 'bg-transparent border-[#C8BFB8]'}`}
                    >
                      {myMemberIdx === i ? '✓' : ''}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setEmojiPickerFor({ kind: 'member', index: i }); }}
                      aria-label={`換 ${m.name} 的 emoji`}
                      className="text-[18px] w-8 h-8 rounded-lg border-[1.5px] border-[#E4DFD9] bg-white flex items-center justify-center flex-shrink-0"
                    >
                      {m.emoji}
                    </button>
                    <span className="flex-1 text-[16px] font-semibold text-ink">{m.name}</span>
                    {myMemberIdx === i && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-[2px] rounded-full">這是我</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); removeMember(i); }}
                      disabled={used > 0}
                      title={used > 0 ? '這位已經有消費紀錄，不能移除' : '移除'}
                      className={`text-sm ml-1 w-6 h-6 flex items-center justify-center ${used > 0 ? 'text-[#D8D2CC] cursor-not-allowed' : 'text-muted'}`}
                    >
                      ✕
                    </button>
                  </div>
                  );
                })}
              </div>

              {errors.members && <p className="text-[11px] text-warn mt-1">{errors.members}</p>}

              {/* Add member inline form */}
              {addingMember ? (
                <div className="mt-3 bg-white rounded-xl p-3 border border-[#E4DFD9]">
                  <p className="text-[13px] font-bold text-mid mb-2">加一個人</p>
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      onClick={() => setEmojiPickerFor({ kind: 'new' })}
                      className="w-12 h-12 rounded-xl border-[1.5px] border-[#E4DFD9] bg-white text-[24px] flex items-center justify-center flex-shrink-0"
                    >
                      {newMemberEmoji}
                    </button>
                    <p className="text-[12px] text-muted leading-snug">點一下換 emoji<br />也可以貼上你自己的</p>
                  </div>
                  <input
                    ref={addMemberInputRef}
                    type="text"
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value.slice(0, 10))}
                    onKeyDown={e => e.key === 'Enter' && addMember()}
                    placeholder="叫什麼名字？"
                    className="w-full h-[42px] px-3 bg-[#F5F4F2] rounded-xl text-[15px] text-ink outline-none mb-3"
                    autoFocus
                  />
                  <p className="text-[11px] text-muted mb-2">最多 10 個字</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingMember(false)}
                      className="flex-1 h-10 rounded-xl border-[1.5px] border-[#E4DFD9] text-mid text-sm font-bold"
                    >
                      取消
                    </button>
                    <button
                      onClick={addMember}
                      className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-bold"
                    >
                      加進來
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingMember(true)}
                  className="mt-3 w-full h-11 rounded-xl border-[1.5px] border-dashed border-[#C8BFB8] text-mid text-sm font-semibold flex items-center justify-center gap-2"
                >
                  ＋ 新增成員
                </button>
              )}
            </div>

            {!isEdit && (
              <p className="text-[11px] text-muted mb-4">
                標記哪位是你，統計卡的「我的花費」就會算你這一份。
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="px-5 pt-[14px] pb-8 flex gap-[10px] flex-shrink-0 border-t border-black/[0.05]">
            <button
              onClick={onClose}
              className="flex-1 h-[50px] bg-white text-primary rounded-xl border-[1.5px] border-primary text-[15px] font-bold active:scale-[0.97] transition-transform duration-100"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="flex-1 h-[50px] bg-primary text-white rounded-xl text-[15px] font-bold active:scale-[0.97] transition-transform duration-100 disabled:opacity-60"
              style={{ boxShadow: '0 3px 14px rgba(124,45,18,0.36)' }}
            >
              {mutation.isPending ? '儲存中…' : isEdit ? '儲存' : '出發！'}
            </button>
          </div>
        </div>
      </div>

      {/* 成員 Emoji 選擇器（封面用途已隨行程 emoji 退場而移除）*/}
      {emojiPickerFor && (
        <EmojiPicker
          mode="member"
          value={
            emojiPickerFor.kind === 'new' ? newMemberEmoji
              : (members[emojiPickerFor.index]?.emoji ?? '🙂')
          }
          onPick={(e) => {
            if (emojiPickerFor.kind === 'new') setNewMemberEmoji(e);
            else setMembers(prev => prev.map((m, i) => i === emojiPickerFor.index ? { ...m, emoji: e } : m));
          }}
          onClose={() => setEmojiPickerFor(null)}
        />
      )}
    </>,
    document.body,
  );
}
