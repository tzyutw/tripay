/* 實作-C-3 第 5 條　兩處共用文案：
 * `MSG_NO_RATE`／`MSG_TWD_PENDING`／`MSG_FILL_ONE` 各被 ≥2 處引用**同一個常數**，
 * 不得有第二份字面量。
 *
 * 理由與 `transferView()`／`statCard()` 相同：兩處分開寫，遲早會走鐘。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MSG_NO_RATE, MSG_TWD_PENDING, MSG_FILL_ONE } from '@/lib/messages';

const FILES: string[] = [];
(function walk(d: string) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) FILES.push(p);
  }
})('src');

const NAMES = ['MSG_NO_RATE', 'MSG_TWD_PENDING', 'MSG_FILL_ONE'] as const;
const TEXT: Record<(typeof NAMES)[number], string> = {
  MSG_NO_RATE: MSG_NO_RATE, MSG_TWD_PENDING: MSG_TWD_PENDING, MSG_FILL_ONE: MSG_FILL_ONE,
};

/* 下限直接綁**原型實際用到幾次**，不是憑指令裡的「≥2 處」。
   查證結果（Tripay_原型.html）：
     MSG_NO_RATE     1 次（S-04-38）
     MSG_TWD_PENDING 2 次（paintS04 的警告 ＋ cmpRow 的 sub2）
     MSG_FILL_ONE    1 次（paintS04）
   佇列寫「各被 ≥2 處引用」，但原型裡有兩句只出現一次——
   照字面訂下限會是個永遠達不到的假目標。真正要守的是**第二份字面量不准存在**，
   那一條在下面是硬的。 */
const PROTO_USES: Record<(typeof NAMES)[number], number> = {
  MSG_NO_RATE: 1, MSG_TWD_PENDING: 2, MSG_FILL_ONE: 1,
};

describe('C-3-5　同一句文案只准寫一次', () => {
  it('掃描範圍本身要有東西——一個檔都沒掃到的話下面全是假通過', () => {
    expect(FILES.length, `只掃到 ${FILES.length} 個檔`).toBeGreaterThan(15);
  });

  for (const name of NAMES) {
    it(`${name}：引用次數不少於原型，且沒有第二份字面量`, () => {
      const users: string[] = [];
      const literals: string[] = [];
      let uses = 0;
      for (const f of FILES) {
        const src = fs.readFileSync(f, 'utf8');
        if (f.endsWith('lib/messages.ts')) {
          /* 定義處：字面量只准出現在這裡 */
          expect(src).toContain(TEXT[name]);
          continue;
        }
        const hits = src.match(new RegExp(`\\b${name}\\b`, 'g'));
        if (hits) { uses += hits.length; users.push(`${f}×${hits.length}`); }
        if (src.includes(TEXT[name])) literals.push(f);
      }
      /* 掃到幾次、哪幾個檔都要輸出，不能只回布林值 */
      expect(uses,
        `${name} 只被引用 ${uses} 次（${users.join('、')}），原型用了 ${PROTO_USES[name]} 次`)
        .toBeGreaterThanOrEqual(PROTO_USES[name]);
      /* 這一條才是重點：同一句話不准有第二份字面量 */
      expect(literals,
        `${name} 有第二份字面量：${literals.join('、')}`).toEqual([]);
    });
  }
});
