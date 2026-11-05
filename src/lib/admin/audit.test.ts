/* 後台-C　操作紀錄：誰、什麼時間、改了什麼、改前改後。 */
import { describe, it, expect } from 'vitest';
import { describeAudit, namesFromAudit, type AuditRow } from './audit';

const ctx = {
  memberName: (id: string) => ({ m0: 'Rozi', m1: '小美', m2: '阿明' } as Record<string, string>)[id] ?? '（已刪除的成員）',
  expenseTitle: (id: string) => (id === 'e1' ? '拉麵' : null),
  currencyOf: () => 'JPY',
};
let n = 0;
const row = (o: Partial<AuditRow>): AuditRow => ({
  id: ++n, at: '2026-11-05T03:00:00Z', actor: 'u2', table_name: 'expenses', op: 'INSERT',
  row_id: 'e1', trip_id: 't1', expense_id: 'e1', old_row: null, new_row: null, ...o,
});
const exp = (o: Record<string, unknown> = {}) => ({
  id: 'e1', title: '拉麵', twd_amount: 1000, foreign_amount: null, payer_member_id: 'm0',
  payment_method: 'cash', expense_type: 'shared', deleted_at: null, updated_at: 'x', ...o,
});

describe('操作紀錄翻譯', () => {
  it('新增帳目：列出填了哪些欄位', () => {
    const [e] = describeAudit([row({ new_row: exp() as never })], ctx);
    expect(e).toMatchObject({ action: '新增', target: '帳目', title: '拉麵', actor: 'u2' });
    expect(e.changes).toContainEqual({ field: '台幣金額', before: '（空）', after: '1,000' });
    expect(e.changes).toContainEqual({ field: '誰付的', before: '（無）', after: 'Rozi' });
  });

  it('修改帳目：只列真的改了的欄位，改前改後都有；updated_at 不算', () => {
    const [e] = describeAudit([row({ op: 'UPDATE', old_row: exp() as never,
      new_row: exp({ twd_amount: 1200, payment_method: 'credit_card', payer_member_id: 'm1', updated_at: 'y' }) as never })], ctx);
    expect(e.action).toBe('修改');
    expect(e.changes).toEqual([
      { field: '台幣金額', before: '1,000', after: '1,200' },
      { field: '誰付的', before: 'Rozi', after: '小美' },
      { field: '付款方式', before: '現金', after: '信用卡' },
    ]);
  });

  it('前台的刪除是設 deleted_at：顯示成「刪除帳目」', () => {
    const [e] = describeAudit([row({ op: 'UPDATE', old_row: exp() as never,
      new_row: exp({ deleted_at: '2026-11-05' }) as never })], ctx);
    expect(e).toMatchObject({ action: '刪除', target: '帳目', title: '拉麵' });
  });

  it('只動到 updated_at 的更新不顯示', () => {
    expect(describeAudit([row({ op: 'UPDATE', old_row: exp() as never,
      new_row: exp({ updated_at: 'z' }) as never })], ctx)).toEqual([]);
  });

  it('分帳「全刪再全加」合併成一條，只講實際差別', () => {
    const s = (mid: string, part = true, amt: number | null = null) =>
      ({ id: `s-${mid}`, expense_id: 'e1', member_id: mid, is_participating: part, split_amount: amt });
    const rows = [
      row({ table_name: 'expense_splits', op: 'DELETE', old_row: s('m0') as never }),
      row({ table_name: 'expense_splits', op: 'DELETE', old_row: s('m1') as never }),
      row({ table_name: 'expense_splits', op: 'INSERT', new_row: s('m0') as never, at: '2026-11-05T03:00:01Z' }),
      row({ table_name: 'expense_splits', op: 'INSERT', new_row: s('m2') as never, at: '2026-11-05T03:00:01Z' }),
    ];
    const out = describeAudit(rows, ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ target: '分帳', action: '修改', title: '拉麵' });
    expect(out[0].changes).toEqual([
      { field: '小美', before: '有分', after: '沒分' },
      { field: '阿明', before: '沒分', after: '有分' },
    ]);
  });

  it('刪掉又加回一模一樣的分帳：不顯示', () => {
    const s = { id: 's', expense_id: 'e1', member_id: 'm0', is_participating: true, split_amount: null };
    expect(describeAudit([
      row({ table_name: 'expense_splits', op: 'DELETE', old_row: s as never }),
      row({ table_name: 'expense_splits', op: 'INSERT', new_row: s as never }),
    ], ctx)).toEqual([]);
  });

  it('成員：新增、改名、刪除', () => {
    const m = (o = {}) => ({ id: 'm9', trip_id: 't1', name: '阿姨', emoji: '', sort_order: 4, ...o });
    const out = describeAudit([
      row({ table_name: 'trip_members', row_id: 'm9', op: 'INSERT', new_row: m() as never, at: '2026-11-05T01:00:00Z' }),
      row({ table_name: 'trip_members', row_id: 'm9', op: 'UPDATE', old_row: m() as never, new_row: m({ name: '小阿姨' }) as never, at: '2026-11-05T02:00:00Z' }),
      row({ table_name: 'trip_members', row_id: 'm9', op: 'DELETE', old_row: m({ name: '小阿姨' }) as never, at: '2026-11-05T03:00:00Z' }),
    ], ctx);
    expect(out.map(e => `${e.action}${e.target} ${e.title}`)).toEqual(['刪除成員 小阿姨', '修改成員 小阿姨', '新增成員 阿姨']);
    expect(out[1].changes).toEqual([{ field: '名字', before: '阿姨', after: '小阿姨' }]);
  });

  it('從紀錄本身補回已刪除成員的名字', () => {
    const { member } = namesFromAudit([row({ table_name: 'trip_members', row_id: 'm9', op: 'DELETE',
      old_row: { name: '阿姨' } as never })]);
    expect(member.get('m9')).toBe('阿姨');
  });
});
