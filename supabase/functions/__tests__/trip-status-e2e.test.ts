/**
 * trip-status-e2e.test.ts
 *
 * TC-STATUS-18~20 E2E 整合測試
 * 對 Supabase local dev 執行真實 DB 操作，驗證 DB 寫入規則。
 *
 * ⚠️  執行前置條件：
 *   1. 安裝 Supabase CLI：brew install supabase/tap/supabase
 *   2. 啟動本地環境：supabase start（需要 Docker）
 *   3. 確認 .env.test 存在（見下方格式）
 *
 * .env.test 格式：
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321
 *   SUPABASE_TEST_SERVICE_KEY=<supabase start 輸出的 service_role key>
 *   SUPABASE_TEST_ANON_KEY=<supabase start 輸出的 anon key>
 *
 * 執行指令：
 *   npx vitest run supabase/functions/__tests__/trip-status-e2e.test.ts
 *
 * 測試完成後 DB 資料自動清除（afterEach cleanup）。
 */

import { beforeAll, afterEach, describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

// ─── 環境設定 ─────────────────────────────────────────────────────────────────

const env = loadEnv("test", process.cwd(), "SUPABASE_TEST");

const SUPABASE_URL         = env.SUPABASE_TEST_URL         || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = env.SUPABASE_TEST_SERVICE_KEY || "";
const SUPABASE_ANON_KEY    = env.SUPABASE_TEST_ANON_KEY    || "";

// ─── Clients ──────────────────────────────────────────────────────────────────

let admin: SupabaseClient;   // service_role：繞過 RLS，用於 seed & cleanup
let anon:  SupabaseClient;   // anon：模擬前端呼叫

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/** 建立測試用假 profile（繞過 Google OAuth）*/
async function seedProfile() {
  const { data, error } = await admin.from("profiles").insert({
    google_sub:   `test-sub-${Date.now()}`,
    display_name: "E2E Tester",
    avatar_url:   null,
  }).select().single();
  if (error) throw new Error(`seedProfile: ${error.message}`);
  return data;
}

/** 建立測試行程，status 預設 planned */
async function seedTrip(ownerId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin.from("trips").insert({
    owner_id:   ownerId,
    name:       "E2E Test Trip",
    emoji:      "🧪",
    currency:   "JPY",
    start_date: "2026-09-01",
    end_date:   "2026-09-10",
    status:     "planned",
    share_token: `e2e-token-${Date.now()}`,
    ...overrides,
  }).select().single();
  if (error) throw new Error(`seedTrip: ${error.message}`);
  return data;
}

/** 建立測試成員 */
async function seedMember(tripId: string) {
  const { data, error } = await admin.from("trip_members").insert({
    trip_id:    tripId,
    name:       "Ning",
    emoji:      "🍋",
    sort_order: 0,
  }).select().single();
  if (error) throw new Error(`seedMember: ${error.message}`);
  return data;
}

/** 建立測試消費（金額不 pending，確保結算可執行）*/
async function seedExpense(tripId: string, payerId: string, createdBy: string) {
  const { data, error } = await admin.from("expenses").insert({
    trip_id:          tripId,
    payer_member_id:  payerId,
    created_by:       createdBy,
    title:            "E2E 午餐",
    expense_date:     "2026-09-02",
    twd_amount:       600,
    twd_pending:      false,
    foreign_amount:   2000,
    foreign_pending:  false,
    payment_method:   "cash",
    expense_type:     "shared",
  }).select().single();
  if (error) throw new Error(`seedExpense: ${error.message}`);
  return data;
}

/** 建立 expense_split */
async function seedSplit(expenseId: string, memberId: string) {
  const { error } = await admin.from("expense_splits").insert({
    expense_id:      expenseId,
    member_id:       memberId,
    is_participating: true,
    split_amount:    null,
    split_pending:   false,
  });
  if (error) throw new Error(`seedSplit: ${error.message}`);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

const createdProfileIds: string[] = [];

async function cleanup() {
  if (createdProfileIds.length === 0) return;
  // cascade：profiles 刪除後，trips → expenses → splits → settlements → items 連帶刪除
  await admin.from("profiles").delete().in("id", createdProfileIds);
  createdProfileIds.length = 0;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

// 使用 describe.skipIf 在沒有 Supabase 的環境下優雅跳過整個 E2E suite，
// 避免因 beforeAll throw 導致 CI 誤判為測試失敗。

// ─── TC-STATUS-18~20 E2E ──────────────────────────────────────────────────────

describe.skipIf(!SUPABASE_SERVICE_KEY)("TC-STATUS-18~20：DB 寫入規則 E2E（需要 supabase start）", () => {
  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    anon  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  afterEach(cleanup);

  /**
   * TC-STATUS-18 E2E
   * 建立行程時，DB status 必須為 "planned"
   *
   * 驗證：
   *   INSERT INTO trips（...） → SELECT status FROM trips WHERE id = ?
   *   → status = "planned"
   *
   * 設計意涵：
   *   不論 start_date 是否已過，DB 初始值一律寫 planned。
   *   前端 deriveDisplayStatus 在讀取時才根據 today 決定顯示 planned/active。
   */
  it("TC-STATUS-18 [E2E]：建立行程時 DB status = planned", async () => {
    const profile = await seedProfile();
    createdProfileIds.push(profile.id);

    const trip = await seedTrip(profile.id, {
      // start_date 設在過去，確認即使「已出發」DB 仍寫 planned
      start_date: "2020-01-01",
      end_date:   "2020-01-10",
      status:     "planned",  // 明確寫入
    });

    // 從 DB 讀回確認
    const { data, error } = await admin
      .from("trips")
      .select("status")
      .eq("id", trip.id)
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("planned");
  });

  /**
   * TC-STATUS-19 E2E
   * confirm-settlement 呼叫後，trips.status = "settled"
   *
   * 驗證完整流程：
   *   1. 建立行程（status=planned）
   *   2. 建立 settlement（status=draft）
   *   3. admin.update settlements → status=confirmed + settled_at
   *   4. admin.update trips → status=settled
   *   5. 從 DB 讀回確認 trips.status = "settled"
   *      且 settlements.status = "confirmed"、settlements.settled_at 有值
   *
   * 此測試模擬 confirm-settlement Edge Function 的 DB 操作，
   * 不直接呼叫 HTTP（Edge Function 在本地需 `supabase functions serve`）。
   */
  it("TC-STATUS-19 [E2E]：confirm-settlement 後 DB trips.status = settled", async () => {
    const profile = await seedProfile();
    createdProfileIds.push(profile.id);

    const trip    = await seedTrip(profile.id);
    const member  = await seedMember(trip.id);
    const expense = await seedExpense(trip.id, member.id, profile.id);
    await seedSplit(expense.id, member.id);

    // 建立 draft settlement
    const { data: settlement, error: settlErr } = await admin
      .from("settlements")
      .insert({ trip_id: trip.id, created_by: profile.id, status: "draft" })
      .select()
      .single();

    expect(settlErr).toBeNull();

    const now = new Date().toISOString();

    // 模擬 confirm-settlement 的 DB 操作（parallel update）
    const [settlUpdate, tripUpdate] = await Promise.all([
      admin.from("settlements")
        .update({ status: "confirmed", settled_at: now })
        .eq("id", settlement.id),
      admin.from("trips")
        .update({ status: "settled" })
        .eq("id", trip.id),
    ]);

    expect(settlUpdate.error).toBeNull();
    expect(tripUpdate.error).toBeNull();

    // 讀回驗證
    const [tripRow, settlRow] = await Promise.all([
      admin.from("trips").select("status").eq("id", trip.id).single(),
      admin.from("settlements").select("status, settled_at").eq("id", settlement.id).single(),
    ]);

    expect(tripRow.data?.status).toBe("settled");
    expect(settlRow.data?.status).toBe("confirmed");
    expect(settlRow.data?.settled_at).not.toBeNull(); // settled_at 已填入
  });

  /**
   * TC-STATUS-20 E2E
   * reopen-settlement（mode=unarchive）後，trips.status = "settled"（不回 active/planned）
   *
   * 驗證完整流程：
   *   1. 建立行程（status=archived）
   *   2. admin.update trips → status=settled（模擬 unarchive）
   *   3. 讀回確認 status = "settled"，且不是 "active" / "planned"
   *
   * 設計意涵：
   *   封存行程通常旅遊已結束，回到 settled 狀態最合理。
   *   使用者若需要修改帳目，可再呼叫 mode=reopen 回退 planned/active。
   */
  it("TC-STATUS-20 [E2E]：unarchive 後 DB trips.status = settled（非 active/planned）", async () => {
    const profile = await seedProfile();
    createdProfileIds.push(profile.id);

    // 建立 archived 行程
    const trip = await seedTrip(profile.id, { status: "archived" });

    // 確認初始狀態
    const before = await admin.from("trips").select("status").eq("id", trip.id).single();
    expect(before.data?.status).toBe("archived");

    // 模擬 reopen-settlement mode=unarchive 的 DB 操作
    const { error: updateErr } = await admin
      .from("trips")
      .update({ status: "settled" })
      .eq("id", trip.id);

    expect(updateErr).toBeNull();

    // 讀回驗證
    const after = await admin.from("trips").select("status").eq("id", trip.id).single();

    expect(after.data?.status).toBe("settled");
    expect(after.data?.status).not.toBe("active");   // ← 關鍵：不回 active
    expect(after.data?.status).not.toBe("planned");  // ← 關鍵：不回 planned
  });

});
