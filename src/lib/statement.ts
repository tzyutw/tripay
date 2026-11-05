/* Phase 2 A：帳單（kind='statement' 的 trips）的月份計算。
 * **逐字對齊 Tripay_原型.html 的 periodOfYm／periodFor／billName／cardName**——
 * 原型的停止條件就是用這幾個函式驗過的（8/15 落 8 月、31 號遇 2 月取 2/28）。
 *
 * 全部是純字串運算，不走 `new Date()` 的本地時區（理由同 format.ts 的 md()）。 */

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

/** m 為 1～12 */
export function lastDayOf(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 某個月的結帳日：31 號遇到小月或 2 月，取那個月最後一天（D4） */
export function closeDayOf(y: number, m: number, day: number): number {
  return Math.min(day || 31, lastDayOf(y, m));
}

export interface Period { ym: string; start: string; end: string }

/** ym（'2026-09'）這一期的起訖：上一期結帳日的隔天 ～ 這一期結帳日 */
export function periodOfYm(day: number, ym: string): Period {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const end = ymd(y, m, closeDayOf(y, m, day));
  let py = y, pm = m - 1;
  if (pm < 1) { pm = 12; py--; }
  const pc = closeDayOf(py, pm, day);
  const start = pc === lastDayOf(py, pm) ? ymd(y, m, 1) : ymd(py, pm, pc + 1);
  return { ym, start, end };
}

/** 一筆消費的日期落在哪一期：日 ≤ 當月結帳日 → 當月；否則下個月（D5） */
export function periodFor(day: number, date: string): Period {
  let y = +date.slice(0, 4), m = +date.slice(5, 7);
  if (+date.slice(8, 10) > closeDayOf(y, m, day)) { m++; if (m > 12) { m = 1; y++; } }
  return periodOfYm(day, `${y}-${pad2(m)}`);
}

/** 畫面上一律說「9 月帳單」，不說「帳單週期」 */
export const billName = (ym: string) => `${+ym.slice(5, 7)} 月帳單`;

/** 帳單的 ym 從它的結束日推回來（trips 存的是起訖，不另存月份） */
export const ymOfStatementEnd = (end: string) => end.slice(0, 7);

/** 卡片識別＝暱稱＋末四碼；**沒有末四碼就只顯示暱稱**，不補任何遮罩符號 */
export function cardLabel(c: { nickname: string; last4: string | null }): { name: string; last4: string | null } {
  const l4 = (c.last4 || '').trim();
  return { name: c.nickname, last4: l4 || null };
}

/** 「主卡 · 每月 15 號結帳」的後半 */
export const dueText = (d: number | null | undefined) =>
  (!d || d >= 31) ? '每月月底結帳' : `每月 ${d} 號結帳`;
