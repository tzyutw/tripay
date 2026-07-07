import { useState, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { searchCurrencies } from '@/lib/currencies';
import type { TripWithMembers } from '@/types/database';

// ── Preset emojis ──────────────────────────────────────────────────────────────

const TRAVEL_EMOJIS = ['✈️','🗾','🏝️','🗻','🏔️','🎡','🌸','🗼','🌅','🏖️','🧳','🏯','🚂','🚢','🌺','🌻','🏕️','🎢','🌄','🎑','🪂','🚁'];
const MEMBER_EMOJIS = ['🍋','🐟','🐵','🐱','🐶','🐻','🦊','🐸','🦁','🐯','🐼','🐨','🦄','🧸','🌸','🌻','🍑','🍊','🥝','🫐','🍇','🐧'];

interface MemberEntry { emoji: string; name: string; }

interface Props {
  tripId?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export default function TripFormSheet({ tripId, onClose, onCreated }: Props) {
  const isEdit = Boolean(tripId);
  const qc     = useQueryClient();

  // ── Load existing trip for edit ──────────────────────────────────────────────
  const { data: existingTrip } = useQuery<TripWithMembers | null>({
    queryKey: ['trip', tripId],
    queryFn: async () => {
      if (!tripId) return null;
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_members(*)')
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
    ? existingTrip.trip_members.sort((a, b) => a.sort_order - b.sort_order).map(m => ({ emoji: m.emoji, name: m.name }))
    : [];

  const [coverEmoji,    setCoverEmoji]    = useState(existingTrip?.emoji ?? '✈️');
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
  const [emojiSection,    setEmojiSection]    = useState<'travel' | 'member'>('travel');
  // Bug 5: picker rendered as fixed overlay — track separately from form scroll
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [addingMember,    setAddingMember]    = useState(false);
  const [newMemberEmoji,  setNewMemberEmoji]  = useState('🙂');
  const [newMemberName,   setNewMemberName]   = useState('');
  const addMemberInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登入');

      if (isEdit && tripId) {
        const { error } = await supabase
          .from('trips')
          .update({ name, emoji: coverEmoji, currency, start_date: startDate, end_date: endDate })
          .eq('id', tripId);
        if (error) throw error;
        return tripId;
      }

      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          owner_id:    user.id,
          name,
          emoji:       coverEmoji,
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
      else { qc.invalidateQueries({ queryKey: ['trip', tripId] }); onClose(); }
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
    setMembers(prev => prev.filter((_, idx) => idx !== i));
    if (myMemberIdx === i) setMyMemberIdx(null);
    else if (myMemberIdx !== null && myMemberIdx > i) setMyMemberIdx(myMemberIdx - 1);
  }

  const filteredCurrencies = searchCurrencies(currencySearch);

  return (
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
            <h2 className="font-serif text-[22px] font-bold text-ink">
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

            {/* Cover emoji */}
            <div className="mb-5">
              <label className="block text-[13px] font-bold text-mid tracking-wide mb-2">封面</label>
              {/* Bug 5 fix: clicking opens a fixed overlay picker, not inline */}
              <button
                onClick={() => setShowEmojiPicker(true)}
                className="w-14 h-14 rounded-xl bg-white border-[1.5px] border-[#E4DFD9] flex items-center justify-center text-[28px]"
              >
                {coverEmoji}
              </button>
              <p className="text-[11px] text-muted mt-1">點 emoji 可自訂行程封面</p>
            </div>

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

              <div className="flex flex-col gap-2">
                {members.map((m, i) => (
                  <div
                    key={i}
                    onClick={() => setMyMemberIdx(myMemberIdx === i ? null : i)}
                    className={`bg-white rounded-xl px-[14px] py-[10px] flex items-center gap-[10px] cursor-pointer border-[1.5px] transition-colors ${myMemberIdx === i ? 'border-primary bg-[#FFF6F1]' : 'border-transparent'}`}
                  >
                    <div
                      className={`w-[22px] h-[22px] rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[12px] font-bold text-white transition-colors ${myMemberIdx === i ? 'bg-primary border-primary' : 'bg-transparent border-[#C8BFB8]'}`}
                    >
                      {myMemberIdx === i ? '✓' : ''}
                    </div>
                    <span className="text-[18px]">{m.emoji}</span>
                    <span className="flex-1 text-[16px] font-semibold text-ink">{m.name}</span>
                    {myMemberIdx === i && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-[2px] rounded-full">這是我</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); removeMember(i); }}
                      className="text-muted text-sm ml-1 w-6 h-6 flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {errors.members && <p className="text-[11px] text-warn mt-1">{errors.members}</p>}

              {/* Add member inline form */}
              {addingMember ? (
                <div className="mt-3 bg-white rounded-xl p-3 border border-[#E4DFD9]">
                  <p className="text-[13px] font-bold text-mid mb-2">加一個人</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {MEMBER_EMOJIS.slice(0, 12).map(e => (
                      <button
                        key={e}
                        onClick={() => setNewMemberEmoji(e)}
                        className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border-[1.5px] ${newMemberEmoji === e ? 'border-primary bg-[#FFF5F0]' : 'border-[#E4DFD9]'}`}
                      >
                        {e}
                      </button>
                    ))}
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
                標記哪位是你，之後可以切換視角看自己的花費。
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

      {/* ── Bug 5 fix: Emoji picker as fixed bottom overlay (z-[60]) ──────── */}
      {showEmojiPicker && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          {/* Backdrop — click to dismiss */}
          <div
            className="absolute inset-0 bg-black/30 animate-fade-in"
            onClick={() => setShowEmojiPicker(false)}
          />
          {/* Picker sheet — slides up from bottom, does not push form content */}
          <div className="relative bg-surface rounded-t-[22px] shadow-sheet animate-sheet-up max-h-[60vh] flex flex-col">
            <div className="w-9 h-1 bg-[#D0CBC5] rounded-full mx-auto mt-3 flex-shrink-0" />

            {/* Section tabs */}
            <div className="flex gap-2 px-4 pt-4 pb-3 flex-shrink-0">
              {(['travel', 'member'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setEmojiSection(s)}
                  className={`px-4 py-[6px] rounded-full text-xs font-bold border transition-colors ${emojiSection === s ? 'bg-primary text-white border-primary' : 'text-muted border-[#E4DFD9]'}`}
                >
                  {s === 'travel' ? '旅遊' : '成員'}
                </button>
              ))}
            </div>

            {/* Emoji grid */}
            <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {(emojiSection === 'travel' ? TRAVEL_EMOJIS : MEMBER_EMOJIS).map(e => (
                  <button
                    key={e}
                    onClick={() => { setCoverEmoji(e); setShowEmojiPicker(false); }}
                    className={`w-12 h-12 rounded-xl text-[24px] flex items-center justify-center border-[1.5px] transition-colors ${coverEmoji === e ? 'border-primary bg-[#FFF5F0]' : 'border-[#E4DFD9] bg-white'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirm */}
            <div className="px-4 pb-8 pt-3 flex-shrink-0 border-t border-black/[0.05]">
              <button
                onClick={() => setShowEmojiPicker(false)}
                className="w-full h-[50px] bg-primary text-white text-[15px] font-bold rounded-xl active:scale-[0.97] transition-transform"
              >
                就用這個
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
