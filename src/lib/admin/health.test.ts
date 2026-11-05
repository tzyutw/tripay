/* 後台-B4　資料健康檢查：五類必抓的問題各一筆，加上「正常的帳不能被誤報」。 */
import { describe, it, expect } from 'vitest';
import { checkTripHealth, countProblems } from './health';
import { baseTrip, mk, M, demoExpenses } from '@/test/fixtures/adminFixture';
import type { TripWithMembers } from '@/types/database';

const codes = (trip: TripWithMembers, ex: ReturnType<typeof mk>[]) =>
  checkTripHealth(trip, ex).map(i => `${i.level}:${i.code}`);

describe('資料健康檢查', () => {
  it('正常的帳不報問題', () => {
    const ok = [
      mk({ title: '晚餐', twd_amount: 1000 }),
      mk({ title: '當場清', twd_amount: 400, settled_on_spot: true }),
      mk({ title: '自己的', twd_amount: 300, parts: [], expense_type: 'personal' }),
      mk({ title: '只算一個', twd_amount: 500, parts: [M[1]], individual_member_id: M[1] }),
      mk({ title: '各自', twd_amount: 900, expense_type: 'individual',
           indiv: { m0: 300, m1: 300, m2: 200, m3: 100 } }),
    ];
    expect(checkTripHealth(baseTrip, ok)).toEqual([]);
  });

  it('金額沒填完：外幣和台幣都沒填', () => {
    const i = checkTripHealth(baseTrip, [mk({ title: '計程車' })]);
    expect(i).toHaveLength(1);
    expect(i[0]).toMatchObject({ level: 'problem', code: 'amount_missing' });
    expect(i[0].where).toBe('3/14 計程車');
    expect(i[0].text).toContain('外幣（KRW）和台幣金額都沒填');
  });

  it('現金外幣沒設匯率', () => {
    const i = checkTripHealth(baseTrip, [mk({ title: '門票', foreign_amount: 20000, payment_method: 'cash' })]);
    expect(i[0]).toMatchObject({ code: 'no_cash_rate' });
    expect(i[0].text).toBe('付現金、只填了外幣 KRW 20,000，但這趟還沒設現金匯率，換不成台幣');
  });

  it('刷卡只填外幣：台幣沒填（不是匯率的問題）', () => {
    expect(codes(baseTrip, [mk({ foreign_amount: 20000, payment_method: 'credit_card' })]))
      .toEqual(['problem:twd_missing']);
  });

  it('設了匯率之後，現金外幣就不再報', () => {
    const t = { ...baseTrip, cash_rate_twd: 1, cash_rate_foreign: 43 } as TripWithMembers;
    expect(codes(t, [mk({ foreign_amount: 43000, payment_method: 'cash' })])).toEqual([]);
  });

  it('分給 0 個人', () => {
    const i = checkTripHealth(baseTrip, [mk({ title: '空', twd_amount: 100, parts: [] })]);
    expect(i[0]).toMatchObject({ level: 'problem', code: 'no_participant' });
    expect(i[0].text).toContain('分給 0 個人');
  });

  it('每人分攤加總不等於總額：各付各的、付款人沒參與、填的比總額少', () => {
    const e = mk({ title: '藥妝', twd_amount: 1000, expense_type: 'individual', payer_member_id: M[0],
                   parts: [M[1], M[2]], indiv: { m1: 300, m2: 300 } });
    const i = checkTripHealth(baseTrip, [e]);
    expect(i[0]).toMatchObject({ level: 'problem', code: 'share_sum_mismatch' });
    expect(i[0].text).toBe('每人分攤加起來 $600，跟總額 $1,000 差 $400（付款人沒有參與這筆，差額沒有人吸收）');
  });

  it('一起分、付款人沒參與的四捨五入差 1 元：只是提醒，不算問題', () => {
    const e = mk({ twd_amount: 100, payer_member_id: M[0], parts: [M[1], M[2], M[3]] });
    const i = checkTripHealth(baseTrip, [e]);
    expect(i.map(x => `${x.level}:${x.code}`)).toEqual(['notice:share_sum_mismatch']);
    expect(countProblems(i)).toBe(0);
  });

  it('各自金額全部填了但加起來不等於總額：提醒差額算給付款人', () => {
    const e = mk({ twd_amount: 1000, expense_type: 'individual', payer_member_id: M[0],
                   indiv: { m0: 100, m1: 300, m2: 300, m3: 100 } });
    const i = checkTripHealth(baseTrip, [e]);
    expect(i[0]).toMatchObject({ level: 'notice', code: 'each_sum_diff' });
    expect(i[0].text).toContain('差的 $200 算到付款人 Rozi 頭上');
  });

  it('各自填的金額超過總額、付款人被算成負的：要抓出來', () => {
    const e = mk({ title: '藥妝', twd_amount: 1000, expense_type: 'individual', payer_member_id: M[1],
                   parts: [M[0], M[1]], indiv: { m0: 1500, m1: 0 } });
    const i = checkTripHealth(baseTrip, [e]);
    expect(i.map(x => x.code)).toEqual(['negative_share']);
    expect(i[0].text).toBe('各自填的金額加起來超過總額，小美 被算成 −$500');
  });

  it('各自金額有人留空、但填了的已經加到總額（線上舊帳的樣子）：只是提醒，不亮紅點', () => {
    /* 照 2024 東京「AINZ TULPE 美妝」的形狀：5 人參與、填了 3 人、加起來剛好＝總額 2866.82 */
    const five = [...M, 'm4'];
    const trip5 = { ...baseTrip, trip_members: [...baseTrip.trip_members,
      { ...baseTrip.trip_members[0], id: 'm4', name: '阿嬤', sort_order: 4, user_id: null }] } as TripWithMembers;
    const e = mk({ title: '美妝', twd_amount: 2866.82, expense_type: 'individual', payer_member_id: M[2],
                   parts: five, indiv: { m0: 338.37, m2: 2369.84, m4: 158.61 } });
    const i = checkTripHealth(trip5, [e]);
    expect(i.map(x => `${x.level}:${x.code}`)).toEqual(['notice:each_blank']);
    expect(i[0].text).toContain('他們算 $0、結算不會錯');
    expect(i[0].text).toContain('家人手機上這筆會顯示成「還沒算清楚」');
    expect(countProblems(i)).toBe(0);
  });

  it('各自金額有 2 人以上沒填', () => {
    const e = mk({ twd_amount: 1000, expense_type: 'individual', indiv: { m0: 100, m1: 300 } });
    const i = checkTripHealth(baseTrip, [e]);
    expect(i[0].code).toBe('each_blank');
    expect(i[0].level).toBe('problem');
    expect(i[0].text).toContain('2 個人沒填（阿明、小魚）');
  });

  it('付款人／分帳對象已不在這趟成員裡', () => {
    const ghostPayer = mk({ title: '鬼付款', twd_amount: 100, payer_member_id: 'gone' });
    const ghostSplit = mk({ title: '鬼分帳', twd_amount: 100, parts: [M[0], 'gone2'] });
    const ghostIndiv = mk({ title: '鬼一人', twd_amount: 100, parts: ['gone3'], individual_member_id: 'gone3' });
    const got = codes(baseTrip, [ghostPayer, ghostSplit, ghostIndiv]);
    expect(got).toContain('problem:ghost_payer');
    expect(got).toContain('problem:ghost_member');
    expect(got).toContain('problem:ghost_individual');
  });

  it('結算頁那組 demo 帳：抓到的筆數跟前台「還沒算清楚」對得上', () => {
    const i = checkTripHealth(baseTrip, demoExpenses());
    /* 城山日出峰（現金外幣沒匯率）、計程車（都沒填）；
       藥妝店：填了的加起來 30,000 > 總額 1,035，小美被算成負的（「沒填」不重複報） */
    expect(i.filter(x => x.level === 'problem').map(x => `${x.where}:${x.code}`).sort())
      .toEqual(['3/14 計程車:amount_missing', '3/15 城山日出峰門票:no_cash_rate',
                '3/15 藥妝店:negative_share'].sort());
  });
});
