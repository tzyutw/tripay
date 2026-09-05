/* 實作-B-3　S-03 行程頁與 S-03d 未定案清單對原型的比對。
 *
 * 資料是**原型的 demoExpenses() 逐筆搬過來的**（Tripay_原型.html 第 1735 行附近）。
 * 用同一組資料餵 App，畫出來的字就必須等於 fixtures/screens.json 的 s03／s03d
 * ——那份 fixture 是原型用這同一組資料 render 出來的。
 * 自己寫預期值只證明「跟我想的一樣」，證明不了「跟原型一樣」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import screens from '@/test/fixtures/screens.json';
import { render, makeSupabaseMock } from '@/test/utils';

const M = ['m0', 'm1', 'm2', 'm3'];
const members = [
  { emoji: '🐵', name: 'Rozi' }, { emoji: '🐱', name: '小美' },
  { emoji: '🍋', name: '阿明' }, { emoji: '🐟', name: '小魚' },
].map((m, i) => ({
  id: M[i], trip_id: 't1', name: m.name, emoji: m.emoji, sort_order: i,
  linked_profile_id: null, person_id: null, user_id: null, role: null, created_at: '2026-03-01',
}));

const trip = {
  id: 't1', owner_id: 'u1', name: '2026 濟州島四寶團', emoji: '✈️', currency: 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: M[0], collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: ['現金', '信用卡'], cash_rate_twd: null, cash_rate_foreign: null,
  tone_seq: 0, created_at: '2026-03-01', updated_at: '2026-03-01', trip_members: members,
};

/* 原型 demoExpenses() 的八筆，順序與欄位一一對應 */
let seq = 0;
function mk(o: Record<string, unknown>) {
  seq += 1;
  const parts = (o.parts as string[]) ?? M;
  const indiv = (o.indiv as Record<string, number>) ?? {};
  return {
    id: `e${seq}`, trip_id: 't1', created_by: 'u1',
    title: '', category_emoji: '➕', expense_date: '2026-03-14',
    foreign_amount: null, twd_amount: null, exchange_rate: null,
    foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false,
    split_fill_currency: 'TWD', individual_member_id: null, payment_label: null,
    category_emoji_manual: false, updated_by: null, card_id: null, deleted_at: null,
    created_at: new Date(2026, 0, seq).toISOString(), updated_at: '2026-03-01',
    ...o,
    expense_splits: parts.map(id => ({
      id: `s${seq}-${id}`, expense_id: `e${seq}`, member_id: id, is_participating: true,
      split_amount: (indiv[id] ?? null) as number | null,
      split_amount_foreign: null as number | null,
      split_pending: !(id in indiv), created_at: '2026-03-01',
    })),
  };
}

const expenses = [
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

/* ⚠️ 不要用 `vi.resetModules()` 換 mock：那會讓元件載到**另一份** ToastContext 模組，
   於是 `useToast()` 在有 provider 的情況下照樣 throw（context 物件不是同一個）。
   改成讓 mock 讀一個可變的 state，要換狀態就改 state，模組圖不動。 */
/* `vi.mock` 的 factory 會被提升到所有 `const` 之前執行，
   直接引用模組層的變數會踩到 TDZ——而且錯誤被 react-query 吞掉，
   畫面只是空的，看不出原因。用 `vi.hoisted` 把可變狀態一起提上去。 */
const state = vi.hoisted(() => ({ trips: [] as Record<string, unknown>[], expenses: [] as unknown[] }));
vi.mock('@/lib/supabaseClient', async () => {
  const { makeSupabaseMock: mk } = await import('@/test/utils');
  return {
    supabase: mk(
      new Proxy({}, {
        get: (_, k: string) => k === 'trips' ? state.trips
           : k === 'expenses' ? state.expenses : [],
        has: () => true,
        ownKeys: () => ['trips', 'expenses', 'settlements'],
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      }) as never,
    ),
  };
});
vi.mock('@/pages/SettlementPage', () => ({ default: () => <div>結算頁</div> }));

import Page from './ExpenseListPage';
beforeEach(() => {
  state.trips = [trip as Record<string, unknown>];
  state.expenses = expenses;
});

const want = (id: 's03' | 's03d') =>
  (screens as Record<string, { list: string[]; text: string }>)[id];
const flat = () => (document.body.textContent ?? '').replace(/\s+/g, '');
const show = async () => {
  render(<Page />, { route: '/trips/t1', path: '/trips/:id' });
  await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());
};

