import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { searchCurrencies } from '@/lib/currencies';
import { Icon } from '@/components/Icon';
import { calc, tripRate } from '@/lib/summary';
import { rateDirection, rateColumns, rateFromColumns, type RateDir } from '@/lib/currencyTable';
import PaymentMethods from '@/components/shared/PaymentMethods';
import CashRate from '@/components/shared/CashRate';
import SettleMode from '@/components/shared/SettleMode';
import { useInlineEdit } from '@/components/shared/useInlineEdit';
import Avatar from '@/components/shared/Avatar';
import { nextToneSeq } from '@/lib/tones';
import type { TripWithMembers, SettlementMode } from '@/types/database';

/** id 存在＝資料庫既有成員；不存在＝本次新加的。
 *  `key` 是**畫面用的穩定識別**：新成員還沒有資料庫 id，但「都轉給同一個人」
 *  要指得出是哪一位——不能用會隨移除而位移的陣列索引。既有成員的 key 就是 id。 */
interface MemberEntry { id?: string; key: string; emoji: string; name: string; }
let memberKeySeq = 0;
const newKey = () => `new-${++memberKeySeq}`;

/**
 * 🔴 現金匯率：**一個數字，方向由系統依幣別量級判**（Rozi 2026-09-06 拍板方案 C）。
 *
 * 推翻實作-O 的「填一邊、另一邊自動帶 1」——那個設計讓使用者可以組出
 * **方向相反**的兩個數字，而系統無從分辨，於是 308500 日圓被存成
 * 1,469,048 台幣（正確 64,785）而且不會有任何警告。
 *
 * `flipped` 記住使用者有沒有按過「換個方向」：按過就以他的選擇為準，
 * 之後改數字也不再重判——不然他改一個字方向就跳回去，救不回來。
 */
export interface RateState { n: string; dir: RateDir | null; flipped: boolean }

export function nextRate(cur: RateState, currency: string, v: string): RateState {
  const auto = rateDirection(currency, Number(v.replace(/,/g, '')));
  /* 使用者按過「換個方向」就沿用他選的；沒按過才用自動判定 */
  const dir = cur.flipped && cur.dir ? cur.dir : auto;
  return { n: v, dir: v.trim() === '' ? null : dir, flipped: cur.flipped && v.trim() !== '' };
}

export function flipRate(cur: RateState): RateState {
  if (!cur.dir) return cur;
  return { ...cur, dir: cur.dir === 'for-unit' ? 'twd-unit' : 'for-unit', flipped: true };
}

/**
 * 🔴 規格 §2A.4 ＋ 實作-Q-1d　設定匯率的當下要動哪些消費、動成什麼樣子。
 *
 * 兩種會被動到：
 * ① **有外幣、沒台幣** → 補算（§2A.4 原本就有的）
 * ② **有外幣、台幣是系統算的**（`twd_from_rate === true`）→ 用新匯率**重算**
 *    ——匯率方向判錯過一次（308500 日圓存成 1,469,048 台幣），
 *    改了判定之後那些錯的值不會自己變對，所以要重算。
 *
 * **`twd_from_rate === false` 的一筆都不准動**——那是使用者自己手打的。
 * 判斷只看這一欄，**不要用 `exchange_rate` 有沒有值來猜**（手打時它也會被寫入）。
 *
 * 匯率算不出來 → 回空陣列，什麼都不做（§2A.4 明講不追溯）。
 */
