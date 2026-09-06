/* 實作-B-4　S-04 記一筆（39 項）。
 *
 * 金額與幣別的判定行為**一律以 `規格_金額未定案與幣別.md` 為準**（R1–R10）。
 * 版面與文案逐字對齊 `Tripay_原型.html` 的 renderS04()／paintS04()／cmpRow()。
 *
 * 🔴 S-04-8 與 S-04-29 是一組，不能只做一半：
 *    拿掉「之後再填」toggle（空欄一律放行存檔）之後，**必須同時**在空欄時自動寫
 *    pending 旗標。分開做的中間狀態是 `twd_amount = null` 且 `twd_pending = false`，
 *    結算整趟會回 422。
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { getCurrencySymbol } from '@/lib/currencies';
import { md, weekday, firstGrapheme } from '@/lib/format';
import { parseAmount, formatAmount, caretAfterFormat } from '@/lib/amount';
import { decimalsFor } from '@/lib/currencyTable';
import { calc, tripRate } from '@/lib/summary';
import type { ExpenseCalc } from '@/lib/summary';
import { MSG_NO_RATE, MSG_TWD_PENDING, MSG_FILL_ONE } from '@/lib/messages';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/Icon';
import Seg from '@/components/shared/Seg';
import { useInlineEdit } from '@/components/shared/useInlineEdit';
import Avatar from '@/components/shared/Avatar';
import type {
  TripWithMembers, ExpenseWithSplits, ExpenseType, PaymentMethod, SplitFillCurrency,
} from '@/types/database';

/* #27-6b 由標題推斷類別。使用者一旦自己改過就不再套用（category_emoji_manual）。
 *
 * 字典**由具體到通用**，先命中的先回。大小寫不敏感。
 * 這一份是拿 Rozi production 的 404 筆真實消費標題挑出來的——
 * 原本只有五條規則（餐／車／住／票／買），「帽子」「烤肉」「加油」全部落到 ➕。
 * ⚠️ **不要無限擴充**，其餘留給手動改；已經存在資料庫的 `category_emoji` 也不回頭重算。
 * ⚠️ 原型的 `emojiForTitle`（`Tripay_原型.html`）必須是**同一份**。 */
const EMOJI_RULES: [RegExp, string][] = [
  [/機票|航班/i, '✈️'],
  [/加油|油錢/i, '⛽'],
  [/711|7-11|セブン|全家|LAWSON|ローソン|CU|GS25|便利/i, '🏪'],
  [/超市|市場|業務|OGINO/i, '🛒'],
  [/藥妝|藥局|美妝|粉餅|唇膏|香水|保養|Olive|AINZ|3CE|ADDICTION|面膜/i, '💄'],
  [/衣|褲|裙|外套|鞋|帽|包包|襪|墨鏡/i, '👕'],
  [/咖啡|星巴克|飲|茶|果昔|奶茶/i, '☕'],
  [/餐|吃|食|麵|飯|肉|鍋|燒|烤|丼|壽司|炸雞|定食/i, '🍜'],
  [/票|景點|館|園|展|樂園|溫泉|拍卡/i, '🎡'],
  [/交通|車|巴士|地鐵|電車|計程|接送|船|租車/i, '🚌'],
  [/住|飯店|旅館|民宿|hotel/i, '🏨'],
  [/SIM|esim|網卡|漫遊/i, '📱'],
  [/買|購物|店|伴手禮|紀念品|扭蛋|大創|無印|唐吉軻德|LOFT/i, '🛍️'],
];

export function emojiForTitle(title: string): string {
  const s = title || '';
  for (const [re, e] of EMOJI_RULES) if (re.test(s)) return e;
  return '➕';
}

/* #35-1 「記一筆」預設今天，不是行程出發日。
   兩邊的邊界只夾一邊：今天晚於回程日 → 夾到回程日，否則行程結束後補記的帳會被
   dayLabel() 算成「第 200 天」那種分組；今天早於出發日 → **不夾**，機票這類行前
   支出本來就該落在「出發前」。回程日留空（當天來回）時不夾。
   只影響新增；載入既有消費一律沿用那筆自己的日期。 */
export function defaultExpDate(trip: { end_date?: string | null }): string {
  const d = new Date().toISOString().slice(0, 10);
  return trip.end_date && d > trip.end_date ? trip.end_date : d;
}

