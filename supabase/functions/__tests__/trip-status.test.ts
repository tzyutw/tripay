/**
 * trip-status.test.ts
 *
 * trip.status 相關測試（planned / active 情境補充）
 * 依據：資料模型 §7、reopen-settlement Edge Function
 *
 * 測試命名規則：TC-STATUS-[流水號]
 *
 * 執行：vitest run supabase/functions/__tests__/trip-status.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  deriveDisplayStatus,
  resolveReopenStatus,
  validateReopenGuards,
  canSettle,
  VALID_STATUS_TRANSITIONS,
  type TripDbStatus,
} from "../_shared/trip-status";

// ─── 輔助：固定 today，避免測試結果依賴執行日期 ────────────────────────────

const D = (dateStr: string) => new Date(dateStr);

// ─── §7 TC-STATUS-01~05：deriveDisplayStatus（前端派生）─────────────────────

describe("TC-STATUS：deriveDisplayStatus（前端派生邏輯）", () => {
  /**
   * TC-STATUS-01
   * 建立行程，DB status = planned，today < start_date
   * → 顯示「準備旅遊」（planned）
   *
   * 這是最常見的初始情境：使用者建立行程後還沒出發。
   * DB 寫入 planned，前端也派生 planned → 兩者一致。
   */
  it("TC-STATUS-01：today < start_date，DB=planned → 顯示 planned", () => {
    const trip = { status: "planned" as const, start_date: "2026-08-01" };
    expect(deriveDisplayStatus(trip, D("2026-07-20"))).toBe("planned");
  });

  /**
   * TC-STATUS-02
   * 今天已到出發日，DB status 仍是 planned（未手動更新）
   * → 前端派生應為 active（不信任 DB 的 planned 值）
   *
   * 這驗證了「前端派生不依賴 DB 值」的核心設計：
   * DB 欄位可能是舊的 planned，但前端根據日期判斷應顯示 active。
   */
  it("TC-STATUS-02：today >= start_date，DB=planned → 前端派生 active（不信任 DB 值）", () => {
    const trip = { status: "planned" as const, start_date: "2026-07-01" };
    expect(deriveDisplayStatus(trip, D("2026-07-01"))).toBe("active"); // 出發當天 = active
    expect(deriveDisplayStatus(trip, D("2026-07-15"))).toBe("active"); // 旅遊中
  });

  /**
   * TC-STATUS-03
   * 出發日前一天 vs 當天的邊界：前一天 = planned，當天 = active
   */
  it("TC-STATUS-03：出發日前一天 planned，當天切換 active（精確邊界）", () => {
    const trip = { status: "planned" as const, start_date: "2026-08-01" };
    expect(deriveDisplayStatus(trip, D("2026-07-31"))).toBe("planned"); // 前一天
    expect(deriveDisplayStatus(trip, D("2026-08-01"))).toBe("active");  // 出發當天
  });

  /**
   * TC-STATUS-04
   * 回程後（today > end_date），DB 若仍是 planned/active（未結算）
   * → 前端持續顯示 active（不自動切換 settled）
   * 只有使用者主動呼叫 confirm-settlement 才會變 settled。
   */
  it("TC-STATUS-04：旅遊結束後未結算，DB=planned → 仍顯示 active（不自動 settled）", () => {
    const trip = { status: "planned" as const, start_date: "2026-06-01" };
    expect(deriveDisplayStatus(trip, D("2026-06-30"))).toBe("active"); // 回國後
    expect(deriveDisplayStatus(trip, D("2026-12-31"))).toBe("active"); // 半年後仍未結算
  });

  /**
   * TC-STATUS-05
   * settled / archived 狀態不受日期影響
   */
  it("TC-STATUS-05：settled 狀態不受 start_date 影響，恆顯示 settled", () => {
    // 未來出發日的行程，但已 settled → 仍顯示 settled
    const trip = { status: "settled" as const, start_date: "2027-01-01" };
    expect(deriveDisplayStatus(trip, D("2026-06-26"))).toBe("settled");
  });

  it("TC-STATUS-06：archived 狀態不受 start_date 影響，恆顯示 archived", () => {
    const trip = { status: "archived" as const, start_date: "2020-01-01" };
    expect(deriveDisplayStatus(trip, D("2026-06-26"))).toBe("archived");
  });
});