export function backfillRows<T extends {
  foreign_amount: number | null; twd_amount: number | null; twd_from_rate?: boolean;
}>(
  rows: T[], rates: { cash_rate_twd: number | null; cash_rate_foreign: number | null },
): T[] {
  const r = tripRate(rates as never);
  if (!r) return [];
  return rows
    .filter(e => e.foreign_amount != null && (e.twd_amount == null || e.twd_from_rate === true))
    .map(e => {
      /* 換算走 `calc()`——**不在這裡另寫一套除法**。畫面顯示的數字與存進去的數字
         若不是同一段程式算的，早晚會差一塊錢而沒人發現。 */
      /* 重算的那一批要先把台幣清掉，`calc()` 才會走「用匯率推」那條分支 */
      const c = calc({ ...e, twd_amount: null, expense_splits: [] } as never, rates as never, []);
      const f = Number(e.foreign_amount);
      return { ...e, twd_amount: c.twdTotal, twd_pending: false, twd_from_rate: true,
               exchange_rate: f ? Math.abs(c.twdTotal / f) : null };
    });
}

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
    ? existingTrip.trip_members.sort((a, b) => a.sort_order - b.sort_order).map(m => ({ id: m.id, key: m.id, emoji: m.emoji, name: m.name }))
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
  /* 建立行程也要能設支付方式（Rozi 2026-09-06：兩頁欄位一致），
     預設清單與先前 insert 時寫死的那一組相同 */
  const [pays, setPays] = useState<string[]>(['現金', '信用卡']);
  /* 一個數字＋一個方向。一開始都空——不預先帶任何值。 */
  const [rate, setRate] = useState<RateState>({ n: '', dir: null, flipped: false });
  const rateCols = rateColumns(rate.n.trim() === '' ? null : Number(rate.n.replace(/,/g, '')), rate.dir);
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
  /* 必填沒填時要捲過去並聚焦——所以四個欄位各留一個 ref */
  const nameRef      = useRef<HTMLInputElement | null>(null);
  const currencyBtnRef = useRef<HTMLButtonElement | null>(null);
  const startRef     = useRef<HTMLInputElement | null>(null);
  const memberAddRef = useRef<HTMLButtonElement | null>(null);
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
    setMembers(ms.map(m => ({ id: m.id, key: m.id, emoji: m.emoji, name: m.name })));
    const oi = ms.findIndex(m => m.id === existingTrip.owner_member_id);
    setMyMemberIdx(oi >= 0 ? oi : null);
    setPays(Array.isArray(existingTrip.payment_methods)
      ? (existingTrip.payment_methods as string[]) : ['現金', '信用卡']);
    /* 兩欄還原成「一個數字＋方向」。哪一欄是 1，另一欄就是 N；
       兩欄都不是 1 的舊資料換算成方向一（1 外幣 = ? 台幣）。 */
    const r = rateFromColumns(existingTrip);
    /* 讀回來的方向就是資料庫裡的事實，不要再判一次——
       重判會把她已經按過「換個方向」修好的行程又改回去。 */
    setRate(r ? { n: String(r.n), dir: r.dir, flipped: true } : { n: '', dir: null, flipped: false });
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
    setMembers(ms.map(m => ({ key: newKey(), emoji: m.emoji, name: m.name })));   // 不帶 id＝一律新建
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

  /** 「都轉給同一個人」選的可能是**還沒有 id 的新成員**——
   *  成員插入之後才把畫面用的 key 換成真正的資料庫 id。 */
  function resolveHub(kept: MemberEntry[], created: { id: string }[]): string | null {
    if (settleMode !== 'hub' || !hubMember) return null;
    const hit = kept.find(m => m.key === hubMember);
    if (!hit) return null;
    if (hit.id) return hit.id;
    const i = kept.filter(m => !m.id).indexOf(hit);
    return created[i]?.id ?? null;
  }

  /**
   * 🔴 規格 §2A.4　**設定匯率的當下**，把這趟「有外幣金額、但沒有台幣金額」的消費
   * 自動補上換算後的台幣。**已經有台幣金額的一律不動**（不追溯、不重算）。
   *
   * 沒有這一段的後果：畫面上那一筆用行程匯率推算得好好的，
   * 但存進去的是 `twd_amount=null`＋`twd_pending=true`，
   * 而結算引擎 `.eq("twd_pending", false)` **整筆跳過**——總額對不起來，
   * 而且畫面上不會有任何一句話說它被跳過。
   *
   * 匯率被清空時什麼都不做（`rate` 為 null 就直接返回）：§2A.4 明講不追溯，
   * 已經算出台幣的消費維持原狀。
   */
  async function backfillTwd(
    id: string, rates: { cash_rate_twd: number | null; cash_rate_foreign: number | null },
  ) {
    const r = tripRate(rates as never);
    if (!r) return;
    /* 兩批都撈回來：沒台幣的（要補）＋ 台幣是系統算的（要重算）。
       篩選由 `backfillRows()` 再做一次——那一層才是「不准動手打的」的權威。 */
    const { data: pend, error: sErr } = await supabase
      .from('expenses').select('*')
      .eq('trip_id', id).is('deleted_at', null)
      .not('foreign_amount', 'is', null)
      .or('twd_amount.is.null,twd_from_rate.is.true');
    if (sErr) throw sErr;
    if (!pend?.length) return;
    const rows = backfillRows(pend, rates);
    if (!rows.length) return;
    /* **一次 upsert 送出＝單一敘述**，要嘛全部成功要嘛全部不做，不會補一半。
       逐筆 update 在中途失敗時會留下一半補好一半沒補的狀態。 */
    const { data: done, error: uErr } = await supabase.from('expenses').upsert(rows).select();
    if (uErr) throw uErr;
    if ((done ?? []).length !== rows.length)
      throw new Error(`匯率補算沒有全部生效（要動 ${rows.length} 筆，實際 ${(done ?? []).length} 筆）`);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (submitMembers: MemberEntry[] = members) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登入');

      if (isEdit && tripId) {
        const nextRates = rateCols;
        const { error } = await supabase
          .from('trips')
          .update({
            name, currency, start_date: startDate, end_date: endDate || startDate,
            payment_methods: pays,
            ...nextRates,
            settlement_mode: settleMode,
            hub_member_id: settleMode === 'hub' ? resolveHub(submitMembers, []) : null,
          })
          .eq('id', tripId);
        if (error) throw error;

        await backfillTwd(tripId, nextRates);

        // 成員異動：更新既有、新增、刪除（刪除前擋掉已有紀錄者）
        const kept = submitMembers.filter(m => m.name.trim());
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
          /* 中心人選的是這次才新增的成員時，第一次 update 解不出 id（那時還沒插入）*/
          const hubId = resolveHub(kept, created ?? []);
          if (hubId) await supabase.from('trips').update({ hub_member_id: hubId }).eq('id', tripId);
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
          /* 建立頁現在也有這三塊（Rozi 2026-09-06：兩頁欄位一致）。
             都不是必填——沒填就是沒填，支付方式沿用預設清單、匯率兩欄留空。 */
          payment_methods: pays,
          ...rateCols,
          settlement_mode: settleMode,
        })
        .select()
        .single();
      if (tripErr) throw tripErr;

      const memberRows = submitMembers
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
        /* 「都轉給同一個人」在建立頁選的是還沒有 id 的成員——
           成員插入之後才把 key 換成真正的 id。 */
        const hubId = settleMode === 'hub'
          ? resolveHub(submitMembers.filter(m => m.name.trim()), createdMembers ?? [])
          : null;
        if (hubId) await supabase.from('trips').update({ hub_member_id: hubId }).eq('id', trip.id);
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
  /* 必填四項（Rozi 2026-09-06 指定，只有這四個）：
     這趟叫什麼？／誰一起去？／當地幣別／出發。
     「回程」不擋（不填就是當天來回），「這趟怎麼結算？」也不擋（預設誰欠誰就轉給誰）。
     **一次只跳第一個**，不要同時把四個欄位都標紅。 */
  function validate(list: MemberEntry[]) {
    const errs: Record<string, string> = {};
    if (!name.trim())      errs.name      = '這欄還沒填喔';
    if (!currency)         errs.currency  = '這欄還沒填喔';
    if (!startDate)        errs.startDate = '這欄還沒填喔';
    if (list.filter(m => m.name.trim()).length === 0) errs.members = '至少要有一位成員';
    setErrors(errs);
    /* 捲到第一個沒填的欄位並把焦點放進去——不然按了「出發！」什麼都不會發生，
       而沒填的那一欄可能在摺線以下，使用者根本看不到紅字。
       順序照畫面由上到下。jsdom 沒實作 scrollIntoView，多一個 ?. 讓測試不要噴。 */
    const first = (['name', 'currency', 'startDate', 'members'] as const).find(k => errs[k]);
    if (first) {
      const el = { name: nameRef, currency: currencyBtnRef, startDate: startRef, members: memberAddRef }[first].current;
      el?.scrollIntoView?.({ block: 'center' });
      el?.focus?.();
    }
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    /* 「加一個人」欄位裡打了名字、但還沒按「加進來」就直接送出——
       名字明明在畫面上，卻報「至少要有一位成員」。先把它收進來再驗。
       （「加進來」那顆在摺線以下，要捲才看得到，使用者不會知道要按。） */
    const pending = newMemberName.trim();
    const list = pending
      ? [...members, { key: newKey(), emoji: newMemberEmoji, name: pending.slice(0, 10) }]
      : members;
    if (pending) {
      setMembers(list);
      setNewMemberName('');
      setNewMemberEmoji('');
    }
    /* mutation 讀的是 state，這一輪還沒更新——所以把有效清單傳進去 */
    if (validate(list)) mutation.mutate(list);
  }

  // ── Member helpers ────────────────────────────────────────────────────────────
  function addMember() {
    if (!newMemberName.trim()) return;
    setMembers(prev => [...prev, { key: newKey(), emoji: newMemberEmoji, name: newMemberName.trim().slice(0, 10) }]);
    /* 加進來了就把「至少要有一位成員」清掉——跟其他欄位一樣在 onChange 時清，
       不然人已經在畫面上了紅字還掛著。 */
    setErrors(e => ({ ...e, members: '' }));
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


            {/* S-02b-14　行程名稱。**兩頁同一個名字**「這趟叫什麼？」
                （Rozi 2026-09-06：「編輯行程的介面應該跟建立新行程的欄位一致」——
                同一個欄位在兩頁叫兩個名字，是最容易讓人以為在改不同東西的寫法）。
                頁面標題不動：建立頁維持「這趟去哪？」、編輯頁維持「編輯行程」。 */}
            <div className="mb-5">
              <label className="block text-sub font-bold text-md tracking-wide mb-2 req">
                這趟叫什麼？
              </label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(ev => ({ ...ev, name: '' })); }}
                placeholder="例如：沖繩四人行 ☀️"
                className="w-full px-[14px] bg-white rounded-base border-[1.5px] border-[#E4DFD9] text-input text-ink placeholder-gr outline-none focus:border-w transition-colors"
              />
              {errors.name && <p className="text-tag text-out mt-1">{errors.name}</p>}
            </div>

            {/* 幣別與出發／回程**編輯頁也要有**（Rozi 2026-09-06）——
                「我就是要修改在這個行程設定上的欄位」。兩頁共用同一段 JSX，
                不是各寫一份：日期欄的 iOS 塌陷已經修過三次，分成兩份就是第四次。 */}

            {/* Currency */}
            <div className="mb-5">
              <label className="block text-sub font-bold text-md tracking-wide mb-2 req">當地幣別</label>
              <button
                ref={currencyBtnRef}
                onClick={() => setShowCurrency(v => {
                  /* 使用者真的要搜尋時才聚焦——不用 autofocus */
                  if (!v) requestAnimationFrame(() => currencyInputRef.current?.focus());
                  return !v;
                })}
                className="fieldh w-full px-[14px] bg-white rounded-base border-[1.5px] border-[#E4DFD9] text-left text-input text-ink flex items-center justify-between"
              >
                <span>{currency}</span>
                <span className="text-gr text-sm">▾</span>
              </button>
              {errors.currency && <p className="text-tag text-out mt-1">{errors.currency}</p>}
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
                      className="w-full px-3 bg-[#F5F4F2] rounded-base text-sm outline-none"
                    />
                  </div>
                  {filteredCurrencies.map(c => (
                    <button
                      key={c.code}
                      onClick={() => {
                        setCurrency(c.code);
                        setErrors(ev => ({ ...ev, currency: '' }));
                        /* 換幣別**不再動那兩欄**——「1」現在是跟著使用者輸入自動補的，
                           不是依幣別預先擺好的，所以沒有「換邊」這回事。 */
                        setShowCurrency(false); setCurrencySearch('');
                      }}
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
                <label className="lbl req">出發</label>
                <span className="datefield">
                  <input
                    ref={startRef}
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

            {/* Members */}
            <div className="mb-5">
              <label className="block text-sub font-bold text-md tracking-wide mb-1 req">誰一起去？</label>
              {!isEdit && prefill && members.length > 0 && (
                <p className="text-tag text-w mb-3 -mt-2">
                  已帶入原本那趟的成員與幣別，可以改
                </p>
              )}

              <div className="flex flex-col gap-2">
                {members.map((m, i) => {
                  const used = m.id ? (memberUsage[m.id] ?? 0) : 0;
                  return (
                  <div key={m.key} className="rowb">
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
                      /* tap44：24×24 的圖形不變，用透明 ::after 把可點區撐到 44×44。
                         ⚠️ 不要放大 ✕ 本身，也不要把 border box 撐大——那會把同一列的內容擠掉。 */
                      className={`tap44 text-sm ml-1 w-6 h-6 flex items-center justify-center ${used > 0 ? 'text-[#D8D2CC] cursor-not-allowed' : 'text-gr'}`}
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
                  {/* 原型 S-02-15（`Tripay_原型.html:1207–1213`）這一塊**只有**
                      標題＋名字輸入框＋取消／加進來，**沒有頭像**。
                      盤點表也寫「emoji 選擇鈕要拿掉」，當初做成「升級為就地編輯留在原地」是反了。
                      新成員 emoji 恆為空，加進來之後在成員列由 Avatar 的第二層
                      （名字第一個字＋填色圓底）顯示。 */}
                  <input
                    ref={addMemberInputRef}
                    type="text"
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value.slice(0, 10))}
                    onKeyDown={e => e.key === 'Enter' && addMember()}
                    placeholder="叫什麼名字？"
                    className="w-full px-3 bg-[#F5F4F2] rounded-base text-body text-ink outline-none mb-3"
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
                  ref={memberAddRef}
                  onClick={() => setAddingMember(true)}
                  className="mt-3 w-full h-11 rounded-base border-[1.5px] border-dashed border-[#C8BFB8] text-md text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Icon name="add" size={16} /> 新增成員
                </button>
              )}
            </div>

            {/* 這三塊**建立頁也要有**（Rozi 2026-09-06 裁示，三塊都顯示、都不是必填）。
                版位照依賴關係：選中心人要先有成員，所以排在「誰一起去？」之後。 */}
            <>
              <SettleMode
                mode={settleMode}
                hubMember={hubMember}
                /* 建立頁的成員還沒有資料庫 id，用畫面 key 當識別，存檔時再換成真 id */
                members={members.filter(m => m.name.trim()).map(m => ({ id: m.key, name: m.name, emoji: m.emoji }))}
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
                value={rate.n}
                dir={rate.dir}
                onChange={v => setRate(r => nextRate(r, currency, v))}
                onFlip={() => setRate(flipRate)}
              />
            </>
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
