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

/**
 * 一列匯率。**必須定義在 `CashRate` 外面**——
 * 在元件內部宣告的函式元件，每次父層 render 都是一個**全新的函式參考**，
 * React 會視為不同的元件型別 → 卸載舊 DOM、掛新的 → `<input>` 被銷毀重建 →
 * 焦點消失 → iOS 鍵盤收起來。打一個字就收一次，「0.19」要點四次。
 *
 * 原型早就寫過這條鐵律（`Tripay_原型.html:2219`）：
 * 「只更新衍生內容——**不重建任何 input**」。
 * ⚠️ 用 `useCallback` 包**沒有用**——那解決不了「元件型別每次都不同」這件事。
 */
function RateRow({ side, currency, dec, rateTwd, rateFor, onChange }: {
  side: 'twd' | 'for'; currency: string; dec: number;
  rateTwd: string; rateFor: string;
  onChange: (side: 'twd' | 'for', v: string) => void;
}) {
  const isTwd = side === 'twd';
  const code = isTwd ? 'TWD' : currency;
  /* placeholder 要跟著 `oneSideOf` 走，不能寫死「台幣那欄是 1」。
     JPY 是「1 日圓 = N 台幣」，所以 1 在 **JPY** 那欄；KRW 才是 1 在台幣那欄。
     寫死的話 JPY 行程會在台幣欄顯示灰色的「1」，看起來像已經填好了。 */
  const isOne = oneSideOf(currency) === side;
  return (
    <div className="raterow" data-side={side}>
      <span className="flag">{FLAG[code] || '🏳️'}</span>
      <input
        type="text" inputMode="decimal" className="rateinput" id={`rate-${side}`}
        value={isTwd ? rateTwd : rateFor}
        placeholder={isOne ? '1' : (dec ? '0.00' : '0')}
        autoComplete="off"
        onChange={e => onChange(side, e.target.value)}
      />
      <span className="code">{code}</span>
    </div>
  );
}

export default function CashRate({ currency, rateTwd, rateFor, onChange }: CashRateProps) {
  const dec = decimalsFor(currency);
  const first = oneSideOf(currency) === 'twd' ? 'twd' : 'for';
  const second = first === 'twd' ? 'for' : 'twd';
  const rowProps = { currency, dec, rateTwd, rateFor, onChange };
  const hasTwd = rateTwd.trim() !== '', hasFor = rateFor.trim() !== '';
  const halfFilled = hasTwd !== hasFor;
  return (
    <div className="fld">
      <span className="lbl">這趟的現金匯率</span>
      <p className="hint" style={{ margin: '-2px 0 9px' }}>在當地換錢後填一次就好</p>
      <div className="ratebox">
        <RateRow side={first} {...rowProps} />
        <RateRow side={second} {...rowProps} />
      </div>
      {/* 只填一欄時 `tripRate()` 算不出來，先前是**靜默**的——
          Rozi 填了 0.19 卻一直看到「還沒填」，畫面沒說少了什麼。 */}
      {halfFilled && <p className="hint">還差一欄，兩邊都填才換算得出來</p>}
      <p className="hint">刷卡不用這個匯率，直接填台幣</p>
    </div>
  );
}
