/* 實作-B-4　S-04 記一筆對原型的比對，以及金額／幣別規格（R1–R10）的行為。
 * 基準是 fixtures/screens.json 的 s04——原型操作模式的字串集合。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import screens from '@/test/fixtures/screens.json';
import { render, makeSupabaseMock } from '@/test/utils';
import ExpenseFormSheet, { defaultExpDate, paymentsOf, saveToastFor } from './ExpenseFormSheet';
import type { TripWithMembers } from '@/types/database';

const members = [
  { emoji: '🐵', name: 'Rozi' }, { emoji: '🐱', name: '小美' },
  { emoji: '🍋', name: '阿明' }, { emoji: '🐟', name: '小魚' },
].map((m, i) => ({
  id: `m${i}`, trip_id: 't1', name: m.name, emoji: m.emoji, sort_order: i,
  linked_profile_id: null, person_id: null, user_id: null, role: null, created_at: '2026-03-01',
}));

const trip = {
  id: 't1', owner_id: 'u1', name: '2026 濟州島四寶團', emoji: '✈️', currency: 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: 'm0', collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: ['現金', '信用卡'], cash_rate_twd: null, cash_rate_foreign: null,
  tone_seq: 0, created_at: '2026-03-01', updated_at: '2026-03-01', trip_members: members,
} as unknown as TripWithMembers;

const captured = vi.hoisted(() => ({ expenses: [] as never[], splits: [] as never[] }));
vi.mock('@/lib/supabaseClient', async () => {
  const { makeSupabaseMock: mk } = await import('@/test/utils');
  const base = mk({});
  return {
    supabase: {
      ...base,
      from: (table: string) => {
        const chain = base.from(table) as Record<string, unknown>;
        if (table === 'expenses') {
          chain.insert = vi.fn((r: never) => { captured.expenses.push(r); return chain; });
          /* insert().select().single() 要回得出新列的 id，否則 mutation 在這裡就炸了，
             後面的 expense_splits 永遠不會被寫入——測試會看起來像「splits 沒產生」。 */
          chain.single = vi.fn(() => Promise.resolve({ data: { id: 'new-exp' }, error: null }));
        }
        if (table === 'expense_splits')
          chain.insert = vi.fn((r: never[]) => { captured.splits.push(...r); return chain; });
        return chain;
      },
    },
  };
});

const want = (screens as Record<string, { list: string[] }>).s04;
const flat = () => (document.body.textContent ?? '').replace(/\s+/g, '');

beforeEach(() => {
  captured.expenses = []; captured.splits = [];
  vi.setSystemTime(new Date('2026-03-14T09:00:00+08:00'));
});

/** sheet 走 `createPortal` 到 `document.body`，所以 RTL 的 container 是空的——
 *  一律查 `document.body`。查 container 會拿到 null 而看起來像「元件沒渲染」。 */
function open(t: TripWithMembers = trip) {
  render(<ExpenseFormSheet tripId="t1" trip={t} onClose={() => {}} />);
  return document.body;
}