/** 這趟的支付方式清單。**沒有任何寫死的常數**——空清單時才退回單一「現金」。 */
export function paymentsOf(trip: { payment_methods: unknown }): string[] {
  const p = trip.payment_methods;
  /* 欄位在 schema 是 jsonb，讀出來什麼形狀都可能——不是陣列就當沒設定 */
  const list = Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  return list.length ? list : ['現金'];
}

/** 規格 §4：存檔後四種提示。
 *  整筆金額未填時**只顯示第一句**，不再依人數顯示其他提示。 */
export function saveToastFor({ pending, blanks }: { pending: boolean; blanks: string[] }): string {
  if (pending)            return '已存。這筆金額還沒填，之後補上就會算進總花費。';
  if (blanks.length === 1) return `已存。${blanks[0]} 的金額由總額推算。`;
  if (blanks.length === 2) return `已存。${blanks[0]} 和 ${blanks[1]} 的金額還沒填，先照均分算。`;
  if (blanks.length >= 3)  return `已存。還有 ${blanks.length} 人的金額還沒填，先照均分算。`;
  return '記下來了';
}

/** 類別 emoji 的識別圓圈尺寸。**未編輯與編輯中共用同一個**，否則切換時整列會跳。 */
const EMOJI_BOX = { width: 28, height: 28 } as const;

/**
 * 實作-Q-2　帶千分位的金額輸入框。
 *
 * ⚠️ **必須定義在模組層級**——定義在元件內部的話，每次父層 render 都是一個
 * 全新的函式參考，React 視為不同的元件型別 → 卸載舊 DOM、掛新的 →
 * `<input>` 被銷毀重建 → 焦點消失 → iOS 鍵盤收起來（`CashRate` 咬過一次）。
 *
 * `type="text"` 不能改成 `type=number`：後者放不進逗號，
 * 而且不支援 selection API（`setSelectionRange` 拋錯後游標歸 0、字元倒序，#13）。
 */
function AmountInput({ id, value, decimals, className, placeholder, onChange, ariaLabel }: {
  id?: string; value: string; decimals: 0 | 2; className?: string;
  placeholder?: string; onChange: (v: string) => void; ariaLabel?: string;
}) {
  return (
    <input
      id={id} type="text" inputMode="decimal" className={className}
      value={value} placeholder={placeholder} aria-label={ariaLabel}
      onChange={e => {
        const el = e.target;
        const caret = el.selectionStart ?? el.value.length;
        const next = formatAmount(el.value, decimals);
        onChange(next);
        /* 游標保位：不還原的話每打一個字就跳到最後，「308500」會打成倒序 */
        const pos = caretAfterFormat(el.value, caret, next);
        requestAnimationFrame(() => {
          if (document.activeElement === el) { try { el.setSelectionRange(pos, pos); } catch { /* 不支援就算了 */ } }
        });
      }}
    />
  );
}

interface Props {
  tripId: string;
  trip: TripWithMembers;
  expenseId?: string;
  onClose: () => void;
}

type SplitKind = 'shared' | 'individual' | 'single';

export interface FormState {
  title: string;
  emoji: string;
  emojiManual: boolean;
  date: string;
  forAmt: string;
  twdAmt: string;
  pay: string;
  payer: string | null;
  kind: SplitKind;
  parts: string[];              // 一起分的參與者／只算一個人時就是那一位
  single: string | null;        // 只算一個人選的人（individual_member_id）
  indiv: Record<string, string>;
  fillCur: SplitFillCurrency;
  partsOpen: boolean;           // 「要排除誰？」是否展開
  onSpot: boolean;
  sponsor: boolean;
}

/** 這一筆有誰參與。`single`（只算一個人）就是那一位。 */
export function partsOfForm(f: FormState): string[] {
  return f.kind === 'single' ? (f.single ? [f.single] : []) : f.parts;
}

/** 表單狀態換成 `calc()` 吃的形狀。金額一律用未帶正負號的原值，符號在 row 那層才套。 */
export function formToExpense(f: FormState, parts: string[]) {
  return {
    expense_type: f.kind === 'individual' ? 'individual' : 'shared',
    individual_member_id: f.kind === 'single' ? f.single : null,
    /* 🔴 一律走 `parseAmount()`——欄位裡是「308,500」，`Number()` 會回 NaN，
       帳直接壞掉而且不會有任何警告。 */
    foreign_amount: parseAmount(f.forAmt),
    twd_amount:     parseAmount(f.twdAmt),
    split_fill_currency: f.fillCur,
    payer_member_id: f.payer,
    is_sponsor: f.sponsor,
    expense_splits: parts.map(id => ({
      member_id: id, is_participating: true,
      split_amount:         f.fillCur === 'FOR' ? null : parseAmount(f.indiv[id]),
      split_amount_foreign: f.fillCur === 'FOR' ? parseAmount(f.indiv[id]) : null,
    })),
  };
}

