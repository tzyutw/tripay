/* 實作-O-1／O-2　**存出去的 row 長什麼樣**。
 *
 * 🔴 為什麼是斷言 row 而不是斷言畫面：這一輪兩條會算錯帳的路徑，
 * 錯的都是**存進去的東西**——畫面上完全正常，金額也對得上，
 * 只有按下結算的時候才會發現總額少了一筆／全算到付款人頭上。
 * 只驗畫面文字的測試對這兩條完全沒有防守能力。
 */
import { describe, it, expect } from 'vitest';
import { buildRows, partsOfForm, formToExpense, type FormState } from './ExpenseFormSheet';
import { backfillRows } from './TripFormSheet';
import { calc, tripRate } from '@/lib/summary';
import type { TripWithMembers } from '@/types/database';

const M = ['m0', 'm1', 'm2'];
const members = M.map((id, i) => ({
  id, trip_id: 't1', name: ['Alex', 'Robin', 'Sam'][i], emoji: '', sort_order: i,
})) as TripWithMembers['trip_members'];

/** 1 台幣 = 0.21 外幣 → `tripRate` 回 0.21，`calc` 用 round(外幣 ÷ 0.21) 換台幣 */
const withRate = { cash_rate_twd: 1, cash_rate_foreign: 0.21 };
const noRate   = { cash_rate_twd: null, cash_rate_foreign: null };
const tripOf = (r: typeof withRate | typeof noRate) =>
  ({ id: 't1', currency: 'KRW', payment_methods: ['現金'], trip_members: members, ...r }) as unknown as TripWithMembers;

const form = (o: Partial<FormState> = {}): FormState => ({
  title: '藥妝店', emoji: '💄', emojiManual: false, date: '2026-03-15',
  forAmt: '', twdAmt: '', pay: '現金', payer: M[0], kind: 'shared',
  parts: [...M], single: null, indiv: {}, fillCur: 'TWD',
  partsOpen: false, onSpot: false, sponsor: false, ...o,
});
const build = (f: FormState, r: typeof withRate | typeof noRate = withRate) =>
  buildRows(f, tripOf(r), members, { tripId: 't1', userId: 'u1' });

describe('O-①　只填外幣的整筆消費', () => {
  it('有匯率 → 存檔時就換算，twd_pending 是 false', () => {
    const { row } = build(form({ forAmt: '5000' }));
    const rate = tripRate(withRate)!;
    expect(row.twd_amount).toBe(Math.round(5000 / rate));
    expect(row.twd_amount).toBe(23810);
    expect(row.twd_pending).toBe(false);
    expect(row.foreign_amount).toBe(5000);
    /* 引擎的條件就是 `.eq("twd_pending", false)`——這一格是 true 就整筆被跳過 */
  });

  it('沒匯率 → twd_amount 維持 null 且 twd_pending 是 true（可以存，但要標出來）', () => {
    const { row } = build(form({ forAmt: '5000' }), noRate);
    expect(row.twd_amount).toBeNull();
    expect(row.twd_pending).toBe(true);
  });

  it('外幣台幣都填 → 使用者填的台幣**不得被換算值蓋掉**', () => {
    const { row } = build(form({ forAmt: '5000', twdAmt: '900' }));
    expect(row.twd_amount).toBe(900);          // 不是 23810
    expect(row.twd_pending).toBe(false);
  });

  it('贊助（負額）也走同一條路，正負號不會被換算弄丟', () => {
    const { row } = build(form({ forAmt: '5000', sponsor: true }));
    expect(row.foreign_amount).toBe(-5000);
    expect(row.twd_amount).toBe(-23810);
    expect(row.twd_pending).toBe(false);
  });
});

