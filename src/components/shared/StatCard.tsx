/* 統計卡：總花費（可展開）＋每人分擔列。**S-03 與 S-06 共用這一份。**
   理由與 TransferView 相同——兩處分開寫，遲早會走鐘。
   分享頁是唯讀：每人分擔列不可點（那裡沒有 S-03d 可以進，也不該讓外人進編輯視圖），
   註腳也不邀請點擊。 逐字對齊 Tripay_原型.html 的 statCard()。 */
import { Icon } from '@/components/Icon';
import { money, firstGrapheme } from '@/lib/format';
import type { SharedSummary, MoneyOpts } from './types';
import Avatar from './Avatar';

export interface StatCardProps {
  S: SharedSummary;
  open?: boolean;
  readonly?: boolean;
  money?: MoneyOpts;
  onToggleTotal?: () => void;
  onPickMember?: (memberId: string) => void;
}

/** 外幣視角的總花費要「原值優先」。`raw` 有值時 `money()` 就原樣顯示、不回推。 */
function totalOpts(S: SharedSummary, mo?: MoneyOpts): MoneyOpts | undefined {
  if (!mo?.sym || !mo.rate || !S.forTotalHasRaw) return mo;
  return { ...mo, raw: (S.forTotalRaw ?? 0) + Math.round((S.forTotalBackTwd ?? 0) * mo.rate) };
}

export function StatCardTotal({ S, open, money: mo, onToggleTotal }: StatCardProps) {
  /* 「約」看的是**行程狀態**（S.readonly：已結算／已封存就不再標約），
     不是 readonly prop——那個只管「這一頁能不能點」。分享頁照樣要看到「約」。 */
  const showApprox = S.t.members.some(m => S.approx[m.id]) && !S.readonly;
  return (
    <button className="tot" onClick={onToggleTotal}>
      <span>總花費</span>
      <span className="totright">
        {showApprox && <i className="approx">約</i>}
        {/* 實作-T-7　外幣視角的總花費：填過外幣的那幾筆用**原值**加總，
            其餘才用台幣 × 匯率回推。台幣視角（`mo.sym` 未給）完全不受影響。 */}
        <b className="money">{money(S.total, totalOpts(S, mo))}</b>
        <Icon name={open ? 'up' : 'down'} size={16} />
      </span>
    </button>
  );
}

export function StatCardPerList({ S, readonly, money: mo, onPickMember }: StatCardProps) {
  return (
    <div className="perlist">
      {S.t.members.map((m, i) => {
        const ap = S.approx[m.id];
        const inner = (
          <>
            {/* S-02c-10 三層 fallback 全站一致（Rozi 2026-09-06 裁示） */}
            <Avatar emoji={m.emoji} name={m.name} index={i} />
            <span className="nm">{m.name}</span>
            <span className={`am${ap ? ' ap' : ''}`}>
              {ap && <i>約</i>}
              <span className="money">{money(S.per[m.id] ?? 0, mo)}</span>
            </span>
          </>
        );
        return readonly
          ? <div className="perrow ro" key={m.id}>{inner}</div>
          : <button className="perrow" key={m.id} onClick={() => onPickMember?.(m.id)}>{inner}</button>;
      })}
    </div>
  );
}

export function StatCardFoot({ S, readonly }: StatCardProps) {
  const showApprox = S.t.members.some(m => S.approx[m.id]) && !S.readonly;
  if (!showApprox) return null;
  return (
    <div className="foot">
      標「約」的金額還沒算清楚{readonly ? '' : '，點名字看是哪幾筆'}
    </div>
  );
}

/** 三段一起用的預設組合 */
export default function StatCard(p: StatCardProps) {
  return (
    <>
      <StatCardTotal {...p} />
      {p.open && <StatCardPerList {...p} />}
      {p.open && <StatCardFoot {...p} />}
    </>
  );
}