/**
 * 表單狀態 → **要寫進資料庫的兩組 row**。抽成純函式，因為存出去的形狀
 * 必須能被單元測試直接斷言——只驗畫面文字驗不到「存進去的是什麼」，
 * 而這一輪兩條會算錯帳的路徑，錯的都是存進去的東西，畫面上完全正常。
 *
 * 🔴 兩條路徑的共同根因：**前端把外幣當成「之後再換算」的東西，
 * 後端結算只認台幣欄位，中間沒有任何一段負責把外幣變成台幣。**
 * 這個函式就是那一段。算式一律取自 `calc()`，**不在這裡另寫一套**——
 * 畫面顯示的數字與存進去的數字若不是同一段程式算的，早晚會差一塊錢而沒人發現。
 */
export function buildRows(
  f: FormState,
  trip: TripWithMembers,
  members: TripWithMembers['trip_members'],
  ctx: { tripId: string; userId: string },
): {
  row: Record<string, unknown>;
  splitRows: Record<string, unknown>[];
  c: ExpenseCalc;
} {
  const parts = partsOfForm(f);
  const c = calc(formToExpense(f, parts) as never, trip, members);
  const sign = f.sponsor ? -1 : 1;
  const forRaw = parseAmount(f.forAmt), twdRaw = parseAmount(f.twdAmt);
  const forNum = forRaw == null ? null : sign * forRaw;
  /* 🔴 只填外幣、而這趟的匯率算得出台幣 → **存檔當下就換算**。
     留 `twd_amount=null`＋`twd_pending=true` 的後果：畫面用行程匯率推算得好好的、
     金額也對，但結算引擎 `.eq("twd_pending", false)` **整筆跳過**——
     總額對不起來，而畫面上不會有任何一句話說它被跳過。
     `c.twdFromRate` 就是 `calc()` 說「這個台幣是我用匯率推出來的」。 */
  const twdNum = twdRaw != null ? sign * twdRaw
               : c.twdFromRate ? sign * c.twdTotal
               : null;

  const row: Record<string, unknown> = {
    trip_id: ctx.tripId, created_by: ctx.userId,
    payer_member_id: f.payer,
    title: f.title.trim(), category_emoji: f.emoji,
    category_emoji_manual: f.emojiManual,
    expense_date: f.date,
    foreign_amount: forNum, twd_amount: twdNum,
    /* 🔴 S-04-29　空欄就自動寫 pending。沒有這一段，S-04-8 拿掉 toggle 之後
       會存出「金額 null 但 pending false」的列，結算整趟回 422。 */
    foreign_pending: forNum == null, twd_pending: twdNum == null,
    /* 🔴 實作-Q-1d　「這個台幣是系統算的」的**唯一依據**。
       改匯率時只有 true 的會被重算——使用者自己手打的一筆都不准動。
       不要用 `exchange_rate` 有沒有值來猜：手打台幣時它也會被寫入。 */
    twd_from_rate: c.twdFromRate,
    exchange_rate: forNum && twdNum ? Math.abs(twdNum / forNum) : null,
    /* 支付方式是這趟自訂的清單，enum 塞不下 → 走 payment_label */
    payment_method: (['cash', 'credit_card', 'stored_value'].includes(f.pay)
      ? f.pay : 'cash') as PaymentMethod,
    payment_label: f.pay,
    expense_type: (f.sponsor ? 'shared'
      : f.kind === 'individual' ? 'individual' : 'shared') as ExpenseType,
    individual_member_id: f.kind === 'single' ? f.single : null,
    split_fill_currency: f.fillCur,
    settled_on_spot: f.sponsor ? false : f.onSpot,
    is_sponsor: f.sponsor,
  };

  const splitRows = parts.map(id => {
    const v = parseAmount(f.indiv[id]);
    /* 「各自付各的」＋填的是外幣，才需要回推台幣。其餘情形照舊。 */
    const isFor = f.kind === 'individual' && f.fillCur === 'FOR';
    /* 🔴 填外幣時 `split_amount` **一定要算出來**。
       引擎的條件是 `if (!s.split_pending && s.split_amount !== null)`，
       兩個缺一該成員這一筆就是 0，差額全歸付款人——
       一筆「各自付各的」變成**其他人 0 元、付款人一個人扛整筆**。
       金額看起來是合的（總額對得上），所以對帳時很難發現。
       引擎全檔**沒有任何一處讀 `split_amount_foreign`**。
       台幣值取 `c.shares[id]`：§2.2 的比例回推（不用匯率），
       而且四捨五入的差額已經在 `shares` 裡歸給付款人了。 */
    const twdShare = isFor ? (c.shares[id] ?? null) : v;
    return {
      member_id: id, is_participating: true,
      /* P1-0：填的是外幣就存進 `split_amount_foreign`，那是使用者輸入的原始值 */
      split_amount:         twdShare,
      split_amount_foreign: isFor ? v : null,
      /* 只看「使用者填沒填」是不夠的——填了外幣但整筆台幣算不出來時，
         `split_amount` 是 null 而 pending 卻是 false，引擎就靜默算成 0。
         要看的是**台幣算不算得出來**。 */
      split_pending: f.kind === 'individual' ? twdShare == null : false,
    };
  });

  return { row, splitRows, c };
}

