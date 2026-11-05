/* 後台-A／B／E　把快照整理成畫面要的形狀。純函式，單元測試直接打。 */
import { deriveDisplayStatus, STATUS_LABEL } from '@/lib/deriveStatus';
import type { ExpenseWithSplits, TripMember, TripWithMembers, DisplayStatus } from '@/types/database';
import { checkTripHealth, countProblems, type HealthIssue } from './health';
import type { ConfirmedSettlement } from './settlementView';

export interface ModelUser {
  id: string;
  email: string | null;
  display_name: string | null;
  last_active_at: string | null;
  last_sign_in_at: string | null;
}

export interface ModelTrip<T extends TripWithMembers = TripWithMembers> {
  trip: T & { last_activity_at?: string | null; recent_error_count?: number; deleted_expense_count?: number };
  status: DisplayStatus;
  statusLabel: string;
  members: TripMember[];
  expenses: ExpenseWithSplits[];
  confirmed: ConfirmedSettlement | null;
  health: HealthIssue[];
  problemCount: number;
  /** 紅點上的數字＝資料問題 ＋ 近 7 天的錯誤紀錄 */
  anomalyCount: number;
}

/** 這位成員綁的是哪個帳號。三個來源任一：user_id、linked_profile_id、行程擁有者本人那一列 */
export function boundUserId(m: TripMember, trip: Pick<TripWithMembers, 'owner_id' | 'owner_member_id'>): string | null {
  return m.user_id ?? m.linked_profile_id ?? (m.id === trip.owner_member_id ? trip.owner_id : null);
}

export function buildTrips<T extends TripWithMembers>(
  trips: (T & { recent_error_count?: number })[],
  expenses: ExpenseWithSplits[],
  settlements: ConfirmedSettlement[],
): ModelTrip<T>[] {
  const byTrip = new Map<string, ExpenseWithSplits[]>();
  for (const e of expenses) {
    const a = byTrip.get(e.trip_id) ?? [];
    a.push(e); byTrip.set(e.trip_id, a);
  }
  /* 與結算頁同一個查法：這趟**最新一次**已確認的結算 */
  const latest = new Map<string, ConfirmedSettlement>();
  for (const s of settlements) {
    if (s.status !== 'confirmed') continue;
    const cur = latest.get(s.trip_id);
    if (!cur || s.created_at > cur.created_at) latest.set(s.trip_id, s);
  }
  const out = trips.map(trip => {
    const ex = byTrip.get(trip.id) ?? [];
    const health = checkTripHealth(trip, ex);
    const problemCount = countProblems(health);
    const status = deriveDisplayStatus(trip);
    return {
      trip, status, statusLabel: STATUS_LABEL[status],
      members: [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order),
      expenses: ex, confirmed: latest.get(trip.id) ?? null,
      health, problemCount,
      anomalyCount: problemCount + (trip.recent_error_count ?? 0),
    };
  });
  return out;
}

/** 總覽的排序：有異常的在最上面（越多越上面），其餘依最後動作時間由新到舊 */
export function sortForOverview<T extends TripWithMembers>(rows: ModelTrip<T>[]): ModelTrip<T>[] {
  return [...rows].sort((a, b) => {
    const aa = a.anomalyCount > 0 ? 1 : 0, bb = b.anomalyCount > 0 ? 1 : 0;
    if (aa !== bb) return bb - aa;
    if (aa && a.anomalyCount !== b.anomalyCount) return b.anomalyCount - a.anomalyCount;
    const ta = a.trip.last_activity_at ?? a.trip.updated_at ?? '';
    const tb = b.trip.last_activity_at ?? b.trip.updated_at ?? '';
    return ta < tb ? 1 : ta > tb ? -1 : 0;
  });
}

/** 一位帳號參加的行程：自己建立的，或在成員名單裡綁了這個帳號的 */
export function tripsOfUser<T extends TripWithMembers>(rows: ModelTrip<T>[], userId: string): ModelTrip<T>[] {
  return rows.filter(r => r.trip.owner_id === userId
    || r.members.some(m => boundUserId(m, r.trip) === userId));
}

/** 一位成員在這趟「有關」的帳目：他付的、有分到的、或他記的 */
export function involves(e: ExpenseWithSplits, memberId: string, userId: string | null): boolean {
  if (e.payer_member_id === memberId) return true;
  if (e.individual_member_id === memberId) return true;
  if (userId && e.created_by === userId) return true;
  return (e.expense_splits ?? []).some(s => s.member_id === memberId && s.is_participating);
}

/** 這一筆是誰記的。產品現況是**只有行程建立者能記帳**（旅伴只能透過分享連結唯讀查看），
 *  所以資料裡沒有記錄者、或記錄者不是任何已知帳號時，就是行程建立者。 */
export function recorderOf(
  e: Pick<ExpenseWithSplits, 'created_by'>,
  trip: Pick<TripWithMembers, 'owner_id'>,
  knownUser: (id: string) => boolean,
): string {
  return e.created_by && knownUser(e.created_by) ? e.created_by : trip.owner_id;
}

/** 一個登入帳號的統計：建了哪些行程、記了幾筆 */
export function accountStats<T extends TripWithMembers>(
  rows: ModelTrip<T>[], userId: string, knownUser: (id: string) => boolean,
): { created: ModelTrip<T>[]; joined: ModelTrip<T>[]; recorded: number } {
  const created = rows.filter(r => r.trip.owner_id === userId);
  const joined = tripsOfUser(rows, userId).filter(r => r.trip.owner_id !== userId);
  let recorded = 0;
  for (const r of rows) for (const e of r.expenses)
    if (recorderOf(e, r.trip, knownUser) === userId) recorded += 1;
  return { created, joined, recorded };
}

/** 時間：11/5 14:03（不同年才帶年份），一律台灣時間 */
export function fmtTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const y = g('year');
  const nowY = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric' })
    .formatToParts(now).find(p => p.type === 'year')?.value;
  return `${y !== nowY ? `${y}/` : ''}${g('month')}/${g('day')} ${g('hour')}:${g('minute')}`;
}

/** 多久以前：剛剛／5 分鐘前／3 小時前／2 天前；超過 30 天就只給日期 */
export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '沒有紀錄';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '沒有紀錄';
  const s = Math.max(0, (now.getTime() - t) / 1000);
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return fmtTime(iso, now);
}
