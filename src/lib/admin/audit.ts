/* 後台-C　操作紀錄 → 給人看的一句話＋改前改後。
 *
 * 資料庫存的是整列的改前／改後（`audit_log.old_row`／`new_row`），
 * 這裡負責翻譯成「誰、什麼時間、改了什麼」。
 *
 * 分帳（expense_splits）的特性：前台每存一次帳目，是「刪掉這筆的所有分帳列、
 * 再全部重新新增」——逐列列出來會變成一大串沒意義的刪除＋新增。
 * 所以同一個人、同一筆帳目、60 秒內的分帳變動**合併成一條**，
 * 只講實際差別（誰被加進來、誰被拿掉、誰的金額變了）。
 */
import type { Json } from '@/types/database';

export interface AuditRow {
  id: number;
  at: string;
  actor: string | null;
  table_name: 'expenses' | 'expense_splits' | 'trip_members' | string;
  op: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  row_id: string | null;
  trip_id: string | null;
  expense_id: string | null;
  old_row: Record<string, Json> | null;
  new_row: Record<string, Json> | null;
}

export interface AuditEntry {
  key: string;
  at: string;
  actor: string | null;
  tripId: string | null;
  expenseId: string | null;
  /** 新增／修改／刪除／復原 */
  action: '新增' | '修改' | '刪除' | '復原';
  /** 帳目／分帳／成員 */
  target: '帳目' | '分帳' | '成員';
  /** 哪一筆（品項或成員名） */
  title: string;
  /** 改前 → 改後，一行一欄 */
  changes: { field: string; before: string; after: string }[];
}

export interface AuditContext {
  /** member id → 名字（含已刪除成員：從紀錄本身補） */
  memberName: (id: string) => string;
  /** expense id → 品項（帳目被刪掉後從紀錄本身補） */
  expenseTitle: (id: string) => string | null;
  /** trip id → 幣別 */
  currencyOf: (tripId: string | null) => string;
}

const PAY: Record<string, string> = { cash: '現金', credit_card: '信用卡', stored_value: '儲值卡' };
const TYPE: Record<string, string> = { shared: '一起分', individual: '各付各的', personal: '自己的' };

export function payLabel(method: string | null | undefined, label?: string | null): string {
  if (label) return label;
  return method ? (PAY[method] ?? method) : '—';
}

const num = (v: Json | undefined) =>
  v == null || v === '' ? '（空）' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const bool = (v: Json | undefined) => (v ? '是' : '否');
const str = (v: Json | undefined) => (v == null || v === '' ? '（空）' : String(v));

/** 帳目欄位的中文名與顯示方式。沒列在這裡的欄位（updated_at 之類）不顯示。 */
function expenseFields(ctx: AuditContext, cur: string): [string, string, (v: Json | undefined) => string][] {
  const member = (v: Json | undefined) => (v ? ctx.memberName(String(v)) : '（無）');
  return [
    ['title', '品項', str],
    ['expense_date', '日期', str],
    ['twd_amount', '台幣金額', num],
    ['foreign_amount', `外幣金額（${cur}）`, num],
    ['payer_member_id', '誰付的', member],
    ['payment_method', '付款方式', v => payLabel(v as string)],
    ['payment_label', '付款方式（自訂）', str],
    ['expense_type', '分法', v => TYPE[String(v)] ?? str(v)],
    ['individual_member_id', '只算一個人', member],
    ['split_fill_currency', '各自金額用哪種幣填', v => (v === 'FOR' ? '外幣' : '台幣')],
    ['settled_on_spot', '當場就清了', bool],
    ['is_sponsor', '贊助', bool],
    ['category_emoji', '類別', str],
    ['note', '備註', str],
    ['exchange_rate', '匯率', num],
  ];
}

function diffExpense(o: Record<string, Json>, n: Record<string, Json>, ctx: AuditContext, cur: string) {
  const out: AuditEntry['changes'] = [];
  for (const [k, label, show] of expenseFields(ctx, cur)) {
    if (JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null))
      out.push({ field: label, before: show(o[k]), after: show(n[k]) });
  }
  return out;
}

/** 一筆分帳列 → 「參與／金額」的描述 */
function splitValue(r: Record<string, Json> | undefined, cur: string): string {
  if (!r || !r.is_participating) return '沒分';
  const parts: string[] = [];
  if (r.split_amount != null) parts.push(`$${num(r.split_amount)}`);
  if (r.split_amount_foreign != null) parts.push(`${cur} ${num(r.split_amount_foreign)}`);
  return parts.length ? `有分 ${parts.join(' / ')}` : '有分';
}

const WINDOW_MS = 60_000;

