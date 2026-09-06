/* 實作-J-6　裸元素選擇器不可以壓過元件寫的尺寸。
 *
 * **同型問題已經第三次**：
 *   ① `.sheet` 的 `overflow:hidden` 壓掉同一元素上的 `overflow-y-auto` → sheet 捲不動
 *   ② `.datefield` 搬進 CSS 了，畫面卻另寫 Tailwind → iOS 日期欄撐爆
 *   ③ 全域 `input[type=text]{width:100%}` 壓過 `w-8 h-8` → emoji 就地編輯框撐滿整列
 *
 * 原型裡這些規則活在 `.ui` scope 底下，搬過來拿掉前綴就變成全域 (0,1,1)，
 * 壓過 Tailwind utility 的 (0,1,0)。**尺寸／版面屬性一律用 `:where()` 降到 0。**
 * reset 與繼承類不在此限——`input{font-size:var(--fs-input)}` 是 iOS 的 16px 硬性下限，
 * 被 Tailwind 的 `text-*` 蓋掉會害點進輸入框時整頁自動放大。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const CSS = fs.readFileSync('src/index.css', 'utf8');

const ELEMENTS = ['input', 'button', 'select', 'textarea', 'a', 'h1', 'h2', 'h3'];
const ONE = `(?:${ELEMENTS.join('|')})(?:\\[[^\\]]*\\])?`;
/** 整條選擇器都是裸元素（沒有 class／id／:where 包住）才算 */
const BARE = new RegExp(`^(${ONE}(?:\\s*,\\s*${ONE})*)\\s*\\{([^}]*)\\}`, 'gm');
const LAYOUT = /(^|[;\s])(width|height|min-[a-z]+|max-[a-z]+|padding|margin|flex|position|overflow|display)\s*:/;

interface Rule { sel: string; body: string; layout: boolean }

function bareRules(): Rule[] {
  const out: Rule[] = [];
  for (const m of CSS.matchAll(BARE))
    out.push({ sel: m[1].trim(), body: m[2].trim(), layout: LAYOUT.test(m[2]) });
  return out;
}

describe('J-6　裸元素選擇器的特異度', () => {
  const rules = bareRules();

  it('掃描範圍本身要有東西——掃不到規則的話下面全是假通過', () => {
    console.log(`   裸元素規則 ${rules.length} 條：`);
    for (const r of rules)
      console.log(`     ${r.layout ? '版面' : 'reset'}｜${r.sel} { ${r.body.slice(0, 60)} }`);
    expect(rules.length, `只掃到 ${rules.length} 條`).toBeGreaterThanOrEqual(1);
  });

  it('帶尺寸／版面屬性的裸元素規則，一律要被 :where() 包住', () => {
    const bad = rules.filter(r => r.layout);
    expect(bad.map(r => `${r.sel} → ${r.body.slice(0, 70)}`),
      `這些規則會壓過元件寫的尺寸：${bad.map(r => r.sel).join('、')}`).toEqual([]);
  });

  it(':where() 版本確實存在（不是整條被刪掉了事）', () => {
    /* 規則要還在、只是降權重——刪掉的話輸入框會沒有邊框與底色 */
    expect(CSS).toMatch(/:where\(input\[type=text\][^)]*\)\s*\{[^}]*width:\s*100%/);
    expect(CSS).toMatch(/:where\(input\[type=date\]\)\s*\{[^}]*min-width:\s*0/);
  });

  it('reset 與繼承類**不要**被包起來——iOS 的 16px 下限要維持全域', () => {
    /* `input, textarea, select { font-size: var(--fs-input) }` 若被 :where() 降權，
       Tailwind 的 text-sub（13px）會蓋過去 → 點進輸入框整頁自動放大 */
    expect(CSS).toMatch(/^input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*var\(--fs-input\)/m);
    expect(CSS).not.toMatch(/:where\(input,\s*textarea,\s*select\)/);
  });
});
