# P9 Schema 變更提案（待 Rozi 拍板）

> Migration：`supabase/migrations/005_delete_integrity.sql`
> 回歸測試：`歷史資料匯入/automation/delete-integrity-check.cjs`
> 提出：2026-08-30　狀態：**待拍板，尚未套用 production**

## 一、要解決什麼

**現況：帳號下任何「做過結算」的行程都刪不掉，而且部分 DELETE 會靜默失敗。**

套用前跑回歸測試的實際結果（**8/12**）：

| 檢查 | 結果 | 說明 |
|------|------|------|
| `expense_splits` DELETE 影響列數 > 0 | ✅ 1 列 | 2026-07-22 hotfix_2 已修 |
| `expenses` DELETE 影響列數 > 0 | ❌ **HTTP 200／0 列** | 缺 DELETE 政策，**靜默過濾** |
| `settlement_items` DELETE 影響列數 > 0 | ❌ **HTTP 200／0 列** | 缺 DELETE 政策，**靜默過濾** |
| `settlements` DELETE 影響列數 > 0 | ✅ 1 列 | 2026-08-30 hotfix_3（004）已修 |
| `trip_members` DELETE 影響列數 > 0 | ❌ HTTP 409 | 連鎖失敗：expenses 沒刪掉，`payer_member_id` 擋住 |
| **有結算紀錄的 trip 可一刀刪除** | ❌ **HTTP 409 / 23503** | **P9 核心** |

> 最危險的是那兩個 **HTTP 200 但影響 0 列**：呼叫端看起來成功，資料卻沒動。
> 這正是 2026-07-22 Bug #4（編輯消費重複建 splits）的同一根因，已第三次發作。

## 二、根因

**(a) FK 缺 CASCADE ＋ cascade 執行順序不保證**

`settlement_items.from_member_id` / `to_member_id → trip_members(id)` 沒有 `ON DELETE` 子句（＝NO ACTION）。
刪 `trips` 時 Postgres 的 cascade 是「逐條觸發語句」執行：

```
trips ─┬─→ trip_members        （第一波）
       ├─→ expenses ─→ expense_splits
       └─→ settlements ─→ settlement_items   （較深，較晚才跑到）
```

`trip_members` 那一波跑完時，`settlement_items` 還在 → NO ACTION 檢查炸出 23503。
**實測完全吻合**：沒有 settlement 的行程刪得掉（3 筆成功），有 settlement 的一律失敗（福岡）。

**(b) 缺 RLS DELETE 政策**

全庫六張表原本只有 `trips`、`trip_members` 有 DELETE 政策。`expenses` 與 `settlement_items` 至今仍無。
RLS 對 DELETE 的行為是**把不符合政策的列過濾掉**，不是報錯 —— 所以回 200、影響 0 列。

## 三、變更內容

**A. `settlement_items` 兩條 member FK 改 `ON DELETE CASCADE`**
語意正確：settlement item 失去所指的成員就沒有意義。

**B. 補齊 `expenses` 與 `settlement_items` 的 RLS DELETE 政策**
寫法對齊同表既有的 read/update 政策（owner 條件）。

**刻意不改**：`expenses.payer_member_id → trip_members` 維持 NO ACTION。
改 CASCADE 會讓「刪一位成員」連帶刪掉他付過的所有消費，語意過重且危險。
刪 trip 時這條不會擋（expenses 與 trip_members 同一波，NO ACTION 於語句結束時檢查）。
成員層級的保護留在應用層 —— `TripFormSheet` 已擋下「有消費或分帳紀錄的成員」。

## 四、影響分析

| 面向 | 影響 | 風險 |
|------|------|------|
| 既有資料 | **無**。只改約束與政策，不動任何一列資料 | 無 |
| 現有功能 | **無**。目前產品沒有任何地方刪 `expenses`／`settlement_items`（消費是軟刪 `deleted_at`） | 無 |
| 結算正確性 | **無**。不碰 `calculate-settlement`／`confirm-settlement`／engine | 無 |
| 前端 | **無**。不需重新部署 | 無 |
| 新增能力 | 刪除行程變成可行 → 解鎖 Phase 1.5「刪除行程」功能 | 見下 |
| **新風險** | 刪成員時會連帶刪掉他的 settlement_items | 應用層已有守衛，但**守衛目前只查 expenses／expense_splits，沒查 settlement_items** → 本包一併補上 |

**Rollback**：把兩條 FK 改回無 `ON DELETE` 子句、drop 兩條新政策即可，資料無損。
（`005` 檔本身可重複執行 —— 用 `drop constraint if exists` / `drop policy if exists`。）

## 五、回歸測試計畫

**測試腳本已寫好**：`歷史資料匯入/automation/delete-integrity-check.cjs`

核心設計原則 —— **每一個 DELETE 都必須斷言實際影響列數，不能只看 HTTP status**
（用 `Prefer: return=representation` 取回被刪的列並計數）。這是唯一擋得住 RLS 靜默過濾的方式。

涵蓋 12 項：
1. 五張子表各自的 DELETE 影響列數 > 0
2. **有結算紀錄的 trip 可一刀刪除**（P9 核心情境）
3. 五項孤兒檢查
4. 臨時資料清乾淨

**執行方式**：建臨時行程（`ZZ` 開頭）→ 驗 → 全部刪掉，不留殘料、不碰四趟正式行程。
套用前已跑一次（8/12，四項紅），套用後應為 **12/12**。

**額外納入既有回歸**：套用後重跑 `verify.cjs` × 4 趟 ＋ `settle-check.cjs`，確認結算數字不變。

## 六、請求拍板

| | |
|---|---|
| 📌 **提案** | 套用 `005_delete_integrity.sql` 到 production |
| 🔴 **不做的話** | 刪除行程功能做不出來（Phase 1.5 卡住）；`expenses`／`settlement_items` 的 DELETE 會繼續靜默失敗，同一類 bug 遲早第四次發作 |
| 🟢 **做的話** | 解鎖刪除行程；補完六張表的 DELETE 政策一致性；靜默失敗被回歸測試永久攔住 |
| ⚖️ **建議** | **套用**。不動資料、不動結算、不需重新部署，rollback 成本極低，且回歸測試已備好可立即驗證 |
| ✅ **需要你** | 一句「套用 005」即可；由 Cowork 端執行 migration，我隨後跑回歸測試驗證 |
