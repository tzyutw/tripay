/* 實作-Q-2　千分位。**存檔前剝逗號**是最容易漏的一步：
   `Number('308,500')` 回 NaN，帳直接壞掉而且不會有任何警告。 */
import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount, caretAfterFormat } from './amount';

describe('Q-②　parseAmount：存檔前把逗號剝掉', () => {
  it('逐條給值', () => {
    expect(parseAmount('308,500')).toBe(308500);
    expect(parseAmount('1,469,048')).toBe(1469048);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('-1,200')).toBe(-1200);
    /* 還沒打完的小數點不算數字，也不能變成 NaN 存進去 */
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount('-')).toBeNull();
  });

  it('**不得回 NaN**——那會被 Number.isFinite 擋掉變成「沒填」，帳靜靜地少一筆', () => {
    for (const v of ['308,500', 'abc', '1,2,3', ''])
      expect(Number.isNaN(parseAmount(v) as number)).toBe(false);
  });
});

describe('Q-②　formatAmount：顯示與輸入中的即時格式化', () => {
  it('整數加千分位', () => {
    expect(formatAmount('308500', 0)).toBe('308,500');
    expect(formatAmount('1469048', 0)).toBe('1,469,048');
    expect(formatAmount('0', 0)).toBe('0');
    expect(formatAmount('', 0)).toBe('');
  });

  it('已經有逗號的再格式化一次不會壞掉（受控欄位每次 onChange 都會再跑一遍）', () => {
    expect(formatAmount('308,500', 0)).toBe('308,500');
    expect(formatAmount(formatAmount('1234567', 0), 0)).toBe('1,234,567');
  });

  it('**保留正在打的小數點**——吃掉的話「12.」會變回「12」，下一個字元接不上去', () => {
    expect(formatAmount('12.', 2)).toBe('12.');
    expect(formatAmount('12.5', 2)).toBe('12.5');
    expect(formatAmount('1234.56', 2)).toBe('1,234.56');
    /* 小數位數上限跟著幣別 */
    expect(formatAmount('12.567', 2)).toBe('12.56');
  });

  it('無輔幣單位的幣別（JPY／KRW／VND／IDR）不接受小數點', () => {
    expect(formatAmount('12.5', 0)).toBe('125');
    expect(formatAmount('12.', 0)).toBe('12');
  });

  it('前導零去掉，負號留著', () => {
    expect(formatAmount('007', 0)).toBe('7');
    expect(formatAmount('-1200', 0)).toBe('-1,200');
  });
});

describe('Q-②　游標保位', () => {
  it('打到一半插入逗號時，游標要停在同一個數字後面', () => {
    /* 「30850」後面再打一個 0 → 原字串 "308500"、游標 6 → 格式化成 "308,500"、游標 7 */
    expect(caretAfterFormat('308500', 6, '308,500')).toBe(7);
    /* 在中間插字：左側有 3 個數字 → 格式化後停在第 3 個數字之後 */
    expect(caretAfterFormat('308500', 3, '308,500')).toBe(3);
    expect(caretAfterFormat('1234567', 4, '1,234,567')).toBe(5);
    /* 全刪光 */
    expect(caretAfterFormat('', 0, '')).toBe(0);
  });
});
