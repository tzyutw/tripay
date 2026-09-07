/* 消費列與日期分組：**S-03 與分享頁共用同一套產生邏輯**。
   分享頁是唯讀——列渲染成 <div> 而不是 <button>，其餘結構完全相同。
   排序（#33-1）：由新到舊，最後一天在最上、「出發前」沉到最底；
   同一天之內依「記錄的時間」由新到舊——不然今天剛記的那一筆要滑到最下面才看得到。
   **只改顯示順序，不動任何計算。**
   逐字對齊 Tripay_原型.html 的 expenseGroups()／expenseRow()。 */
import { money, dayLabel } from '@/lib/format';
import type { SharedSummary, SharedExpense, SharedCalc, MoneyOpts } from './types';
import { MemberTag } from './Avatar';

export interface ExpenseRowProps {
  e: SharedExpense;
  c: SharedCalc;
  S: SharedSummary;
  readonly?: boolean;
  /** 唯讀時點下去要說一句話。**不傳就維持現在的 `<div>`**——
   *  分享頁不傳，行為一個字都不變。 */
  onReadonlyTap?: (id: string) => void;
  money?: MoneyOpts;
  onEdit?: (id: string) => void;
}

export function ExpenseRow({ e, c, S, readonly, money: mo, onEdit, onReadonlyTap }: ExpenseRowProps) {
  const t = S.t;
  const payer = t.members.find(m => m.id === e.payer);

  const badges: React.ReactNode[] = [];
  if (e.type === 'individual') badges.push(<span className="pill ind" key="ind">各付各的</span>);

  /* 「只算一個人」涵蓋兩種語意完全不同的情況，先前畫面上長得一樣：
       付款人＝被算的人 → 自己買自己付，**不產生任何債務**
       付款人≠被算的人 → 有人幫他墊了，**他要還錢**——而這正是最容易忘記的一種
     歷史資料的 `personal` 也歸在第一類（自己的購物，不進結算）。
     樣式一律 `pill gr`（灰）：這類佔舊行程約三分之一（東京 44%、福岡 34%），
     用強調色會變成滿頁雜訊。 */
  if (e.type === 'single' && e.parts?.[0]) {
    const target = e.parts[0];
    if (e.payer === target) {
      badges.push(<span className="pill gr" key="own">自己的</span>);
    } else {
      const who = t.members.find(m => m.id === target)?.name ?? '';
      badges.push(<span className="pill gr" key="single">只算 {who}</span>);
    }
  } else if (e.personal) {
    badges.push(<span className="pill gr" key="own">自己的</span>);
  }
  if (e.onSpot) badges.push(<span className="pill gr" key="spot">當場就清了</span>);
  if (e.sponsor) badges.push(<span className="pill ind" key="spon">贊助回饋</span>);

  /* §5.4：整筆未定 → 橘紅左邊框＋「還沒填」，不再有「待補填」badge */
  const pend = c.twdPending;
  const approx = !pend && Object.keys(c.estimated).length > 0;

  /* #22-3：贊助是負額共同項，金額顯示負數並用收款綠，與一般支出區隔 */
  /* 🔴 實作-T-7　外幣視角下，**使用者自己填過的外幣原樣顯示**，
     沒填過的才用台幣 × 匯率回推——而且回推的要標「約」，讓她一眼分得出
     哪些是她填的、哪些是系統算的。台幣視角完全不受影響（`mo.sym` 是 undefined）。 */
  const ownFor = mo?.sym && c.forTotalEff != null && c.forTotalAuto === false
    ? c.forTotalEff : null;
  const backCalc = Boolean(mo?.sym) && ownFor == null;
  const mo2 = ownFor != null ? { ...mo, raw: ownFor } : mo;
  const amt = pend
    ? <span style={{ color: 'var(--out)' }}>還沒填</span>
    : e.sponsor
      ? <span className="money" style={{ color: 'var(--in)' }}>−{money(c.twdTotal, mo2)}</span>
      : <>{(approx || backCalc) && <i className="approx">約</i>}
          <span className="money">{money(c.twdTotal, mo2)}</span></>;

  const inner = (
    <>
      <span className="ic">{e.emoji}</span>
      <span className="mid">
        <span className="t">{e.title}</span>
        <span className="s">
          {/* 識別位，不是句子——圓底要看得見 */}
          <MemberTag m={payer} index={t.members.findIndex(m => m.id === e.payer)} />
          {badges}
        </span>
      </span>
      <span className="a">{amt}</span>
    </>
  );

  /* 🔴 實作-U-6　§5.4 原本只定義兩種狀態（整筆未定 → 橘紅左框；各自金額
     `is_estimated` → 加「約」）。**「藥局」是第三種**：整筆台幣有填（所以不是整筆未定），
     但各自金額算不出來——`calc()` 因為 `noAutoReason` 而不標 `estimated`，
     所以也拿不到「約」。**兩種樣式都套不上，於是它看起來完全正常。**
     Rozi：「我在這麼多筆消費紀錄裡，看不出來哪一些還需要再做調整。」
     沿用既有的橘紅左框（不新做一套顏色）；金額欄照常顯示台幣總額——
     那個數字是真的，寫「還沒填」會是假的。
     已結算／已封存維持 §5.6：不顯示這個標記。 */
  const parts0 = e.parts ?? [];
  const cantSplit = !pend && !S.readonly && parts0.length > 0
    && parts0.every(id => c.shares?.[id] == null);
  const cls = `exprow${pend || cantSplit ? ' pend' : ''}`;
  /* 封存態的列**維持不可編輯**（決策 B），但點下去要有話講——
     現在完全沒反應，跟壞掉分不出來。 */
  if (readonly)
    return onReadonlyTap
      ? <button className={cls} onClick={() => onReadonlyTap(e.id)}>{inner}</button>
      : <div className={cls}>{inner}</div>;
  return <button className={cls} onClick={() => onEdit?.(e.id)}>{inner}</button>;
}

export interface ExpenseGroupsProps {
  S: SharedSummary;
  readonly?: boolean;
  onReadonlyTap?: (id: string) => void;
  money?: MoneyOpts;
  onEdit?: (id: string) => void;
}

export default function ExpenseGroups({ S, readonly, money: mo, onEdit, onReadonlyTap }: ExpenseGroupsProps) {
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
            <ExpenseRow key={e.id} e={e} c={S.calcOf(e)} S={S} readonly={readonly}
              money={mo} onEdit={onEdit} onReadonlyTap={onReadonlyTap} />
          ))}
        </div>
      ))}
    </>
  );
}
