/* 實作-N-2　類別 emoji 字典。**原型與實作必須是同一份**——
 * 兩邊各改一次遲早會走鐘，所以這裡把原型的 EMOJI_RULES 也讀出來逐條比對。 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { emojiForTitle } from './ExpenseFormSheet';

/* 停止條件 5 指定的十一組輸入 */
const CASES: [string, string][] = [
  ['帽子', '👕'], ['烤肉', '🍜'], ['加油', '⛽'], ['711果昔', '🏪'],
  ['Olive Young', '💄'], ['olive young', '💄'],   // 大小寫不敏感
  ['扭蛋', '🛍️'], ['機場接送', '🚌'], ['機票 ×4', '✈️'], ['Esim', '📱'],
  ['大國', '➕'],                                   // 推不出來就是 ➕，不要硬猜
];

describe('N-②　類別 emoji 字典', () => {
  for (const [input, want] of CASES) {
    it(`「${input}」→ ${want}`, () => {
      expect(emojiForTitle(input)).toBe(want);
    });
  }

  it('原型的 emojiForTitle 用同一組輸入跑出同樣結果', () => {
    const proto = fs.readFileSync('Tripay_原型.html', 'utf8');
    const m = proto.match(/const EMOJI_RULES = \[([\s\S]*?)\n\];/);
    expect(m, '原型裡找不到 EMOJI_RULES——兩份字典已經走鐘').not.toBeNull();

    /* 把原型的規則表解析出來，用同一支比對函式跑一次 */
    const rules: [RegExp, string][] = [];
    for (const line of m![1].split('\n')) {
      const r = line.match(/\[\/(.+)\/i,\s*'(.+)'\]/);
      if (r) rules.push([new RegExp(r[1], 'i'), r[2]]);
    }
    expect(rules.length, `原型只解析到 ${rules.length} 條規則`).toBe(13);

    const protoEmoji = (t: string) => {
      for (const [re, e] of rules) if (re.test(t)) return e;
      return '➕';
    };
    const diff = CASES.filter(([i, w]) => protoEmoji(i) !== w)
      .map(([i, w]) => `${i}：原型給 ${protoEmoji(i)}、應為 ${w}`);
    expect(diff, `原型與實作的字典不一致：${diff.join('｜')}`).toEqual([]);
  });

  it('順序是由具體到通用——「機票」不可以被「票」搶先', () => {
    expect(emojiForTitle('機票'), '「機票」被「票→🎡」搶走了').toBe('✈️');
    expect(emojiForTitle('門票')).toBe('🎡');
    /* 「藥妝店」有「店」也有「藥妝」，具體的先命中 */
    expect(emojiForTitle('藥妝店')).toBe('💄');
    /* 「計程車」有「車」→ 🚌，不會被「餐|吃|食」之類誤中 */
    expect(emojiForTitle('計程車')).toBe('🚌');
  });
});
