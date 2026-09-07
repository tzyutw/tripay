/* 實作-Q-1　S-02b-12「這趟的現金匯率」——**只有一個輸入框**。
 *
 * 🔴 為什麼從兩格改成一格（Rozi 2026-09-06 拍板方案 C）：
 * 兩格讓使用者可以組出**方向相反**的兩個數字，而系統無從分辨。
 * 她想的是「1 日幣 = 0.21 台幣」，系統讀成「1 台幣 = 0.21 日幣」，
 * 於是 308500 日圓被存成 1,469,048 台幣（正確 64,785），
 * 而且 `twd_pending=false`——**錯的值被當成確定值寫進資料庫，全程沒有警告**。
 *
 * 現在：填一個數字 → 依幣別量級判方向（`rateDirection`）→
 * **用一行白話把系統的理解攤開**，判錯時按「換個方向」救得回來。
 * 只顯示不給救，跟不顯示一樣糟。
 */
import { FLAG, decimalsFor, currencyName, TWD_PER_UNIT, rateColumns,
         type RateDir } from '@/lib/currencyTable';
import { tripRate } from '@/lib/summary';
import { formatAmount } from '@/lib/amount';

export interface CashRateProps {
  currency: string;
  /** 使用者填的那一個數字（原字串，可能還在打） */
  value: string;
  /** 目前採用的方向。null＝還沒填或判不出來 */
  dir: RateDir | null;
  onChange: (v: string) => void;
  onFlip: () => void;
}

/**
 * placeholder 給那個幣別的**量級範例**——由 `TWD_PER_UNIT` 推，不要寫死一張表。
 * 講法選數字好記的那一邊（與 `oneSideOf` 同一條規則）：
 * 1 外幣不到 0.1 台幣時給倒數，才不會叫使用者填 `0.023`。
 */
export function ratePlaceholder(code: string): string {
  const p = TWD_PER_UNIT[code];
  if (!p) return decimalsFor(code) ? '0.00' : '0';
  const n = p < 0.1 ? 1 / p : p;
  return n >= 10 ? String(Math.round(n)) : String(Number(n.toPrecision(2)));
}

/**
 * 實作-S-1　示範金額。依幣別量級決定，**不要寫死一張表**：
 * 沒有輔幣單位的（JPY／KRW／VND／IDR）用 10,000，其餘（USD／EUR 這種）用 100。
 */
export function sampleAmountFor(code: string): number {
  return decimalsFor(code) === 0 ? 10000 : 100;
}

/**
 * 「花 10,000 日圓，記成台幣 2,100」。
 *
 * 🔴 為什麼要這一行（Rozi 2026-09-07：「說明變得不太清楚，沒有案例顯示差別在哪」）：
 * 兩個方向的第一行長得幾乎一模一樣（只有兩個幣別名互換、數字還是同一個），
 * 掃過去分辨不出來。而上一次方向填反，帳從 64,785 變成 1,469,048（差 22 倍）——
 * **畫面上沒有任何地方會讓她看出這個差別**。換算範例的數量級一眼就看得出來。
 *
 * ⚠️ 換算走**既有的** `tripRate()`，不另寫算式——範例算出來的數字必須跟
 * 真的記一筆時算出來的完全一致，不然範例會騙人。
 * ⚠️ 不要用「約」字：那是「金額未定案」的專用標記（`.approx`），
 * 用在這裡會被誤讀成「這筆帳還沒算準」。
 */
export function rateExample(code: string, n: string, dir: RateDir | null):
  { foreign: string; twd: string } | null {
  const num = Number(String(n).replace(/,/g, ''));
  if (!dir || !Number.isFinite(num) || num <= 0) return null;
  const rate = tripRate(rateColumns(num, dir) as never);
  if (!rate) return null;
  const sample = sampleAmountFor(code);
  return { foreign: `${formatAmount(String(sample), 0)} ${currencyName(code)}`,
           twd: formatAmount(String(Math.round(sample / rate)), 0) };
}

export default function CashRate({ currency, value, dir, onChange, onFlip }: CashRateProps) {
  const code = currency;
  const filled = value.trim() !== '' && dir != null;
  const name = currencyName(code);
  /* 白話那一行：把系統的理解攤開。幣別名走 currencyName()，不要自己寫中文。 */
  const ex = rateExample(currency, value, dir);
  const plain = dir === 'for-unit'
    ? `1 ${name} ＝ ${value} 台幣`
    : `1 台幣 ＝ ${value} ${name}`;

  return (
    <div className="fld">
      <span className="lbl">這趟的現金匯率</span>
      <p className="hint" style={{ margin: '-2px 0 9px' }}>在當地換錢後填一次就好</p>
      <div className="ratebox">
        <div className="raterow" data-side="one">
          <span className="flag">{FLAG[code] || '🏳️'}</span>
          <input
            type="text" inputMode="decimal" className="rateinput" id="rate-one"
            aria-label="這趟的現金匯率"
            value={value}
            placeholder={ratePlaceholder(code)}
            autoComplete="off"
            onChange={e => onChange(e.target.value)}
          />
          <span className="code">{code}</span>
        </div>
      </div>
      {filled ? (
        <p className="hint" style={{ marginTop: 7 }}>
          <b style={{ color: 'var(--ink)' }}>{plain}</b>
          <br />
          {/* 第二行：她看得懂單位的換算範例。次級字級＋灰字，不另開卡片或分隔線。
              外幣數字用次階字色、台幣用主色——與 S-04 的兩欄同一套語彙。 */}
          {ex && <span>花 <span className="forcur">{ex.foreign}</span>，記成台幣 {ex.twd}</span>}
          {' '}
          <button type="button" className="ratelink" onClick={onFlip}>換個方向</button>
        </p>
      ) : (
        <p className="hint">填一個數字就好，方向由系統判斷；判錯可以按「換個方向」</p>
      )}
      <p className="hint">刷卡不用這個匯率，直接填台幣</p>
    </div>
  );
}
