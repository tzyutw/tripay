# ═══ 原型檢視結束，以下進入實作 ═══

> #25～#35 是原型輪次，**已全部結束**。以下的節次是 Phase 1＋1.5 的實作。
> 實作分三節（A／B／C），每一節按一次「收」。分節不是為了讓 Rozi 判斷，
> 是為了每一段結束在一個可驗證、可部署的狀態。**三節都不需要 Rozi 看內容。**

## 實作-A　地基：型別對齊 ＋ schema ＋ 全域 token ＋ 共用元件

**這一節不動任何畫面的版面**（token 會讓全站外觀改變，那是預期的；
但不重排任何元件、不搬任何區塊）。畫面改動全部在實作-B。

### 讀之前先看這個：文件效力順序

`CLAUDE.md` 最前面新增了一張效力順序表，**照它判斷，不要「兩邊都做一點」**：

1. **`Tripay_原型.html`** —— 畫面、文案、互動、版面的**唯一真相**
2. `專案狀態.md` 決策表 —— 產品決策的真相，新的一列推翻舊的一列
3. `規格_金額未定案與幣別.md` —— S-04 金額與幣別判定的權威規格
4. **實際的 Supabase schema（用 MCP 查）** —— 資料庫結構的真相
5. `CLAUDE.md` —— 護欄與流程

**四份已過期、不得當依據**：`_實作批次工作清單.md`、`使用者旅程地圖.md`、
`MVP功能清單.md`、`資料模型.md`（四份都已加頂部警語）。
**三個反向陷阱**：設定頁不要補「我的資料／顯示」兩段；不要複用 `EmojiPicker`（整檔刪）；
字體走 Onest、全站移除等寬。

---

### A-0　`src/types/database.ts` 補齊（**最先做，其餘全部相依於它**）

型別落後四個 migration。**先補型別，後面每一個查詢才有東西擋。**

用 Supabase MCP 查實際 schema 之後補齊，至少包含：
`Trip`: `cover_path`(008)、`kind`／`card_id`(007)、`settlement_mode`／`hub_member_id`(010)；
`TripMember`: `person_id`(006)。

⚠️ **補完型別之後 `TripListPage.tsx:37` 可能立刻報錯**——它已經在查 `kind`，
現在是靠型別沒擋才過的。報錯就修，那正是補型別的目的。

---

### A-1　schema：七項缺口 ＋ 色調序號 ＋ 四項共編前置

**寫成一個 migration 檔（012），寫完就停下回報，由 Cowork 端套 production。**
（`CLAUDE.md` 既有規則：終端機寫 migration，Cowork 套 production。）

**七項缺口**（來源：`_盤點_實作缺口.md` 第二段）：

| # | 欄位 | 為了什麼 |
|---|---|---|
| 1 | `expense_splits.split_amount_foreign` numeric | **P1-0：唯一一條會靜默算錯帳的**。現在各自金額只有台幣語意，填外幣會被當台幣加總，不報錯 |
| 2 | `expenses.split_fill_currency` text（`TWD`／`FOR`）| 不知道各自金額是用哪種幣別填的，規格 §2.2 的換算做不出來 |
| 3 | `expenses.individual_member_id` uuid → trip_members | 「只算一個人」要能選人（S-04-17） |
| 4 | `trips.payment_methods` jsonb | 支付方式清單無處可存（S-02b-11） |
| 5 | `expenses.payment_label` text | 行程自訂的支付方式（Linepay）enum 塞不下（S-04-9） |
| 6 | `trips.rate_twd`／`trips.rate_for` numeric | 行程現金匯率（S-02b-12、規格 §2b） |
| 7 | `expenses.category_emoji_manual` boolean default false | 手動改過的類別 emoji 不被標題覆蓋（S-04-3） |

**色調序號**：`trips` 加一欄存「建立當下算出的循環色號」（0–7）。
**建立時決定並存起來，不可用「清單第幾筆」**——否則刪掉一趟，後面所有行程顏色集體位移。

**四項共編前置**（Phase 2 才用，但現在加最便宜）：

- `trip_members.user_id` uuid **可空** ＋ `(trip_id, user_id)` 唯一約束
- `expenses.updated_by` uuid（與 `created_by` 同理，**之後才加補不回歷史**）
- `trip_members.role` text（可編輯／只能看）
- **把權限規則收斂成一個判定函式**（見 A-2，同一個 migration）

全部是加欄位／加約束，可回滾、不影響既有資料。**不要問 Rozi，她已同意。**

---