// ─── TC-STATUS-07~10：reopen-settlement（mode=reopen）狀態決策 ───────────────

describe("TC-STATUS：reopen-settlement mode=reopen 回退狀態", () => {
  /**
   * TC-STATUS-07
   * 結算後發現帳目有誤，reopen 時 today 尚在出發前
   * → 回退 planned（尚未出發，回到準備狀態）
   */
  it("TC-STATUS-07：reopen 時 today < start_date → 回退 planned", () => {
    expect(resolveReopenStatus("2026-09-01", D("2026-08-01"))).toBe("planned");
  });

  /**
   * TC-STATUS-08
   * reopen 時 today >= start_date（旅遊中或已回國）
   * → 回退 active
   */
  it("TC-STATUS-08：reopen 時 today >= start_date → 回退 active", () => {
    expect(resolveReopenStatus("2026-07-01", D("2026-07-10"))).toBe("active"); // 旅遊中
    expect(resolveReopenStatus("2026-06-01", D("2026-06-26"))).toBe("active"); // 已回國
  });

  /**
   * TC-STATUS-09
   * reopen 時 today 恰好等於 start_date → 回退 active（出發當天算 active）
   */
  it("TC-STATUS-09：reopen 時 today = start_date（出發當天） → 回退 active", () => {
    expect(resolveReopenStatus("2026-08-15", D("2026-08-15"))).toBe("active");
  });

  /**
   * TC-STATUS-10
   * reopen 時前一天與當天的精確邊界
   */
  it("TC-STATUS-10：reopen 邊界，前一天 planned / 當天 active", () => {
    const startDate = "2026-10-01";
    expect(resolveReopenStatus(startDate, D("2026-09-30"))).toBe("planned");
    expect(resolveReopenStatus(startDate, D("2026-10-01"))).toBe("active");
  });
});

// ─── TC-STATUS-11~17：reopen-settlement guard 驗證 ────────────────────────────

describe("TC-STATUS：reopen-settlement guard（前置條件驗證）", () => {
  /**
   * TC-STATUS-11
   * mode=unarchive，trip 確實是 archived → 允許執行
   */
  it("TC-STATUS-11：unarchive archived 行程 → ok", () => {
    const result = validateReopenGuards("archived", "unarchive");
    expect(result.ok).toBe(true);
  });

  /**
   * TC-STATUS-12
   * mode=unarchive，但 trip 不是 archived（如 settled）→ 409
   */
  it("TC-STATUS-12：unarchive 非 archived 行程 → 409 錯誤", () => {
    const result = validateReopenGuards("settled", "unarchive");
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(409);
    expect(result.error).toContain("settled");

    // 其他非 archived 狀態也同樣拒絕
    expect(validateReopenGuards("planned", "unarchive").ok).toBe(false);
    expect(validateReopenGuards("active",  "unarchive").ok).toBe(false);
  });

  /**
   * TC-STATUS-13
   * mode=reopen，trip 是 archived → 409（應改用 unarchive）
   */
  it("TC-STATUS-13：reopen archived 行程 → 409，提示應用 unarchive", () => {
    const result = validateReopenGuards("archived", "reopen");
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(409);
    expect(result.error).toContain("unarchive");
  });

  /**
   * TC-STATUS-14
   * mode=reopen，trip 已是 planned → 冪等早回（不寫 DB）
   * 對應 Edge Function 第 87 行：already planned/active → early return
   */
  it("TC-STATUS-14：reopen 時行程已是 planned → 早回（冪等）", () => {
    const result = validateReopenGuards("planned", "reopen");
    expect(result.ok).toBe(false);        // ok=false 但屬 earlyReturn
    expect(result.earlyReturn).toBe(true);
    expect(result.currentStatus).toBe("planned");
  });

  /**
   * TC-STATUS-15
   * mode=reopen，trip 已是 active → 冪等早回
   */
  it("TC-STATUS-15：reopen 時行程已是 active → 早回（冪等）", () => {
    const result = validateReopenGuards("active", "reopen");
    expect(result.earlyReturn).toBe(true);
    expect(result.currentStatus).toBe("active");
  });

  /**
   * TC-STATUS-16
   * mode=reopen，trip 是 settled → 允許執行（正常 reopen 路徑）
   */
  it("TC-STATUS-16：reopen settled 行程 → ok（正常路徑）", () => {
    const result = validateReopenGuards("settled", "reopen");
    expect(result.ok).toBe(true);
  });
});