function blank(trip: TripWithMembers, members: TripWithMembers['trip_members']): FormState {
  return {
    title: '', emoji: '➕', emojiManual: false,
    date: defaultExpDate(trip), forAmt: '', twdAmt: '',
    /* #33-4 預設是清單的第一項，不寫死「現金」——使用者可能把清單改成只有信用卡 */
    pay: paymentsOf(trip)[0],
    payer: null, kind: 'shared', parts: members.map(m => m.id), single: null,
    indiv: {}, fillCur: 'TWD', partsOpen: false, onSpot: false, sponsor: false,
  };
}

function fromExpense(e: ExpenseWithSplits, members: TripWithMembers['trip_members']): FormState {
  const on = e.expense_splits.filter(s => s.is_participating).map(s => s.member_id);
  const indiv: Record<string, string> = {};
  for (const s of e.expense_splits) {
    const v = e.split_fill_currency === 'FOR' ? s.split_amount_foreign : s.split_amount;
    if (v != null) indiv[s.member_id] = formatAmount(String(v), 2);
  }
  return {
    title: e.title, emoji: e.category_emoji, emojiManual: e.category_emoji_manual,
    date: e.expense_date,                                   // 編輯既有消費沿用該筆原本的日期
    forAmt: e.foreign_amount != null ? formatAmount(String(e.foreign_amount), 2) : '',
    twdAmt: e.twd_amount != null ? formatAmount(String(e.twd_amount), 2) : '',
    pay: e.payment_label ?? e.payment_method,
    payer: e.payer_member_id,
    kind: e.individual_member_id ? 'single' : (e.expense_type === 'individual' ? 'individual' : 'shared'),
    parts: on.length ? on : members.map(m => m.id),
    single: e.individual_member_id,
    indiv, fillCur: e.split_fill_currency, partsOpen: false,
    onSpot: e.settled_on_spot, sponsor: e.is_sponsor,
  };
}