describe('B-4　S-04 記一筆', () => {
  it('原型上的每一段文字都要出現', async () => {
    open();
    await waitFor(() => expect(screen.getByText('記一筆')).toBeInTheDocument());
    /* fixture 是用「午餐／台幣 1200／四人均分」抓的。標題是 input 的 value，
       不是文字節點，所以不必填；但**類別 emoji 要維持預設的 ➕**——
       原型的 renderS04() 不會依標題重算它，填了標題反而對不上。 */
    fireEvent.change(document.getElementById('e-twd')!, { target: { value: '1200' } });
    /* 「要排除誰？」以外的都在預設狀態就看得到；R2 那一段本來就收合 */
    expect(want.list.length).toBe(29);
    const got = flat();
    const missing = want.list.filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing, `原型有、App 沒有：${missing.join(' ｜ ')}`).toEqual([]);
  });

  it('S-04-8　沒有「之後再填」toggle，空欄也能存', () => {
    open();
    expect(flat()).not.toContain('之後再填');
    const save = screen.getByText('記下來') as HTMLButtonElement;
    expect(save.disabled, '存檔鍵不得被 disable').toBe(false);
  });

  it('🔴 S-04-8＋S-04-29　完全沒填金額 → twd_amount null 且 pending 為 true', async () => {
    open();
    fireEvent.click(screen.getByText('🐵 Rozi'));
    fireEvent.click(screen.getByText('記下來'));
    await waitFor(() => expect(captured.expenses.length).toBe(1));

    const row = captured.expenses[0] as Record<string, unknown>;
    expect(row.twd_amount).toBeNull();
    expect(row.twd_pending, '空欄沒有自動寫 pending——結算整趟會回 422').toBe(true);
    expect(row.foreign_amount).toBeNull();
    expect(row.foreign_pending).toBe(true);
  });

  it('S-04-10　日期列與標籤同一列，預設今天，位置在標題正下方', () => {
    const container = open();
    const row = container.querySelector('.fieldrow.datefield') as HTMLElement;
    expect(row, '找不到日期列').not.toBeNull();
    expect(row.querySelector('.lbl')!.textContent).toBe('記在');
    expect(row.querySelector('input[type=date]')!.getAttribute('value')).toBe('2026-03-14');

    /* 排在標題（記一筆）之後、「花費」之前 */
    const rows = [...container.querySelectorAll('.fld')];
    expect(rows[0].contains(row)).toBe(true);
    expect(rows[1].textContent).toContain('花費');
  });

  it('#35-1　今天超過回程日 → 夾到回程日；今天早於出發日 → 不夾', () => {
    vi.setSystemTime(new Date('2026-04-01T09:00:00+08:00'));
    expect(defaultExpDate({ end_date: '2026-03-18' })).toBe('2026-03-18');
    vi.setSystemTime(new Date('2026-01-05T09:00:00+08:00'));
    expect(defaultExpDate({ end_date: '2026-03-18' }), '行前支出該落在「出發前」，不夾')
      .toBe('2026-01-05');
    expect(defaultExpDate({ end_date: null })).toBe('2026-01-05');
  });

  it('S-04-9　支付方式讀這趟的清單，預設第一項，程式碼裡沒有寫死常數', async () => {
    const t2 = { ...trip, payment_methods: ['Linepay', '悠遊卡'] } as unknown as TripWithMembers;
    const container = open(t2);
    const chips = [...container.querySelectorAll('.fld')]
      .find(x => x.textContent?.includes('怎麼付的？'))!
      .querySelectorAll('.chip');
    expect([...chips].map(c => c.textContent)).toEqual(['Linepay', '悠遊卡']);
    expect(chips[0].className, '預設第一項').toContain('on');

    /* 「不要有任何寫死的支付方式常數」——連程式碼都要查 */
    const src = await import('fs').then(fs =>
      fs.readFileSync('src/components/ExpenseFormSheet.tsx', 'utf8'));
    expect(src).not.toContain("label: '現金'");
    expect(src).not.toMatch(/PAYMENT_OPTIONS/);
  });

  it('paymentsOf：jsonb 讀出奇怪形狀時不要炸，退回單一「現金」', () => {
    expect(paymentsOf({ payment_methods: ['A', 'B'] })).toEqual(['A', 'B']);
    expect(paymentsOf({ payment_methods: null })).toEqual(['現金']);
    expect(paymentsOf({ payment_methods: 'oops' })).toEqual(['現金']);
    expect(paymentsOf({ payment_methods: [] })).toEqual(['現金']);
  });

  it('S-04-17　「只算一個人」要能選人，存 individual_member_id', async () => {
    const body = open();
    fireEvent.click(screen.getByRole('tab', { name: '只算一個人' }));
    expect(screen.getByText('算誰的？')).toBeInTheDocument();
    /* 「誰付的」與「算誰的」兩區的 chip 文字一樣，要指定是哪一區 */
    const pick = [...body.querySelectorAll('.fld')]
      .find(x => x.textContent?.includes('算誰的？'))!;
    fireEvent.click([...pick.querySelectorAll('.chip')].find(c => c.textContent === '🐱 小美')!);
    fireEvent.click(screen.getByText('記下來'));
    await waitFor(() => expect(captured.expenses.length).toBe(1));
    expect((captured.expenses[0] as Record<string, unknown>).individual_member_id).toBe('m1');
  });

  it('🔴 P1-0　各自金額填外幣要存進 split_amount_foreign，不得塞進 split_amount', async () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: '各付各的' }));
    fireEvent.click(screen.getByRole('tab', { name: /KRW 填/ }));
    fireEvent.change(screen.getByLabelText('花費'), { target: { value: '藥妝店' } });
    fireEvent.change(document.getElementById('ei-m0')!, { target: { value: '12000' } });
    fireEvent.click(screen.getByText('記下來'));
    await waitFor(() => expect(captured.splits.length).toBeGreaterThan(0));

    const s0 = captured.splits.find((s) => (s as Record<string, unknown>).member_id === 'm0') as unknown as Record<string, unknown>;
    expect(s0.split_amount_foreign).toBe(12000);
    expect(s0.split_amount, '外幣被塞進 split_amount 就是靜默算錯帳').toBeNull();
    expect((captured.expenses[0] as Record<string, unknown>).split_fill_currency).toBe('FOR');
  });

  it('S-04-15／32　逐人一列用 <label for>，而且列高有 CSS 撐（.amtrow）', () => {
    const container = open();
    fireEvent.click(screen.getByRole('tab', { name: '各付各的' }));
    const rows = [...container.querySelectorAll('label.amtrow')];
    expect(rows.length).toBe(4);
    for (const r of rows) {
      const forAttr = r.getAttribute('for');
      expect(forAttr).toBeTruthy();
      expect(container.querySelector(`#${forAttr}`), `label for 指不到輸入框：${forAttr}`).not.toBeNull();
    }
  });

  it('R9　差額三級都可以存檔，沒有任何加總阻擋', () => {
    const container = open();
    fireEvent.change(screen.getByLabelText('花費'), { target: { value: 'x' } });
    fireEvent.change(document.getElementById('e-twd')!, { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('tab', { name: '各付各的' }));
    for (const id of ['m0', 'm1', 'm2', 'm3'])
      fireEvent.change(document.getElementById(`ei-${id}`)!, { target: { value: '675' } });

    /* 3000 vs 2700 → 差 300，10% > 1% → 橘色警示，但仍可存 */
    const cmp = container.querySelector('.cmp') as HTMLElement;
    expect(cmp, '找不到比對列').not.toBeNull();
    expect(cmp.className).toContain('bad');
    expect((screen.getByText('記下來') as HTMLButtonElement).disabled).toBe(false);
  });

  it('R9　差額 0 是「剛好」、≤1% 是淡色', () => {
    const container = open();
    fireEvent.change(document.getElementById('e-twd')!, { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('tab', { name: '各付各的' }));
    for (const id of ['m0', 'm1', 'm2', 'm3'])
      fireEvent.change(document.getElementById(`ei-${id}`)!, { target: { value: '1000' } });
    expect(container.querySelector('.cmp')!.className).toContain('ok');

    fireEvent.change(document.getElementById('ei-m3')!, { target: { value: '980' } });
    expect(container.querySelector('.cmp')!.className, '20/4000 = 0.5% 應該是淡色').toContain('soft');
  });

  it('S-04-3　類別 emoji 就地編輯，手動改過就不再被標題覆蓋', () => {
    open();
    fireEvent.change(screen.getByLabelText('花費'), { target: { value: '晚餐' } });
    expect(screen.getByLabelText('類別 emoji').textContent, '應由標題推斷').toBe('🍜');

    fireEvent.click(screen.getByLabelText('類別 emoji'));
    const input = screen.getByLabelText('類別 emoji') as HTMLInputElement;
    fireEvent.blur(input, { target: { value: '🍕' } });
    expect(screen.getByLabelText('類別 emoji').textContent).toBe('🍕');

    fireEvent.change(screen.getByLabelText('花費'), { target: { value: '計程車' } });
    expect(screen.getByLabelText('類別 emoji').textContent, '手動改過就不該被覆蓋').toBe('🍕');
  });

  it('S-04-3　手動改過要寫進 category_emoji_manual', async () => {
    open();
    fireEvent.click(screen.getByLabelText('類別 emoji'));
    fireEvent.blur(screen.getByLabelText('類別 emoji'), { target: { value: '🍕' } });
    fireEvent.click(screen.getByText('記下來'));
    await waitFor(() => expect(captured.expenses.length).toBe(1));
    expect((captured.expenses[0] as Record<string, unknown>).category_emoji_manual).toBe(true);
  });

  it('禁止 autofocus——手機上會變成鍵盤關掉又跳出來', async () => {
    const container = open();
    expect(container.querySelector('[autofocus]')).toBeNull();
    const src = await import('fs').then(fs =>
      fs.readFileSync('src/components/ExpenseFormSheet.tsx', 'utf8'));
    expect(src).not.toContain('autoFocus');
  });

  it('S-04-18／19　「當場就清了」與「贊助／回饋」用全站統一的 chip 樣式', () => {
    const container = open();
    const spot = [...container.querySelectorAll('.chip')]
      .find(c => c.textContent === '當場就清了')!;
    const spon = [...container.querySelectorAll('.chip')]
      .find(c => c.textContent === '贊助／回饋')!;
    expect(spot).toBeTruthy();
    expect(spon).toBeTruthy();
    /* 不得出現第二套選取語彙（打勾框等）在這兩顆上 */
    expect(spot.querySelector('.chkchip')).toBeNull();
    expect(spon.querySelector('.chkchip')).toBeNull();
  });

  it('S-04-23　刪除文案是誠實的軟刪說法，不寫「無法復原」', () => {
    render(<ExpenseFormSheet tripId="t1" trip={trip} expenseId="e1" onClose={() => {}} />);
    fireEvent.click(screen.getByText('刪除這筆'));
    const got = flat();
    expect(got).toContain('這筆會從清單與結算裡拿掉。');
    for (const bad of ['無法復原', '救不回來', '不可回復'])
      expect(got, `軟刪不該寫「${bad}」`).not.toContain(bad);
  });

  it('§4　存檔後四種提示的文案照規格', () => {
    expect(saveToastFor({ pending: true, blanks: [] }))
      .toBe('已存。這筆金額還沒填，之後補上就會算進總花費。');
    expect(saveToastFor({ pending: false, blanks: ['小美'] }))
      .toBe('已存。小美 的金額由總額推算。');
    expect(saveToastFor({ pending: false, blanks: ['小美', '阿明'] }))
      .toBe('已存。小美 和 阿明 的金額還沒填，先照均分算。');
    expect(saveToastFor({ pending: false, blanks: ['小美', '阿明', '小魚'] }))
      .toBe('已存。還有 3 人的金額還沒填，先照均分算。');
  });
});
