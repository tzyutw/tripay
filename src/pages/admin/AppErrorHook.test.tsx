/* 後台-D 接線：真正的 <App/> 裡，頁面讀取失敗、存檔失敗時，全域掛勾會記一筆；
   而且頁面原本的錯誤畫面照常出現（記錄是旁聽，不改行為）。 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const logs = vi.hoisted(() => [] as { kind: string; err: unknown }[]);
vi.mock('@/lib/errorLog', () => ({
  logClientError: (kind: string, err: unknown) => { logs.push({ kind, err }); },
  installErrorLogFlush: () => {},
}));
vi.mock('@/lib/supabaseClient', async () => {
  const { makeSupabaseMock } = await import('@/test/utils');
  const sb = makeSupabaseMock({});
  const fail = { data: null, error: { message: 'Failed to fetch' } };
  const chain: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(fail).then(r) };
  for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in', 'neq', 'not'])
    chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve(fail);
  chain.single = chain.maybeSingle;
  sb.from = vi.fn(() => chain) as never;
  return { supabase: sb };
});

import App from '@/App';

describe('全域錯誤掛勾', () => {
  it('行程列表讀不到：記一筆 sync，畫面照樣顯示原本的「讀不到」', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    await waitFor(() => expect(logs.some(l => l.kind === 'sync')).toBe(true), { timeout: 5000 });
    expect(await screen.findByText('現在讀不到你的行程')).toBeInTheDocument();
  });
});
