/* 實作-B-6　S-06 分享頁對原型的比對。資料來源是 get_shared_trip() RPC。 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import screens from '@/test/fixtures/screens.json';
import { render } from '@/test/utils';

const M = ['m0', 'm1', 'm2', 'm3'];
const members = [
  { emoji: '🐵', name: 'Rozi' }, { emoji: '🐱', name: '小美' },
  { emoji: '🍋', name: '阿明' }, { emoji: '🐟', name: '小魚' },
].map((m, i) => ({ id: M[i], trip_id: 't1', name: m.name, emoji: m.emoji, sort_order: i }));

const trip = {
  id: 't1', name: '2026 濟州島四寶團', currency: 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  settlement_mode: 'direct', hub_member_id: null, tone_seq: 0,
  payment_methods: ['現金', '信用卡'], cash_rate_twd: null, cash_rate_foreign: null,
};

let seq = 0;
function mk(o: Record<string, unknown>) {
  seq += 1;
  const parts = (o.parts as string[]) ?? M;
  const indiv = (o.indiv as Record<string, number>) ?? {};
  const e = {
    id: `e${seq}`, trip_id: 't1', title: '', category_emoji: '➕', category_emoji_manual: false,
    expense_date: '2026-03-14', foreign_amount: null, twd_amount: null, exchange_rate: null,
    foreign_pending: false, twd_pending: false, payment_method: 'cash', payment_label: null,
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false,
    individual_member_id: null, split_fill_currency: 'TWD',
    created_at: new Date(2026, 0, seq).toISOString(), ...o,
  };
  const splits = parts.map(id => ({
    id: `s${seq}-${id}`, expense_id: e.id, member_id: id, is_participating: true,
    split_amount: (indiv[id] ?? null) as number | null,
    split_amount_foreign: null as number | null, split_pending: !(id in indiv),
  }));
  return { e, splits };
}

const built = [
  mk({ title: '機票 ×4', category_emoji: '✈️', expense_date: '2026-02-10',
       twd_amount: 28400, payment_method: 'credit_card', payer_member_id: M[0] }),
  mk({ title: '黑豬肉晚餐', category_emoji: '🍜', expense_date: '2026-03-14',
       foreign_amount: 108000, twd_amount: 2480, payment_method: 'credit_card', payer_member_id: M[2] }),
  mk({ title: '藥妝店', category_emoji: '🛍️', expense_date: '2026-03-15',
       foreign_amount: 45000, twd_amount: 1035, payment_method: 'credit_card',
       expense_type: 'individual', indiv: { [M[0]]: 12000, [M[1]]: 18000 }, payer_member_id: M[1] }),
  mk({ title: '城山日出峰門票', category_emoji: '🎡', expense_date: '2026-03-15',
       foreign_amount: 20000, payer_member_id: M[3] }),
  mk({ title: '紀念品', category_emoji: '🛍️', expense_date: '2026-03-16',
       twd_amount: 860, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[1] }),
  mk({ title: '機場接送', category_emoji: '🚌', expense_date: '2026-03-18',
       twd_amount: 1600, payer_member_id: M[0], settled_on_spot: true }),
  mk({ title: '計程車', category_emoji: '🚕', expense_date: '2026-03-16', payer_member_id: M[0] }),
  mk({ title: '爸爸贊助', category_emoji: '💝', expense_date: '2026-03-14',
       twd_amount: 50000, payer_member_id: M[0], is_sponsor: true }),
];

const payload = vi.hoisted(() => ({ v: null as unknown }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...a: unknown[]) => { rpc(...a); return Promise.resolve({ data: payload.v, error: null }); },
    from: () => { throw new Error('分享頁不得直接查表——013 已把 anon 讀取收掉'); },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  },
}));

import SharePage from './SharePage';

beforeEach(() => {
  rpc.mockClear();
  payload.v = {
    trip, members,
    expenses: built.map(b => b.e),
    splits: built.flatMap(b => b.splits),
    settlements: [
      { id: 'st1', trip_id: 't1', status: 'confirmed', settled_at: '2026-03-20T00:00:00Z' },
    ],
    settlement_items: [
      { id: 'i1', settlement_id: 'st1', from_member_id: M[3], to_member_id: M[0], amount: 20220 },
      { id: 'i2', settlement_id: 'st1', from_member_id: M[2], to_member_id: M[0], amount: 17740 },
      { id: 'i3', settlement_id: 'st1', from_member_id: M[1], to_member_id: M[0], amount: 8220 },
    ],
  };
});

const flat = () => (document.body.textContent ?? '').replace(/\s+/g, '');
const show = async () => {
  render(<SharePage />, { route: '/share/tok', path: '/share/:token' });
  await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());
};

/* 原型的 S-06 hero 仍然把成員 emoji 接在日期後面，fixture 也是這樣抓的。
   **Rozi 2026-09-05 已裁示：不要 emoji，維持現狀**——與行程頁 S-03 一致，
   收到連結的人第一眼該看到的是「哪一趟、什麼時候」。原型此處待日後同步。
   這個常數留著當守門的：hero 哪天又被接回 emoji，下面那條就會紅。 */
