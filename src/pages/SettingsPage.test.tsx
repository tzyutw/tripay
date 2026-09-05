/* 實作-B-7　S-07 設定對原型的比對，以及 EmojiPicker 已整檔刪除。 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import fs from 'fs';
import screens from '@/test/fixtures/screens.json';
import { render, makeSupabaseMock } from '@/test/utils';

const user = {
  id: 'u1', email: 'msziyu@gmail.com',
  user_metadata: { full_name: 'Rozi' },
};
vi.mock('@/lib/supabaseClient', async () => {
  const { makeSupabaseMock: mk } = await import('@/test/utils');
  const base = mk({});
  return {
    supabase: {
      ...base,
      auth: {
        ...base.auth,
        getUser: vi.fn(() => Promise.resolve({
          data: { user: { id: 'u1', email: 'msziyu@gmail.com',
                          user_metadata: { full_name: 'Rozi' } } },
          error: null,
        })),
      },
    },
  };
});

import SettingsPage from './SettingsPage';

const want = (screens as Record<string, { list: string[] }>).s07;
const flat = () => (document.body.textContent ?? '').replace(/\s+/g, '');

beforeEach(() => { void user; });

const show = async () => {
  render(<SettingsPage />, { route: '/settings' });
  await waitFor(() => expect(screen.getByText('Rozi')).toBeInTheDocument());
};

describe('B-7　S-07 設定', () => {
  it('原型上的每一段文字都要出現，不多不少', async () => {
    await show();
    expect(want.list.length).toBe(7);
    const got = flat();
    const missing = want.list.filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing, `原型有、App 沒有：${missing.join(' ｜ ')}`).toEqual([]);
  });

  it('**不要補做**「我的資料」與「顯示設定」兩段', async () => {
    await show();
    const got = flat();
    for (const bad of ['我的資料', '顯示設定', '通訊錄', '卡片管理', '帳單週期',
                       '深色模式', '跟隨系統', '即將推出'])
      expect(got, `已裁示整段拿掉，不得出現：${bad}`).not.toContain(bad);
  });

  it('S-07-6　登出是描邊、文字中性色 --md，**不是 --dg**（登出可復原）', async () => {
    await show();
    const btn = [...document.querySelectorAll('.btn')].find(b => b.textContent === '登出') as HTMLElement;
    expect(btn, '找不到登出鍵').toBeTruthy();
    expect(btn.className, '登出要用描邊（.qt）').toContain('qt');
    expect(btn.style.color).toBe('var(--md)');
    expect(btn.className).not.toContain('dg');
  });

  it('S-07-8　確認框也是描邊，不是實心紅', async () => {
    await show();
    fireEvent.click([...document.querySelectorAll('.btn')].find(b => b.textContent === '登出')!);
    expect(screen.getByText('確定要登出嗎？')).toBeInTheDocument();
    const confirm = [...document.querySelectorAll('.dlg .btn')]
      .find(b => b.textContent === '登出') as HTMLElement;
    expect(confirm.className, '確認鍵要描邊（.gh）').toContain('gh');
    expect(confirm.className).not.toContain('dg');
  });

  it('S-07-7　版本 footer 沒有版本號', async () => {
    await show();
    const foot = document.querySelector('.verfoot')!;
    expect(foot.textContent).toBe('Tripay · 每一趟，都記得');
    expect(flat()).not.toMatch(/v?\d+\.\d+\.\d+/);
  });

  it('S-07-1　返回是 .ic2（畫面層級的動作）', async () => {
    await show();
    const back = document.querySelector('button[aria-label="返回"]')!;
    expect(back.className).toContain('ic2');
    expect(back.querySelector('svg')).not.toBeNull();
  });
});

describe('B-7　EmojiPicker 整檔刪除', () => {
  it('檔案不存在', () => {
    expect(fs.existsSync('src/components/EmojiPicker.tsx')).toBe(false);
  });

  it('全專案零 import', () => {
    /* 這一份測試檔自己會提到這個名字，掃描時要排掉，否則永遠紅 */
    const SELF = 'src/pages/SettingsPage.test.tsx';
    const NAME = ['Emoji', 'Picker'].join('');
    const hits: string[] = [];
    let scanned = 0;
    (function walk(d: string) {
      for (const f of fs.readdirSync(d)) {
        const p = `${d}/${f}`;
        if (fs.statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(f) || p === SELF) continue;
        scanned += 1;
        if (fs.readFileSync(p, 'utf8').includes(NAME)) hits.push(p);
      }
    })('src');
    /* 掃到幾個檔要輸出——沒掃到任何檔的話這條會假通過 */
    expect(scanned, '一個檔都沒掃到，這條等於沒驗').toBeGreaterThan(10);
    /* 掃到幾個、哪幾個都要輸出——只回布林值時「查了但沒查到」與「沒有問題」長得一樣 */
    expect(hits, `還有檔案提到 EmojiPicker：${hits.join(' ｜ ')}`).toEqual([]);
  });
});