### A-2　權限：35 條收斂成一個判定函式 ＋ 分享改成後端驗 token

**背景（Rozi 已裁示，兩件都要做）**：

- 現存 **35 條** RLS 政策（不是舊文件寫的 22 條），每條都各自寫死 `owner_id = auth.uid()`。
  共編時要改 35 條，**漏一條就是別人的帳被看到**。
- **原本另有六條 "share read" 政策沒有比對 token 的值**，等於「只要這趟有分享連結，
  任何人都讀得到」。**Cowork 已於 2026-09-05 套 migration 011 全數關閉並驗證**
  （anon 五張表全 0 筆；owner 仍讀得到 4／404／16）。
  **所以現在線上的分享頁是讀不到資料的，要靠這一節補回來。**
  完整備份：`supabase/backups/rls_policies_2026-09-05_before_refactor.sql`。

**要做的兩件**：

1. **收斂**：建一個 `can_access_trip(p_trip_id uuid)` 判定函式，
   內容**先維持現狀語意**（`exists(select 1 from trips where id = p_trip_id and owner_id = auth.uid())`），
   35 條政策改成呼叫它。**這一步不改變任何人看得到什麼**——
   只是同一句話從寫 35 遍變成寫 1 遍。
   共編上線時只要改這個函式（加上「或我是這趟的成員」），35 條同時生效。
   函式要 `security definer`、`set search_path = public`、`stable`。

2. **分享改成驗 token**：建一個 `security definer` 的 RPC
   （例如 `get_shared_trip(p_token text)`），**驗 token 存在且相符才回傳那一趟的資料**
   （行程、成員、消費、分帳、結算、結算明細），一次回傳一包。
   **不要恢復 anon 對這些表的直接 SELECT。**
   `SharePage.tsx` 改成呼叫這個 RPC，不再直接查表。
   **token 比對要用固定時間比較**（`hashtext` 或 `= ` 皆可，但不要用 `like`／前綴比對）。

**停止條件（權限，機器可驗）**：
- `pg_policies` 裡 public schema **沒有任何一條政策的條件字串含 `auth.uid()` 字面量**
  （全部改走函式）；政策數仍為 35。
- 以 `role anon` 查 `trips`／`expenses`／`trip_members`／`settlements`／`expense_splits`
  五張表**全部 0 筆**。
- 以 `role authenticated` ＋ owner 的 `sub` 查，得到 **4／404／16**（與改動前相同）。
- 用**正確的 token** 呼叫 `get_shared_trip()` 回傳該趟完整資料；
  用**錯誤的／空的 token** 回傳空，不得回傳任何其他行程的任何一列。
- **反向驗證**：把函式內容暫時改成 `true`，上面第二條斷言要變紅（確認斷言真的在驗）。

---

### A-3　全域 token（**排在所有畫面改動之前，否則每個畫面要改兩次**）

以 **`Tripay_原型.html` 的 `:root` 與 `.ui` 區塊為單一來源**。
（`打磨輪_tokens與before-after.html` 停在字級六階與圓角 C 定案之前，**不要拿它當來源**。）

- 字級六階：`12 / 13 / 15 / 16 / 17 / 20`；**輸入框硬性 ≥16px**（iOS 一聚焦就放大整頁）；
  金額 16、統計卡主數字 26；登入頁字標 44 是唯一例外。
- 圓角：`--r-base:10px`／`--r-panel:20px`／`--r-icon:50%`／`--r-chip:999px`。
- 顏色三階：內容 `#151C21` ＜ 可點未選 `--md:#4C5B64` ＜ 提示 `--gr:#6A7980`；
  `--dg:#9B1B14`（會刪資料且無法還原）與 `--out:#B03A22`（提醒）**分開**。
- icon：Feather，`fill:none`＋`stroke:currentColor`＋線寬 1.7，只搬原型 `ICON` 表裡有的鍵。
- **icon 按鈕三個層級**（不要「統一」成一種）：畫面層級動作＝40×40 正圓＋描邊；
  **列內動作＝裸 icon 無容器、可點區用透明擴張區撐到 44×44**；方向指示＝裸 icon 不可點。
- 字體 **Onest**（`@fontsource/onest`，**Google Fonts 被 egress 擋，不要用 CDN**），
  **全站移除等寬**，金額靠字重 500–600 ＋ `tabular-nums`。
- **輸入框高度階梯一併定義**（目前全站三種 41／25／32px，沒有階梯）。
- 有圓角的容器，左右內距至少比圓角多 4px。

---

### A-4　六個共用元件（**排在畫面之前，否則兩處會各寫一份**）

