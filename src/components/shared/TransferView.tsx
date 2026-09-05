/* 轉帳明細：**S-05 與分享頁共用這一份**。兩處分開寫遲早會走鐘。
   hub 模式把方向拆成「大家給 X」與「X 再給」兩段，
   同一列只顯示需要的那一半名字——重複印中心人的名字會讓人以為是兩筆不同的帳。
   逐字對齊 Tripay_原型.html 的 transferView()。 */
import { Icon } from '@/components/Icon';
import { money, memberLabel } from '@/lib/format';
import type { SharedTrip, Transfer, MoneyOpts } from './types';

export interface TransferViewProps {
  t: SharedTrip;
  tx: Transfer[];
  approx?: boolean;
  withClear?: boolean;
  money?: MoneyOpts;
  clearedIds?: string[];
  onClear?: (tx: Transfer) => void;
  /**
   * 呈現變體。**只換排版，不換資料，也不換方向**。
   *   'rows'（預設）＝ S-05 的轉帳明細：「A 給 B　$X」，可加「標記付清」。
   *   'arrows'       ＝ S-06 分享頁的「誰付給誰」：「A → B　$X」，一列一張卡。
   * 原型的 renderS06() 用的就是箭頭那一版（`→`，句子裡的連接符，不是 icon）。
   * 兩種長相不同但**來源同一份 tx**——分開寫遲早會走鐘，所以收在同一個元件裡。
   */
  variant?: 'rows' | 'arrows';
}

function nm2(t: SharedTrip, id: string) {
  const m = t.members.find(x => x.id === id);
  return m ? memberLabel(m) : ' ';
}

function Row({ t, x, showFrom, showTo, approx, withClear, cleared, mo, onClear }: {
  t: SharedTrip; x: Transfer; showFrom: boolean; showTo: boolean;
  approx?: boolean; withClear?: boolean; cleared?: boolean;
  mo?: MoneyOpts; onClear?: (tx: Transfer) => void;
}) {
  return (
    <div className="txrow">
      {showFrom && <span className="who">{nm2(t, x.from)}</span>}
      {showFrom && showTo && <span className="gv">給</span>}
      {showTo && <span className="who">{nm2(t, x.to)}</span>}
      <span className="amt">
        {approx && <i className="approx">約</i>}
        <span className="money">{money(x.amount, mo)}</span>
      </span>
      {withClear && (cleared
        ? <span className="cleared"><Icon name="check" size={13} /> 已付清</span>
        : <button className="clearbtn" onClick={() => onClear?.(x)}>標記付清</button>)}
    </div>
  );
}

export default function TransferView({
  t, tx, approx, withClear, money: mo, clearedIds = [], onClear, variant = 'rows',
}: TransferViewProps) {
  const key = (x: Transfer) => `${x.from}>${x.to}`;

  /* S-06：分享頁的「誰付給誰」。hub 分段在這裡沒有意義——那一頁不做結算動作，
     只是把結果列出來，所以一律平鋪。 */
  if (variant === 'arrows') {
    if (!tx.length) {
      return (
        <div className="rowb" style={{ margin: '0 14px' }}>
          <span className="flex-1 text-body text-gr">這趟旅程還沒結算。</span>
        </div>
      );
    }
    return (
      <div style={{ margin: '0 14px' }}>
        {tx.map(x => (
          <div className="rowb" key={key(x)} style={{ marginBottom: 6 }}>
            <span className="flex-1 text-body">
              {nm2(t, x.from)} <span className="text-gr">→</span> {nm2(t, x.to)}
            </span>
            <span className="money">{money(x.amount, mo)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (!tx.length) return <div className="txempty">大家剛好打平</div>;

  const common = { t, approx, withClear, mo, onClear };

  if (t.settleMode === 'hub' && t.hubMember) {
    const hub = t.hubMember;
    const hubName = t.members.find(m => m.id === hub)?.name ?? '';
    const inbound = tx.filter(x => x.to === hub);
    const outbound = tx.filter(x => x.from === hub);
    return (
      <>
        <div className="txhead">都跟 {nm2(t, hub)} 結算</div>
        {inbound.length > 0 && <div className="txsec">大家給 {hubName}</div>}
        {inbound.map(x => (
          <Row key={key(x)} x={x} showFrom showTo={false} cleared={clearedIds.includes(key(x))} {...common} />
        ))}
        {outbound.length > 0 && <div className="txsec">{hubName} 再給</div>}
        {outbound.map(x => (
          <Row key={key(x)} x={x} showFrom={false} showTo cleared={clearedIds.includes(key(x))} {...common} />
        ))}
      </>
    );
  }

  return (
    <>
      {tx.map(x => (
        <Row key={key(x)} x={x} showFrom showTo cleared={clearedIds.includes(key(x))} {...common} />
      ))}
    </>
  );
}
