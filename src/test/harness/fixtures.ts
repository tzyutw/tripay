/* 實作-C-3　版面回歸用的假資料：**與 fixtures/screens.json 同源的那一組**
 * （原型的 demoExpenses()）。版面測試量的是真實元件配真實 CSS，
 * 所以資料也要是真實形狀，不能用一兩筆敷衍——短內容量不出溢出。 */
import type { Trip, TripMember, ExpenseWithSplits } from '@/types/database';

export const M = ['m0', 'm1', 'm2', 'm3'];

/* ⚠️ 這個檔會被 push 到**公開的** GitHub，所以不放 Rozi 的真實成員名與真實金額。
   用中性英文短名——**要對齊的是「狀態」，不是「名字」**；
   名字只需維持「英文短名」這個字寬特性（中文名與英文名渲染寬度不同，會影響版面斷言）。 */
const NAMES = ['Alex', 'Robin', 'Sam', 'Kai'];
const EMOJI = ['🐵', '🐱', '🍋', '🐟'];

function mkMembers(withEmoji: boolean): TripMember[] {
  return NAMES.map((name, i) => ({
    id: M[i], trip_id: 't1', name, emoji: withEmoji ? EMOJI[i] : '', sort_order: i,
    linked_profile_id: null, person_id: null, user_id: null, role: null,
    created_at: '2026-03-01',
  })) as TripMember[];
}

/**
 * `?members=noemoji` 時所有成員都沒有 emoji。
 *
 * **為什麼要有這個模式**：原本的假資料清一色有 emoji，
 * 所以 Avatar 的第二層（名字第一個字＋填色圓底）**從來沒被測到過**——
 * Rozi 在手機上反覆回報「沒有填色圓底」，而版面回歸 263 條全綠。
 * 假資料只走 happy path，等於那條路沒有人守。
 */
const Q = new URLSearchParams(location.search);

/**
 * 實作-K　把假資料切成 Rozi 真實資料的**形狀**。
 *
 * 她每天會打開的三趟：成員全部沒有 emoji、0 筆消費、
 * 其中一趟匯率只填了外幣那一邊、支付方式有自訂的第三項。
 * **原本的假資料一項都不符合**——所以那些路徑從來沒被測到，
 * 而她連續三批回報的問題，版面回歸 263 條全綠。
 *
 * 預設值一律維持現況，不影響既有斷言。
 */
export const membersHaveEmoji = Q.get('members') !== 'noemoji';
/** `?expenses=none`：一趟還沒記過帳的行程 */
export const noExpenses = Q.get('expenses') === 'none';
/** `?rate=half`：匯率只填了外幣那一邊（換算不出台幣） */
export const halfRate = Q.get('rate') === 'half';
/** `?pays=none`：支付方式還沒設定 */
export const noPays = Q.get('pays') === 'none';

export const members: TripMember[] = mkMembers(membersHaveEmoji);

export const trip = {
  id: 't1', owner_id: 'u1', name: '2026 濟州島四寶團', emoji: '✈️', currency: 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: M[0], collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: noPays ? null : ['現金', '信用卡', 'Linepay'],
  cash_rate_twd: null,
  cash_rate_foreign: halfRate ? 0.19 : null,
  tone_seq: 0, created_at: '2026-03-01', updated_at: '2026-03-01',
  trip_members: members,
} as unknown as Trip & { trip_members: TripMember[] };

let seq = 0;
function mk(o: Record<string, unknown>): ExpenseWithSplits {
  seq += 1;
  const parts = (o.parts as string[]) ?? M;
  const indiv = (o.indiv as Record<string, number>) ?? {};
  return {
    id: `e${seq}`, trip_id: 't1', created_by: 'u1', title: '', category_emoji: '➕',
    expense_date: '2026-03-14', foreign_amount: null, twd_amount: null, exchange_rate: null,
    foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false,
    split_fill_currency: 'TWD', individual_member_id: null, payment_label: null,
    category_emoji_manual: false, updated_by: null, card_id: null, deleted_at: null,
    created_at: new Date(2026, 0, seq).toISOString(), updated_at: '2026-03-01',
    ...o,
    expense_splits: parts.map(id => ({
      id: `s${seq}-${id}`, expense_id: `e${seq}`, member_id: id, is_participating: true,
      split_amount: indiv[id] ?? null, split_amount_foreign: null,
      split_pending: !(id in indiv), created_at: '2026-03-01',
    })),
  } as unknown as ExpenseWithSplits;
}

export const expenses: ExpenseWithSplits[] = [
  mk({ title: '機票 ×4', category_emoji: '✈️', expense_date: '2026-02-10',
       twd_amount: 28400, payment_method: 'credit_card', payer_member_id: M[0] }),
  mk({ title: '黑豬肉晚餐', category_emoji: '🍜', expense_date: '2026-03-14',
       foreign_amount: 108000, twd_amount: 2480, payment_method: 'credit_card', payer_member_id: M[2] }),
  mk({ title: '藥妝店', category_emoji: '🛍️', expense_date: '2026-03-15',
       foreign_amount: 45000, twd_amount: 1035, payment_method: 'credit_card',
       expense_type: 'individual', indiv: { [M[0]]: 12000, [M[1]]: 18000 }, payer_member_id: M[1] }),
  mk({ title: '城山日出峰門票', category_emoji: '🎡', expense_date: '2026-03-15',
       foreign_amount: 20000, payer_member_id: M[3] }),
  mk({ title: '紀念品', category_emoji: '🛍️', expense_date: '2026-03-16',
       twd_amount: 860, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[1] }),
  mk({ title: '機場接送', category_emoji: '🚌', expense_date: '2026-03-18',
       twd_amount: 1600, payer_member_id: M[0], settled_on_spot: true }),
  mk({ title: '計程車', category_emoji: '🚕', expense_date: '2026-03-16', payer_member_id: M[0] }),
  mk({ title: '爸爸贊助', category_emoji: '💝', expense_date: '2026-03-14',
       twd_amount: 50000, payer_member_id: M[0], is_sponsor: true }),
];

export const settlementItems = [
  { id: 'i1', from_member_id: M[3], to_member_id: M[0], amount: 20220, is_cleared: true },
  { id: 'i2', from_member_id: M[2], to_member_id: M[0], amount: 17740, is_cleared: false },
  { id: 'i3', from_member_id: M[1], to_member_id: M[0], amount: 8220,  is_cleared: false },
];
