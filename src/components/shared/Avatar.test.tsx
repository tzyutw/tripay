/* 實作-E-②　S-02c-10 成員頭像的三層 fallback。
 * 逐條對照 Tripay_原型.html 的 avatar()（993–1002）。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { render } from '@testing-library/react';
import Avatar, { LETTER_COLORS } from './Avatar';

describe('S-02c-10　三層 fallback', () => {
  it('LETTER_COLORS 逐字等於原型第 947 行', () => {
    const proto = fs.readFileSync('Tripay_原型.html', 'utf8');
    const m = proto.match(/const LETTER_COLORS = \[([^\]]+)\]/);
    expect(m, '原型裡找不到 LETTER_COLORS').not.toBeNull();
    const want = m![1].split(',').map(x => x.trim().replace(/^'|'$/g, ''));
    expect(LETTER_COLORS).toEqual(want);
    expect(LETTER_COLORS.length).toBe(6);
  });

  it('① 有 emoji → 顯示該 emoji，不套填色圓底', () => {
    const { container } = render(<Avatar emoji="🐵" name="Rozi" index={0} />);
    const el = container.querySelector('.avatar') as HTMLElement;
    expect(el.textContent).toBe('🐵');
    expect(el.className, '有 emoji 不該套 letter').not.toContain('letter');
    expect(el.style.background).toBe('');
  });

  it('② 沒 emoji、名字非空 → 名字第一個字 ＋ 填色圓底', () => {
    const { container } = render(<Avatar emoji="" name="Rozi" index={0} />);
    const el = container.querySelector('.avatar') as HTMLElement;
    expect(el.textContent).toBe('R');
    expect(el.className, '缺 letter 類').toContain('letter');
    /* 「非透明背景色」——不能是空字串、也不能是 transparent */
    expect(el.style.background, '缺填色圓底').not.toBe('');
    expect(el.style.background).not.toBe('transparent');
  });

  it('② 底色跟著順位走（LETTER_COLORS[idx % 長度]）', () => {
    const hex = (n: number) => {
      const { container } = render(<Avatar emoji={null} name="小美" index={n} />);
      return (container.querySelector('.avatar') as HTMLElement).style.background;
    };
    const rgb = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    expect(hex(0)).toBe(rgb(LETTER_COLORS[0]));
    expect(hex(2)).toBe(rgb(LETTER_COLORS[2]));
    /* 取模：第 7 位（index 6）繞回第一個顏色 */
    expect(hex(6)).toBe(rgb(LETTER_COLORS[0]));
  });

  it('② 取的是 grapheme 不是 name[0]——組合字不能被切斷', () => {
    for (const [name, want] of [['👩‍👧 家庭', '👩‍👧'], ['🇹🇼 台灣', '🇹🇼'], ['安安', '安']] as const) {
      const { container } = render(<Avatar emoji={null} name={name} index={0} />);
      expect((container.querySelector('.avatar') as HTMLElement).textContent,
        `${name} 應取到 ${want}`).toBe(want);
    }
  });

  it('③ 兩者皆無 → 🙂', () => {
    const { container } = render(<Avatar emoji={null} name="" index={0} />);
    const el = container.querySelector('.avatar') as HTMLElement;
    expect(el.textContent).toBe('🙂');
    expect(el.className).not.toContain('letter');
  });

  it('有 onClick 時是 button，沒有時是 span（唯讀處不該長得可點）', () => {
    const a = render(<Avatar emoji="🐵" onClick={() => {}} />).container.querySelector('.avatar')!;
    const b = render(<Avatar emoji="🐵" />).container.querySelector('.avatar')!;
    expect(a.tagName).toBe('BUTTON');
    expect(b.tagName).toBe('SPAN');
  });
});

describe('S-02c-10　S-02 與 S-02b 走同一個元件', () => {
  it('TripFormSheet 用 Avatar，沒有自己再寫一份', () => {
    const src = fs.readFileSync('src/components/TripFormSheet.tsx', 'utf8');
    expect(src).toContain("from '@/components/shared/Avatar'");
    /* 第二層永遠走不到的成因：新成員預設塞了 '🙂' */
    expect(src, "新成員的 emoji 預設不得是 '🙂'，否則第二層永遠走不到")
      .not.toMatch(/useState\('🙂'\)/);
  });
});
