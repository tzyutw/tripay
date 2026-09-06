/* 實作-B　幣別資料表：逐字搬自 Tripay_原型.html。
   TWD_PER_UNIT 只用來決定「1」擺哪一欄與小數位數，**不參與分帳計算**。 */

export type CurrencyRow = readonly [code: string, name: string, symbol: string];

export const CURRENCIES: readonly CurrencyRow[] = [
  ['JPY','日圓','¥'],['TWD','台幣','$'],['KRW','韓元','₩'],['USD','美元','$'],['EUR','歐元','€'],
  ['HKD','港幣','HK$'],['SGD','新幣','S$'],['THB','泰銖','฿'],['CNY','人民幣','¥'],['AUD','澳幣','A$'],
  ['GBP','英鎊','£'],['MYR','馬來幣','RM'],['VND','越南盾','₫'],['PHP','菲律賓披索','₱'],
  ['IDR','印尼盾','Rp'],['INR','印度盧比','₹'],['CAD','加拿大幣','C$'],['CHF','瑞士法郎','Fr'],
] as const;

/** 1 單位外幣約值多少台幣 */
export const TWD_PER_UNIT: Record<string, number> = { JPY:0.22, TWD:1, KRW:0.023, USD:32, EUR:35, HKD:4.1, SGD:24, THB:0.9,
  CNY:4.5, AUD:21, GBP:41, MYR:7.2, VND:0.0013, PHP:0.57, IDR:0.002, INR:0.38, CAD:23, CHF:36 };

export const FLAG: Record<string, string> = { JPY:'🇯🇵', TWD:'🇹🇼', KRW:'🇰🇷', USD:'🇺🇸', EUR:'🇪🇺', HKD:'🇭🇰', SGD:'🇸🇬', THB:'🇹🇭',
  CNY:'🇨🇳', AUD:'🇦🇺', GBP:'🇬🇧', MYR:'🇲🇾', VND:'🇻🇳', PHP:'🇵🇭', IDR:'🇮🇩', INR:'🇮🇳', CAD:'🇨🇦', CHF:'🇨🇭' };

/** 台灣人講匯率會選數字好記的方向：1 單位外幣不到 0.1 台幣時，改成「1 台幣 = N 外幣」 */
export function oneSideOf(code: string): 'twd' | 'for' {
  return (TWD_PER_UNIT[code] ?? 1) < 0.1 ? 'twd' : 'for';
}

/** 無輔幣單位的幣別不給小數 */
export function decimalsFor(code: string): 0 | 2 {
  return ['JPY', 'KRW', 'VND', 'IDR'].includes(code) ? 0 : 2;
}

export function currencyName(code: string): string {
  return CURRENCIES.find(c => c[0] === code)?.[1] ?? code;
}

export function currencySymbol(code: string): string {
  return CURRENCIES.find(c => c[0] === code)?.[2] ?? '¥';
}

/** 匯率的兩個方向：`for-unit`＝「1 外幣 = N 台幣」；`twd-unit`＝「1 台幣 = N 外幣」 */
export type RateDir = 'for-unit' | 'twd-unit';

/**
 * 🔴 實作-Q-1b　只給一個數字，判斷使用者講的是哪個方向。
 *
 * 事故：實作-O 的「填一邊、另一邊自動帶 1」讓使用者可以組出**方向相反**的兩個數字，
 * 而系統無從分辨。Rozi 想的是「1 日幣 = 0.21 台幣」，系統讀成「1 台幣 = 0.21 日幣」，
 * 於是 308500 日圓被存成 **1,469,048 台幣**（正確 64,785），
 * 而且 `twd_pending=false`——**錯的值被當成確定值寫進資料庫，全程沒有警告**。
 *
 * Rozi 的直覺是「小於 1 用乘、大於 1 用除」。那在日韓泰越印菲印度都對，
 * 但美元 32／歐元 35／港幣 4.1 這些會反（她填「美元 32」會被當成 1 台幣 = 32 美元）。
 * **真正的判準不是「跟 1 比」，是「跟這個幣別的量級比」**——所以拿 `TWD_PER_UNIT`
 * 當基準，在對數尺度上看 N 離哪一邊近。
 */
export function rateDirection(code: string, n: number): RateDir | null {
  const P = TWD_PER_UNIT[code];
  if (!P || !Number.isFinite(n) || n <= 0) return null;
  const d1 = Math.abs(Math.log(n) - Math.log(P));       // 候選一：N 是「1 外幣 = N 台幣」
  const d2 = Math.abs(Math.log(n) - Math.log(1 / P));   // 候選二：N 是「1 台幣 = N 外幣」
  /* 平手只會發生在 N === 1，兩個方向講的是同一件事——沿用既有的 oneSideOf，
     不要在這裡自己另定一套規則。 */
  if (d1 === d2) return oneSideOf(code) === 'for' ? 'for-unit' : 'twd-unit';
  return d1 <= d2 ? 'for-unit' : 'twd-unit';
}

/** 一個數字＋方向 → `trips` 那兩欄。schema 不動，`tripRate()` 也不動。 */
export function rateColumns(n: number | null, dir: RateDir | null):
  { cash_rate_twd: number | null; cash_rate_foreign: number | null } {
  if (n == null || !Number.isFinite(n) || n <= 0 || !dir)
    return { cash_rate_twd: null, cash_rate_foreign: null };
  return dir === 'for-unit'
    ? { cash_rate_twd: n, cash_rate_foreign: 1 }    // 1 外幣 = N 台幣
    : { cash_rate_twd: 1, cash_rate_foreign: n };   // 1 台幣 = N 外幣
}

/** 讀回來：兩欄還原成「一個數字＋方向」。兩欄都不是 1 的舊資料一律換算成方向一。 */
export function rateFromColumns(
  t: { cash_rate_twd: number | null; cash_rate_foreign: number | null },
): { n: number; dir: RateDir } | null {
  const twd = Number(t.cash_rate_twd), forr = Number(t.cash_rate_foreign);
  if (!Number.isFinite(twd) || !Number.isFinite(forr) || twd <= 0 || forr <= 0) return null;
  if (forr === 1) return { n: twd, dir: 'for-unit' };
  if (twd === 1)  return { n: forr, dir: 'twd-unit' };
  return { n: twd / forr, dir: 'for-unit' };
}
