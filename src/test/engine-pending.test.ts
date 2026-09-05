/* 實作-C-1　結算引擎遇到 pending 的行為：**先查證，不要先改。**
 *
 * `_盤點_實作缺口.md:151` 說「待填筆本來就跳過，不會 422」，
 * `:296` 又說「pending 旗標必寫，否則結算整趟回 422」。
 * 兩句講的是**不同的東西**，都是對的：
 *
 *   ① 有標記 pending（`twd_pending = true`）→ `calculate-settlement` 在
 *      **查詢階段**就用 `.eq("twd_pending", false)` 濾掉，根本進不了驗證迴圈。
 *   ② 沒標記卻沒有台幣金額（`twd_amount is null` 且 `twd_pending = false`）
 *      → 濾不掉，撞上 `!Number.isFinite(null)` → **整趟回 422**。
 *
 * 所以 S-04-29「空欄自動寫 pending」不是裝飾，是 ② 的唯一防線。
 * **結論：引擎不需要改**，因此不必跑四趟 verify。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  calculateNetBalances, minimumTransactions,
  type Member, type Expense, type Split,
} from '../../supabase/functions/_shared/settlement-engine';

const members: Member[] = [
  { id: 'a', name: 'Rozi', emoji: '🐵' },
  { id: 'b', name: '小美', emoji: '🐱' },
];
const splitsFor = (ids: string[], eid: string): Split[] =>
  ids.map(id => ({ expense_id: eid, member_id: id, is_participating: true,
                   split_amount: null, split_pending: false }));

const SRC = fs.readFileSync('supabase/functions/calculate-settlement/index.ts', 'utf8');

describe('C-1　引擎遇到 pending 的行為（查證，不改）', () => {
  it('① 有標記 pending 的筆在查詢階段就被濾掉——進不了驗證迴圈', () => {
    /* 這一行就是「跳過」的實作。它必須排在型別驗證之前，否則 null 會先炸。 */
    const filterAt = SRC.indexOf('.eq("twd_pending", false)');
    const validateAt = SRC.indexOf('Number.isFinite(exp.twd_amount)');
    expect(filterAt, '找不到 twd_pending 過濾條件').toBeGreaterThan(-1);
    expect(validateAt, '找不到金額型別驗證').toBeGreaterThan(-1);
    expect(filterAt, 'pending 的過濾必須排在型別驗證之前').toBeLessThan(validateAt);
  });

  it('② 沒標記卻沒有金額 → 撞上型別驗證 → 整趟 422', () => {
    /* 引擎對 null 的判斷就是 Number.isFinite。這裡直接驗那個判斷本身， */
    /* 不是驗我對它的印象。 */
    expect(Number.isFinite(null as unknown as number)).toBe(false);
    expect(SRC).toContain('invalid_amount');
    expect(SRC).toContain('422');
  });

  it('跳過待填的筆之後，剩下的帳照樣算得出來，Σ淨額為 0', () => {
    /* 模擬「引擎已經濾掉 pending」之後餵進來的資料 */
    const expenses: Expense[] = [
      { id: 'e1', payer_member_id: 'a', twd_amount: 1000, expense_type: 'shared' },
    ];
    const splits = splitsFor(['a', 'b'], 'e1');
    const balances = calculateNetBalances(members, expenses, splits);
    expect(balances.reduce((s, b) => s + b.net_balance, 0)).toBe(0);

    const tx = minimumTransactions(balances);
    expect(tx.length).toBe(1);
    expect(tx[0].amount).toBe(500);
    expect(tx[0].from_member_id).toBe('b');
    expect(tx[0].to_member_id).toBe('a');
  });

  it('整趟都是待填 → 濾完是空的 → 沒有轉帳，也不該炸', () => {
    const balances = calculateNetBalances(members, [], []);
    expect(balances.every(b => b.net_balance === 0)).toBe(true);
    expect(minimumTransactions(balances)).toEqual([]);
  });

  it('S-04-29 的防線在前端這一側也要成立：空金額必定伴隨 pending', () => {
    const form = fs.readFileSync('src/components/ExpenseFormSheet.tsx', 'utf8');
    /* 兩個旗標都必須由「金額是不是 null」推導，不得寫死 false */
    expect(form).toContain('foreign_pending: forNum == null');
    expect(form).toContain('twd_pending: twdNum == null');
  });
});
