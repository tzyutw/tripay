/* B-1②　S-02b-12「這趟的現金匯率」——**只有兩個輸入框**。
   「1」擺哪一欄依幣別決定（規格 §2b.3a）：台灣人講匯率會選數字好記的方向，
   1 單位外幣不到 0.1 台幣時改成「1 台幣 = N 外幣」。**「1」的那一欄排在上面。**
   刷卡不走這個匯率，直接填台幣。 */
import { FLAG, decimalsFor, oneSideOf } from '@/lib/currencyTable';

export interface CashRateProps {
  currency: string;
  rateTwd: string;
  rateFor: string;
  onChange: (side: 'twd' | 'for', v: string) => void;
}

export default function CashRate({ currency, rateTwd, rateFor, onChange }: CashRateProps) {
  const dec = decimalsFor(currency);
  const Row = ({ side }: { side: 'twd' | 'for' }) => {
    const isTwd = side === 'twd';
    const code = isTwd ? 'TWD' : currency;
    return (
      <div className="raterow" data-side={side}>
        <span className="flag">{FLAG[code] || '🏳️'}</span>
        <input
          type="text" inputMode="decimal" className="rateinput" id={`rate-${side}`}
          value={isTwd ? rateTwd : rateFor}
          placeholder={isTwd ? '1' : (dec ? '0.00' : '0')}
          autoComplete="off"
          onChange={e => onChange(side, e.target.value)}
        />
        <span className="code">{code}</span>
      </div>
    );
  };
  const first = oneSideOf(currency) === 'twd' ? 'twd' : 'for';
  const second = first === 'twd' ? 'for' : 'twd';
  return (
    <div className="fld">
      <span className="lbl">這趟的現金匯率</span>
      <p className="hint" style={{ margin: '-2px 0 9px' }}>在當地換錢後填一次就好</p>
      <div className="ratebox"><Row side={first} /><Row side={second} /></div>
      <p className="hint">刷卡不用這個匯率，直接填台幣</p>
    </div>
  );
}