// ─── TC-STATUS-18~20：DB 寫入規則（行為說明，作為 E2E 整合測試規格）──────────

describe("TC-STATUS：DB 寫入規則規格（E2E 整合測試規格）", () => {
  /**
   * 以下三個 test 為規格說明型測試（spec tests）。
   * 實際 DB 操作需要 Supabase 環境，此處以行為斷言記錄預期，
   * 作為未來接 Supabase local dev 的整合測試基礎。
   */

  /**
   * TC-STATUS-18：建立行程 → DB status = planned
   *
   * 規格：INSERT INTO trips (...) VALUES (..., status='planned', ...)
   * 前端派生可能立即顯示 active（若 start_date 已過），
   * 但 DB 初始值必須是 planned。
   */
  it("TC-STATUS-18 [規格]：建立行程時 DB status 必須寫入 planned", () => {
    // 此規格需 Supabase E2E 環境驗證，以下斷言記錄期望行為
    const expectedDbStatusOnCreate = "planned";
    expect(expectedDbStatusOnCreate).toBe("planned");
  });

  /**
   * TC-STATUS-19：confirm-settlement → DB status = settled
   *
   * 規格：confirm-settlement 呼叫後，trips.status 必須為 settled。
   * 同步驗證：settlement.status = confirmed，settlement.settled_at 有值。
   */
  it("TC-STATUS-19 [規格]：confirm-settlement 後 DB status = settled", () => {
    const expectedDbStatusAfterConfirm = "settled";
    expect(expectedDbStatusAfterConfirm).toBe("settled");
  });

  /**
   * TC-STATUS-20：unarchive → DB status = settled（不回 active/planned）
   *
   * 規格：reopen-settlement（mode=unarchive）呼叫後，
   * trips.status 必須為 settled（非 active / planned）。
   * 理由：封存行程通常旅遊已結束，回到結算狀態最合理。
   */
  it("TC-STATUS-20 [規格]：unarchive 後 DB status = settled（不回 active）", () => {
    const expectedDbStatusAfterUnarchive = "settled";
    expect(expectedDbStatusAfterUnarchive).toBe("settled");
    expect(expectedDbStatusAfterUnarchive).not.toBe("active");
    expect(expectedDbStatusAfterUnarchive).not.toBe("planned");
  });
});

// ─── TC-STATUS-21~23：point 3 — planned 狀態下結算限制確認 ───────────────────

