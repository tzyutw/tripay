/* Phase 2 A：月份計算。期望值來自原型驗過的基準（src/test/harness/phase2-fixtures.json） */
import { describe, it, expect } from 'vitest';
import fx from '@/test/harness/phase2-fixtures.json';
import { periodFor, periodOfYm, billName, cardLabel, dueText, closeDayOf } from './statement';

describe('periodFor／periodOfYm（D4／D5）', () => {
  it('結帳日 15：8/16–9/15 都算 9 月帳單', () => {
    const p = periodOfYm(15, '2026-09');
    expect([p.start, p.end]).toEqual(fx.benchmark.period);
    for (const d of ['2026-08-16', '2026-08-20', '2026-09-02', '2026-09-15']) expect(periodFor(15, d).ym).toBe('2026-09');
  });
  it('8/15 那一筆落在 8 月（基準案例）', () => {
    expect(periodFor(15, '2026-08-15').ym).toBe(fx.benchmark.outsideYm);
    expect(periodFor(15, '2026-08-15')).toEqual({ ym: '2026-08', start: '2026-07-16', end: '2026-08-15' });
  });
  it('結帳日 31 遇到 2 月：取 2 月最後一天', () => {
    expect([periodOfYm(31, '2026-02').start, periodOfYm(31, '2026-02').end]).toEqual(fx.benchmark.feb31.period);
    expect(periodFor(31, '2026-02-28').ym).toBe('2026-02');
    expect(periodFor(31, '2026-03-01').ym).toBe('2026-03');
    expect(periodOfYm(31, '2028-02').end).toBe('2028-02-29');          // 閏年
  });
  it('結帳日 30：2 月取 28，3 月從 3/1 開始；1 月 31 日落 2 月', () => {
    expect(closeDayOf(2026, 2, 30)).toBe(28);
    expect(periodOfYm(30, '2026-03').start).toBe('2026-03-01');
    expect(periodFor(30, '2026-01-31').ym).toBe('2026-02');
  });
  it('跨年：12/20 在結帳日 15 時落到隔年 1 月', () => {
    expect(periodFor(15, '2026-12-20')).toEqual({ ym: '2027-01', start: '2026-12-16', end: '2027-01-15' });
  });
  it('依 D5，基準案例的每一筆都落在 fixture 宣稱的月份', () => {
    const cards = Object.fromEntries(fx.cards.map(c => [c.id, c]));
    const prim = (id: string) => { const c = cards[id]; return c.parentId ? cards[c.parentId] : c; };
    const sep = fx.expenses.filter(e => { const p = prim(e.cardId); return p.id === 'c-main' && periodFor(p.statementDay!, e.date).ym === '2026-09'; });
    expect(sep.map(e => e.id).sort()).toEqual([...fx.benchmark.expenseIds].sort());
  });
});

describe('文案', () => {
  it('一律說「9 月帳單」', () => expect(billName('2026-09')).toBe('9 月帳單'));
  it('沒有末四碼只給暱稱，不補遮罩', () => {
    expect(cardLabel({ nickname: '小明的副卡', last4: '' })).toEqual({ name: '小明的副卡', last4: null });
    expect(cardLabel({ nickname: '小明的副卡', last4: null }).last4).toBeNull();
    expect(JSON.stringify(cardLabel({ nickname: 'x', last4: '' }))).not.toMatch(/\*/);
  });
  it('結帳日說明', () => {
    expect(dueText(15)).toBe('每月 15 號結帳');
    expect(dueText(31)).toBe('每月月底結帳');
  });
});