const KNOWN_DIVERGENCE = '3/14 – 3/18 · 2026 🐵🐱🍋🐟';

describe('B-6　S-06 分享頁', () => {
  it('資料走 get_shared_trip() RPC，不直接查表', async () => {
    await show();
    expect(rpc).toHaveBeenCalledWith('get_shared_trip', { p_token: 'tok' });
  });

  it('原型上的每一段文字都要出現（hero 成員 emoji 那一項除外）', async () => {
    await show();
    fireEvent.click(screen.getByText('總花費'));

    const list = (screens as Record<string, { list: string[] }>).s06.list;
    expect(list.length).toBe(81);
    expect(list, '基準裡應該找得到那一項已知出入').toContain(KNOWN_DIVERGENCE);

    const got = flat();
    const missing = list
      .filter(t => t !== KNOWN_DIVERGENCE)
      .filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing, `原型有、App 沒有：${missing.join(' ｜ ')}`).toEqual([]);
  });

  it('hero 拿掉成員 emoji，只留日期區間', async () => {
    await show();
    const hero = document.querySelector('.hero') as HTMLElement;
    expect(hero).not.toBeNull();
    expect(hero.textContent).toContain('3/14 – 3/18 · 2026');
    for (const e of ['🐵', '🐱', '🍋', '🐟'])
      expect(hero.textContent, `hero 不該有成員 emoji：${e}`).not.toContain(e);
  });

  it('S-06-5／6　外幣格與人均消失——這是共用元件的預期結果，不要補回去', async () => {
    await show();
    const got = flat();
    expect(got).not.toContain('人均');
    expect(got).not.toContain('₩');
  });

  it('全頁唯讀：消費列是 div、每人分擔列不可點、註腳不邀請點擊', async () => {
    await show();
    fireEvent.click(screen.getByText('總花費'));

    const rows = [...document.querySelectorAll('.exprow')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.tagName === 'DIV')).toBe(true);

    const per = [...document.querySelectorAll('.perrow')];
    expect(per.length).toBe(4);
    expect(per.every(r => r.tagName === 'DIV'), '每人分擔列不得可點').toBe(true);

    /* 註腳不寫「點名字看是哪幾筆」——那裡沒有 S-03d 可以進 */
    expect(flat()).toContain('標「約」的金額還沒算清楚');
    expect(flat()).not.toContain('點名字看是哪幾筆');
  });

  it('總花費排除贊助，與行程頁同一套算法（兩頁數字不得不同）', async () => {
    await show();
    /* 34,375 是 S-03 那一頁算出來的同一個數字 */
    expect(flat()).toContain('$34,375');
  });

  it('消費明細改日期分組、列上不寫日期', async () => {
    await show();
    const secs = [...document.querySelectorAll('.sec')].map(s => s.textContent);
    expect(secs).toContain('消費明細');
    expect(secs.some(s => s?.includes('第 5 天'))).toBe(true);
    expect(secs[secs.length - 1]).toBe('出發前');
  });

  it('S-06-12　頁尾文案改了；S-06-13 安裝鈕整顆移除（連 state 與 listener）', async () => {
    await show();
    expect(screen.getByText('這趟帳是用 Tripay 記的')).toBeInTheDocument();
    expect(screen.getByText('開一趟自己的')).toBeInTheDocument();
    expect(flat()).not.toContain('安裝');

    const src = await import('fs').then(fs => fs.readFileSync('src/pages/SharePage.tsx', 'utf8'));
    expect(src, 'listener 也要一起清掉').not.toContain('beforeinstallprompt');
    expect(src).not.toContain('pwaPrompt');
  });
});

/* ══════════════════════════════════════════════════════════════
   實作-G　上線後複驗：分享頁把「誰付給誰」重複列了 12 次
   根因：`get_shared_trip()` 回的是**這趟全部的結算**（superseded／draft／confirmed），
   我改走 RPC 時把「挑 confirmed 那一次」那層篩選弄丟了。
   改版前的 SharePage 有挑（`.eq('status','confirmed')`），SettlementPage 現在也還有。
   ══════════════════════════════════════════════════════════════ */
