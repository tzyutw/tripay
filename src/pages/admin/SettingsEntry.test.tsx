/* 後台入口：只有管理者在設定頁看得到；其他人設定頁跟改動前完全一樣。 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { render } from '@/test/utils';

const st = vi.hoisted(() => ({ admin: null as boolean | null | 'error' }));
vi.mock('@/lib/supabaseClient', async () => {
  const { makeSupabaseMock } = await import('@/test/utils');
  const sb = makeSupabaseMock({});
  sb.auth.getUser = vi.fn(() => Promise.resolve({
    data: { user: { id: 'u1', email: 'x@example.test', user_metadata: { full_name: 'Rozi' } } }, error: null,
  })) as never;
  sb.rpc = vi.fn(() => Promise.resolve(st.admin === 'error'
    ? { data: null, error: { message: 'Could not find the function public.admin_check' } }
    : { data: st.admin, error: null })) as never;
  return { supabase: sb };
});

import SettingsPage from '@/pages/SettingsPage';
import { supabase } from '@/lib/supabaseClient';

const show = () => render(
  <Routes>
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/admin" element={<div>後台頁</div>} />
  </Routes>, { route: '/settings' });

beforeEach(() => { st.admin = null; });

describe('設定頁的後台入口', () => {
  it('管理者：看得到入口，按了進後台', async () => {
    st.admin = true;
    show();
    fireEvent.click(await screen.findByText('後台（只有你看得到）'));
    expect(await screen.findByText('後台頁')).toBeInTheDocument();
  });

  it.each([[false], [null], ['error']] as const)('不是管理者（admin_check 回 %s）：沒有入口', async v => {
    st.admin = v;
    show();
    await screen.findByText('Rozi');
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('admin_check'));
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText(/後台/)).toBeNull();
  });
});