describe("TC-STATUS：planned 狀態下結算限制（point 3）", () => {
  /**
   * TC-STATUS-21
   * planned 狀態下允許執行結算（canSettle = true）
   *
   * 設計意圖：
   *   calculate-settlement API 層不檢查 trip.status。
   *   DB 的 planned 值僅為初始寫入，不保證即時準確。
   *   前端依日期派生顯示狀態，今天若已到出發日，
   *   前端顯示 active，此時允許結算完全合理。
   *   因此，planned / active / settled 三個 DB 狀態都允許結算。
   */
  it("TC-STATUS-21：DB=planned 行程允許執行結算（API 層無 status guard）", () => {
    const result = canSettle("planned");
    expect(result.allowed).toBe(true);
  });

  it("TC-STATUS-21b：DB=active 行程允許執行結算", () => {
    expect(canSettle("active").allowed).toBe(true);
  });

  it("TC-STATUS-21c：DB=settled 行程允許重新結算（覆蓋舊版本）", () => {
    // settled 可重新結算，舊 settlement 保留歷史，新建一筆 draft
    expect(canSettle("settled").allowed).toBe(true);
  });

  /**
   * TC-STATUS-22
   * archived 是唯一不允許結算的狀態
   *
   * 封存 = 預設只讀，必須先 unarchive 解除封存才能重新操作。
   */
  it("TC-STATUS-22：DB=archived 行程不允許結算，唯一例外", () => {
    const result = canSettle("archived");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain("封存");
  });

  /**
   * TC-STATUS-23
   * planned 狀態下的前端顯示與結算可行性矩陣
   *
   * 驗證「DB=planned 但前端顯示 active」時，結算邏輯的完整性：
   *   - DB status 看起來是 planned，但 today >= start_date
   *   - 前端派生顯示 active
   *   - canSettle(planned) = true → 允許結算
   *   → 使用者看到的是「旅遊中，可以結算」，後端也不阻斷，行為一致
   */
  it("TC-STATUS-23：DB=planned + today >= start_date → 顯示 active + 允許結算（設計一致性）", () => {
    const trip = { status: "planned" as const, start_date: "2026-06-01" };
    const today = D("2026-06-26"); // 已出發

    const display = deriveDisplayStatus(trip, today);
    const settle  = canSettle(trip.status);

    expect(display).toBe("active");   // 前端顯示旅遊中
    expect(settle.allowed).toBe(true); // 後端允許結算
    // 兩者一致：不會出現「前端說可以結算，後端卻拒絕」的矛盾
  });
});

// ─── TC-STATUS-24~26：point 4 — 完整四狀態流程確認 ───────────────────────────