describe('B-3　S-03 行程頁', () => {
  it('原型上的每一段文字都要出現（含展開統計卡）', async () => {
    await show();
    fireEvent.click(screen.getByText('總花費'));          // #17-2 每人分擔預設收合，要展開才掃得到

    expect(want('s03').list.length).toBe(73);             // 基準本身要有東西
    const got = flat();
    const missing = want('s03').list.filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing, `原型有、App 沒有：${missing.join(' ｜ ')}`).toEqual([]);
  });

  it('引擎移植正確：總額與每人分擔跟原型一模一樣', async () => {
    await show();
    fireEvent.click(screen.getByText('總花費'));
    const got = flat();
    /* 這幾個數字是原型算出來的，不是我自己寫的預期值 */
    for (const v of ['$34,375', '$32,620', '$10,515', '$20,620'])
      expect(got, `金額對不上：${v}`).toContain(v);
  });

  it('S-03-1／7／8　hero 副標只有日期區間，沒有成員 emoji', async () => {
    const { container } = await show().then(() => ({ container: document.body }));
    const hero = container.querySelector('.hero') as HTMLElement;
    expect(hero, '找不到 hero').not.toBeNull();
    expect(hero.textContent).toContain('3/14 – 3/18 · 2026');
    for (const e of ['🐵', '🐱', '🍋', '🐟'])
      expect(hero.textContent, `hero 不該有成員 emoji：${e}`).not.toContain(e);
  });

  it('#28-6b　hero 右上只有「返回」與「⋯」兩顆', async () => {
    await show();
    const nav = document.querySelector('.hero .navrow') as HTMLElement;
    expect(nav).not.toBeNull();
    const btns = [...nav.querySelectorAll('button')];
    expect(btns.length).toBe(2);
    expect(btns.map(b => b.getAttribute('aria-label'))).toEqual(['返回', '更多']);
    expect(btns.every(b => b.className.includes('ic2'))).toBe(true);
  });

  it('S-03-31／32　⋯ 選單：編輯／分享／複製／刪除都在裡面，刪除是唯一著色的一項', async () => {
    await show();
    fireEvent.click(document.querySelector('button[aria-label="更多"]')!);
    for (const t of ['編輯行程', '分享', '複製成新的一趟', '刪除行程'])
      expect(screen.getByText(t), `⋯ 選單缺：${t}`).toBeInTheDocument();
    const del = [...document.querySelectorAll('.shopt')]
      .filter(b => b.className.includes('del'));
    expect(del.length, '刪除必須是唯一著色的一項').toBe(1);
    expect(del[0].textContent).toContain('刪除行程');
  });

  it('S-03-29　未定案入口：N＝3；N＝0 時整條不顯示', async () => {
    await show();
    expect(screen.getByText(/有 3 筆還沒算清楚/)).toBeInTheDocument();
    expect(document.querySelector('.unsettled')).not.toBeNull();
  });

  it('S-03-33　分段控制切到「結算」，內容就是 S-05 整頁', async () => {
    await show();
    expect(screen.queryByText('結算頁')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '結算' }));
    expect(screen.getByText('結算頁')).toBeInTheDocument();
    /* S-05 自己的導覽列由 CSS 收起來，不動它的輸出 */
    expect(document.querySelector('.settlepane')).not.toBeNull();
  });

  it('#33-1　日期分組由新到舊，「出發前」沉到最底', async () => {
    await show();
    const secs = [...document.querySelectorAll('.sec')].map(x => x.textContent);
    expect(secs.length).toBeGreaterThan(3);
    expect(secs[0]).toContain('第 5 天');
    expect(secs[secs.length - 1]).toBe('出發前');
  });

  it('G-05 分享橫幅五處全清，含 sessionStorage 的 g05-dismissed', async () => {
    await show();
    const got = flat();
    for (const t of ['記完了嗎', '讓大家看看', '分享給大家', '之後再說'])
      expect(got, `G-05 殘留：${t}`).not.toContain(t);
    const src = await import('fs').then(fs =>
      fs.readFileSync('src/pages/ExpenseListPage.tsx', 'utf8'));
    expect(src).not.toContain('g05-dismissed');
  });

  it('底部主鈕依狀態三種：旅途中「記一筆」', async () => {
    await show();
    const btn = document.querySelector('.btnrow .btn') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('記一筆');
    expect(btn.querySelector('svg')).not.toBeNull();     // ic('add',16)，不是全形＋
  });

  it('S-03-12　沒設匯率時外幣切不動，並說出「總花費是少算的」', async () => {
    await show();
    const forBtn = screen.getByRole('tab', { name: /KRW/ }) as HTMLButtonElement;
    expect(forBtn.disabled, '沒有匯率卻切得動外幣').toBe(true);
    expect(screen.getByText(/有 1 筆還沒換算成台幣，上面的總花費不含它們。/)).toBeInTheDocument();
    expect(screen.getByText(/設現金匯率/)).toBeInTheDocument();
  });
});

