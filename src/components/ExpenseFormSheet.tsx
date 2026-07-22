import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { TripWithMembers, ExpenseWithSplits, ExpenseType, PaymentMethod } from '@/types/database';

// ── Constants ─────────────────────────────────────────────────────────────────

function suggestEmoji(title: string): string {
  if (/餐|吃|食|lunch|dinner|food/i.test(title))          return '🍜';
  if (/交通|車|巴士|bus|train|地鐵|metro|taxi/i.test(title)) return '🚌';
  if (/住|飯店|hotel|旅館|hostel/i.test(title))             return '🏨';
  if (/票|景點|ticket|入場|樂園/i.test(title))              return '🎡';
  if (/買|購物|shop|便利|超市/i.test(title))                return '🛍️';
  return '➕';
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash',          label: '現金' },
  { value: 'credit_card',   label: '信用卡' },
  { value: 'stored_value',  label: '儲值卡' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  tripId: string;
  trip: TripWithMembers;
  expenseId?: string;
  onClose: () => void;
}

interface FormState {
  title:            string;
  categoryEmoji:    string;
  foreignAmount:    string;
  foreignPending:   boolean;
  twdAmount:        string;
  twdPending:       boolean;
  paymentMethod:    PaymentMethod | '';
  expenseDate:      string;
  expenseType:      ExpenseType;
  payerMemberId:    string;
  participating:    Set<string>;          // for shared
  individualAmts:   Record<string, string>; // member_id → amount string
}

function initState(members: TripWithMembers['trip_members']): FormState {
  return {
    title:          '',
    categoryEmoji:  '➕',
    foreignAmount:  '',
    foreignPending: false,
    twdAmount:      '',
    twdPending:     false,
    paymentMethod:  '',
    expenseDate:    new Date().toISOString().slice(0, 10),
    expenseType:    'shared',
    payerMemberId:  members[0]?.id ?? '',
    participating:  new Set(members.map(m => m.id)),
    individualAmts: {},
  };
}

function stateFromExpense(exp: ExpenseWithSplits, members: TripWithMembers['trip_members']): FormState {
  const participating = new Set(
    exp.expense_splits.filter(s => s.is_participating).map(s => s.member_id)
  );
  const individualAmts: Record<string, string> = {};
  for (const s of exp.expense_splits) {
    if (s.split_amount !== null) individualAmts[s.member_id] = String(s.split_amount);
  }

  return {
    title:          exp.title,
    categoryEmoji:  exp.category_emoji,
    foreignAmount:  exp.foreign_amount !== null ? String(exp.foreign_amount) : '',
    foreignPending: exp.foreign_pending,
    twdAmount:      exp.twd_amount !== null ? String(exp.twd_amount) : '',
    twdPending:     exp.twd_pending,
    paymentMethod:  exp.payment_method,
    expenseDate:    exp.expense_date,
    expenseType:    exp.expense_type,
    payerMemberId:  exp.payer_member_id,
    participating:  participating.size > 0 ? participating : new Set(members.map(m => m.id)),
    individualAmts,
  };
}

// ── Sheet component ───────────────────────────────────────────────────────────

export default function ExpenseFormSheet({ tripId, trip, expenseId, onClose }: Props) {
  const isEdit = Boolean(expenseId);
  const qc     = useQueryClient();
  const members = trip.trip_members.sort((a, b) => a.sort_order - b.sort_order);

  // Load existing expense for edit
  const { data: existingExp } = useQuery<ExpenseWithSplits | null>({
    queryKey: ['expense', expenseId],
    queryFn: async () => {
      if (!expenseId) return null;
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('id', expenseId)
        .single();
      if (error) throw error;
      return data as ExpenseWithSplits;
    },
    enabled: isEdit,
  });

  const [form, setForm] = useState<FormState>(() => initState(members));
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [showDelete, setShowDelete] = useState(false);

  // Populate form when existingExp loads
  useEffect(() => {
    if (existingExp) setForm(stateFromExpense(existingExp, members));
  }, [existingExp]); // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: '' }));
  }

  // Auto-suggest emoji when title changes
  function handleTitleChange(v: string) {
    update('title', v);
    if (form.categoryEmoji === '➕' || form.categoryEmoji === suggestEmoji(form.title)) {
      update('categoryEmoji', suggestEmoji(v));
    }
  }

  // ── Computed (shared per-person, individual diff) ─────────────────────────────
  const sharedPerPerson = useMemo(() => {
    const n = form.participating.size;
    const amt = parseFloat(form.twdAmount);
    if (!n || !Number.isFinite(amt) || amt <= 0) return null;
    return Math.round(amt / n);
  }, [form.twdAmount, form.participating]);

  const individualDiff = useMemo(() => {
    const total = parseFloat(form.twdAmount);
    if (!Number.isFinite(total)) return null;
    const filled = Object.entries(form.individualAmts)
      .filter(([id]) => members.some(m => m.id === id))
      .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);
    return { filled, total, diff: total - filled };
  }, [form.twdAmount, form.individualAmts, members]);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登入');

      const expData = {
        trip_id:          tripId,
        payer_member_id:  form.payerMemberId,
        created_by:       user.id,
        title:            form.title.trim(),
        category_emoji:   form.categoryEmoji,
        expense_date:     form.expenseDate,
        foreign_amount:   form.foreignPending ? null : (form.foreignAmount ? parseFloat(form.foreignAmount) : null),
        twd_amount:       form.twdPending     ? null : (form.twdAmount     ? parseFloat(form.twdAmount)     : null),
        exchange_rate:    null as number | null,
        foreign_pending:  form.foreignPending,
        twd_pending:      form.twdPending,
        payment_method:   form.paymentMethod as PaymentMethod,
        expense_type:     form.expenseType,
      };

      // Auto-compute exchange_rate
      if (!form.foreignPending && !form.twdPending && form.foreignAmount && form.twdAmount) {
        const fa = parseFloat(form.foreignAmount);
        const ta = parseFloat(form.twdAmount);
        if (fa > 0) expData.exchange_rate = ta / fa;
      }

      if (isEdit && expenseId) {
        // Delete old splits, update expense
        await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
        const { error } = await supabase.from('expenses').update(expData).eq('id', expenseId);
        if (error) throw error;
        await insertSplits(expenseId);
        return expenseId;
      }

      const { data: exp, error } = await supabase
        .from('expenses')
        .insert(expData)
        .select()
        .single();
      if (error) throw error;
      await insertSplits(exp.id);
      return exp.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', tripId] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('expenses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', expenseId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', tripId] });
      onClose();
    },
  });

  async function insertSplits(eid: string) {
    if (form.expenseType === 'personal') return;

    const rows = (() => {
      if (form.expenseType === 'shared') {
        return members
          .filter(m => form.participating.has(m.id))
          .map(m => ({
            expense_id:       eid,
            member_id:        m.id,
            is_participating: true,
            split_amount:     null,
            split_pending:    false,
          }));
      } else {
        // individual
        return members.map(m => {
          const raw = form.individualAmts[m.id];
          return {
            expense_id:       eid,
            member_id:        m.id,
            is_participating: true,
            split_amount:     raw ? parseFloat(raw) : null,
            split_pending:    !raw,
          };
        });
      }
    })();

    if (rows.length > 0) {
      const { error } = await supabase.from('expense_splits').insert(rows);
      if (error) throw error;
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.title.trim())       errs.title         = '這欄還沒填喔';
    if (!form.paymentMethod)      errs.paymentMethod = '這欄還沒填喔';
    if (!form.payerMemberId)      errs.payer         = '這欄還沒填喔';
    if (form.expenseType === 'shared' && form.participating.size === 0)
      errs.participating = '至少選一位參與成員';
    // Bug #5：不可存入「台幣空白且未標記待填」的消費（會變成 null 又不計入統計/結算）
    if (!form.twdPending && !form.twdAmount.trim())
      errs.twdAmount = '填台幣金額，或開啟「之後再填」';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (validate()) saveMutation.mutate();
  }

  function toggleParticipant(id: string) {
    setForm(f => {
      const next = new Set(f.participating);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...f, participating: next };
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        style={{ backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-surface rounded-t-[22px] shadow-sheet max-h-[95%] flex flex-col animate-sheet-up">
        <div className="w-9 h-1 bg-[#D0CBC5] rounded-full mx-auto mt-3 flex-shrink-0" />

        {/* Header */}
        <div className="px-5 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
          <h2 className="font-serif text-[22px] font-bold text-ink">
            {isEdit ? '編輯消費' : '記一筆'}
          </h2>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-full bg-[#EAE6E1] flex items-center justify-center text-mid text-[13px]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pt-4 pb-0">

          {/* Title */}
          <Field label="什麼花費？" error={errors.title}>
            <div className="flex items-center gap-2">
              <span className="text-2xl flex-shrink-0 w-10 text-center">{form.categoryEmoji}</span>
              <input
                type="text"
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="例如：午餐 🍜"
                className="flex-1 h-[46px] px-[14px] bg-white rounded-xl border-[1.5px] border-[#E4DFD9] text-[16px] text-ink placeholder-muted outline-none focus:border-primary transition-colors"
              />
            </div>
          </Field>

          {/* Amounts */}
          <div className="mb-5 bg-[#F5F4F2] rounded-2xl p-4">
            {/* Foreign amount */}
            <AmountRow
              label="外幣金額"
              value={form.foreignAmount}
              pending={form.foreignPending}
              onChange={v => update('foreignAmount', v)}
              onToggle={() => update('foreignPending', !form.foreignPending)}
              placeholder="稍後再填也可以"
            />
            {/* TWD amount */}
            <AmountRow
              label="台幣金額"
              value={form.twdAmount}
              pending={form.twdPending}
              onChange={v => update('twdAmount', v)}
              onToggle={() => { update('twdPending', !form.twdPending); setErrors(e => ({ ...e, twdAmount: '' })); }}
              placeholder="稍後再填也可以"
            />
            {errors.twdAmount && <p className="text-[11px] text-warn mt-1">{errors.twdAmount}</p>}
            {/* Exchange rate display */}
            {!form.foreignPending && !form.twdPending && form.foreignAmount && form.twdAmount && (
              <p className="text-[11px] text-muted mt-1 text-right">
                匯率 ≈ {(parseFloat(form.twdAmount) / parseFloat(form.foreignAmount)).toFixed(2)}
              </p>
            )}
          </div>

          {/* Payment method */}
          <Field label="怎麼付的？" error={errors.paymentMethod}>
            <div className="flex gap-2">
              {PAYMENT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => update('paymentMethod', opt.value)}
                  className={`flex-1 h-[42px] rounded-xl text-[14px] font-semibold border-[1.5px] transition-colors ${form.paymentMethod === opt.value ? 'bg-primary text-white border-primary' : 'bg-white text-mid border-[#E4DFD9]'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Date */}
          <Field label="日期">
            <input
              type="date"
              value={form.expenseDate}
              onChange={e => update('expenseDate', e.target.value)}
              className="w-full h-[46px] px-[14px] bg-white rounded-xl border-[1.5px] border-[#E4DFD9] text-[15px] text-ink outline-none focus:border-primary transition-colors"
            />
          </Field>

          {/* Expense type */}
          <Field label="分帳方式">
            <div className="flex rounded-xl overflow-hidden border-[1.5px] border-[#E4DFD9] bg-[#F5F4F2]">
              {(['shared', 'individual', 'personal'] as ExpenseType[]).map((t, i) => {
                const labels = ['一起分', '各付各的', '只算我'];
                return (
                  <button
                    key={t}
                    onClick={() => update('expenseType', t)}
                    className={`flex-1 py-[9px] text-[13px] font-semibold transition-colors ${form.expenseType === t ? 'bg-primary text-white' : 'text-muted'} ${i > 0 ? 'border-l border-[#E4DFD9]' : ''}`}
                  >
                    {labels[i]}
                  </button>
                );
              })}
            </div>

            {/* Shared sub-state */}
            {form.expenseType === 'shared' && (
              <div className="mt-3">
                <p className="text-[13px] font-bold text-mid mb-2">分給誰？</p>
                <div className="flex flex-col gap-2">
                  {members.map(m => {
                    const on = form.participating.has(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleParticipant(m.id)}
                        className={`flex items-center gap-[10px] bg-white rounded-xl px-3 py-[9px] border-[1.5px] transition-colors ${on ? 'border-primary bg-[#FFF6F1]' : 'border-[#E4DFD9]'}`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white transition-colors ${on ? 'bg-primary border-primary' : 'border-[#C8BFB8]'}`}>
                          {on ? '✓' : ''}
                        </div>
                        <span className="text-[17px]">{m.emoji}</span>
                        <span className="text-[15px] font-semibold text-ink flex-1 text-left">{m.name}</span>
                      </button>
                    );
                  })}
                </div>
                {errors.participating && <p className="text-[11px] text-warn mt-1">{errors.participating}</p>}
                {sharedPerPerson !== null && (
                  <div className="mt-2 py-[7px] bg-ok/10 rounded-lg text-center text-[13px] font-bold text-ok">
                    每人 $ {sharedPerPerson.toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Individual sub-state */}
            {form.expenseType === 'individual' && (
              <div className="mt-3">
                <p className="text-[13px] font-bold text-mid mb-2">各自多少？</p>
                <div className="flex flex-col gap-2">
                  {members.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-[10px] bg-white rounded-xl px-3 py-2 border-[1.5px] border-[#E4DFD9]"
                    >
                      <span className="text-[17px]">{m.emoji}</span>
                      <span className="flex-1 text-[14px] font-medium text-ink">{m.name}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={form.individualAmts[m.id] ?? ''}
                        onChange={e => setForm(f => ({
                          ...f,
                          individualAmts: { ...f.individualAmts, [m.id]: e.target.value },
                        }))}
                        placeholder="輸入金額"
                        className="w-[108px] h-9 px-[10px] bg-[#F5F4F2] rounded-lg border-[1.5px] border-transparent text-[15px] font-bold text-ink text-right tabular-nums outline-none focus:border-primary focus:bg-white transition-colors placeholder-muted placeholder:font-normal placeholder:text-[13px]"
                      />
                    </div>
                  ))}
                </div>
                {individualDiff && (
                  <p className={`text-[12px] font-semibold mt-2 text-right ${Math.abs(individualDiff.diff) < 1 ? 'text-ok' : 'text-warn'}`}>
                    {Math.abs(individualDiff.diff) < 1
                      ? `已填 $${individualDiff.filled.toLocaleString()} ／ 總額 $${individualDiff.total.toLocaleString()} ✓`
                      : `已填 $${individualDiff.filled.toLocaleString()} ／ 總額 $${individualDiff.total.toLocaleString()}，差 $${Math.abs(individualDiff.diff).toLocaleString()}`
                    }
                  </p>
                )}
              </div>
            )}

            {/* Personal sub-state */}
            {form.expenseType === 'personal' && (
              <div className="mt-3 bg-[#FFF7F0] border border-[#FFD9C0] rounded-xl p-4">
                <p className="text-[15px] font-bold text-[#9A3412] mb-1">這筆不分帳</p>
                <p className="text-[13px] text-mid leading-relaxed">
                  這筆費用只記給自己，不進入任何分帳計算。<br />
                  適合紀念品、個人藥品，或不想跟大家一起分的花費。
                </p>
              </div>
            )}
          </Field>

          {/* Payer */}
          <Field label={form.expenseType === 'individual' ? '誰付的？' : '誰請客？'} error={errors.payer}>
            <div className="flex flex-wrap gap-2">
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => update('payerMemberId', m.id)}
                  className={`px-3 py-[7px] rounded-full text-[13px] font-semibold border-[1.5px] transition-colors ${form.payerMemberId === m.id ? 'border-primary bg-surface text-primary' : 'bg-white text-mid border-[#E4DFD9]'}`}
                >
                  {m.emoji} {m.name}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Actions */}
        <div className="px-5 pt-[14px] pb-8 flex gap-[10px] flex-shrink-0 border-t border-black/[0.05] flex-col">
          <div className="flex gap-[10px]">
            <button
              onClick={onClose}
              className="flex-1 h-[50px] bg-white text-primary rounded-xl border-[1.5px] border-primary text-[15px] font-bold active:scale-[0.97] transition-transform"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className="flex-1 h-[50px] bg-primary text-white rounded-xl text-[15px] font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
              style={{ boxShadow: '0 3px 14px rgba(124,45,18,0.36)' }}
            >
              {saveMutation.isPending ? '儲存中…' : '記下來'}
            </button>
          </div>
          {isEdit && (
            <button
              onClick={() => setShowDelete(true)}
              className="w-full py-2 text-warn text-[13px] font-semibold"
            >
              刪除這筆
            </button>
          )}
        </div>
      </div>

      {/* Delete confirm dialog */}
      {showDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDelete(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-sheet">
            <p className="text-[17px] font-bold text-ink mb-2 text-center">刪除這筆消費？</p>
            <p className="text-[13px] text-mid text-center mb-6">刪除後無法復原。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 h-[46px] bg-[#F5F4F2] text-ink rounded-xl text-[14px] font-bold"
              >
                取消
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 h-[46px] bg-warn text-white rounded-xl text-[14px] font-bold disabled:opacity-60"
              >
                {deleteMutation.isPending ? '刪除中…' : '刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[13px] font-bold text-mid tracking-wide mb-2">{label}</label>
      {children}
      {error && <p className="text-[11px] text-warn mt-1">{error}</p>}
    </div>
  );
}

function AmountRow({
  label, value, pending, onChange, onToggle, placeholder,
}: {
  label: string;
  value: string;
  pending: boolean;
  onChange: (v: string) => void;
  onToggle: () => void;
  placeholder: string;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-bold text-mid">{label}</span>
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <div
            onClick={onToggle}
            className={`w-9 h-5 rounded-full transition-colors ${pending ? 'bg-primary' : 'bg-[#C8BFB8]'} relative`}
          >
            <div
              className={`absolute top-[2px] w-4 h-4 rounded-full bg-white shadow transition-all ${pending ? 'left-[18px]' : 'left-[2px]'}`}
            />
          </div>
          <span className="text-[11px] text-muted">之後再填</span>
        </label>
      </div>
      <input
        type="number"
        inputMode="decimal"
        value={pending ? '' : value}
        disabled={pending}
        onChange={e => onChange(e.target.value)}
        placeholder={pending ? '之後再填' : placeholder}
        className="w-full h-[46px] px-[14px] bg-white rounded-xl border-[1.5px] border-[#E4DFD9] text-[18px] font-bold text-ink tabular-nums outline-none focus:border-primary transition-colors disabled:bg-[#F5F4F2] disabled:text-muted placeholder-muted placeholder:font-normal placeholder:text-[14px]"
      />
    </div>
  );
}
