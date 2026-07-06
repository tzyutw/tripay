/**
 * calculate-settlement
 *
 * 觸發一次結算計算，寫入 settlements（status=draft）與 settlement_items。
 * 使用者確認後呼叫 confirm-settlement 才正式生效。
 *
 * POST /functions/v1/calculate-settlement
 * Body: { trip_id: string }
 * Auth: Bearer <supabase jwt>
 *
 * CR Issues 修正：
 *   #1  canSettle() guard — archived 行程回 409
 *   #2  排除軟刪除費用（.is("deleted_at", null)）
 *   #4  標記舊 draft 為 superseded
 *   #5  改呼叫 shared runSettlement，移除重複演算法
 *   #6  shared 零參與人回 422
 *   #7  twd_amount 型別驗證（非有限數或負數回 422）
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/helpers.ts";
import { canSettle, type TripDbStatus } from "../_shared/trip-status.ts";
import { runSettlement, type Member, type Expense, type Split } from "../_shared/settlement-engine.ts";

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── 2. Validate input ────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { trip_id } = body;
    if (!trip_id) return json({ error: "trip_id required" }, 400);

    // ── 3. Verify ownership + CR Issue #1 canSettle guard ───────────────────
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, owner_id, status")   // CR Issue #1：加入 status
      .eq("id", trip_id)
      .single();

    if (tripErr || !trip) return json({ error: "Trip not found" }, 404);
    if (trip.owner_id !== user.id) return json({ error: "Forbidden" }, 403);

    // CR Issue #1：封存行程為唯讀，不允許結算
    const settleCheck = canSettle(trip.status as TripDbStatus);
    if (!settleCheck.allowed) {
      return json({ error: "trip_archived", reason: settleCheck.reason }, 409);
    }

    // ── 4. Load data ─────────────────────────────────────────────────────────
    const [membersRes, expensesRes] = await Promise.all([
      supabase
        .from("trip_members")
        .select("id, name, emoji")
        .eq("trip_id", trip_id)
        .order("sort_order"),
      supabase
        .from("expenses")
        .select("id, payer_member_id, twd_amount, expense_type")
        .eq("trip_id", trip_id)
        .is("deleted_at", null)          // CR Issue #2：排除軟刪除費用
        .neq("expense_type", "personal") // personal 費用不進結算
        .eq("twd_pending", false),       // 台幣待填的筆排除
    ]);

    if (membersRes.error) throw membersRes.error;
    if (expensesRes.error) throw expensesRes.error;

    const members: Member[]   = membersRes.data  ?? [];
    const expenses: Expense[] = expensesRes.data ?? [];

    // CR Issue #7：金額型別驗證（非有限數或負數 → 422）
    for (const exp of expenses) {
      if (!Number.isFinite(exp.twd_amount) || exp.twd_amount < 0) {
        return json({ error: "invalid_amount", expense_id: exp.id }, 422);
      }
    }

    // 載入符合條件的 expense_splits
    const expenseIds = expenses.map((e) => e.id);
    let allSplits: Split[] = [];

    if (expenseIds.length > 0) {
      const { data, error } = await supabase
        .from("expense_splits")
        .select("expense_id, member_id, is_participating, split_amount, split_pending")
        .in("expense_id", expenseIds)
        .eq("is_participating", true);
      if (error) throw error;
      allSplits = (data ?? []) as Split[];
    }

    // CR Issue #6：shared 零參與人 → 422
    const splitsByExpense = new Map<string, Split[]>();
    for (const s of allSplits) {
      if (!splitsByExpense.has(s.expense_id)) splitsByExpense.set(s.expense_id, []);
      splitsByExpense.get(s.expense_id)!.push(s);
    }

    for (const expense of expenses) {
      if (expense.expense_type === "shared") {
        const participants = splitsByExpense.get(expense.id) ?? [];
        if (participants.length === 0) {
          return json({ error: "invalid_expense_splits", expense_id: expense.id }, 422);
        }
      }
    }

    // ── 5. Calculate（CR Issue #5：改呼叫 shared runSettlement）───────────────
    let result: ReturnType<typeof runSettlement>;
    try {
      result = runSettlement(members, expenses, allSplits);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("settlement_integrity_error")) {
        console.error(`[calculate-settlement] ${message}, trip_id=${trip_id}`);
        return json({
          error:   "settlement_integrity_error",
          message: "結算結果不一致，請聯繫開發團隊。",
        }, 500);
      }
      throw err;
    }

    // ── 8. Persist（service role 繞過 RLS 寫入）──────────────────────────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // CR Issue #4：標記同 trip 的舊 draft 為 superseded
    await admin
      .from("settlements")
      .update({ status: "superseded" })
      .eq("trip_id", trip_id)
      .eq("status", "draft");

    // 建立新 settlement（draft，等待使用者確認）
    const { data: settlement, error: settlErr } = await admin
      .from("settlements")
      .insert({ trip_id, created_by: user.id, status: "draft" })
      .select()
      .single();

    if (settlErr) throw settlErr;

    // 寫入 settlement_items
    if (result.items.length > 0) {
      const { error: itemsErr } = await admin
        .from("settlement_items")
        .insert(
          result.items.map((item) => ({
            ...item,
            settlement_id: settlement.id,
            is_cleared:    false,
          })),
        );
      if (itemsErr) throw itemsErr;
    }

    // 統計仍待填的筆數（for 前端警告顯示）
    const { count: pendingCount } = await supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", trip_id)
      .is("deleted_at", null)
      .neq("expense_type", "personal")
      .eq("twd_pending", true);

    // ── 9. Response ───────────────────────────────────────────────────────────
    return json({
      settlement_id:   settlement.id,
      status:          "draft",
      has_pending:     (pendingCount ?? 0) > 0,
      pending_count:   pendingCount ?? 0,
      items:           result.items,
      member_balances: result.balances,
    });
  } catch (err) {
    console.error("[calculate-settlement]", err);
    return json({ error: "Internal server error", detail: String(err) }, 500);
  }
});
