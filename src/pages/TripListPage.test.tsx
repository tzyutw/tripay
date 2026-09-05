/* 實作-A2-② 的環境驗收 ＋ 實作-B-2 的 S-01 對原型文字比對。
 *
 * 基準是 `src/test/fixtures/screens.json` 的 s01——原型**操作模式**的字串集合。
 * 原型是規格，所以比對對象是原型，不是「上一版的自己」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import screens from '@/test/fixtures/screens.json';
import { render, makeSupabaseMock, visibleTexts } from '@/test/utils';

const base = {
  emoji: '✈️', currency: 'JPY', kind: 'trip', owner_id: 'u1', share_token: 'tok',
  cover_path: null, settlement_mode: 'direct', hub_member_id: null, owner_member_id: null,
  collab_enabled: false, card_id: null, payment_methods: null,
  cash_rate_twd: null, cash_rate_foreign: null, tone_seq: 0,
  created_at: '2026-03-01', updated_at: '2026-03-01', trip_members: [],
};
const member = {
  id: 'm1', trip_id: 't1', name: 'Rozi', emoji: '🐵', sort_order: 0,
  linked_profile_id: null, person_id: null, user_id: null, role: null, created_at: '2026-03-01',
};

/* 原型的示範資料：三張卡剛好蓋掉「旅途中／已結算／已封存」三種徽章。
   出發日已過且 status=active → 旅途中，不必依賴今天是哪一天。 */
const trips = [
  { ...base, id: 't1', name: '2026 濟州島四寶團', start_date: '2026-03-14',
    end_date: '2026-03-18', status: 'active',   trip_members: [member] },
  { ...base, id: 't2', name: '2024 東京富士山五寶團', start_date: '2024-11-02',
    end_date: '2024-11-08', status: 'settled' },
  { ...base, id: 't3', name: '2023 福岡三人行', start_date: '2023-04-06',
    end_date: '2023-04-11', status: 'archived' },
];

vi.mock('@/lib/supabaseClient', () => ({ supabase: makeSupabaseMock({ trips }) }));

let TripListPage: typeof import('./TripListPage').default;
beforeEach(async () => { TripListPage = (await import('./TripListPage')).default; });

const want = (screens as Record<string, { list: string[]; text: string }>).s01;
const flat = () => (document.body.textContent ?? '').replace(/\s+/g, '');

describe('測試環境：S-01 行程列表', () => {
  it('render 得起來，而且畫面上有「Tripay」', async () => {
    render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('Tripay')).toBeInTheDocument());
  });

  it('資料真的畫出來了——不是只剩一個空殼', async () => {
    render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());
    const texts = visibleTexts();
    expect(texts).toContain('Tripay');
    expect(texts.length).toBeGreaterThan(3);   // 目標不存在時不得算通過
  });
});

describe('B-2　S-01 首頁', () => {
  it('原型上的每一段文字都要出現', async () => {
    render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());

    expect(want.list.length).toBe(12);          // 基準本身要有東西，否則下面全是假通過
    const got = flat();
    const missing = want.list.filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing, `原型有、App 沒有：${missing.join(' ｜ ')}`).toEqual([]);
  });

  it('S-01-9／10：G-06 分享橫幅與「複製連結」鈕已移除', async () => {
    render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());
    const got = flat();
    const extra = ['分享行程連結，朋友免下載就能看帳', '複製連結', '🔗']
      .filter(t => got.includes(t.replace(/\s+/g, '')));
    expect(extra, `原型沒有、App 卻多出來：${extra.join(' ｜ ')}`).toEqual([]);
  });

  it('S-01-13／14：卡片下緣沒有成員 emoji（只有首頁這樣）', async () => {
    render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());
    /* 這筆行程真的有一位掛著 🐵 的成員——沒抓到不是因為資料是空的 */
    expect(trips[0].trip_members.length).toBe(1);
    expect(flat()).not.toContain('🐵');
  });

  it('S-01-2：「＋」是 Feather 的 add，不是全形字元', async () => {
    const { container } = render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());
    expect(flat()).not.toContain('＋');
    const newBtn = [...container.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').includes('新增行程'))!;
    expect(newBtn).toBeTruthy();
    expect(newBtn.querySelector('svg')).not.toBeNull();
    expect(newBtn.querySelector('svg')!.getAttribute('stroke')).toBe('currentColor');
  });

  it('S-01-15：設定入口在標題列右上、排在「新增行程」之後', async () => {
    const { container } = render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());

    const gear = container.querySelector('button[aria-label="設定"]') as HTMLElement;
    expect(gear, '找不到設定入口').not.toBeNull();
    /* 第一層「畫面層級的動作」＝ .ic2，不是裸 icon 也不是第二層 */
    expect(gear.className).toContain('ic2');

    const newBtn = [...container.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').includes('新增行程'))!;
    /* 依賴／頻率：新增行程比設定常用，所以設定排在它之後 */
    expect(newBtn.compareDocumentPosition(gear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('S-01-6：狀態徽章三態都對，而且「已結算」不帶 ✅', async () => {
    render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());
    const got = flat();
    for (const label of ['旅途中', '已結算', '已封存'])
      expect(got, `缺狀態徽章：${label}`).toContain(label);
    /* ✅ 是「表示狀態的圖形」不是內容，走不了 emoji 的豁免 */
    expect(got).not.toContain('✅');
  });

  it('日期區間跟原型同一種算法（純字串切片，不受時區影響）', async () => {
    render(<TripListPage />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());
    const got = flat();
    for (const d of ['3/14–3/18·2026', '11/2–11/8·2024', '4/6–4/11·2023'])
      expect(got, `日期對不上：${d}`).toContain(d);
  });
});

describe('B-2　S-01 空狀態', () => {
  beforeEach(() => { vi.resetModules(); });

  it('S-01-4：空狀態要有主要按鈕「建立第一趟」', async () => {
    vi.doMock('@/lib/supabaseClient', () => ({ supabase: makeSupabaseMock({ trips: [] }) }));
    const Page = (await import('./TripListPage')).default;
    const { container } = render(<Page />, { route: '/trips' });
    await waitFor(() => expect(screen.getByText('還沒有行程。')).toBeInTheDocument());

    expect(screen.getByText('第一趟要去哪？')).toBeInTheDocument();
    const cta = [...container.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').replace(/\s+/g, '') === '建立第一趟');
    expect(cta, '空狀態沒有 CTA——讀碼發現 #11').toBeTruthy();
    expect(cta!.querySelector('svg')).not.toBeNull();   // ic('add',16)，不是全形＋
  });
});