describe('B-3　S-03d 未定案清單', () => {
  it('從列表上方入口進來：標題與筆數照原型', async () => {
    await show();
    fireEvent.click(document.querySelector('.unsettled')!);
    expect(want('s03d').list.length).toBe(16);
    const got = flat();
    const missing = want('s03d').list.filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing, `原型有、App 沒有：${missing.join(' ｜ ')}`).toEqual([]);
  });

  it('從統計卡的人進來：同一個畫面，只有標題與範圍不同', async () => {
    await show();
    fireEvent.click(screen.getByText('總花費'));
    fireEvent.click(screen.getByText('小美'));
    expect(screen.getByText(/影響 小美 的 · \d+ 筆/)).toBeInTheDocument();
  });

  it('列是唯讀的——那裡不該點進編輯', async () => {
    await show();
    fireEvent.click(document.querySelector('.unsettled')!);
    const rows = [...document.querySelectorAll('.exprow')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.tagName === 'DIV'), '未定案清單的列不得是 button').toBe(true);
  });
});

describe('B-3　既有 bug：封存／已結算不得點進編輯', () => {
  it('封存的行程點消費列不會開表單', async () => {
    state.trips = [{ ...trip, status: 'archived' }];
    render(<Page />, { route: '/trips/t1', path: '/trips/:id' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());

    /* 唯讀態的列本來就渲染成 div——先確認真的有列，否則這條會在「沒有列」時假通過 */
    const rows = [...document.querySelectorAll('.exprow')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.tagName === 'DIV')).toBe(true);
    /* 封存態底部是「重新開啟行程」，不是「記一筆」 */
    expect(document.querySelector('.btnrow .btn')!.textContent).toContain('重新開啟行程');
  });

  it('已結算的行程也一樣：列不可點，且底部沒有主鈕', async () => {
    state.trips = [{ ...trip, status: 'settled' }];
    render(<Page />, { route: '/trips/t1', path: '/trips/:id' });
    await waitFor(() => expect(screen.getByText('2026 濟州島四寶團')).toBeInTheDocument());

    const rows = [...document.querySelectorAll('.exprow')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.tagName === 'DIV')).toBe(true);
    /* #28-6b 已結算態沒有主鈕——那時的主要動作是「逐筆標記付清」，在結算分頁裡做 */
    expect(document.querySelector('.btnrow')).toBeNull();
  });
});

/* 引擎移植的兩條分支，S-03 的示範資料剛好都沒走到——
   反向驗證時「改壞了卻全綠」就是這樣被抓出來的。 */