/** 依時間由新到舊。輸入不需要排序。 */
export function describeAudit(rows: AuditRow[], ctx: AuditContext): AuditEntry[] {
  const sorted = [...rows].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id));
  const out: AuditEntry[] = [];

  /* 分帳先分組：同一人＋同一筆帳目＋與上一列相隔不到 60 秒 */
  type Group = { rows: AuditRow[]; last: number };
  const open = new Map<string, Group>();
  const groups: Group[] = [];

  for (const r of sorted) {
    if (r.table_name !== 'expense_splits') continue;
    const k = `${r.actor}|${r.expense_id}`;
    const t = Date.parse(r.at);
    const g = open.get(k);
    if (g && t - g.last <= WINDOW_MS) { g.rows.push(r); g.last = t; }
    else { const ng = { rows: [r], last: t }; open.set(k, ng); groups.push(ng); }
  }

  for (const r of sorted) {
    const cur = ctx.currencyOf(r.trip_id);
    const o = r.old_row ?? {}, n = r.new_row ?? {};
    if (r.table_name === 'expenses') {
      const title = String((n.title ?? o.title) ?? '（沒有品項名稱）');
      const base = { key: `a${r.id}`, at: r.at, actor: r.actor, tripId: r.trip_id,
                     expenseId: r.row_id, target: '帳目' as const, title };
      if (r.op === 'INSERT') {
        out.push({ ...base, action: '新增', changes: diffExpense({}, n, ctx, cur)
          .filter(c => c.after !== '（空）' && c.after !== '否') });
      } else if (r.op === 'DELETE') {
        out.push({ ...base, action: '刪除', changes: [{ field: '狀態', before: '存在', after: '永久刪除' }] });
      } else {
        const wasDel = o.deleted_at != null, isDel = n.deleted_at != null;
        if (!wasDel && isDel) out.push({ ...base, action: '刪除', changes: [] });
        else if (wasDel && !isDel) out.push({ ...base, action: '復原', changes: [] });
        else {
          const changes = diffExpense(o, n, ctx, cur);
          if (changes.length) out.push({ ...base, action: '修改', changes });
        }
      }
    } else if (r.table_name === 'trip_members') {
      const title = String((n.name ?? o.name) ?? '（沒有名字）');
      const base = { key: `a${r.id}`, at: r.at, actor: r.actor, tripId: r.trip_id,
                     expenseId: null, target: '成員' as const, title };
      if (r.op === 'INSERT') out.push({ ...base, action: '新增', changes: [] });
      else if (r.op === 'DELETE') out.push({ ...base, action: '刪除', changes: [] });
      else {
        const changes: AuditEntry['changes'] = [];
        if (o.name !== n.name) changes.push({ field: '名字', before: str(o.name), after: str(n.name) });
        if (o.emoji !== n.emoji) changes.push({ field: 'emoji', before: str(o.emoji), after: str(n.emoji) });
        if (o.user_id !== n.user_id || o.linked_profile_id !== n.linked_profile_id)
          changes.push({ field: '綁定帳號',
            before: o.user_id || o.linked_profile_id ? '有' : '沒有',
            after:  n.user_id || n.linked_profile_id ? '有' : '沒有' });
        if (o.sort_order !== n.sort_order)
          changes.push({ field: '排序', before: str(o.sort_order), after: str(n.sort_order) });
        if (changes.length) out.push({ ...base, action: '修改', changes });
      }
    }
  }

  /* 分帳群組：比較「這一批之前」與「這一批之後」每個成員的狀態 */
  for (const g of groups) {
    const first = g.rows[0], last = g.rows[g.rows.length - 1];
    const cur = ctx.currencyOf(first.trip_id);
    const before = new Map<string, Record<string, Json>>();
    const after = new Map<string, Record<string, Json>>();
    /* 依時間重播：DELETE/UPDATE 的 old 是「之前」（只取第一次出現的）、
       INSERT/UPDATE 的 new 是「之後」（取最後一次） */
    for (const r of g.rows) {
      const mid = String((r.new_row?.member_id ?? r.old_row?.member_id) ?? '');
      if (r.old_row && !before.has(mid) && !after.has(mid)) before.set(mid, r.old_row);
      if (r.op === 'DELETE') after.delete(mid);
      else if (r.new_row) after.set(mid, r.new_row);
    }
    const ids = new Set([...before.keys(), ...after.keys()]);
    const changes: AuditEntry['changes'] = [];
    for (const id of ids) {
      const b = splitValue(before.get(id), cur), a = splitValue(after.get(id), cur);
      if (b !== a) changes.push({ field: ctx.memberName(id), before: b, after: a });
    }
    if (!changes.length) continue;     // 刪掉又加回一模一樣的：沒有實際變動
    const isNew = g.rows.every(r => r.op === 'INSERT');
    out.push({
      key: `s${first.id}`, at: last.at, actor: first.actor, tripId: first.trip_id,
      expenseId: first.expense_id, target: '分帳',
      action: isNew ? '新增' : '修改',
      title: (first.expense_id && ctx.expenseTitle(first.expense_id)) || '（已刪除的帳目）',
      changes,
    });
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.key.localeCompare(a.key)));
}

/** 從紀錄本身補出已刪除成員的名字、已刪除帳目的品項 */
export function namesFromAudit(rows: AuditRow[]) {
  const member = new Map<string, string>(), expense = new Map<string, string>();
  for (const r of rows) {
    const x = r.new_row ?? r.old_row;
    if (!x || !r.row_id) continue;
    if (r.table_name === 'trip_members' && x.name) member.set(r.row_id, String(x.name));
    if (r.table_name === 'expenses' && x.title) expense.set(r.row_id, String(x.title));
  }
  return { member, expense };
}
