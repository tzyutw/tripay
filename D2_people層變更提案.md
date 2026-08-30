# D2｜people 通訊錄層 Schema 變更提案（待 Rozi 拍板）

> Migration：`supabase/migrations/006_people_layer.sql`
> 回歸測試：`歷史資料匯入/automation/people-layer-check.cjs`
> 提出：2026-08-30　狀態：**待拍板，尚未套用 production**
> 依據：Phase 2 決策點 D2「抽 people 層，排第一個 sprint」（Rozi 2026-08-30 拍板）

## 一、要解決什麼

`trip_members` 是**行程內的**成員 —— 同一個人在四趟裡是四筆不同的 id：

| 人 | 出現在幾趟 | 目前是幾筆 `trip_members` |
|---|---|---|
| 🍋 Ning | 4 趟 | 4 筆 |
| 🐟 Ziyu | 4 趟 | 4 筆 |
| 🐱 Mei | 4 趟 | 4 筆 |
| 🐵 Xiu | 3 趟 | 3 筆 |
| 🌷 Nien | 1 趟 | 1 筆 |
| **合計** | | **16 筆 → 實際只有 5 個人** |

**Phase 2 的副卡持有人是「跨週期存在的人」**，綁不到任何一趟，沒有這層就無處可指。
另外 **G-09「預填上趟成員」目前是複製上一趟的 name/emoji 硬湊的**，本來就該有這層。

## 二、設計原則：不動結算

**結算引擎、`expense_splits`、`settlement_items` 一律仍以 `trip_members.id` 運作。**
`person_id` 只是「這位行程成員對應通訊錄裡的誰」的指標，且**可為 NULL**。

→ **本 migration 對既有結算數字的影響為零。**

## 三、變更內容

1. 新增 `people` 表（`owner_id` / `name` / `emoji`），含 `(owner_id, name, emoji)` unique index
2. `people` 的 RLS：read / insert / update / **delete 四條政策一次補齊**
   （DELETE 政策這坑已咬過三次：`expense_splits`→hotfix_2、`settlements`→004、`expenses`→005，不留第四次）
3. `trip_members` 加 `person_id uuid references people(id) on delete set null` ＋ 索引
4. **回填**：依 `(行程擁有者, name, emoji)` 去重建立 people，再把 `trip_members.person_id` 補上

**冪等性**：`people` 有 unique index ＋ `on conflict do nothing`；`person_id` 只更新 `is null` 的列。重複執行安全。

## 四、影響分析

| 面向 | 影響 | 風險 |
|---|---|---|
| 既有結算數字 | **無**。結算全程只用 `trip_members.id` | 無 |
| 既有資料 | 只新增 people 5 筆、`trip_members` 補 `person_id`；**不修改任何既有欄位值** | 無 |
| 前端 | **無**。`person_id` 目前沒有任何程式讀取，不需重新部署 | 無 |
| Edge Functions | **無**。查詢不涉及新欄位 | 無 |
| 回填正確性 | 16 筆 → 5 人，**無同名不同 emoji 的衝突**（已實測確認） | 低 |
| 未來 | 解鎖 Phase 2 卡片持有人；G-09 可改為真正的通訊錄挑人 | — |

**Rollback**：
```sql
alter table trip_members drop column if exists person_id;
drop table if exists people;
```
既有資料無損（`person_id` 是新增欄位，移除不影響任何原有欄位）。

## 五、回歸測試計畫

**腳本已寫好**：`歷史資料匯入/automation/people-layer-check.cjs`

| 檢查 | 套用前（實測）| 套用後（預期）|
|---|---|---|
| people 表存在且可讀 | ❌ HTTP 404 | ✅ 5 筆 |
| 去重後 5 個人 | — | ✅ |
| 無重複（owner+name+emoji）| — | ✅ |
| trip_members 可讀（含 person_id）| ❌ HTTP 400（欄位不存在）| ✅ 16 筆 |
| 沒有未對應的成員 | — | ✅ 0 筆 |
| 對應的 name/emoji 一致 | — | ✅ |
| 同一人跨多趟指向同一個 person | — | ✅ 🍋×4 🐟×4 🐱×4 🐵×3 |
| **無指向不存在成員的結算項** | ✅ 已通過 | ✅ 維持 |

套用後另需重跑：`verify.cjs` × 4 趟 ＋ `settle-check.cjs`，確認結算數字不變。

## 六、順帶發現的問題（不在本提案範圍）

**superseded／draft settlement 從不清理**

| settlements 狀態 | 筆數 |
|---|---|
| confirmed | 4 |
| **superseded** | **27** |
| draft | 4 |

`settlement_items` 共 85 筆，其中只有 **10 筆屬於 confirmed**，**75 筆是 superseded/draft 的殘留**。

每呼叫一次 `calculate-settlement` 就產生一組 draft＋items，舊的標成 superseded 但**永遠不刪**。
這次驗證跑很多次所以特別明顯，但真實使用者反覆按「重新計算」也會累積。

**建議**（待排，非本提案）：`calculate-settlement` 在標記 superseded 時直接刪除舊的 draft
（confirmed 的必須保留），或加定期清理。→ 已列入 backlog。

## 七、請求拍板

| | |
|---|---|
| 📌 **提案** | 套用 `006_people_layer.sql` 到 production |
| 🔴 **不做的話** | Phase 2 的卡片持有人無處可綁，只能再做一套平行的人員管理；G-09 繼續用 name/emoji 硬湊 |
| 🟢 **做的話** | 解鎖 Phase 2 第一個 sprint；G-09 可改為真正的通訊錄；愈晚抽回填成本愈高 |
| ⚖️ **建議** | **套用**。不動結算、不動前端、不需重新部署；回填只有 16 筆且無衝突；rollback 兩行 SQL |
| ✅ **需要你** | 一句「套用 006」；由 Cowork 端執行 migration，我隨後跑回歸測試驗證 |
