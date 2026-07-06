/**
 * trip-status.ts
 *
 * trip.status 相關純函式
 * 抽離自資料模型 §7 設計說明，供前端與測試共用。
 *
 * 架構說明：
 *   DB status（planned / active / settled / archived）
 *     ├─ planned  → 建立行程時寫入，或 reopen 且 today < start_date
 *     ├─ active   → reopen 且 today >= start_date
 *     ├─ settled  → confirm-settlement 寫入，或 unarchive 寫入
 *     └─ archived → 使用者主動封存
 *
 *   DisplayStatus（前端派生，不寫 DB）
 *     ├─ settled / archived → 直接對應 DB 值
 *     └─ planned / active   → 依 today vs start_date 即時計算，不信任 DB 值
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TripDbStatus = "planned" | "active" | "settled" | "archived";
export type DisplayStatus = "planned" | "active" | "settled" | "archived";

export interface TripStatusInput {
  status: TripDbStatus;
  start_date: string; // ISO date "YYYY-MM-DD"
}

// ─── 前端派生：deriveDisplayStatus ───────────────────────────────────────────

/**
 * deriveDisplayStatus
 *
 * 將 DB status 轉換為前端顯示狀態。
 * `planned` / `active` 的顯示由日期即時計算，不依賴 DB 欄位值。
 *
 * @param trip   trip 資料（status + start_date）
 * @param today  當前日期（預設 new Date()，測試時傳入固定值）
 * @returns DisplayStatus
 *
 * 規則：
 *   settled  → "settled"  （結算已完成，不受日期影響）
 *   archived → "archived" （封存狀態，不受日期影響）
 *   其餘     → today < start_date ? "planned" : "active"
 */
export function deriveDisplayStatus(
  trip: TripStatusInput,
  today: Date = new Date(),
): DisplayStatus {
  if (trip.status === "settled")  return "settled";
  if (trip.status === "archived") return "archived";

  // planned / active 依日期派生
  // CR Issue #9：純字串比較（YYYY-MM-DD 字典序等價日期大小），避免時區問題
  const todayYmd = today.toISOString().slice(0, 10);
  return todayYmd < trip.start_date ? "planned" : "active";
}

// ─── reopen-settlement 狀態決策（純邏輯，供測試驗證 Edge Function 行為）──────

/**
 * resolveReopenStatus
 *
 * reopen-settlement（mode="reopen"）的回退狀態決策邏輯。
 * 抽出為純函式，讓測試不需要呼叫 Supabase。
 *
 * @param startDate 行程出發日（ISO "YYYY-MM-DD"）
 * @param today     當前日期（測試時傳入固定值）
 * @returns "planned" | "active"
 */
export function resolveReopenStatus(
  startDate: string,
  today: Date = new Date(),
): "planned" | "active" {
  // CR Issue #9：純字串比較，避免時區問題
  const todayYmd = today.toISOString().slice(0, 10);
  return todayYmd < startDate ? "planned" : "active";
}

// ─── reopen-settlement guard 驗證 ─────────────────────────────────────────────

export type ReopenMode = "reopen" | "unarchive";

export interface ReopenGuardResult {
  ok: boolean;
  error?: string;
  statusCode?: number;
  /** 若 ok = false 且 earlyReturn = true，代表 trip 已在目標狀態，直接回傳現有 status */
  earlyReturn?: boolean;
  currentStatus?: TripDbStatus;
}

/**
 * validateReopenGuards
 *
 * 驗證 reopen-settlement 的前置條件，對應 Edge Function step 4a / 4b 的 guard。
 */
export function validateReopenGuards(
  currentStatus: TripDbStatus,
  mode: ReopenMode,
): ReopenGuardResult {
  if (mode === "unarchive") {
    if (currentStatus !== "archived") {
      return {
        ok: false,
        error: `Cannot unarchive a trip with status "${currentStatus}"`,
        statusCode: 409,
      };
    }
    return { ok: true };
  }

  // mode = "reopen"
  if (currentStatus === "archived") {
    return {
      ok: false,
      error: 'Archived trips must use mode "unarchive" to reopen',
      statusCode: 409,
    };
  }
  if (currentStatus === "planned" || currentStatus === "active") {
    return {
      ok: false,
      earlyReturn: true,
      currentStatus,
    };
  }
  return { ok: true };
}

// ─── 結算前置條件：canSettle ──────────────────────────────────────────────────

export interface CanSettleResult {
  allowed: boolean;
  reason?: string;
}

/**
 * canSettle
 *
 * 判斷行程是否可執行結算（calculate-settlement）。
 *
 * 設計說明（對應資料模型 §7）：
 *   calculate-settlement API 層**不檢查** trip.status。
 *   理由：DB 的 planned/active 值僅作為初始寫入用途，不保證即時準確。
 *   前端依日期派生顯示狀態（deriveDisplayStatus），實際旅遊狀態以日期為準。
 *   因此，即使 DB status = "planned"，前端顯示可能已是 "active"（today >= start_date），
 *   此時允許結算是合理的。
 *
 *   唯一不允許結算的狀態是 "archived"（封存 = 預設只讀）。
 *
 * @returns { allowed: true }               → 可執行結算
 * @returns { allowed: false, reason: ... } → 不可執行，含原因
 */
export function canSettle(status: TripDbStatus): CanSettleResult {
  if (status === "archived") {
    return {
      allowed: false,
      reason: "封存行程為唯讀狀態，請先呼叫 reopen-settlement（mode=unarchive）解除封存",
    };
  }
  // planned / active / settled 均允許（settled 表示重新結算覆蓋）
  return { allowed: true };
}

// ─── 完整 DB 狀態機：合法轉換路徑 ────────────────────────────────────────────

/**
 * DB 寫入合法轉換路徑（文件化用途）
 *
 * planned  → settled   （confirm-settlement，不論前端顯示為何）
 * active   → settled   （confirm-settlement）
 * settled  → archived  （使用者主動封存）
 * settled  → planned   （reopen-settlement mode=reopen，today < start_date）
 * settled  → active    （reopen-settlement mode=reopen，today >= start_date）
 * archived → settled   （reopen-settlement mode=unarchive）
 *
 * 不合法轉換（API 層拒絕）：
 * archived → planned/active  （必須先 unarchive → settled，再 reopen）
 * planned/active → planned/active via reopen  （冪等早回，不寫 DB）
 */
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  planned:  ["settled"],
  active:   ["settled"],
  settled:  ["archived", "planned", "active"],
  archived: ["settled"],
};

