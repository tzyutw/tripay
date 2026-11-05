/* 後台畫面測試。
 *   - 守門：不是管理者、或資料庫還沒套 migration → 直接回行程列表
 *   - A～E 每一區都有東西
 *   - **唯讀**：整個後台走一圈，對資料表的 from()／insert／update／delete 次數都是 0
 *   - **結算與家人手機一致**：同一份資料，結算頁畫出來的轉帳金額＝後台畫出來的
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { render, supabaseWrites } from '@/test/utils';
import { baseTrip, demoExpenses, mk, M } from '@/test/fixtures/adminFixture';

const st = vi.hoisted(() => ({
  isAdmin: true as boolean | 'error',
  snapshot: null as unknown,
  audit: [] as unknown[],
  errors: [] as unknown[],
  rpcCalls: [] as { fn: string; args: unknown }[],
  rows: {} as Record<string, unknown[]>,
}));

vi.mock('@/lib/supabaseClient', async () => {
  const { makeSupabaseMock } = await import('@/test/utils');
  const sb = makeSupabaseMock(new Proxy({}, {
    get: (_, k: string) => st.rows[k] ?? [],
  }) as never);
  sb.rpc = vi.fn((fn: string, args?: unknown) => {
    st.rpcCalls.push({ fn, args });
    if (fn === 'admin_check')
      return Promise.resolve(st.isAdmin === 'error'
        ? { data: null, error: { message: 'function admin_check does not exist' } }
        : { data: st.isAdmin, error: null });
    if (!st.isAdmin || st.isAdmin === 'error')
      return Promise.resolve({ data: null, error: { message: 'forbidden', code: '42501' } });
    if (fn === 'admin_snapshot') return Promise.resolve({ data: st.snapshot, error: null });
    if (fn === 'admin_audit') return Promise.resolve({ data: st.audit, error: null });
    if (fn === 'admin_errors') return Promise.resolve({ data: st.errors, error: null });
    return Promise.resolve({ data: null, error: null });
  }) as never;
  return { supabase: sb };
});

import AdminPage from './AdminPage';
import SettlementPage from '@/pages/SettlementPage';
import { supabase } from '@/lib/supabaseClient';

const TRIP_OK = { ...baseTrip, id: 't2', name: 'ZZ 沒問題的一趟',
  trip_members: baseTrip.trip_members.map(m => ({ ...m, trip_id: 't2' })),
  last_activity_at: '2026-11-04T00:00:00Z', deleted_expense_count: 0, recent_error_count: 0 };
const TRIP_BAD = { ...baseTrip, last_activity_at: '2026-10-01T00:00:00Z',
  deleted_expense_count: 2, recent_error_count: 1 };

function snapshot(expenses = demoExpenses()) {
  return {
    audit_started_at: '2026-11-05T00:00:00Z',
    trips: [TRIP_OK, TRIP_BAD],
    expenses: [...expenses, mk({ id: 'ok1', trip_id: 't2', title: '便當', twd_amount: 400 })],
    settlements: [],
    users: [
      { id: 'u1', email: 'owner@example.test', display_name: 'Rozi', created_at: '2026-07-01T00:00:00Z',
        last_sign_in_at: '2026-11-05T00:00:00Z', last_active_at: '2026-11-05T00:00:00Z', is_admin: true },
      { id: 'u2', email: 'mei@example.test', display_name: '小美本人', created_at: '2026-07-02T00:00:00Z',
        last_sign_in_at: '2026-11-01T00:00:00Z', last_active_at: '2026-11-02T00:00:00Z', is_admin: false },
    ],
  };
}

const show = (route: string) => render(
  <Routes>
    <Route path="/" element={<div>家人的行程列表</div>} />
    <Route path="/admin/*" element={<AdminPage />} />
  </Routes>, { route });

let baseTripOverride: unknown = null;
beforeEach(() => {
  baseTripOverride = null;
  st.isAdmin = true; st.snapshot = snapshot(); st.audit = []; st.errors = []; st.rpcCalls = [];
  st.rows = {};
  supabaseWrites.length = 0;
});

describe('守門', () => {
  it('不是管理者：打 /admin 會被送回行程列表，而且拿不到快照', async () => {
    st.isAdmin = false;
    show('/admin');
    await screen.findByText('家人的行程列表');
    expect(st.rpcCalls.map(c => c.fn)).toEqual(['admin_check']);
  });
  it('資料庫還沒套 migration（函式不存在）：一樣回行程列表，不會白畫面', async () => {
    st.isAdmin = 'error';
    show('/admin/trips/t1');
    await screen.findByText('家人的行程列表');
  });
});

describe('A 行程總覽', () => {
  it('有異常的排最上面，帶紅點與數字；其他欄位都在', async () => {
    show('/admin');
    await screen.findByText('全部行程 2 趟');
    const rows = document.querySelectorAll('button.rowb');
    expect(rows[0].textContent).toContain('ZZ 濟州島四寶團');
    expect(rows[1].textContent).toContain('ZZ 沒問題的一趟');
    /* 3 個資料問題＋1 筆近 7 天錯誤 */
    expect(within(rows[0] as HTMLElement).getByLabelText('4 個異常')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByLabelText(/個異常/)).toBeNull();
    expect(rows[0].textContent).toContain('旅途中');
    expect(rows[0].textContent).toContain('4 人');
    expect(rows[0].textContent).toContain('10 筆帳');
    expect(rows[0].textContent).toContain('最後動作');
  });
});

