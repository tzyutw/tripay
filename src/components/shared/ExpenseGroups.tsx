/* 消費列與日期分組：**S-03 與分享頁共用同一套產生邏輯**。
   分享頁是唯讀——列渲染成 <div> 而不是 <button>，其餘結構完全相同。
   排序（#33-1）：由新到舊，最後一天在最上、「出發前」沉到最底；
   同一天之內依「記錄的時間」由新到舊——不然今天剛記的那一筆要滑到最下面才看得到。
   **只改顯示順序，不動任何計算。**
   逐字對齊 Tripay_原型.html 的 expenseGroups()／expenseRow()。 */
import { money, dayLabel, memberLabel } from '@/lib/format';
import type { SharedSummary, SharedExpense, SharedCalc, MoneyOpts } from './types';

export interface ExpenseRowProps {
  e: SharedExpense;
  c: SharedCalc;
  S: SharedSummary;
  readonly?: boolean;
  money?: MoneyOpts;
  onEdit?: (id: string) => void;
}

export function ExpenseRow({ e, c, S, readonly, money: mo, onEdit }: ExpenseRowProps) {
  const t = S.t;
  const payer = t.members.find(m => m.id === e.payer);

  const badges: React.ReactNode[] = [];
  if (e.type === 'individual') badges.push(<span className="pill ind" key="ind">各付各的</span>);
  if (e.type === 'single' && e.parts?.[0]) {
    const who = t.members.find(m => m.id === e.parts![0])?.name ?? '';
    badges.push(<span className="pill gr" key="single">只算 {who}</span>);
  }
  if (e.onSpot) badges.push(<span className="pill gr" key="spot">當場就清了</span>);
  if (e.sponsor) badges.push(<span className="pill ind" key="spon">贊助回饋</span>);

  /* §5.4：整筆未定 → 橘紅左邊框＋「還沒填」，不再有「待補填」badge */
  const pend = c.twdPending;
  const approx = !pend && Object.keys(c.estimated).length > 0;

  /* #22-3：贊助是負額共同項，金額顯示負數並用收款綠，與一般支出區隔 */
  const amt = pend
    ? <span style={{ color: 'var(--out)' }}>還沒填</span>
    : e.sponsor
      ? <span className="money" style={{ color: 'var(--in)' }}>−{money(c.twdTotal, mo)}</span>
      : <>{approx && <i className="approx">約</i>}<span className="money">{money(c.twdTotal, mo)}</span></>;

  const inner = (
    <>
      <span className="ic">{e.emoji}</span>
      <span className="mid">
        <span className="t">{e.title}</span>
        <span className="s">{payer ? memberLabel(payer) : ''} {badges}</span>
      </span>
      <span className="a">{amt}</span>
    </>
  );

  const cls = `exprow${pend ? ' pend' : ''}`;
  return readonly
    ? <div className={cls}>{inner}</div>
    : <button className={cls} onClick={() => onEdit?.(e.id)}>{inner}</button>;
}

export interface ExpenseGroupsProps {
  S: SharedSummary;
  readonly?: boolean;
  money?: MoneyOpts;
  onEdit?: (id: string) => void;
}

export default function ExpenseGroups({ S, readonly, money: mo, onEdit }: ExpenseGroupsProps) {
  const t = S.t;
  const groups = new Map<string, SharedExpense[]>();
  [...S.list]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created ?? 0) - (a.created ?? 0))
    .forEach(e => {
      const k = dayLabel(t.start, e.date);
      const arr = groups.get(k);
      arr ? arr.push(e) : groups.set(k, [e]);
    });

  return (
    <>
      {[...groups.entries()].map(([label, arr]) => (
        <div key={label}>
          <div className="sec">{label}</div>
          {arr.map(e => (
            <ExpenseRow key={e.id} e={e} c={S.calcOf(e)} S={S} readonly={readonly} money={mo} onEdit={onEdit} />
          ))}
        </div>
      ))}
    </>
  );
}
