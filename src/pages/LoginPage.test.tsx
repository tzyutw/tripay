/* 實作-B-2　S-00 登入對原型的文字比對與版面斷言。
 * 基準是 `src/test/fixtures/screens.json` 的 s00——原型**操作模式**的字串集合。
 */
import { describe, it, expect, vi } from 'vitest';
import screens from '@/test/fixtures/screens.json';
import { render, makeSupabaseMock } from '@/test/utils';
import LoginPage from './LoginPage';

vi.mock('@/lib/supabaseClient', () => ({ supabase: makeSupabaseMock({}) }));

const want = (screens as Record<string, { list: string[]; text: string }>).s00;
const flat = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, '');

describe('B-2　S-00 登入', () => {
  it('原型上的每一段文字都要出現，而且不多不少', () => {
    render(<LoginPage />);
    const got = flat(document.body);

    /* 目標不存在時要變紅：先確認基準本身有東西，再比內容 */
    expect(want.list.length).toBe(4);

    const missing = want.list.filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing, `原型有、App 沒有：${missing.join(' ｜ ')}`).toEqual([]);

    /* 反向：App 不得多出原型沒有的字。整頁只有這四段，串起來就該等於原型 */
    expect(got).toBe(want.list.map(t => t.replace(/\s+/g, '')).join(''));
  });

  it('S-00-1 App icon 與 S-00-6 幽靈卡已移除', () => {
    const { container } = render(<LoginPage />);
    expect(flat(document.body)).not.toContain('✈️');
    expect(container.querySelector('.ghost')).toBeNull();
  });

  it('S-00-5 是整頁唯一的按鈕', () => {
    const { container } = render(<LoginPage />);
    const btns = container.querySelectorAll('button');
    expect(btns.length).toBe(1);
    expect(btns[0].className).toContain('gbtn');
    expect(flat(btns[0] as HTMLElement)).toBe('用Google繼續');
  });

  it('S-00-5 用官方四色 G，不套 currentColor（全站 icon 規則的唯一例外）', () => {
    const { container } = render(<LoginPage />);
    const svg = container.querySelector('.gbtn svg')!;
    expect(svg).not.toBeNull();
    const fills = [...svg.querySelectorAll('path')].map(p => p.getAttribute('fill'));
    expect(fills).toEqual(['#4285F4', '#34A853', '#FBBC05', '#EA4335']);
    expect(svg.getAttribute('stroke')).toBeNull();
  });

  it('#28-3／#32-5 標語與登入鈕共用同一個欄——兩者都掛 .s00col', () => {
    const { container } = render(<LoginPage />);
    const cols = container.querySelectorAll('.s00col');
    expect(cols.length).toBe(2);                       // 標語一個、登入鈕一個
    expect(cols[0].querySelector('.s00tag')).not.toBeNull();
    expect(cols[1].querySelector('.gbtn')).not.toBeNull();
    expect(cols[1].className).toContain('s00act');
  });

  it('容器高度跟著可用高度走，沒有寫死的 min-height', () => {
    const { container } = render(<LoginPage />);
    const wrap = container.querySelector('.s00wrap') as HTMLElement;
    expect(wrap).not.toBeNull();
    /* 寫死的高度只會出現在 inline style；版面全在 .s00wrap 這個 class 裡 */
    expect(wrap.style.minHeight).toBe('');
    expect(wrap.style.height).toBe('');
  });
});
