/* 🔴 實作-W-3　`{名字} 的帳`：這個人的消費明細，分三段。
   **S-03 與分享頁共用這一份**——理由與 statCard()／expenseGroups()／transferView()
   相同：兩處分開寫，遲早會走鐘。原本這一段是寫死在 ExpenseListPage 裡的，
   分享頁要用就只能抄一份，所以搬出來。

   兩頁的差別只有三件事，全部走 prop，不分岔成兩套：
     ① 消費列能不能點（分享頁是 `<div>`，不得有任何編輯入口——驗收案例 A9）
     ② 付款人那一行的稱呼（自己那邊「你付的」；分享頁的觀看者不是任何一位成員，
        「你」指誰講不通，所以用「{名字}付的」）
     ③ 底部要不要掛東西（S-03 開著「只看共同的帳」時要掛摘要行）
*/
import { money } from '@/lib/format';
import type { SharedSummary, SharedExpense, MoneyOpts } from './types';

const SEGS = [
  { key: 'split', name: '跟大家平分的' },
  { key: 'each',  name: '各自付各的' },
  { key: 'mine',  name: '只算我的' },
] as const;

/** 每一筆歸到哪一段：只算一個人（參與者 1 位）→ 只算我的；
 *  各付各的 → 各自付各的；其餘（2 人以上一起分）→ 跟大家平分的。 */
function segOf(e: SharedExpense) {
  return e.type === 'single' || (e.parts ?? []).length === 1 ? 'mine'
       : e.type === 'individual' ? 'each' : 'split';
}

export interface MemberLedgerProps {
  S: SharedSummary;
  memberId: string;
  money?: MoneyOpts;
  /** 唯讀（分享頁）：列渲染成 `<div>`，點下去什麼都不會發生 */
  readonly?: boolean;
  /** 付款人那一行的稱呼。不給就是「你付的」（自己那一頁） */
  payerName?: string;
  onEdit?: (id: string) => void;
  onRowTap?: (id: string) => void;
  footer?: React.ReactNode;
}

export default function MemberLedger(
  { S, memberId, money: mo, readonly, payerName, onEdit, onRowTap, footer }: MemberLedgerProps,
) {
  const rowsOf = (key: string) => S.list
    .filter(e => (e.parts ?? []).includes(memberId) && segOf(e) === key)
    /* 🔴 實作-V-2　贊助那一筆在這裡符號相反、而且被算進小計。
       S-03 已經有正確的處理（`e.sponsor` → 負號＋收入色）。
       `爸爸贊助 50,000` 不是他「付了」50,000，所以也不顯示付款人那一行。
       ⚠️ 這裡只管**顯示**，不動 `per[]` 的算法（帳務語意要 Rozi 拍板）。 */
    .map(e => {
      const raw = S.calcOf(e).shares?.[memberId] ?? null;
      return { e, mine: raw == null ? null : (e.sponsor ? -raw : raw),
               paid: !e.sponsor && e.payer === memberId ? S.calcOf(e).twdTotal : null };
    });

  const any = SEGS.some(x => rowsOf(x.key).length);

  return (
    <>
      {SEGS.map(seg => {
        const rows = rowsOf(seg.key);
        /* 沒有那一段的人**整段不顯示**，不要顯示 0 */
        if (!rows.length) return null;
        const known = rows.filter(r => r.mine != null);
        const sum = known.reduce((a, r) => a + (r.mine as number), 0);
        return (
          <div key={seg.key} data-seg={seg.key} data-seg-n={rows.length}
            data-seg-sum={known.length ? sum : 0}>
            <div className="sec">
              <span>{seg.name}</span>
              <span className="secright">{rows.length} 筆　
                {/* 整段只有算不出來的筆時小計顯示「—」 */}
                {known.length ? money(sum, mo) : '—'}</span>
            </div>
            <div className="gap" style={{ margin: '0 14px' }}>
              {rows.map(({ e, mine, paid }) => {
                const inner = (
                  <>
                    <span className="ic">{e.emoji}</span>
                    <span className="mid">
                      <span className="t">{e.title}</span>
                      {/* 他同時是付款人時才出現這一行小字 */}
                      {paid != null &&
                        <span className="s">{payerName ? `${payerName}付的` : '你付的'} {money(paid, mo)}</span>}
                    </span>
                    <span className="a">
                      {mine == null
                        ? <span style={{ color: 'var(--out)' }}>還沒算清楚</span>
                        /* 贊助＝收入，與 S-03 同一套語彙：負號＋ --in */
                        : e.sponsor
                          ? <span className="money" style={{ color: 'var(--in)' }}>
                              −{money(-mine, mo)}</span>
                          : <span className="money">{money(mine, mo)}</span>}
                    </span>
                  </>
                );
                const attrs = {
                  className: 'exprow', 'data-exp-row': true, 'data-exp-id': e.id,
                  'data-mine': mine == null ? 'null' : String(mine),
                  ...(paid != null ? { 'data-paid': String(paid) } : {}),
                };
                /* 分享頁：`<div>`，沒有 onClick，點下去什麼都不會發生（A9） */
                return readonly
                  ? <div key={e.id} {...attrs}>{inner}</div>
                  : <button key={e.id} {...attrs}
                      onClick={() => (onRowTap ? onRowTap(e.id) : onEdit?.(e.id))}>{inner}</button>;
              })}
            </div>
          </div>
        );
      })}
      {!any && <div className="empty"><p>還沒有算到他頭上的消費。</p></div>}
      {footer}
    </>
  );
}
