/* R-10（2026-11 產品負責人拍板）：「一起分」0 人與「只算一個人」沒選人。
 *
 * 規則：
 *   1. 一起分勾掉最後一個人的當下，參與者下方出現提示＋「改成只算一個人」按鈕；
 *      不彈視窗；重新勾任何人提示就消失；仍是 0 人時按「記下來」擋下不存。
 *   2. 切到「只算一個人」時預設帶付款人；沒選付款人就帶第一位成員；不會沒選人。
 *   4. 打開舊的 0 人帳照實顯示 0 人並出現提示，不准自動變成全部勾選。
 * （規則 3「0 人舊資料整筆算付款人」在 `src/lib/summary.r10.test.ts` 與
 *   `supabase/functions/__tests__/settlement.test.ts` 的 R10 段。）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils';
import ExpenseFormSheet, { switchKind, hasNoParts, type FormState } from './ExpenseFormSheet';
import { MSG_NO_PARTS, LABEL_TO_SINGLE } from '@/lib/messages';
import type { TripWithMembers } from '@/types/database';

const { members, oldZero } = vi.hoisted(() => {
  const members = [
  { emoji: '🐵', name: 'Rozi' }, { emoji: '🐱', name: '小美' }, { emoji: '🍋', name: '阿明' },
].map((m, i) => ({
  id: `m${i}`, trip_id: 't1', name: m.name, emoji: m.emoji, sort_order: i,
  linked_profile_id: null, person_id: null, user_id: null, role: null, created_at: '2026-03-01',
}));

/* 舊的 0 人帳：一起分、三個人的參與列全部是 false */
  const oldZero = {
  id: 'e-old', trip_id: 't1', title: '舊的 0 人帳', category_emoji: '🍜', category_emoji_manual: false,
  expense_date: '2026-03-15', foreign_amount: null, twd_amount: 900, twd_pending: false,
  foreign_pending: false, twd_from_rate: false, exchange_rate: null,
  payment_method: 'cash', payment_label: '現金', payer_member_id: 'm1',
  expense_type: 'shared', individual_member_id: null, split_fill_currency: 'TWD',
  settled_on_spot: false, is_sponsor: false, note: null, deleted_at: null,
  created_at: '2026-03-15T10:00:00Z', created_by: 'u1',
  expense_splits: members.map(m => ({
    expense_id: 'e-old', member_id: m.id, is_participating: false,
    split_amount: null, split_amount_foreign: null, split_pending: false,
  })),
};

  return { members, oldZero };
});

const trip = {
  id: 't1', owner_id: 'u1', name: 'ZZ 測試行程', emoji: '✈️', currency: 'JPY',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: 'm0', collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: ['現金'], cash_rate_twd: null, cash_rate_foreign: null,
  tone_seq: 0, created_at: '2026-03-01', updated_at: '2026-03-01', trip_members: members,
} as unknown as TripWithMembers;

const captured = vi.hoisted(() => ({ expenses: [] as never[], splits: [] as never[] }));
vi.mock('@/lib/supabaseClient', async () => {
  const { makeSupabaseMock: mk } = await import('@/test/utils');
  const base = mk({ expenses: [oldZero] as never[] });
  return {
    supabase: {
      ...base,
      from: (table: string) => {
        const chain = base.from(table) as Record<string, unknown>;
        if (table === 'expenses') {
          const single0 = chain.single as () => Promise<unknown>;
          chain.insert = vi.fn((r: never) => {
            captured.expenses.push(r);
            chain.single = vi.fn(() => Promise.resolve({ data: { id: 'new-exp' }, error: null }));
            return chain;
          });
          chain.update = vi.fn((r: never) => { captured.expenses.push(r); return chain; });
          chain.single = single0;
        }
        if (table === 'expense_splits')
          chain.insert = vi.fn((r: never[]) => { captured.splits.push(...r); return chain; });
        return chain;
      },
    },
  };
});

beforeEach(() => {
  captured.expenses = []; captured.splits = [];
  vi.setSystemTime(new Date('2026-03-14T09:00:00+08:00'));
});

function open(expenseId?: string) {
  render(<ExpenseFormSheet tripId="t1" trip={trip} expenseId={expenseId} onClose={() => {}} />);
  return document.body;
}
function zone(label: string) {
  return [...document.body.querySelectorAll('.fld')].find(x => x.textContent?.includes(label))!;
}
function pickPayer(name: string) {
  fireEvent.click([...zone('誰付的？').querySelectorAll('.chip')]
    .find(c => (c.textContent ?? '').includes(name))!);
}
/** 「要排除誰？」展開後的逐人列（`.rowb`） */
function partRows() { return [...document.body.querySelectorAll('button.rowb')] as HTMLElement[]; }
const hint = () => document.querySelector('[data-testid="noparts"]');