export default function ExpenseFormSheet({ tripId, trip, expenseId, onClose }: Props) {
  const isEdit  = Boolean(expenseId);
  const qc      = useQueryClient();
  const members = [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
  const cur     = trip.currency;
  const sym     = getCurrencySymbol(cur);
  const pays    = paymentsOf(trip);
  const { toast } = useToast();

  const { data: existing } = useQuery<ExpenseWithSplits | null>({
    queryKey: ['expense', expenseId],
    queryFn: async () => {
      if (!expenseId) return null;
      const { data, error } = await supabase
        .from('expenses').select('*, expense_splits(*)').eq('id', expenseId).single();
      if (error) throw error;
      return data as ExpenseWithSplits;
    },
    enabled: isEdit,
  });

  const [f, setF] = useState<FormState>(() => blank(trip, members));
  const [showDelete, setShowDelete] = useState(false);
  /* 付款人沒選時**不能靜默失敗**——按鈕看起來按得下去、按了什麼都不說，
     使用者只會覺得 App 壞了。用與其他欄位同一套 errors 機制。 */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const payerRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (existing) setF(fromExpense(existing, members));
  }, [existing]);  // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(s => ({ ...s, [k]: v }));

  /* 存檔前的檢查。**只擋真的存不下去的**——金額空白照樣放行（S-04-8）。 */
  function validate(): boolean {
    const errs: Record<string, string> = {};
    /* 「當場就清了」＝沒有人代墊，本來就不需要付款人 */
    if (!f.onSpot && !f.payer) errs.payer = '先選這筆是誰付的';
    setErrors(errs);
    /* jsdom 沒實作 scrollIntoView，真實瀏覽器有——多一個 ?. 讓測試不要噴 unhandled error */
    if (errs.payer) payerRowRef.current?.scrollIntoView?.({ block: 'center' });
    return Object.keys(errs).length === 0;
  }

  /* S-04-3 類別 emoji 就地編輯。手動改過就寫 emojiManual，之後改標題不再覆蓋。 */
  const inline = useInlineEdit((_k, v) => setF(s => ({ ...s, emoji: v, emojiManual: true })));

  function onTitle(v: string) {
    setF(s => ({ ...s, title: v, emoji: s.emojiManual ? s.emoji : emojiForTitle(v) }));
  }

  /* 用同一支 calc() 算——表單看到的數字與 S-03 列表看到的必須是同一套邏輯，
     而且**與存進去的數字也是同一套**（`buildRows()` 走的是同一個 `formToExpense`）。 */
  const parts = partsOfForm(f);
  const c = useMemo(
    () => calc(formToExpense(f, parts) as never, trip, members),
    [f, parts, trip, members]);

  const rate = tripRate(trip);

  // ── 存檔 ──────────────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登入');

      const { row, splitRows: pending } = buildRows(f, trip, members,
        { tripId, userId: user.id });

      let eid = expenseId;
      if (isEdit && eid) {
        /* 帳務鐵律：DELETE 要斷言影響列數。RLS 會把不符政策的 DELETE
           靜默過濾成「影響 0 列」而仍回 200——這一類根因已咬過三次。 */
        const { error: dErr } = await supabase
          .from('expense_splits').delete().eq('expense_id', eid).select();
        if (dErr) throw dErr;
        const { error } = await supabase.from('expenses').update(row).eq('id', eid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('expenses').insert(row).select().single();
        if (error) throw error;
        eid = data.id;
      }

      /* 編輯時是「delete 全部 splits 再 insert」，所以重算也走同一條路徑 */
      const splitRows = pending.map(r => ({ ...r, expense_id: eid }));
      if (splitRows.length) {
        const { error } = await supabase.from('expense_splits').insert(splitRows);
        if (error) throw error;
      }
      return eid;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', tripId] });
      toast(saveToastFor({
        pending: c.twdPending,
        blanks: c.blanks.map(id => members.find(m => m.id === id)?.name ?? ''),
      }));
      onClose();
    },
    onError: (e: Error) => toast(e.message || '存不起來，請再試一次'),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('expenses')
        .update({ deleted_at: new Date().toISOString() }).eq('id', expenseId!).select();
      if (error) throw error;
      if (!data || data.length !== 1) throw new Error('刪除沒有生效（影響 0 列），請重試或回報');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', tripId] });
      toast('刪掉了');
      onClose();
    },
    onError: (e: Error) => toast(e.message),
  });

  function togglePart(id: string) {
    setF(s => ({
      ...s,
      parts: s.parts.includes(id) ? s.parts.filter(x => x !== id) : [...s.parts, id],
    }));
  }

  const n = parts.length;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in"
        style={{ backdropFilter: 'blur(3px)' }} onClick={onClose} />

      {/* ⚠️ 外層**不捲**，也不掛 `.sheet`——`.sheet` 是 `overflow:hidden`，
          跟同一個元素上的 `overflow-y-auto` 打架，hidden 會贏，整張就捲不動了
          （Rozi 的手機上「記下來」直接被切掉、按不到）。
          結構照 `TripFormSheet`：外層只負責高度上限與排版，
          中間一個 `flex-1 overflow-y-auto` 放內容，
          **footer 放在捲動區外面**——內容再長它都還在畫面上。 */}
      <div className="relative bg-bg rounded-t-panel shadow-sheet max-h-[93%] flex flex-col animate-sheet-up">
        <div className="grab flex-shrink-0" />

        {/* S-04-1 */}
        <div className="shd flex-shrink-0" style={{ paddingTop: 14 }}>
          <h3>{isEdit ? '編輯消費' : '記一筆'}</h3>
          <button className="ic2" aria-label="關閉" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 捲動區 */}
        <div className="sheetbody flex-1 overflow-y-auto scrollbar-hide">

        {/* S-04-10　日期。#29-1 不是「這一筆的屬性」，是「這一批帳的共同前提」——
            一天只設一次，卻擋在每筆都要填的「誰付的」前面，所以放在標題正下方，
            不排進欄位序列。#35-2 與「去哪？」同款的欄位列（標籤與值同一列）。 */}
        <div className="fld">
          <div className="fieldrow datefield">
            <span className="lbl">記在</span>
            <span className="v tnum">{md(f.date)}（{weekday(f.date)}）</span>
            <Icon name="calendar" size={16} />
            <input type="date" value={f.date} aria-label="記在"
              onChange={e => set('date', e.target.value)} />
          </div>
        </div>

        {/* S-04-2／S-04-3 */}
        <div className="fld">
          <div className="fieldrow">
            {/* S-04-3　類別 emoji：**未編輯時也要有識別圓圈**（Rozi 2026-09-06 追加）。
                先前是裸的 emoji，看不出可以點；成員識別（`<Avatar>`）一直都有框。
                互動本來就共用 `useInlineEdit`，這一輪只補外觀。
                ⚠️ 兩種狀態**共用同一個尺寸**（`EMOJI_BOX`），
                切換編輯時外框大小不變——變了整列會跳動。 */}
            {inline.editing === 'exp' ? (
              <span className="avatar" style={EMOJI_BOX}>
                <input ref={inline.inputRef} type="text" maxLength={4} defaultValue=""
                  aria-label="類別 emoji"
                  onBlur={e => inline.commit(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && inline.commit(e.currentTarget.value)} />
              </span>
            ) : (
              <button type="button" className="avatar" style={EMOJI_BOX}
                aria-label="類別 emoji" onClick={() => inline.begin('exp')}>
                {f.emoji}
              </button>
            )}
            <span className="lbl" style={{ width: 46 }}>花費</span>
            <input type="text" value={f.title} placeholder="例如：藥妝店" aria-label="花費"
              onChange={e => onTitle(e.target.value)} />
          </div>
        </div>

        {/* S-04-4／5／6　金額（§2.3 §2.4 §2A.3）。
            S-04-8：**沒有「之後再填」toggle**，空欄一律放行存檔。 */}
        <div className="fld">
          <span className="lbl">金額</span>
          <div className="amtstack">
            <label htmlFor="e-for"
              className={`amtline${c.noAutoReason === 'noForeignTotal' ? ' needfill' : ''}`}>
              <span className="cur">{sym} {cur}</span>
              <AmountInput id="e-for" value={f.forAmt} decimals={decimalsFor(cur)}
                className={c.forTotalAuto ? 'auto' : ''}
                placeholder={c.forTotalAuto ? formatAmount(String(c.forTotalEff), decimalsFor(cur)) : '0'}
                onChange={v => set('forAmt', v)} />
              {/* S-04-30 外幣總額自動補入時標「自動」，仍可覆寫 */}
              {c.forTotalAuto && <span className="autotag">自動</span>}
            </label>
            <label htmlFor="e-twd" className="amtline">
              <span className="cur">$ 台幣</span>
              <AmountInput id="e-twd" value={f.twdAmt} decimals={0}
                className={c.twdFromRate ? 'auto' : ''}
                placeholder={c.twdFromRate ? formatAmount(String(c.twdTotal), 0) : '0'}
                onChange={v => set('twdAmt', v)} />
              {c.twdFromRate && <span className="autotag">自動</span>}
            </label>
          </div>

          {/* #29-2「填一邊就好」與匯率警告互斥：沒設匯率時只出警告，
              不再多疊一句做不到的事 */}
          {c.needRateLink ? (
            <div className="note warn">
              <Icon name="warn" size={14} /> {MSG_NO_RATE}
            </div>
          ) : c.twdPending ? (
            <div className="note warn"><Icon name="warn" size={14} /> {MSG_TWD_PENDING}</div>
          ) : rate ? (
            <p className="hint">{MSG_FILL_ONE}</p>
          ) : null}
        </div>

        {/* S-04-9　讀這趟的 payment_methods，順序跟著清單，預設第一項 */}
        <div className="fld">
          <span className="lbl">怎麼付的？</span>
          <div className="chips">
            {pays.map(v => (
              <button key={v} className={`chip${f.pay === v ? ' on' : ''}`}
                onClick={() => set('pay', v)}>{v}</button>
            ))}
          </div>
        </div>

        {/* S-04-21／18 */}
        <div className="fld" ref={payerRowRef}>
          <span className="lbl">誰付的？</span>
          <div className="chips">
            {members.map(m => (
              <button key={m.id} className={`chip${!f.onSpot && f.payer === m.id ? ' on' : ''}`}
                onClick={() => {
                  setF(s => ({ ...s, payer: m.id, onSpot: false }));
                  setErrors(e => ({ ...e, payer: '' }));
                }}>
                <Avatar emoji={m.emoji} name={m.name} index={members.indexOf(m)} size={20} /> {m.name}
              </button>
            ))}
            <span className="paysep" />
            {/* #17-10「當場各付各的」本來就是在回答「誰付的」——答案是沒有人代墊 */}
            <button className={`chip alt${f.onSpot ? ' on' : ''}`}
              onClick={() => {
                set('onSpot', !f.onSpot);
                setErrors(e => ({ ...e, payer: '' }));
              }}>當場就清了</button>
          </div>
          {errors.payer && <p className="err">{errors.payer}</p>}
        </div>

        {/* S-04-11　分帳方式 */}
        <div className="fld">
          <span className="lbl">分帳方式</span>
          <Seg
            options={[
              { value: 'shared',     label: '一起分' },
              { value: 'individual', label: '各付各的' },
              { value: 'single',     label: '只算一個人' },
            ]}
            value={f.kind}
            onChange={k => set('kind', k)}
          />

          {/* R2（已定案）：預設全員均分、只顯示結果；要排除人才點開 */}
          {f.kind === 'shared' && (
            <div style={{ marginTop: 10 }}>
              <div className="sharedhead">
                <div className="shareline">
                  <span className="text-body font-semibold">{n} 人均分</span>
                  <span className="sep" aria-hidden="true">·</span>
                  <span className="money">
                    {c.twdPending ? '每人 —' : `每人 $ ${Math.round(c.twdTotal / Math.max(1, n)).toLocaleString()}`}
                  </span>
                </div>
                <button className="expandbtn" onClick={() => set('partsOpen', !f.partsOpen)}>
                  {f.partsOpen ? '收起' : '要排除誰？'}
                </button>
              </div>
              {f.partsOpen && (
                <div className="gap" style={{ marginTop: 9 }}>
                  {members.map(m => {
                    const on = f.parts.includes(m.id);
                    return (
                      <button key={m.id} className={`rowb${on ? ' on' : ''}`}
                        onClick={() => togglePart(m.id)}>
                        <Avatar emoji={m.emoji} name={m.name} index={members.indexOf(m)} />
                        <span className="flex-1 font-semibold">{m.name}</span>
                        <span className={`chkchip ${on ? 'on' : ''}`} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* S-04-17　只算一個人：要能選人，存 individual_member_id */}
          {f.kind === 'single' && (
            <div style={{ marginTop: 10 }}>
              <span className="lbl">算誰的？</span>
              <div className="chips">
                {members.map(m => (
                  <button key={m.id} className={`chip${f.single === m.id ? ' on' : ''}`}
                    onClick={() => set('single', m.id)}>
                    <Avatar emoji={m.emoji} name={m.name} index={members.indexOf(m)} size={20} /> {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {f.kind === 'individual' && (
            <EachAmounts
              f={f} c={c} cur={cur} sym={sym} members={members} parts={parts}
              onFillCur={v => set('fillCur', v)}
              onAmt={(id, v) => setF(s => ({ ...s, indiv: { ...s.indiv, [id]: v } }))}
            />
          )}
        </div>

        {/* S-04-19／20 */}
        <div className="fld">
          <span className="lbl">這筆是</span>
          <div className="chips">
            <button className={`chip${f.sponsor ? ' on' : ''}`}
              onClick={() => set('sponsor', !f.sponsor)}>贊助／回饋</button>
          </div>
          {f.sponsor && (
            <p className="hint">
              金額會記成負數，由 {n} 人均分扣抵。「誰付的」請選<b>實際代收這筆錢的人</b>
            </p>
          )}
        </div>

        {/* S-04-23　刪除。**這是軟刪**，所以不要寫「無法復原」——那不誠實。
            它跟著內容捲，不是常駐動作。 */}
        {isEdit && (
          <div className="delrow">
            <button onClick={() => setShowDelete(true)}>刪除這筆</button>
          </div>
        )}
        </div>

        {/* S-04-22　存檔一律放行：不擋、不跳確認、不 disable。
            **在捲動區外面**，所以永遠按得到。 */}
        <div className="btnrow flex-shrink-0">
          <button className="btn gh" onClick={onClose}>取消</button>
          <button className="btn" disabled={save.isPending}
            onClick={() => { if (validate()) save.mutate(); }}>
            {save.isPending ? '存檔中…' : '記下來'}
          </button>
        </div>
      </div>

      {showDelete && (
        <>
          <div className="scrim" onClick={() => setShowDelete(false)} />
          <div className="dlgwrap">
            <div className="dlg">
              <p className="dlgt">刪掉這一筆？</p>
              <p className="dlgs">這筆會從清單與結算裡拿掉。</p>
              <div className="dlgrow">
                <button className="btn qt" onClick={() => setShowDelete(false)}>算了</button>
                <button className="btn dg" disabled={del.isPending}
                  onClick={() => del.mutate()}>
                  {del.isPending ? '刪除中…' : '刪掉'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

/* S-04-15／31／32／16　各自金額。逐人一列用 <label for>，列高 ≥48（CSS 的 .amtrow）。 */
function EachAmounts({ f, c, cur, sym, members, parts, onFillCur, onAmt }: {
  f: FormState;
  c: ReturnType<typeof calc>;
  cur: string; sym: string;
  members: TripWithMembers['trip_members'];
  parts: string[];
  onFillCur: (v: SplitFillCurrency) => void;
  onAmt: (id: string, v: string) => void;
}) {
  const fillCur = c.fillsAreForeign ? cur : 'TWD';
  const fs      = fillCur === 'TWD' ? '$' : sym;

  return (
    <div style={{ marginTop: 10 }}>
      <span className="lbl" style={{ display: 'block' }}>各自多少？</span>

      {/* S-04-31　「填的是哪種幣別」是使用者**明確選的狀態**，不是從有沒有外幣總額推斷 */}
      <div style={{ marginBottom: 8 }}>
        <Seg
          options={[
            { value: 'TWD', label: '$ 台幣填' },
            { value: 'FOR', label: `${sym} ${cur} 填` },
          ]}
          value={f.fillCur}
          onChange={onFillCur}
        />
      </div>

      <div className="gap">
        {parts.map(id => {
          const m = members.find(x => x.id === id);
          /* 自動均分值走 **placeholder**——空白不等於 0 */
          const auto = c.valInCur[id] != null && !(f.indiv[id]?.trim());
          return (
            <label key={id} htmlFor={`ei-${id}`} className="amtrow">
              <Avatar emoji={m?.emoji} name={m?.name} index={members.findIndex(x => x.id === id)} />
              <span className="flex-1 text-body">{m?.name ?? ''}</span>
              {auto && <span className="autotag">自動</span>}
              <AmountInput id={`ei-${id}`} value={f.indiv[id] ?? ''}
                decimals={c.fillsAreForeign ? decimalsFor(cur) : 0}
                className={auto ? 'auto' : ''}
                placeholder={c.noAutoReason ? '—' : (auto ? formatAmount(String(c.valInCur[id]), 0) : '0')}
                onChange={v => onAmt(id, v)} />
            </label>
          );
        })}
      </div>

      <CmpRow c={c} fs={fs} fillCur={fillCur} />
    </div>
  );
}

/* §2.6 比對列。R9：加總不必等於總額——0＝剛好、≤1% 淡色、>1% 橘色，
   **三種都可以存檔**，這裡只呈現，不擋。 */
function CmpRow({ c, fs, fillCur }: {
  c: ReturnType<typeof calc>; fs: string; fillCur: string;
}) {
  if (!c.isEach || c.noAutoReason) return null;
  const base = c.fillsAreForeign ? c.forTotalEff : c.twdTotal;
  if (base == null) return null;

  const sum    = Object.values(c.valInCur).reduce<number>((a, v) => a + (v ?? 0), 0);
  const twdSum = Object.values(c.shares).reduce<number>((a, v) => a + (v ?? 0), 0);
  const diff   = base - sum;
  const lvl    = Math.abs(diff) < 1 ? 'ok' : (Math.abs(diff) / base > 0.01 ? 'bad' : 'soft');

  return (
    <div className={`cmp ${lvl}`}>
      <span>{fs} {sum.toLocaleString()} ／ {fs} {base.toLocaleString()}</span>
      <span className="d">
        {lvl === 'ok' ? <Icon name="check" size={14} /> : `差 ${fs} ${Math.abs(diff).toLocaleString()}`}
      </span>
      <div className="sub2">
        {c.twdPending ? MSG_TWD_PENDING
          : fillCur === 'TWD' ? '' : `換算後台幣 $ ${twdSum.toLocaleString()}`}
      </div>
    </div>
  );
}