describe('O-②　「各自付各的」用外幣填每個人的金額', () => {
  const each = (o: Partial<FormState> = {}) => form({
    kind: 'individual', fillCur: 'FOR', parts: [M[0], M[1]],
    forAmt: '30000', twdAmt: '690', indiv: { [M[0]]: '12000', [M[1]]: '18000' }, ...o,
  });

  it('整筆台幣算得出來 → 每個 split 的 split_amount 等於 calc().shares，總和等於整筆台幣', () => {
    const f = each();
    const { row, splitRows } = build(f);
    const c = calc(formToExpense(f, partsOfForm(f)) as never, tripOf(withRate), members);
    for (const s of splitRows)
      expect(s.split_amount, `${s.member_id} 的台幣沒算出來`).toBe(c.shares[s.member_id as string]);
    /* 差額已經在 shares 裡歸給付款人，所以是**完全相等**，不是「差一塊以內」 */
    const sum = splitRows.reduce((a, s) => a + (s.split_amount as number), 0);
    expect(sum).toBe(row.twd_amount);
    /* 使用者輸入的原始外幣值照舊存著 */
    expect(splitRows.map(s => s.split_amount_foreign)).toEqual([12000, 18000]);
    for (const s of splitRows) expect(s.split_pending).toBe(false);
  });

  it('整筆台幣算不出來 → 每個 split 的 split_pending 必須是 true', () => {
    /* 🔴 這一條就是引擎靜默算成 0 的直接原因：
       原本寫死 `v == null`，只看使用者填沒填，不看算不算得出台幣。
       填了外幣 → v 有值 → pending=false，而 split_amount 是 null
       → 引擎 `if (!s.split_pending && s.split_amount !== null)` 不成立 → cost = 0
       → 差額全歸付款人。 */
    const { splitRows } = build(each({ forAmt: '30000', twdAmt: '' }), noRate);
    expect(splitRows.length).toBe(2);
    for (const s of splitRows) {
      expect(s.split_amount, '算不出台幣就不該有 split_amount').toBeNull();
      expect(s.split_pending, '算不出台幣時 split_pending 必須是 true').toBe(true);
    }
  });

  it('填台幣的「各自付各的」照舊：split_amount 是使用者填的值', () => {
    const f = form({ kind: 'individual', fillCur: 'TWD', parts: [M[0], M[1]],
                     twdAmt: '690', indiv: { [M[0]]: '276', [M[1]]: '414' } });
    const { splitRows } = build(f);
    expect(splitRows.map(s => s.split_amount)).toEqual([276, 414]);
    expect(splitRows.map(s => s.split_amount_foreign)).toEqual([null, null]);
  });

  it('一起分（shared）不受影響：split_amount 仍是 null、不 pending', () => {
    const { splitRows } = build(form({ forAmt: '5000' }));
    expect(splitRows.length).toBe(3);
    for (const s of splitRows) {
      expect(s.split_amount).toBeNull();
      expect(s.split_pending).toBe(false);
    }
  });
});

describe('O-①b　設定匯率時補算既有消費', () => {
  const rows = [
    { id: 'a', foreign_amount: 5000, twd_amount: null,  twd_pending: true,  exchange_rate: null },
    { id: 'b', foreign_amount: 5000, twd_amount: 900,   twd_pending: false, exchange_rate: 0.18 },
    { id: 'c', foreign_amount: null, twd_amount: null,  twd_pending: true,  exchange_rate: null },
  ];

  it('只有「有外幣沒台幣」那一筆被改到，另外兩筆逐欄相同', () => {
    const out = backfillRows(rows, withRate);
    expect(out.map(r => r.id)).toEqual(['a']);
    expect(out[0].twd_amount).toBe(23810);
    expect(out[0].twd_pending).toBe(false);
    /* 沒被選中的那兩筆連碰都沒碰到——回傳的清單裡沒有它們 */
    const untouched = rows.filter(r => !out.some(o => o.id === r.id));
    expect(untouched).toEqual([rows[1], rows[2]]);
  });

  it('匯率算不出來時什麼都不補（§2A.4 不追溯）', () => {
    expect(backfillRows(rows, noRate)).toEqual([]);
    expect(backfillRows(rows, { cash_rate_twd: 1, cash_rate_foreign: null })).toEqual([]);
  });

  it('匯率被清空不會反向清掉已經補好的台幣', () => {
    /* 清空＝算不出匯率＝回空陣列，b 那一筆的 twd_amount 一個字都沒動 */
    expect(backfillRows(rows, noRate)).toEqual([]);
    expect(rows[1].twd_amount).toBe(900);
  });
});
