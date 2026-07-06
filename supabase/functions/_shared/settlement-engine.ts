/**
 * settlement-engine.ts
 *
 * 分帳結算核心邏輯（Pure functions）
 * 從 calculate-settlement Edge Function 中抽離，便於單元 / 整合測試。
 *
 * 呼叫順序：
 *   1. calculateNetBalances(members, expenses, splits)
 *   2. minimumTransactions(balances)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  name: string;
  emoji: string;
}

export interface Expense {
  id: string;
  payer_member_id: string;
  twd_amount: number;
  expense_type: "shared" | "individual" | "personal";
  twd_pending?: boolean;
}

export interface Split {
  expense_id: string;
  member_id: string;
  is_participating: boolean;
  split_amount: number | null;
  split_pending: boolean;
}

export interface MemberBalance {
  member_id: string;
  name: string;
  emoji: string;
  payout: number;
  cost: number;
  net_balance: number;
}

export interface SettlementItem {
  from_member_id: string;
  to_member_id: string;
  amount: number;
}

export interface SettlementResult {
  balances: MemberBalance[];
  items: SettlementItem[];
  net_sum: number;
}

// ─── Step 1–2：計算每人 payout / cost / net_balance ──────────────────────────

/**
 * calculateNetBalances
 *
 * @param members  行程成員清單
 * @param expenses 費用清單（已過濾：排除 personal & twd_pending = true）
 * @param splits   expense_splits（已過濾：is_participating = true）
 * @returns MemberBalance[]
 *
 * 設計原則：
 *   - shared  → per_person = ROUND(twd_amount / n)，餘數歸付款人
 *   - individual → split_amount 直接用；差額（twd_amount − Σinput）一律歸付款人
 *                  付款人無論是否參與均承擔差額，確保 Σnet_balance = 0
 *   - personal → 不應傳入此函式（呼叫前過濾）
 */
export function calculateNetBalances(
  members: Member[],
  expenses: Expense[],
  splits: Split[],
): MemberBalance[] {
  const payout = new Map<string, number>(members.map((m) => [m.id, 0]));
  const cost   = new Map<string, number>(members.map((m) => [m.id, 0]));

  // Index: expense_id → splits[]
  const splitsByExpense = new Map<string, Split[]>();
  for (const s of splits) {
    if (!splitsByExpense.has(s.expense_id)) splitsByExpense.set(s.expense_id, []);
    splitsByExpense.get(s.expense_id)!.push(s);
  }

  for (const expense of expenses) {
    if (expense.twd_pending) continue; // 防禦：呼叫前應已過濾

    const { id, payer_member_id: payerId, twd_amount, expense_type } = expense;
    const expenseSplits = splitsByExpense.get(id) ?? [];

    // 付款人累積 payout
    payout.set(payerId, (payout.get(payerId) ?? 0) + twd_amount);

    if (expense_type === "shared") {
      const participants = expenseSplits.filter((s) => s.is_participating);
      const n = participants.length;
      if (n === 0) continue; // 零參與人：跳過（前端應已驗證）

      const perPerson = Math.round(twd_amount / n);
      const remainder = twd_amount - perPerson * n;

      for (const s of participants) {
        const extra = s.member_id === payerId ? remainder : 0;
        cost.set(s.member_id, (cost.get(s.member_id) ?? 0) + perPerson + extra);
      }
    } else if (expense_type === "individual") {
      const participants = expenseSplits.filter((s) => s.is_participating);
      let totalInput = 0;

      for (const s of participants) {
        if (!s.split_pending && s.split_amount !== null) {
          const amount = Number(s.split_amount);
          totalInput += amount;
          cost.set(s.member_id, (cost.get(s.member_id) ?? 0) + amount);
        }
        // split_pending = true → 本筆 cost = 0
      }

      // 差額一律歸付款人（確保 Σnet_balance = 0）
      const difference = twd_amount - totalInput;
      cost.set(payerId, (cost.get(payerId) ?? 0) + difference);
    }
    // personal → 不計入任何人（呼叫前過濾）
  }

  return members.map((m) => {
    const p = payout.get(m.id) ?? 0;
    const c = cost.get(m.id) ?? 0;
    return {
      member_id:   m.id,
      name:        m.name,
      emoji:       m.emoji,
      payout:      p,
      cost:        c,
      net_balance: p - c,
    };
  });
}

// ─── Step 3：Minimum Transactions（Greedy）────────────────────────────────────

/**
 * minimumTransactions
 *
 * 貪婪演算法：每回合讓應收最多的人收應付最多的人的錢。
 * 浮點誤差收斂閾值：< 1 元視為已平衡，不產生 settlement_item。
 *
 * @param balances calculateNetBalances 的輸出
 * @returns SettlementItem[]
 */
export function minimumTransactions(balances: MemberBalance[]): SettlementItem[] {
  const creditors = balances
    .filter((b) => b.net_balance >= 1)
    .map((b) => ({ member_id: b.member_id, balance: b.net_balance }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = balances
    .filter((b) => b.net_balance <= -1)
    .map((b) => ({ member_id: b.member_id, balance: b.net_balance }))
    .sort((a, b) => a.balance - b.balance);

  const items: SettlementItem[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor   = debtors[di];

    const transfer = Math.min(creditor.balance, Math.abs(debtor.balance));
    const rounded  = Math.round(transfer);

    if (rounded >= 1) {
      items.push({
        from_member_id: debtor.member_id,
        to_member_id:   creditor.member_id,
        amount:         rounded,
      });
    }

    creditor.balance -= transfer;
    debtor.balance   += transfer;

    if (Math.abs(creditor.balance) < 1) ci++;
    if (Math.abs(debtor.balance)   < 1) di++;
  }

  return items;
}

// ─── 主入口（Edge Function 呼叫）─────────────────────────────────────────────

/**
 * runSettlement
 *
 * 封裝兩步驟：計算 balances → 執行 greedy matching
 * 同時做 Σnet_balance 守恆驗證（偏差 ≥ 1 元時拋錯）。
 */
export function runSettlement(
  members: Member[],
  expenses: Expense[],
  splits: Split[],
): SettlementResult {
  const eligibleExpenses = expenses.filter(
    (e) => e.expense_type !== "personal" && !e.twd_pending,
  );
  const eligibleSplits = splits.filter((s) =>
    eligibleExpenses.some((e) => e.id === s.expense_id),
  );

  const balances = calculateNetBalances(members, eligibleExpenses, eligibleSplits);

  const netSum = balances.reduce((acc, b) => acc + b.net_balance, 0);
  if (Math.abs(netSum) >= 1) {
    throw new Error(
      `settlement_integrity_error: Σnet_balance = ${netSum} ≠ 0`,
    );
  }

  const items = minimumTransactions(balances);
  return { balances, items, net_sum: netSum };
}
