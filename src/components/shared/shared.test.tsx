/* 實作-A2-③　六個共用元件的行為比對。
 *
 * 基準是 **Tripay_原型.html 用同一組資料 render 出來的文字**
 * （由 實作_元件基準擷取.cjs 產出 fixtures/shared-components.json）。
 * 自己寫的預期值只證明「元件跟我想的一樣」，證明不了「元件跟原型一樣」。
 */
import { describe, it, expect } from 'vitest';
import { render as rtlRender } from '@testing-library/react';
import fixture from '@/test/fixtures/shared-components.json';
import StatCard from './StatCard';
import TransferView from './TransferView';
import ExpenseGroups from './ExpenseGroups';
import MoreSheet from './MoreSheet';
import Seg from './Seg';
import type { SharedSummary, SharedExpense, SharedCalc, SharedTrip, Transfer } from './types';

const { input, expect: want } = fixture as unknown as {
  input: {
    trip: SharedTrip; list: SharedExpense[]; calcs: Record<string, SharedCalc>;
    per: Record<string, number>; approx: Record<string, boolean>;
    total: number; tx: Transfer[]; hubMemberId: string;
  };
  expect: Record<string, { nodes: string[]; text: string }>;
};

const S: SharedSummary = {
  t: input.trip,
  list: input.list,
  calcOf: e => input.calcs[e.id],
  total: input.total,
  per: input.per,
  approx: input.approx,
};

/** render 之後取 textContent 並正規化空白。
    不要用文字節點陣列、也不要用空白接節點：JSX 把 −{money} 拆成兩個節點，
    原型是一個，那樣會比出「− $ 50,000」對不上「−$ 50,000」的假失敗。
    比的是使用者看到的字，不是誰怎麼拆節點。 */
function texts(ui: React.ReactElement) {
  const { container } = rtlRender(ui);
  return (container.textContent ?? '').replace(/\s+/g, '');
}

describe('StatCard：S-03 與 S-06 共用', () => {
  it('可操作版的文字集合與原型相同', () => {
    expect(texts(<StatCard S={S} open />)).toBe(want.statCard.text);
  });
  /* fixture 的唯讀版是用 `statCard({...S, readonly:true}, {readonly:true})` 抓的——
     兩個 readonly 是**不同的東西**：`S.readonly` 是行程狀態（決定還標不標「約」），
     prop 是「這一頁能不能點」。要比對就得餵同一組輸入。 */
  const Sro = { ...S, readonly: true };
  it('唯讀版（分享頁）的文字集合與原型相同', () => {
    expect(texts(<StatCard S={Sro} open readonly />)).toBe(want.statCardReadonly.text);
  });
  it('唯讀版的每人分擔列不可點——外人不該進得了編輯視圖', () => {
    const { container } = rtlRender(<StatCard S={Sro} open readonly />);
    expect(container.querySelectorAll('button.perrow')).toHaveLength(0);
    expect(container.querySelectorAll('.perrow.ro').length).toBe(input.trip.members.length);
  });
  it('可操作版的每人分擔列是按鈕', () => {
    const { container } = rtlRender(<StatCard S={S} open />);
    expect(container.querySelectorAll('button.perrow').length).toBe(input.trip.members.length);
  });
});

describe('ExpenseGroups：S-03 與分享頁共用', () => {
  it('文字集合與原型相同（含日期分組與排序）', () => {
    expect(texts(<ExpenseGroups S={S} />)).toBe(want.expenseGroups.text);
  });
  it('唯讀版文字相同，但列是 div 不是 button', () => {
    expect(texts(<ExpenseGroups S={S} readonly />)).toBe(want.expenseGroupsReadonly.text);
    const { container } = rtlRender(<ExpenseGroups S={S} readonly />);
    expect(container.querySelectorAll('button.exprow')).toHaveLength(0);
    expect(container.querySelectorAll('div.exprow').length).toBeGreaterThan(0);
  });
  it('#33-1 由新到舊：「出發前」沉到最底', () => {
    const { container } = rtlRender(<ExpenseGroups S={S} />);
    const secs = [...container.querySelectorAll('.sec')].map(x => x.textContent);
    expect(secs.length).toBeGreaterThan(1);
    if (secs.includes('出發前')) expect(secs[secs.length - 1]).toBe('出發前');
    const days = secs.filter(s => s?.startsWith('第 ')).map(s => Number(s!.match(/第 (\d+) 天/)![1]));
    expect(days).toEqual([...days].sort((a, b) => b - a));   // 天數由大到小
  });
});

describe('TransferView：S-05 與分享頁共用', () => {
  it('direct 模式與原型相同', () => {
    expect(texts(<TransferView t={{ ...input.trip, settleMode: 'direct', hubMember: null }} tx={input.tx} />))
      .toBe(want.transferDirect.text);
  });
  it('hub 模式與原型相同（拆成「大家給」與「再給」兩段）', () => {
    expect(texts(<TransferView t={{ ...input.trip, settleMode: 'hub', hubMember: input.hubMemberId }} tx={input.tx} />))
      .toBe(want.transferHub.text);
  });
  it('沒有轉帳時顯示「大家剛好打平」', () => {
    expect(texts(<TransferView t={input.trip} tx={[]} />)).toBe(want.transferEmpty.text);
  });
});

describe('MoreSheet：S-03 的 ⋯ 選單', () => {
  it('active 狀態與原型相同', () => {
    expect(texts(<MoreSheet status="active" />)).toBe(want.moreSheetActive.text);
  });
  it('settled 狀態多一項「封存行程」', () => {
    expect(texts(<MoreSheet status="settled" />)).toBe(want.moreSheetSettled.text);
  });
  it('archived 狀態沒有「編輯行程」——封存＝預設只讀', () => {
    expect(texts(<MoreSheet status="archived" />)).toBe(want.moreSheetArchived.text);
  });
  it('只有「刪除行程」帶 del', () => {
    const { container } = rtlRender(<MoreSheet status="active" />);
    const del = container.querySelectorAll('.shopt.del');
    expect(del).toHaveLength(1);
    expect(del[0].textContent).toContain('刪除行程');
  });
});

describe('Seg：S-03 分頁與 S-04 分帳方式共用', () => {
  const opts = [
    { value: 'a' as const, label: '一起分' },
    { value: 'b' as const, label: '各付各的' },
    { value: 'c' as const, label: '只算一個人', disabled: true },
  ];
  it('選中的那顆帶 .on，其餘沒有', () => {
    const { container } = rtlRender(<Seg options={opts} value="a" />);
    const on = container.querySelectorAll('button.on');
    expect(on).toHaveLength(1);
    expect(on[0].textContent).toBe('一起分');
  });
  it('停用的選項看得見但點不動', () => {
    const { container } = rtlRender(<Seg options={opts} value="a" />);
    const dis = container.querySelector('button.dis') as HTMLButtonElement;
    expect(dis).toBeTruthy();
    expect(dis.textContent).toBe('只算一個人');
    expect(dis.disabled).toBe(true);
  });
  it('三個選項都畫出來了', () => {
    const { container } = rtlRender(<Seg options={opts} value="a" />);
    expect(container.querySelectorAll('button')).toHaveLength(3);
  });
});
