/* Phase 2 B：貼上帳單明細的拆解。期望值來自 phase2-fixtures.json 的 importSample（原型驗過的同一份） */
import { describe, it, expect } from 'vitest';
import fx from '@/test/harness/phase2-fixtures.json';
import { parseBill, inferDate, isDuplicate } from './billImport';

const IS = fx.importSample, EX = IS.expect;
const family = fx.cards.filter(c => c.id === IS.primaryId || c.parentId === IS.primaryId).map(c => ({ id: c.id, last4: c.last4 || null }));
const fixed = IS.text.split('\n').map((l, i) => i === IS.badLine - 1 ? IS.fixedLine : l).join('\n');

describe('parseBill', () => {
  it('範例：第 7 行看不懂、表頭與總額略過', () => {
    const P = parseBill(IS.text, IS.primaryId, family, IS.today);
    expect(P.rows.length).toBe(EX.rowsBeforeFix);
    expect(P.sum).toBe(EX.sumBeforeFix);
    expect(P.bad).toEqual([{ line: IS.badLine, raw: '09/13 星巴克（金額看不清楚）', why: '找不到金額' }]);
    expect(P.ignored).toBe(2);
  });
  it('修好後加總＝本期應繳，每一筆歸到對的卡', () => {
    const P = parseBill(fixed, IS.primaryId, family, IS.today);
    expect(P.rows.length).toBe(EX.rowsAfterFix);
    expect(P.sum).toBe(EX.sumAfterFix);
    expect(P.bad).toEqual([]);
    for (const [t, c] of Object.entries(EX.cards)) expect(P.rows.find(r => r.title === t)?.cardId).toBe(c);
  });
  it('兩個日期取消費日；帶年份；NT$；負數＝退款', () => {
    const P = parseBill(fixed, IS.primaryId, family, IS.today);
    const by = Object.fromEntries(P.rows.map(r => [r.title, r]));
    expect(by['全聯福利中心'].date).toBe('2026-09-02');
    expect(by['UNIQLO 台北店'].date).toBe('2026-09-08');
    expect(by['麥當勞'].amount).toBe(189);
    expect(by['好市多退貨'].amount).toBe(-350);
  });
  it('重複判定：同卡同日同金額（不比名稱）', () => {
    const P = parseBill(fixed, IS.primaryId, family, IS.today);
    const ex = fx.expenses.map(e => ({ card_id: e.cardId, expense_date: e.date, twd_amount: +e.twdAmt }));
    expect(P.rows.filter(r => isDuplicate(r, ex)).map(r => r.title)).toEqual(['全聯福利中心']);
  });
});

describe('inferDate', () => {
  it('沒寫年份取不晚於今天', () => {
    expect(inferDate('12/30', '2026-11-05')).toBe('2025-12-30');
    expect(inferDate('09/02', '2026-11-05')).toBe('2026-09-02');
  });
  it('不存在的日期看不懂', () => {
    expect(inferDate('02/30', '2026-11-05')).toBeNull();
    expect(inferDate('13/01', '2026-11-05')).toBeNull();
  });
});