describe('R-10 ①　一起分全部取消勾選', () => {
  it('勾掉最後一個人的當下，提示與按鈕立刻出現；不是彈出視窗', () => {
    open();
    fireEvent.click(screen.getByText('要排除誰？'));
    const rows = partRows();
    expect(rows.length, '先確認名單真的展開了，不然後面的斷言是空跑').toBe(3);
    fireEvent.click(rows[0]); fireEvent.click(rows[1]);
    expect(hint(), '還剩一人時不該出現').toBeNull();
    fireEvent.click(rows[2]);

    const h = hint();
    expect(h, '0 人時提示要出現').not.toBeNull();
    expect(h!.textContent).toContain(MSG_NO_PARTS);
    expect(screen.getByRole('button', { name: LABEL_TO_SINGLE })).toBeInTheDocument();
    /* 位置：在分帳方式那一欄裡、參與者名單之後 */
    const fld = zone('分帳方式');
    expect(fld.contains(h!)).toBe(true);
    const last = rows[2];
    expect(last.compareDocumentPosition(h!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    /* 不彈視窗：沒有 dialog、沒有遮罩 */
    expect(document.querySelector('[role="dialog"], .dlgwrap, .scrim')).toBeNull();
    expect(screen.getByText('0 人均分')).toBeInTheDocument();
    expect(screen.getByText('每人 —'), '0 人不可以顯示「每人 $ 總額」').toBeInTheDocument();
  });

  it('重新勾任何一人，提示就消失', () => {
    open();
    fireEvent.click(screen.getByText('要排除誰？'));
    for (const r of partRows()) fireEvent.click(r);
    expect(hint()).not.toBeNull();
    fireEvent.click(partRows()[1]);
    expect(hint()).toBeNull();
    expect(screen.getByText('1 人均分')).toBeInTheDocument();
  });

  it('仍是 0 人時按「記下來」→ 擋下不存', async () => {
    open();
    fireEvent.change(screen.getByLabelText('花費'), { target: { value: 'ZZ 午餐' } });
    pickPayer('Rozi');
    fireEvent.click(screen.getByText('要排除誰？'));
    for (const r of partRows()) fireEvent.click(r);
    fireEvent.click(screen.getByText('記下來'));
    await new Promise(r => setTimeout(r, 30));
    expect(captured.expenses.length, '0 人不可以送出').toBe(0);
    expect(captured.splits.length).toBe(0);
    expect(hint(), '擋下之後提示仍在').not.toBeNull();
  });

  it('按「改成只算一個人」→ 切過去並帶付款人，然後存得出去', async () => {
    open();
    fireEvent.change(screen.getByLabelText('花費'), { target: { value: 'ZZ 午餐' } });
    pickPayer('小美');
    fireEvent.click(screen.getByText('要排除誰？'));
    for (const r of partRows()) fireEvent.click(r);
    fireEvent.click(screen.getByRole('button', { name: LABEL_TO_SINGLE }));

    expect(hint()).toBeNull();
    expect(screen.getByRole('tab', { name: '只算一個人' }).getAttribute('aria-selected')).toBe('true');
    const on = zone('算誰的？').querySelector('.chip.on');
    expect(on?.textContent).toContain('小美');

    fireEvent.click(screen.getByText('記下來'));
    await waitFor(() => expect(captured.expenses.length).toBe(1));
    expect((captured.expenses[0] as Record<string, unknown>).individual_member_id).toBe('m1');
    expect(captured.splits.length).toBe(1);
  });
});

describe('R-10 ②　切到「只算一個人」一定有人', () => {
  it('畫面：已選付款人 → 帶付款人', () => {
    open();
    pickPayer('阿明');
    fireEvent.click(screen.getByRole('tab', { name: '只算一個人' }));
    expect(zone('算誰的？').querySelector('.chip.on')?.textContent).toContain('阿明');
  });

  it('畫面：還沒選付款人 → 帶第一位成員', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: '只算一個人' }));
    const ons = zone('算誰的？').querySelectorAll('.chip.on');
    expect(ons.length).toBe(1);
    expect(ons[0].textContent).toContain('Rozi');
  });

  it('純函式 switchKind：付款人 → 第一位成員；之前選過的保留；不會是 null', () => {
    const f = { kind: 'shared', single: null, payer: null, parts: [] } as unknown as FormState;
    expect(switchKind(f, 'single', members).single).toBe('m0');
    expect(switchKind({ ...f, payer: 'm2' }, 'single', members).single).toBe('m2');
    expect(switchKind({ ...f, payer: 'm2', single: 'm1' }, 'single', members).single).toBe('m1');
    /* 切到別的方式不動參與者名單 */
    expect(switchKind({ ...f, parts: ['m1'] }, 'shared', members).parts).toEqual(['m1']);
    for (const p of [null, 'm0', 'm1', 'm2'])
      expect(hasNoParts(switchKind({ ...f, payer: p }, 'single', members))).toBe(false);
  });
});

describe('R-10 ④　打開舊的 0 人帳', () => {
  it('照實顯示 0 人並出現提示，不准自動變成全部勾選', async () => {
    open('e-old');
    await waitFor(() => expect(screen.getByDisplayValue('舊的 0 人帳')).toBeInTheDocument());
    expect(screen.getByText('0 人均分')).toBeInTheDocument();
    expect(hint()).not.toBeNull();
    /* 名單直接展開，三個人全部是「沒勾」 */
    const rows = partRows();
    expect(rows.length).toBe(3);
    expect(rows.filter(r => r.classList.contains('on')).length, '不准自動勾回去').toBe(0);
  });

  it('不改就存 → 擋下；勾一個人才存得出去', async () => {
    open('e-old');
    await waitFor(() => expect(screen.getByDisplayValue('舊的 0 人帳')).toBeInTheDocument());
    fireEvent.click(screen.getByText('記下來'));
    await new Promise(r => setTimeout(r, 30));
    expect(captured.expenses.length).toBe(0);

    fireEvent.click(partRows()[0]);
    fireEvent.click(screen.getByText('記下來'));
    await waitFor(() => expect(captured.splits.length).toBe(1));
    expect((captured.splits[0] as Record<string, unknown>).member_id).toBe('m0');
  });
});