原型已經把這六個抽成共用函式，**照抄它的邊界，不要重新切**：

| 元件 | 原型裡的名字 | 誰在用 | 為什麼一定要共用 |
|---|---|---|---|
| 統計卡 | `statCard()` | S-03-9/27/28、S-06-4/14/15 | 兩頁數字必須一致；分開寫遲早走鐘 |
| 轉帳明細 | `transferView()` | S-05-7、S-05-28 | 同上 |
| 消費列＋日期分組 | `expenseGroups()`／`expenseRow()` | S-03、S-06 | 同上；**倒序邏輯也在裡面** |
| emoji 就地編輯 | `beginInlineEdit()`／`commitInlineEdit()` | S-02c-11、S-04-3 | 兩處同一套，不做第二種寫法 |
| ⋯ 選單 | `s03MoreSheet()` | S-03-32 | 沿用既有 `.sheet`，不新造第三種彈層 |
| 分段控制 | `.seg` | S-03-33、S-04-11、S-04-31、幣別切換 | 全站只有一種切換器 |

**未定案文案只准寫一次**：原型的 `MSG_NO_RATE`／`MSG_TWD_PENDING`／`MSG_FILL_ONE`
三個字串常數照搬，兩處引用同一個常數（`CLAUDE.md`「同一句文案只准寫一次」）。

---

### 護欄

- **本節不改任何畫面的版面**。token 造成的外觀變化是預期的；
  搬區塊、改順序、改文案一律留到實作-B。
- 看到別的問題**不要順手處理**，寫進 `_停點.md` 的「順手看到但沒動」清單。
  （唯一例外：A-0 補型別後冒出的編譯錯誤，那是本節造成的，要修。）
- **不要碰 Rozi 已裁示「只做紀錄」的六項**（見 `_延後與不做清單.md` 與
  `Tripay_問題優先序清單.md` P4）。

### 停止條件（機器判斷得出來）

1. `pnpm run build` 通過（`tsc` 零錯誤）。
2. A-0：`database.ts` 的 `Trip`／`TripMember` 欄位與 Supabase MCP 查到的實際欄位**逐一對得起來**，
   斷言要**列出比對表**，不是只回布林值。
3. A-1：migration 012 檔案存在且語法可 parse；**不要自己套 production**，寫完就停下回報。
4. A-2：見上方「停止條件（權限，機器可驗）」五條，含反向驗證。
5. A-3：全站掃描——不存在字級六階以外的 `font-size` 字面量；
   不存在四個圓角變數以外的 `border-radius` 字面量（`50%`／`999px` 由變數提供）；
   不存在任何等寬字體宣告；**沒有任何 `fonts.googleapis.com` 的引用**。
6. A-4：六個共用元件**各只有一份實作**，斷言要驗「引用它的檔案數 ≥2」，
   不是只驗它存在。
7. **既有測試全綠**；新增的斷言要有**反向驗證**（拿掉被測的東西會變紅）。
8. `git diff --stat` 只動 `src/`、`supabase/migrations/`、`package.json`／lock、
   `_停點.md`、`專案狀態.md`。**不動 `Tripay_原型.html`。**

### `_停點.md` 必須包含

- A-0 的欄位比對表（型別 vs 實際 schema）
- A-2 五條權限驗證的實際數字，以及反向驗證是否真的變紅
- 「順手看到但沒動」清單
- migration 012 的檔名與內容摘要（Cowork 要據此套 production）

### 交付前檢查

**① 需求覆蓋**：本節對應 Tech Lead 稽核的階段 0～3（型別／schema／token／共用元件），
外加 Rozi 2026-09-05 裁示的兩件權限工作（35 條收斂、分享改後端驗 token）。
畫面層 212 項留在實作-B，引擎與測試留在實作-C。

**② 收件人檢查**：本節提到的先前決策都已展開成自描述敘述——
文件效力順序、七項 schema 缺口各自的用途、35 條政策與六條 share 政策的現況、
六個共用元件的邊界與理由、token 的實際數值，都在內文寫清楚。
需要細節時看 `Tripay_原型.html`（畫面）與 `規格_金額未定案與幣別.md`（S-04 金額判定）。

**③ 五類例外**：A-1 的 schema 全是加欄位／加約束（可回滾，Rozi 已同意，不必再問）。
**A-2 屬安全性，但 Rozi 已於 2026-09-05 在對話中明確同意**（「可以」＋「關」），
備份與還原點都已就位，**可以直接做**。其餘無不可逆動作、無花費、無重大範疇取捨。