describe('B 行程詳情', () => {
  it('成員：建立者／有帳號／沒有帳號（由建立者代記），沒帳號不算異常', async () => {
    show('/admin/trips/t1');
    await screen.findByText('成員 4 人');
    const txt = document.body.textContent!;
    expect(txt).toContain('行程建立者（owner@example.test）');
    expect(txt).toContain('記了 10 筆');                // Rozi 是建立者那一列
    expect(txt).toContain('有帳號（mei@example.test）');
    expect(screen.getAllByText('沒有帳號（由建立者代記）')).toHaveLength(2);
    expect(txt).not.toContain('最後使用 —');
    expect(screen.queryByText(/沒有帳號.*問題|問題.*沒有帳號/)).toBeNull();
    expect(screen.getByText('阿 阿明')).toBeInTheDocument();   // 沒 emoji → 名字第一個字
  });

  it('健康檢查：白話寫出哪一筆、什麼問題', async () => {
    show('/admin/trips/t1');
    await screen.findByText('3 個問題');
    expect(screen.getByText(/小美 被算成 −\$10,965/)).toBeInTheDocument();
    expect(screen.getByText('問題 · 3/15 城山日出峰門票')).toBeInTheDocument();
    expect(screen.getByText(/但這趟還沒設現金匯率，換不成台幣/)).toBeInTheDocument();
    expect(screen.getByText('問題 · 3/14 計程車')).toBeInTheDocument();
  });

  it('帳目：時間、誰記的、品項、金額＋幣別、付款方式、誰付的、分給誰各多少；可依成員篩選', async () => {
    show('/admin/trips/t1');
    await screen.findByText('10 筆');
    const card = screen.getByText(/黑豬肉晚餐/).closest('div.bg-white') as HTMLElement;
    const t = card.textContent!;
    expect(t).toContain('KRW 108,000 ／ $2,480');
    expect(t).toContain('阿明 付的');
    expect(t).toContain('信用卡');
    expect(t).toContain('Rozi 記於');
    expect(t).toContain('分給 4 人：Rozi $620、小美 $620、阿明 $620、小魚 $620');

    fireEvent.click(within(screen.getByRole('group', { name: '依成員篩選' })).getByText('小魚'));
    await screen.findByText('7 筆');
    expect(screen.queryByText(/紀念品/)).toBeNull();     // 只算小美的那筆不見了
  });

  it('「誰記的」資料裡沒有記錄者（或不是已知帳號）時，顯示行程建立者', async () => {
    st.snapshot = snapshot([...demoExpenses(), mk({ id: 'x1', title: '沒記錄者的帳', twd_amount: 100,
      created_by: null }), mk({ id: 'x2', title: '記錄者不明的帳', twd_amount: 100, created_by: 'ghost' })]);
    show('/admin/trips/t1');
    for (const t of ['沒記錄者的帳', '記錄者不明的帳']) {
      const card = (await screen.findByText(new RegExp(t))).closest('div.bg-white')!;
      expect(card.textContent).toContain('Rozi 記於');
    }
  });

  it('結算結果在、操作紀錄寫明從哪天開始', async () => {
    show('/admin/trips/t1');
    await screen.findByText('結算結果（與家人手機上看到的相同）');
    expect(screen.getByText(/還沒結算，家人看到的是即時試算/)).toBeInTheDocument();
    expect(screen.getAllByText(/操作紀錄從 11\/5 08:00 開始，之前的沒有紀錄。/).length).toBeGreaterThan(0);
  });
});

