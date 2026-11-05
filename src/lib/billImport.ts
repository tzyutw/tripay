/* Phase 2 B：貼上帳單明細的拆解。**逐字對齊 Tripay_原型.html 的 parseBill／inferDate**。
 * 全部在瀏覽器裡做，**不發任何網路請求**——帳單內容不離開手機、不用付費。 */
import { lastDayOf } from './statement';

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const DATE_RE = /^(?:(\d{4})[/\-.])?(\d{1,2})[/\-.](\d{1,2})$/;
const AMT_RE = /^(-?)(?:NT\$|NT|\$)?(-?)([\d,]+(?:\.\d+)?)(?:元)?$/i;

/** 沒寫年份的日期：取「不晚於今天」的那一年（帳單一定是過去的消費） */
export function inferDate(tok: string, today: string): string | null {
  const m = tok.match(DATE_RE);
  if (!m) return null;
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let y = m[1] ? +m[1] : +today.slice(0, 4);
  if (!m[1] && ymd(y, mo, d) > today) y--;
  if (d > lastDayOf(y, mo)) return null;
  return ymd(y, mo, d);
}

export interface BillCard { id: string; last4: string | null }
export interface BillRow { line: number; date: string; title: string; amount: number; cardId: string }
export interface BadLine { line: number; raw: string; why: '日期看不懂' | '找不到金額' | '找不到消費名稱' }
export interface ParsedBill { rows: BillRow[]; bad: BadLine[]; ignored: number; sum: number }

/**
 * @param primaryId 這份帳單的主卡
 * @param family    主卡＋它的副卡（用末四碼認卡）
 */
export function parseBill(text: string, primaryId: string, family: BillCard[], today: string): ParsedBill {
  const rows: BillRow[] = [], bad: BadLine[] = [];
  let ignored = 0;
  (text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const tok = line.split(/\s+/);
    const dates: string[] = [];
    while (tok.length && dates.length < 2 && DATE_RE.test(tok[0])) dates.push(tok.shift() as string);
    if (!dates.length) { ignored++; return; }                     // 表頭、總額那類沒有日期的行
    const date = inferDate(dates[0], today);                       // 兩個日期時第一個是消費日
    if (!date) { bad.push({ line: i + 1, raw: line, why: '日期看不懂' }); return; }
    const last = tok.length ? tok[tok.length - 1] : '';
    const am = last.match(AMT_RE);
    if (!am || !tok.length) { bad.push({ line: i + 1, raw: line, why: '找不到金額' }); return; }
    tok.pop();
    const amount = (am[1] || am[2] ? -1 : 1) * parseFloat(am[3].replace(/,/g, ''));
    let cardId = primaryId;
    const ci = tok.findIndex(t => /^\d{4}$/.test(t) && family.some(c => c.last4 === t));
    if (ci >= 0) { cardId = (family.find(c => c.last4 === tok[ci]) as BillCard).id; tok.splice(ci, 1); }
    const title = tok.join(' ').trim();
    if (!title) { bad.push({ line: i + 1, raw: line, why: '找不到消費名稱' }); return; }
    rows.push({ line: i + 1, date, title, amount, cardId });
  });
  return { rows, bad, ignored, sum: rows.reduce((a, r) => a + r.amount, 0) };
}

/** 「已經記過」＝同卡、同日、同金額（不比名稱：銀行寫「全聯福利中心」、自己記的是「全聯」） */
export function isDuplicate(r: BillRow, existing: { card_id: string | null; expense_date: string; twd_amount: number | null }[]): boolean {
  return existing.some(e => e.card_id === r.cardId && e.expense_date === r.date && Number(e.twd_amount) === r.amount);
}
