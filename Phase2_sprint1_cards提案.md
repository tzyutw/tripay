# Phase 2 sprint 1｜cards 表 ＋ 半自動帳單流程

> Migration：`supabase/migrations/007_cards_and_statements.sql`　**待 Rozi 拍板，尚未套用**
> 回歸測試：`歷史資料匯入/automation/cards-layer-check.cjs`
> 設計（不需拍板，已依「預設執行」定案）：第三節半自動帳單流程
> 提出：2026-08-30

---

## 一、schema 變更提案（📌 待拍板）

### 1.1 依據

- **D1**：帳單週期**沿用 `trips` 表**、加 `kind` 欄位 → **本檔不建 `statements` 表**
- **D2**（已落地 006）：卡片持有人指向 `people`
- **D5**：分帳三型沿用，Phase 2 預設 `personal` → 這是前端預設值，不在 schema

### 1.2 變更內容

| # | 變更 | 說明 |
|---|---|---|
| 1 | 新增 `cards` 表 | `nickname`／`last4`／`card_issuer`（Phase 3 銀行合作預留）／`is_primary`／`parent_card_id`（副卡指向主卡）／`holder_person_id` → `people` |
| 2 | `cards` 的 RLS **四條一次補齊** | read／insert／update／**delete**。這坑已咬四次（`expense_splits`→hotfix_2、`settlements`→004、`expenses`→005、`people`→006）|
| 3 | `trips` 加 `kind trip_kind not null default 'trip'` | enum `'trip' \| 'statement'`。**default 讓既有四趟自動歸類為旅遊，語意不變** |
| 4 | `trips` 加 `card_id` | 帳單週期屬於哪張卡；旅遊為 NULL |
| 5 | **check constraint** `trips_kind_card_chk` | `statement` 必須有卡、`trip` 不得有卡 —— 從資料層擋掉語意錯亂 |
| 6 | `expenses.card_id` **補上 FK** | 該欄位早在 `001_initial_schema.sql:68` 就存在但**一直沒有 FK**；本檔補 `on delete set null` |

### 1.3 影響分析

| 面向 | 影響 | 風險 |
|---|---|---|
| 既有四趟資料 | **無**。`kind` 有 default、`card_id` 為 NULL，既有列自動符合 check constraint | 無 |
| 結算引擎 | **無**。不碰 `expense_splits`／`settlement_items`／engine | 無 |
| 前端 | **無**。目前沒有程式讀 `kind`／`cards`，不需重新部署 | 無 |
| `expenses.card_id` 補 FK | 目前全部是 NULL，補 FK 不會有既有列違反 | 無 |
| 查詢效能 | `trips` 多一個 `kind` 索引；列表查詢未來需加 `kind='trip'` 過濾 | 低（見下）|

> ⚠️ **前端後續要記得的事**（不在本 migration，列為 sprint 1 的實作待辦）：
> `TripListPage` 的查詢未來必須加 `.eq('kind', 'trip')`，
> 否則帳單週期會混進旅遊列表。**在建立第一筆 statement 之前補上即可**。

> ⚠️ **刪卡的連鎖效應（Rozi 2026-08-30 指定記錄）**
> `trips.card_id` 是 **`ON DELETE CASCADE`** —— **刪掉一張卡，會連帶刪掉該卡的全部帳單週期
> 與其下所有消費、分帳、結算紀錄。**
> 未來的「刪除卡片」UI **必須明示警告 ＋ 二次確認**，並列出將一併刪除的週期數與消費筆數，
> 比照 Phase 1「刪除行程」要求輸入名稱才可按的作法。
>
> （不改成 `SET NULL` 的理由：帳單週期脫離卡片後就沒有意義，留著會變成孤兒週期。
> 風險用 UI 層的警告與二次確認來擋，而不是讓資料留半套。）

**Rollback**：
```sql
alter table expenses drop constraint if exists expenses_card_id_fkey;
alter table trips drop constraint if exists trips_kind_card_chk;
alter table trips drop column if exists card_id, drop column if exists kind;
drop type if exists trip_kind;
drop table if exists cards;
```
既有資料無損（全部是新增，未修改任何原有欄位值）。

### 1.4 回歸測試

**腳本已寫好**：`cards-layer-check.cjs`

| 檢查 | 套用前（實測）| 套用後（預期）|
|---|---|---|
| cards 表存在且可讀 | ❌ 404 | ✅ |
| anon key 讀不到 cards（隱私）| ❌ | ✅ 0 筆 |
| `trips.kind` 欄位存在 | ❌ 400 | ✅ |
| 既有四趟 kind 皆為 `trip`、card_id 皆 NULL | — | ✅ |
| statement 沒帶 card_id 會被擋下 | ✅（因欄位不存在而 400，套用後才是真檢查）| ✅ 違反 check constraint |
| 端到端：建主卡→建副卡→建帳單週期→記一筆掛 card_id→刪乾淨 | — | ✅ |
| Phase 1 結算不受影響 | ✅ | ✅ |

測試已接上 `guard.cjs` 登記制刪除護欄，測試資料一律 `ZZ` 前綴、驗完即刪。

### 1.5 請求拍板

| | |
|---|---|
| 📌 **提案** | 套用 `007_cards_and_statements.sql` 到 production |
| 🔴 **不做的話** | Phase 2 sprint 1 無法開始；`expenses.card_id` 繼續是沒有 FK 的孤兒欄位 |
| 🟢 **做的話** | 解鎖卡片管理與帳單週期；check constraint 從資料層擋掉語意錯亂 |
| ⚖️ **建議** | **套用**。不動既有資料與結算、不需重新部署；rollback 六行 SQL |
| ✅ **需要你** | 一句「套用 007」 |