describe('結算與家人手機上一模一樣', () => {
  const amountsOnSettlementPage = async () => {
    st.rows = { trips: [baseTripOverride ?? baseTrip], expenses: demoExpenses(), settlements: st.rows.settlements ?? [] };
    const r = render(<SettlementPage />, { route: '/trips/t1/settlement', path: '/trips/:id/settlement' });
    await waitFor(() => expect(document.querySelectorAll('.txrow').length).toBeGreaterThan(0));
    const got = [...document.querySelectorAll('.txrow')].map(x =>
      x.querySelector('.money')!.textContent!.replace(/[^\d]/g, '')).map(Number).sort((a, b) => a - b);
    r.unmount();
    return got;
  };
  const amountsInAdmin = async () => {
    const r = show('/admin/trips/t1');
    await screen.findByText('誰給誰');
    const sec = screen.getByText('誰給誰').parentElement!;
    const got = [...sec.querySelectorAll('div')].map(d => d.textContent ?? '')
      .filter(s => s.includes('→')).map(s => Number(s.replace(/.*\$/, '').replace(/[^\d]/g, '')))
      .sort((a, b) => a - b);
    r.unmount();
    return got;
  };

  it('還沒結算：轉帳金額逐筆相同', async () => {
    const a = await amountsOnSettlementPage();
    const b = await amountsInAdmin();
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it('已結算、還有人沒付清：兩邊都顯示凍結的那份', async () => {
    const items = [
      { id: 'i1', settlement_id: 's1', from_member_id: M[3], to_member_id: M[0], amount: 20220, is_cleared: true, cleared_at: null },
      { id: 'i2', settlement_id: 's1', from_member_id: M[2], to_member_id: M[0], amount: 17740, is_cleared: false, cleared_at: null },
    ];
    const settlement = { id: 's1', trip_id: 't1', status: 'confirmed', created_at: '2026-03-20', settlement_items: items };
    st.rows = { settlements: [settlement] };
    const settledTrip = { ...baseTrip, status: 'settled' };
    baseTripOverride = settledTrip;
    (st.snapshot as { settlements: unknown[]; trips: unknown[] }).settlements = [settlement];
    (st.snapshot as { trips: unknown[] }).trips = [TRIP_OK, { ...TRIP_BAD, status: 'settled' }];
    const a = await amountsOnSettlementPage();
    const b = await amountsInAdmin();
    expect(a).toEqual([17740, 20220]);
    expect(b).toEqual(a);
  });

  it('有已確認結算、但行程沒標已結算（例如重新開啟後）：兩邊都回到即時試算', async () => {
    const items = [{ id: 'i1', settlement_id: 's1', from_member_id: M[3], to_member_id: M[0],
                     amount: 1, is_cleared: false, cleared_at: null }];
    const settlement = { id: 's1', trip_id: 't1', status: 'confirmed', created_at: '2026-03-20', settlement_items: items };
    st.rows = { settlements: [settlement] };
    (st.snapshot as { settlements: unknown[] }).settlements = [settlement];
    const a = await amountsOnSettlementPage();
    const b = await amountsInAdmin();
    expect(a).not.toContain(1);
    expect(b).toEqual(a);
  });
});

describe('C 操作紀錄 / D 錯誤紀錄 / E 用人查', () => {
  it('操作紀錄：誰、什麼時間、改前改後、哪一趟', async () => {
    st.audit = [{ id: 1, at: '2026-11-05T03:00:00Z', actor: 'u2', table_name: 'expenses', op: 'UPDATE',
      row_id: 'e1', trip_id: 't1', expense_id: 'e1',
      old_row: { title: '拉麵', twd_amount: 1000 }, new_row: { title: '拉麵', twd_amount: 1200 } }];
    show('/admin/log');
    await screen.findByText('修改帳目');
    const t = document.body.textContent!;
    expect(t).toContain('11/5 11:00 · 小美本人 · ZZ 濟州島四寶團');
    expect(t).toContain('台幣金額：1,000 → 1,200');
    expect(t).toContain('操作紀錄從 11/5 08:00 開始');
  });

  it('錯誤紀錄：時間、誰、哪個行程、哪個畫面、錯誤訊息', async () => {
    st.errors = [{ id: 1, at: '2026-11-05T03:10:00Z', occurred_at: '2026-11-05T03:00:00Z', user_id: 'u2',
      trip_id: 't1', screen: '記帳頁', path: '/trips/t1', kind: 'save', message: 'Failed to fetch',
      user_agent: 'x', app_version: 'abc' }];
    show('/admin/errors');
    await screen.findByText('存檔失敗');
    const t = document.body.textContent!;
    expect(t).toContain('11/5 11:00 · 小美本人 · ZZ 濟州島四寶團 · 記帳頁');
    expect(t).toContain('Failed to fetch');
    expect(t).toContain('當時離線，11/5 11:10 才補送上來');
  });

  it('用人查：列出登入帳號（建了幾趟、記了幾筆、最後使用）→ 選一個看建立的行程＋最近 20 筆動作', async () => {
    show('/admin/people');
    await screen.findByText('登入帳號 2 個');
    const rozi = screen.getByText('owner@example.test').closest('button')!;
    expect(rozi.textContent).toContain('建了 2 趟 · 記了 11 筆');
    const mei = screen.getByText('mei@example.test').closest('button')!;
    expect(mei.textContent).toContain('建了 0 趟 · 記了 0 筆');
    fireEvent.click(screen.getByText('小美本人'));
    await screen.findByText('建立的行程 0 趟');
    expect(screen.getByText('這個帳號沒有建立過行程。')).toBeInTheDocument();
    expect(screen.getByText('被綁為成員的行程 2 趟')).toBeInTheDocument();
    await waitFor(() => expect(st.rpcCalls).toContainEqual(
      { fn: 'admin_audit', args: { p_trip: null, p_actor: 'u2', p_limit: 20 } }));
    expect(screen.getByText('最近 20 筆動作')).toBeInTheDocument();
  });
});

describe('唯讀', () => {
  it('把後台每一頁都走過、每個篩選都按過：沒有任何一次寫入，也沒有直接查資料表', async () => {
    for (const route of ['/admin', '/admin/trips/t1', '/admin/log', '/admin/errors', '/admin/people/u2']) {
      const r = show(route);
      await waitFor(() => expect(document.querySelector('[data-admin]')).not.toBeNull());
      await waitFor(() => expect(document.querySelector('.spin')).toBeNull());
      for (const b of [...document.querySelectorAll('button.chip')]) fireEvent.click(b);
      r.unmount();
    }
    expect(supabaseWrites).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(new Set(st.rpcCalls.map(c => c.fn)))
      .toEqual(new Set(['admin_check', 'admin_snapshot', 'admin_audit', 'admin_errors']));
  });
});