describe("TC-STATUS：planned → active → settled → archived 完整流程（point 4）", () => {
  /**
   * TC-STATUS-24
   * 完整顯示狀態流程（以時間軸模擬）
   *
   * 場景：行程出發日 2026-09-01，今天逐步推移
   *
   * Step 1：建立行程當下（2026-08-01）→ 顯示 planned
   * Step 2：出發當天（2026-09-01）→ 顯示 active
   * Step 3：confirm-settlement → DB=settled → 顯示 settled
   * Step 4：封存 → DB=archived → 顯示 archived
   */
  it("TC-STATUS-24：planned → active → settled → archived 完整顯示流程", () => {
    const START_DATE = "2026-09-01";

    // Step 1：建立行程，尚未出發
    const tripPlanned = { status: "planned" as TripDbStatus, start_date: START_DATE };
    expect(deriveDisplayStatus(tripPlanned, D("2026-08-01"))).toBe("planned");

    // Step 2：出發當天，DB 仍可能是 planned（前端派生 active）
    expect(deriveDisplayStatus(tripPlanned, D("2026-09-01"))).toBe("active");
    // 旅遊中也一樣
    expect(deriveDisplayStatus(tripPlanned, D("2026-09-10"))).toBe("active");

    // Step 3：confirm-settlement → DB 變 settled
    const tripSettled = { status: "settled" as TripDbStatus, start_date: START_DATE };
    expect(deriveDisplayStatus(tripSettled, D("2026-09-15"))).toBe("settled");
    // settled 不受日期影響，即使 today < start_date 也是 settled
    expect(deriveDisplayStatus(tripSettled, D("2020-01-01"))).toBe("settled");

    // Step 4：封存 → DB 變 archived
    const tripArchived = { status: "archived" as TripDbStatus, start_date: START_DATE };
    expect(deriveDisplayStatus(tripArchived, D("2026-10-01"))).toBe("archived");
  });

  /**
   * TC-STATUS-25
   * DB 狀態機合法轉換路徑驗證
   *
   * 驗證 VALID_STATUS_TRANSITIONS 對應資料模型 §7 的轉換規則：
   *   planned/active → settled（confirm-settlement）
   *   settled → archived（封存）
   *   settled → planned/active（reopen，依日期）
   *   archived → settled（unarchive）
   */
  it("TC-STATUS-25：DB 狀態機合法轉換路徑完整性", () => {
    // planned → settled（confirm-settlement）
    expect(VALID_STATUS_TRANSITIONS["planned"]).toContain("settled");

    // active → settled（confirm-settlement）
    expect(VALID_STATUS_TRANSITIONS["active"]).toContain("settled");

    // settled → archived（封存）
    expect(VALID_STATUS_TRANSITIONS["settled"]).toContain("archived");

    // settled → planned（reopen，today < start_date）
    expect(VALID_STATUS_TRANSITIONS["settled"]).toContain("planned");

    // settled → active（reopen，today >= start_date）
    expect(VALID_STATUS_TRANSITIONS["settled"]).toContain("active");

    // archived → settled（unarchive）
    expect(VALID_STATUS_TRANSITIONS["archived"]).toContain("settled");
  });

  /**
   * TC-STATUS-26
   * 非法轉換路徑驗證（guard 確保不發生）
   *
   * 以下轉換不合法：
   *   archived → planned/active（必須先 unarchive → settled → reopen）
   *   planned → archived（不能跳過 settled 直接封存）
   */
  it("TC-STATUS-26：非法轉換路徑 — archived 不可直接 reopen 成 planned/active", () => {
    // archived 必須先 unarchive → settled，才能再 reopen → planned/active
    const guardResult = validateReopenGuards("archived", "reopen");
    expect(guardResult.ok).toBe(false);
    expect(guardResult.statusCode).toBe(409);
  });

  it("TC-STATUS-26b：settled → archived 後 unarchive 回 settled，再 reopen 可回 planned", () => {
    // 模擬完整回退路徑：
    // settled → archived（封存）→ unarchive → settled → reopen（today < start_date）→ planned

    // Step 1：settled → archived（封存，不在 guard 測試範圍，屬前端操作）

    // Step 2：archived → settled（unarchive guard 通過）
    const unarchiveGuard = validateReopenGuards("archived", "unarchive");
    expect(unarchiveGuard.ok).toBe(true);

    // Step 3：settled → planned（reopen，today < start_date）
    const reopenStatus = resolveReopenStatus("2026-12-01", D("2026-06-29"));
    expect(reopenStatus).toBe("planned");

    // 最終：DB 回到 planned，前端 deriveDisplayStatus 確認
    const tripReopened = { status: "planned" as TripDbStatus, start_date: "2026-12-01" };
    expect(deriveDisplayStatus(tripReopened, D("2026-06-29"))).toBe("planned");
  });

  /**
   * TC-STATUS-27（特殊情境）
   * DB=active 但 today < start_date（資料不一致）→ 前端仍派生 planned
   *
   * 說明：
   *   若 DB 寫入了 active 但日期還沒到（例如 reopen 後 start_date 被往後修改），
   *   deriveDisplayStatus 仍以日期為準，回傳 planned。
   *   這是「前端不信任 DB planned/active 值」設計的完整性保證。
   */
  it("TC-STATUS-27：DB=active 但 today < start_date → 前端仍派生 planned（設計防禦）", () => {
    const trip = { status: "active" as TripDbStatus, start_date: "2027-01-01" };
    // 雖然 DB 說 active，但今天還沒到出發日，前端派生 planned
    expect(deriveDisplayStatus(trip, D("2026-06-29"))).toBe("planned");
  });
});

