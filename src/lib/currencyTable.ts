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
