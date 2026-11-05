/* 後台-B4　資料健康檢查。
 *
 * 每一條都用白話寫出「哪一筆、什麼問題」。
 * ⚠️ **判定直接用前台的 `calc()`**（`@/lib/summary`），不另寫一套換算——
 *    「金額沒填完」「分攤加總」這兩類問題的答案，必須跟家人手機上
 *    「有 N 筆還沒算清楚」用的是同一個判斷，不然後台說沒事、手機上說有事。
 *
 * 嚴重度兩級：
 *   problem　會讓結算算錯或算不出來（紅點計入）
 *   notice　 不會算錯，但家人可能覺得「怪怪的」（只在詳情顯示，不計入紅點）
 */
import { calc, toSharedExpense } from '@/lib/summary';
import type { ExpenseWithSplits, TripWithMembers } from '@/types/database';

export type HealthLevel = 'problem' | 'notice';
export type HealthCode =
  | 'amount_missing' | 'twd_missing' | 'no_cash_rate'
  | 'each_blank' | 'each_no_foreign_total'
  | 'no_participant' | 'share_sum_mismatch' | 'each_sum_diff' | 'negative_share'
  | 'ghost_payer' | 'ghost_member' | 'ghost_individual';

export interface HealthIssue {
  level: HealthLevel;
  code: HealthCode;
  expenseId: string | null;
  /** 哪一筆（給人看的：日期＋品項） */
  where: string;
  /** 什麼問題（白話） */
  text: string;
}

const fmt = (v: number) => Math.round(v).toLocaleString('en-US');

/** 日期＋品項，例：「11/2 拉麵」 */
export function expenseLabel(e: Pick<ExpenseWithSplits, 'expense_date' | 'title'>): string {
  const d = e.expense_date ?? '';
  const md = d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '';
  return `${md} ${e.title || '（沒有品項名稱）'}`.trim();
}

export function checkTripHealth(trip: TripWithMembers, expenses: ExpenseWithSplits[]): HealthIssue[] {
  const out: HealthIssue[] = [];
  const members = [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
  const ids = new Set(members.map(m => m.id));
  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? '（已不在行程裡的成員）';
  const cur = trip.currency;

  for (const e of expenses) {
    const where = expenseLabel(e);
    const push = (level: HealthLevel, code: HealthCode, text: string) =>
      out.push({ level, code, expenseId: e.id, where, text });

    /* ── 付款人或分帳對象不在行程裡 ─────────────────────────────── */
    if (e.payer_member_id && !ids.has(e.payer_member_id))
      push('problem', 'ghost_payer', '付款人已經不在這趟的成員名單裡，這筆的錢不知道該算誰付的');
    if (e.individual_member_id && !ids.has(e.individual_member_id))
      push('problem', 'ghost_individual', '「只算一個人」選的那個人已經不在成員名單裡');
    const ghostSplits = (e.expense_splits ?? [])
      .filter(s => s.is_participating && !ids.has(s.member_id));
    if (ghostSplits.length && e.expense_type !== 'personal' && !e.individual_member_id)
      push('problem', 'ghost_member',
        `分給了 ${ghostSplits.length} 位已經不在成員名單裡的人，他們那一份不會出現在結算`);

    if (e.expense_type === 'personal') continue;     // 「自己的」本來就不分給任何人

    const c = calc(e, trip, members);
    const se = toSharedExpense(e, members);
    const parts = se.parts ?? [];

    /* ── 分給 0 個人 ─────────────────────────────────────────── */
    if (parts.length === 0) {
      push('problem', 'no_participant', '分給 0 個人：這筆沒有任何人分攤，不會進結算');
      continue;
    }

    /* ── 金額沒填完 ──────────────────────────────────────────── */
    if (c.twdPending) {
      const hasFor = Number.isFinite(e.foreign_amount as number);
      if (!hasFor)
        push('problem', 'amount_missing', `外幣（${cur}）和台幣金額都沒填，這筆還不會算進結算`);
      else if (e.payment_method === 'cash' && !c.rate)
        push('problem', 'no_cash_rate',
          `付現金、只填了外幣 ${cur} ${fmt(e.foreign_amount!)}，但這趟還沒設現金匯率，換不成台幣`);
      else
        push('problem', 'twd_missing',
          `只填了外幣 ${cur} ${fmt(e.foreign_amount!)}，台幣金額還沒填，這筆還不會算進結算`);
      continue;
    }

    if (c.isEach) {
      if (c.noAutoReason === 'noForeignTotal') {
        push('problem', 'each_no_foreign_total',
          `各自金額是用外幣填的，但外幣總額沒填，每個人的台幣算不出來`);
        continue;
      }
      if (c.blanks.length >= 2)
        push('problem', 'each_blank',
          `各自金額還有 ${c.blanks.length} 個人沒填（${c.blanks.map(nameOf).join('、')}），目前是先平分剩下的`);
    }

    /* ── 有人被算成負的分攤 ──────────────────────────────────── */
    /* 各自填的金額加起來超過總額時，差額倒扣在付款人身上，他的分攤會變成負數。
       加總仍然等於總額（所以下一條抓不到），但帳一定是填錯了。贊助本來就是負的，不算。 */
    if (!e.is_sponsor) {
      const neg = parts.filter(id => (c.shares[id] ?? 0) < 0);
      if (neg.length) {
        push('problem', 'negative_share',
          `各自填的金額加起來超過總額，${neg.map(id => `${nameOf(id)} 被算成 −$${fmt(-(c.shares[id] as number))}`).join('、')}`);
        continue;
      }
    }

    /* ── 每人分攤加總不等於總額 ──────────────────────────────── */
    const shares = parts.map(id => c.shares[id]);
    if (shares.every(v => v != null)) {
      const sum = (shares as number[]).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - c.twdTotal) >= 1) {
        const payerIn = e.payer_member_id && parts.includes(e.payer_member_id);
        /* 一起分、付款人沒參與時，每人四捨五入到整數，最多差「人數的一半」元。
           那是四捨五入，不是資料錯，降成提醒，免得紅點被一兩塊錢洗版。 */
        const rounding = !c.isEach && !payerIn && Math.abs(sum - c.twdTotal) <= parts.length / 2;
        push(rounding ? 'notice' : 'problem', 'share_sum_mismatch',
          `每人分攤加起來 $${fmt(sum)}，跟總額 $${fmt(c.twdTotal)} 差 $${fmt(Math.abs(sum - c.twdTotal))}`
          + (payerIn ? '' : '（付款人沒有參與這筆，差額沒有人吸收）'));
        continue;
      }
    }

    /* 各自金額全部填了、但加起來跟總額不一樣：系統把差額算到付款人頭上。
       不會算錯，但家人很可能就是因為這個覺得「怪怪的」。 */
    if (c.isEach && c.blanks.length === 0) {
      const base = c.fillsAreForeign ? c.forTotalEff : c.twdTotal;
      const entered = parts.reduce((a, id) => a + (c.valInCur[id] ?? 0), 0);
      if (base != null && !c.forTotalAuto && Math.abs(entered - base) >= 1) {
        const unit = c.fillsAreForeign ? `${cur} ` : '$';
        push('notice', 'each_sum_diff',
          `各自填的金額加起來 ${unit}${fmt(entered)}，總額是 ${unit}${fmt(base)}，`
          + `差的 ${unit}${fmt(Math.abs(base - entered))} 算到付款人 ${nameOf(e.payer_member_id)} 頭上`);
      }
    }
  }
  return out;
}

export const countProblems = (issues: HealthIssue[]) =>
  issues.filter(i => i.level === 'problem').length;