---

## 二、為什麼不建 `statements` 表

D1 拍板沿用 `trips`。實際對照下來，帳單週期需要的欄位 `trips` **幾乎都有**：

| 帳單週期需要 | `trips` 既有欄位 |
|---|---|
| 週期起訖 | `start_date` / `end_date` |
| 狀態（未結／已結／封存）| `status`（planned / settled / archived）|
| 誰的帳單 | `owner_id` ＋ 新增的 `card_id` |
| 參與的人 | `trip_members`（＋ D2 的 `person_id`）|
| 分享 | `share_token` |
| 幣別 | `currency`（帳單固定 TWD）|

只差「這是旅遊還是帳單」→ 就是新增的 `kind`。
**結算引擎、`expense_splits`、分享頁、封存／重開，全部零改動可直接重用。**

---

## 三、半自動帳單流程設計（依 D3／D6，已定案不需拍板）

D3 拍板「先做半自動、OCR 延後」，D6 拍板「A→B 兩個里程碑」。以下是 **B 里程碑**的流程設計。

### 3.1 為什麼不是一開始就 OCR

Phase 2 的價值是**分帳與收款**，不是辨識。先用半自動驗證「月底儀式」這個假設成不成立；
若儀式成立、使用者嫌輸入麻煩，那才是投資 OCR 的時機（也才知道該優化哪一段）。

### 3.2 流程（七階段，沿用 Excel 管線的骨架）

| 階段 | 半自動版本做法 | 對應 Excel 管線的哪一步 |
|---|---|---|
| ① 取得原始資料 | 使用者從網銀複製帳單明細，**整段貼上**（或逐筆輸入）| 讀 xlsx 儲存格 |
| ② 正規化 | 貼上的文字用寬鬆 parser 切成「日期／商家／金額」三欄，**切不出來的列標紅讓使用者手動修** | 版型 parser |
| ③ **對帳鐵律** | 逐列加總 **必須對上使用者輸入的「本期應繳總額」**，對不上就**不准送出** | 必須對上 Excel 小計／總計 |
| ④ 對應規則 | 卡末四碼 → 持卡人（`cards.last4` → `holder_person_id`）；商家名 → 分類 emoji | 分類 → type/payer/splits |
| ⑤ **樣本先審** | 先顯示**前 5 筆**的解析結果讓使用者確認對應規則，**確認後才全部匯入** | 先謄第一天 → 比對小計 → 才全速 |
| ⑥ 逐筆寫入 | 建立 `kind='statement'` 的週期 ＋ 逐筆 expenses（預設 `personal`，依 D5）| 走真實 UI／API |
| ⑦ 驗證 | 匯入後顯示「已匯入 N 筆／合計 $X／與帳單總額差 $0」 | 每人分擔／淨額 vs 基準 |

### 3.3 ③ 與 ⑤ 是硬性門檻，不是 nice-to-have

這兩條是這次 393 筆重謄學到最貴的兩課：

- **③ 對帳鐵律**：靠「必須對上 Excel 自己的小計」抓出 **5 個解析錯誤**（東京 ✅已結拆分被當欠款、
  濟州島 r153、福岡 r60 不等額誤用均分、東京漏 3 筆 $70,587、東京 5 筆計程車誤入共同池）。
  **沒有總額校驗的匯入不可上線。**
- **⑤ 樣本先審**：先謄第一天讓錯誤只影響 11 筆而不是 393 筆。

### 3.4 UI 草案（S-08 帳單匯入）

```
┌─────────────────────────────┐
│ 匯入 8 月帳單                │
│                             │
│ 本期應繳總額  [ $      ]    │ ← 對帳基準，必填
│                             │
│ ┌─ 貼上帳單明細 ──────────┐ │
│ │ 08/03 全聯      $1,280  │ │
│ │ 08/05 星巴克    $  180  │ │
│ │ …                       │ │
│ └─────────────────────────┘ │
│                             │
│         [ 解析看看 ]         │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│ 先確認前 5 筆對不對          │
│  08/03 全聯 $1,280 🛍️ 小美  │
│  …                          │
│  ⚠️ 第 7 列看不懂，請手動修  │
│                             │
│  已解析 $12,480 / 應繳 $12,480 ✅ │
│         [ 全部匯入 ]         │
└─────────────────────────────┘
```

**若總額對不上**，按鈕改為停用並顯示「差 $320，請檢查第 N 列」——**不提供「先這樣匯入」的逃生門**。
（與 Phase 1 結算頁的「先這樣算」不同：那裡是金額待填、使用者知道自己在做什麼；
這裡是解析可能出錯，放行等於把錯誤資料寫進去。）

### 3.5 sprint 1 的實作待辦（A 里程碑，純前端，不需拍板）

- [ ] `TripListPage` 查詢加 `.eq('kind', 'trip')`（**建第一筆 statement 前必須完成**）
- [ ] 卡片管理頁：新增／編輯卡片、主副卡關係、綁 `people` 持卡人
- [ ] 帳單週期建立：選卡 → 選週期 → 建 `kind='statement'` 的 trips 列
- [ ] 帳單消費記帳：沿用 `ExpenseFormSheet`，預設 `personal`（D5）、自動帶 `card_id`
- [ ] 結算與分享：**完全重用 Phase 1**，不需新程式