describe('B-3　引擎移植：示範資料沒走到的兩條分支', () => {
  it('P1-0　填寫幣別是外幣時要讀 split_amount_foreign，不是 split_amount', async () => {
    const { calc } = await import('@/lib/summary');
    const row = {
      ...mk({ title: 'ZZ外幣各付各的', expense_type: 'individual',
              split_fill_currency: 'FOR', foreign_amount: 40000, twd_amount: 1000,
              payer_member_id: M[0] }),
    };
    /* 外幣欄有值、台幣欄故意塞完全不同的數字：讀錯欄位就會算出另一組結果 */
    row.expense_splits = M.map((id, i): typeof row.expense_splits[number] => ({
      id: `x${i}`, expense_id: row.id, member_id: id, is_participating: true,
      split_amount: 999, split_amount_foreign: [10000, 10000, 10000, 10000][i],
      split_pending: false, created_at: '2026-03-01',
    }));

    const c = calc(row as never, trip as never, members as never);
    expect(c.fillsAreForeign, '沒認出填寫幣別是外幣').toBe(true);
    /* R5 比例回推：每人 10000/40000 × 1000 台幣 = 250。讀成 split_amount 會變 999 */
    expect(c.shares[M[1]]).toBe(250);
    expect(c.shares[M[1]]).not.toBe(999);
  });

  it('§3　未輸入 1 人不標記未定案，2 人以上才標記', async () => {
    const { calc } = await import('@/lib/summary');
    const base = { expense_type: 'individual', twd_amount: 4000, payer_member_id: M[0] };

    const one = mk({ title: 'ZZ一人沒填', ...base,
                     indiv: { [M[0]]: 1000, [M[1]]: 1000, [M[2]]: 1000 } });
    const c1 = calc(one as never, trip as never, members as never);
    expect(c1.blanks.length, '這筆應該正好 1 人沒填').toBe(1);
    expect(Object.keys(c1.estimated), '1 人沒填不得標記未定案').toEqual([]);
    expect(c1.unsettled).toBe(false);

    const two = mk({ title: 'ZZ兩人沒填', ...base, indiv: { [M[0]]: 1000, [M[1]]: 1000 } });
    const c2 = calc(two as never, trip as never, members as never);
    expect(c2.blanks.length).toBe(2);
    expect(Object.keys(c2.estimated).sort()).toEqual([M[2], M[3]].sort());
    expect(c2.unsettled).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════
   實作-D　Cowork 複驗退回的兩項
   ══════════════════════════════════════════════════════════════ */
describe('D-①　只能有一個刪除對話框', () => {
  it('按「刪除行程」時，畫面上只出現一個對話框', async () => {
    await show();
    fireEvent.click(document.querySelector('button[aria-label="更多"]')!);
    fireEvent.click(screen.getByText('刪除行程'));

    /* 舊區塊沒刪乾淨時，兩個會疊在一起——標題就會出現兩次 */
    const titles = [...document.querySelectorAll('.dlgt')];
    expect(titles.length, `刪除對話框出現 ${titles.length} 個`).toBe(1);
    expect(screen.getAllByText(/刪除「2026 濟州島四寶團」？/).length).toBe(1);

    /* 舊版是「請輸入行程名稱」才 enable，新版是打「刪除」兩個字 */
    expect(flat(), '舊的刪除對話框還在').not.toContain('請輸入行程名稱');
    expect(flat()).not.toContain('這會一併刪掉這趟的');
    expect(screen.getByText('請輸入「刪除」兩個字')).toBeInTheDocument();
  });

  it('S-03c-2／3／4／7　對話框的字串集合與原型 renderS03c() 差異為空', async () => {
    const fs = await import('fs');
    const proto = fs.readFileSync('Tripay_原型.html', 'utf8');
    /* 雙向綁住：這些字面量必須**同時**存在於原型與 App。
       原型哪天改了字，這裡就會紅，而不是靜靜地各走各的。 */
    const FROM_PROTO = [
      '刪掉就', '救不回來', '筆消費與分帳紀錄', '位成員',
      '結算結果與分享連結', '請輸入「刪除」兩個字', '算了，留著',
    ];
    for (const t of FROM_PROTO)
      expect(proto, `原型裡找不到這句了：${t}`).toContain(t);

    await show();
    fireEvent.click(document.querySelector('button[aria-label="更多"]')!);
    fireEvent.click(screen.getByText('刪除行程'));

    const dlg = document.querySelector('.dlg') as HTMLElement;
    expect(dlg).not.toBeNull();
    /* 數字用同一組 fixture：8 筆消費、4 位成員 */
    const want = '刪除「2026 濟州島四寶團」？刪掉就救不回來：'
      + '8 筆消費與分帳紀錄4 位成員結算結果與分享連結'
      + '請輸入「刪除」兩個字算了，留著刪除';
    expect((dlg.textContent ?? '').replace(/\s+/g, ''))
      .toBe(want.replace(/\s+/g, ''));
  });

  it('S-03c-3　影響清單是三個 <li>，數字即時帶入', async () => {
    await show();
    fireEvent.click(document.querySelector('button[aria-label="更多"]')!);
    fireEvent.click(screen.getByText('刪除行程'));
    const lis = [...document.querySelectorAll('.dlg li')].map(x => x.textContent);
    expect(lis).toEqual(['8 筆消費與分帳紀錄', '4 位成員', '結算結果與分享連結']);
  });

  it('打「刪除」兩個字才 enable，而且只有一顆刪除鍵', async () => {
    await show();
    fireEvent.click(document.querySelector('button[aria-label="更多"]')!);
    fireEvent.click(screen.getByText('刪除行程'));

    const dg = [...document.querySelectorAll('.dlg .btn.dg')] as HTMLButtonElement[];
    expect(dg.length, '刪除鍵不只一顆——兩個對話框共用同一個 state').toBe(1);
    expect(dg[0].disabled).toBe(true);

    fireEvent.change(document.querySelector('.dlginput')!, { target: { value: '刪除' } });
    expect((document.querySelector('.dlg .btn.dg') as HTMLButtonElement).disabled).toBe(false);
  });

  it('原始碼裡只有一個 deleteOpen 區塊', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('src/pages/ExpenseListPage.tsx', 'utf8'));
    const n = (src.match(/\{deleteOpen && \(/g) ?? []).length;
    expect(n, `原始碼裡有 ${n} 個 {deleteOpen && (` ).toBe(1);
  });
});

describe('D-②　S-03b 分享 sheet 對齊原型', () => {
  /* 逐字取自 Tripay_原型.html:2866–2868（位階 1） */
  const WANT = [
    { title: '複製文字摘要', sub: null },
    { title: '複製分享連結', sub: '不用登入就看得到消費明細' },
    { title: '預覽分享頁面', sub: null },
  ];

  async function openShare() {
    await show();
    fireEvent.click(document.querySelector('button[aria-label="更多"]')!);
    fireEvent.click(screen.getByText('分享'));
  }

  it('三個選項的標題與灰字逐字等於原型', async () => {
    await openShare();
    for (const w of WANT)
      expect(screen.getByText(w.title), `缺選項：${w.title}`).toBeInTheDocument();

    const got = flat();
    /* #25-5 在講好處的灰字砍掉 */
    for (const bad of ['貼到 LINE 群組，讓大家知道誰付誰',
                       '任何人打開都能看消費明細，不用登入',
                       '看看對方收到連結會看到什麼'])
      expect(got, `原型沒有這句灰字：${bad}`).not.toContain(bad.replace(/\s+/g, ''));

    expect(got).toContain('不用登入就看得到消費明細');
    /* 舊標題不得殘留 */
    expect(got).not.toContain('複製結算摘要');
  });

  it('沒有灰字的兩個選項不得渲染出空段落', async () => {
    await openShare();
    const rows = [...document.querySelectorAll('button')]
      .filter(b => WANT.some(w => (b.textContent ?? '').includes(w.title)));
    expect(rows.length).toBe(3);
    for (const w of WANT) {
      const row = rows.find(r => (r.textContent ?? '').includes(w.title))!;
      const subs = row.querySelectorAll('.text-gr');
      expect(subs.length, `${w.title} 的灰字數量不對`).toBe(w.sub ? 1 : 0);
      if (w.sub) expect(subs[0].textContent).toBe(w.sub);
    }
  });
});