describe('G-①　只畫 confirmed 那一次的轉帳', () => {
  /* 三筆結算，各 3 個 item——不挑的話會畫成 9 列 */
  const three = {
    settlements: [
      { id: 'old', trip_id: 't1', status: 'superseded', settled_at: '2026-03-18T00:00:00Z' },
      { id: 'now', trip_id: 't1', status: 'confirmed',  settled_at: '2026-03-20T00:00:00Z' },
      { id: 'new', trip_id: 't1', status: 'draft',      settled_at: null },
    ],
    settlement_items: [
      { id: 'o1', settlement_id: 'old', from_member_id: M[3], to_member_id: M[0], amount: 111 },
      { id: 'o2', settlement_id: 'old', from_member_id: M[2], to_member_id: M[0], amount: 222 },
      { id: 'o3', settlement_id: 'old', from_member_id: M[1], to_member_id: M[0], amount: 333 },
      { id: 'c1', settlement_id: 'now', from_member_id: M[3], to_member_id: M[0], amount: 20220 },
      { id: 'c2', settlement_id: 'now', from_member_id: M[2], to_member_id: M[0], amount: 17740 },
      { id: 'c3', settlement_id: 'now', from_member_id: M[1], to_member_id: M[0], amount: 8220 },
      { id: 'd1', settlement_id: 'new', from_member_id: M[3], to_member_id: M[0], amount: 999 },
      { id: 'd2', settlement_id: 'new', from_member_id: M[2], to_member_id: M[0], amount: 888 },
      { id: 'd3', settlement_id: 'new', from_member_id: M[1], to_member_id: M[0], amount: 777 },
    ],
  };

  it('三筆結算（superseded／confirmed／draft）只畫出 confirmed 那 3 列', async () => {
    payload.v = { ...(payload.v as object), ...three };
    await show();

    /* **比列數**，不是「有沒有出現某個字串」——重複的時候字串照樣在 */
    const rows = [...document.querySelectorAll('.rowb')]
      .filter(r => (r.textContent ?? '').includes('→'));
    expect(rows.length, `畫出 ${rows.length} 列，應該只有 confirmed 那 3 列`).toBe(3);

    const got = flat();
    for (const v of ['$20,220', '$17,740', '$8,220'])
      expect(got, `confirmed 的金額不見了：${v}`).toContain(v);
    /* superseded 與 draft 的金額一個都不准出現 */
    for (const v of ['$111', '$222', '$333', '$999', '$888', '$777'])
      expect(got, `畫到了不該畫的結算：${v}`).not.toContain(v);
  });

  it('多筆 confirmed 時取 settled_at 最新的', async () => {
    payload.v = {
      ...(payload.v as object),
      settlements: [
        { id: 'a', trip_id: 't1', status: 'confirmed', settled_at: '2026-03-19T00:00:00Z' },
        { id: 'b', trip_id: 't1', status: 'confirmed', settled_at: '2026-03-21T00:00:00Z' },
        { id: 'c', trip_id: 't1', status: 'confirmed', settled_at: null },
      ],
      settlement_items: [
        { id: 'a1', settlement_id: 'a', from_member_id: M[1], to_member_id: M[0], amount: 111 },
        { id: 'b1', settlement_id: 'b', from_member_id: M[1], to_member_id: M[0], amount: 20220 },
        { id: 'c1', settlement_id: 'c', from_member_id: M[1], to_member_id: M[0], amount: 333 },
      ],
    };
    await show();
    const rows = [...document.querySelectorAll('.rowb')]
      .filter(r => (r.textContent ?? '').includes('→'));
    expect(rows.length).toBe(1);
    expect(flat()).toContain('$20,220');
    expect(flat(), 'settled_at 為 null 應視為最舊').not.toContain('$333');
  });

  it('沒有 confirmed → 走前端預覽，不畫 draft／superseded', async () => {
    payload.v = {
      ...(payload.v as object),
      settlements: [
        { id: 'd', trip_id: 't1', status: 'draft', settled_at: null },
        { id: 's', trip_id: 't1', status: 'superseded', settled_at: '2026-03-18T00:00:00Z' },
      ],
      settlement_items: [
        { id: 'd1', settlement_id: 'd', from_member_id: M[1], to_member_id: M[0], amount: 999 },
        { id: 's1', settlement_id: 's', from_member_id: M[1], to_member_id: M[0], amount: 111 },
      ],
    };
    await show();
    const got = flat();
    expect(got, 'draft 不該被畫出來').not.toContain('$999');
    expect(got, 'superseded 不該被畫出來').not.toContain('$111');
    /* 前端預覽算出來的是 Rozi 收三筆 */
    const rows = [...document.querySelectorAll('.rowb')]
      .filter(r => (r.textContent ?? '').includes('→'));
    expect(rows.length).toBe(3);
  });

  it('pickConfirmed 的挑法本身', async () => {
    const { pickConfirmed } = await import('./SharePage');
    expect(pickConfirmed([])).toBeNull();
    expect(pickConfirmed([{ id: 'a', trip_id: 't', status: 'draft', settled_at: null }])).toBeNull();
    expect(pickConfirmed([
      { id: 'a', trip_id: 't', status: 'confirmed', settled_at: null },
      { id: 'b', trip_id: 't', status: 'confirmed', settled_at: '2026-01-01' },
    ])!.id).toBe('b');
    expect(pickConfirmed([
      { id: 'a', trip_id: 't', status: 'superseded', settled_at: '2026-09-09' },
      { id: 'b', trip_id: 't', status: 'confirmed',  settled_at: '2026-01-01' },
    ])!.id, 'superseded 再新也不能選').toBe('b');
  });
});
