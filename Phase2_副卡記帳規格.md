# Phase 2｜副卡記帳 功能規格

> 產出：Growth × PM，2026-08-30
> 狀態：**規格草案，尚未實作**。文末有 6 個範疇決策點待 Rozi 拍板。
> 前置：Phase 1 已上線且穩定（四趟真實資料、393 筆消費、結算驗證全綠）。

---

## 一、定位與轉換路徑

**Phase 1 是「一趟旅遊的帳」，Phase 2 是「一個月的帳」。**

| | Phase 1（已上線）| Phase 2（本規格）|
|---|---|---|
| 週期 | 一趟旅遊（幾天～兩週）| 每月帳單週期 |
| 觸發 | 出發前建立行程 | 刷卡當下／月底帳單寄達 |
| 核心問題 | 「這趟大家怎麼分？」| 「這個月副卡刷了什麼？誰要還我？」|
| 使用頻率 | 一年幾次 | 每月一次以上 |

**轉換路徑（Growth 2026-06-29 已定）**：旅遊封存後的**情緒空窗期** —— 使用者剛結完一趟帳、
對 App 好感最高但沒有下一趟。此時推「你的信用卡帳單也可以這樣分」是最低阻力的切入點。

**資料橋接**：Phase 1 的 `payment_method`（現金／信用卡／儲值卡）已在記錄付款方式，
`expenses.card_id` 也已是預留欄位（見第三節）——Phase 1 的資料天然可以接進 Phase 2 的卡片視角。

---

## 二、核心使用情境

**主卡人（父母）**
1. 月中隨手看：這個月副卡刷了多少、誰刷的
2. 月底帳單來了：拍照 → OCR → 逐筆歸屬到副卡人 → 產生「誰要還我多少」
3. 收款：沿用 Phase 1 的結算與「標記付清」

**副卡人（配偶／子女）**
1. 刷完收到通知：「你剛刷了 $1,280，記在 8 月帳單」
2. 月底看到自己要還多少，不用等主卡人算
3. 可以標註某筆是「爸媽說不用還」（對應 Phase 1 的 `settled_on_spot` 概念）

---

## 三、資料模型

### 3.1 沿用 Phase 1 的既有資產

| Phase 1 既有 | Phase 2 如何用 |
|---|---|
| `expenses.card_id uuid` | **已預留、目前無 FK 也無 `cards` 表**（`001_initial_schema.sql:68`）。Phase 2 補上 `cards` 表與 FK 即可，**不需要改動 expenses 的其他欄位** |
| `expenses.payment_method` | `credit_card` 的筆數自動成為 Phase 2 的候選資料 |
| `trip_members` | 成員清單共用機制的來源，見 3.3 |
| `expense_splits` | 分帳結構完全沿用，`shared`／`individual`／`personal` 三型不變 |
| 結算引擎 | **完全沿用**。帳單週期就是另一個「trip」——見決策點 D1 |

### 3.2 新增資料表（草案）

```sql
-- 卡片
create table cards (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id) on delete cascade,
  nickname      text not null,               -- 「玉山主卡」「小美的副卡」
  last4         text,                        -- 卡號末四碼，用於帳單比對
  card_issuer   text,                        -- 發卡行；Phase 3 銀行合作的預留欄位
  is_primary    bool not null default false, -- 主卡 / 副卡
  parent_card_id uuid references cards(id) on delete cascade,  -- 副卡指向主卡
  holder_member_id uuid,                     -- 持卡人（見 3.3 的成員共用機制）
  created_at    timestamptz default now()
);

-- 帳單週期（＝Phase 2 的「行程」）
create table statements (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id) on delete cascade,
  card_id       uuid not null references cards(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  due_date      date,
  status        text not null default 'open',  -- open / settled / archived
  source        text,                          -- manual / ocr / bank_api（Phase 3）
  created_at    timestamptz default now()
);
```

**`expenses` 的改動**：只需補 FK 與一個可空的 `statement_id`。

```sql
alter table expenses
  add constraint expenses_card_id_fkey foreign key (card_id) references cards(id) on delete set null,
  add column if not exists statement_id uuid references statements(id) on delete cascade;
```

> ⚠️ **`trip_id` 目前是 NOT NULL**。Phase 2 的消費不屬於任何行程，
> 這是最大的 schema 衝擊點 —— 見**決策點 D1**。

### 3.3 與 Phase 1 成員清單的共用機制

**問題**：`trip_members` 是**行程內的**成員（每趟各自一份，同一個人在四趟裡是四筆不同的 id）。
Phase 2 的「副卡持有人」是**跨週期存在的人**，不能綁在某一趟。

**建議做法：抽出「人」的層級**

```sql
create table people (                 -- 使用者的通訊錄
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '🙂',
  created_at timestamptz default now()
);

alter table trip_members add column if not exists person_id uuid references people(id) on delete set null;
alter table cards        add constraint cards_holder_fkey foreign key (holder_member_id) references people(id);
```

- Phase 1 建行程時，成員可以「從通訊錄挑」或「新建一個人」——**G-09 預填上趟成員已經是這個行為的雛形**
- 既有 `trip_members` 用 `person_id` 補綁，**不影響任何既有結算**（結算仍以 `trip_members.id` 運作）
- Phase 2 的卡片持有人直接指向 `people`

> 見**決策點 D2**：要不要現在就抽 `people` 層。

---

## 四、拍照帳單 OCR 匯入流程

### 4.1 與 Excel 解析管線共用的設計

這次 Excel 重謄（393 筆、四種版型）驗證出一套可重用的管線，**Phase 2 直接沿用同樣的階段切分**：

| 階段 | Excel 匯入（已驗證）| 拍照帳單（Phase 2）|
|---|---|---|
| ① 取得原始資料 | 讀 xlsx 儲存格 | OCR 出「日期／商家／金額／卡末四碼」|
| ② 正規化 | 版型 parser → 統一的列結構 | 帳單版型 parser（各家銀行格式不同）→ 同一個列結構 |
| ③ **對帳鐵律** | 逐列加總必須對上 Excel 自己的小計／總計 | 逐列加總必須對上**帳單上的本期應繳總額** |
| ④ 對應規則 | 分類→type/payer/splits | 商家名→分類；卡末四碼→持卡人→payer |
| ⑤ **樣本先審** | 先謄第一天 → 比對小計 → 才全速 | 先出前 5 筆給使用者核對 → 才全部匯入 |
| ⑥ 逐筆寫入 | 走真實 UI／API | 同 |
| ⑦ 驗證 | 每人分擔／淨額 vs 基準 | 每人應還 vs 帳單總額 |

**③ 與 ⑤ 是這次學到最貴的兩課，必須帶進 Phase 2**：

- **③ 對帳鐵律**：這次靠「必須對上 Excel 自己的小計」抓出 5 個解析錯誤。
  OCR 更容易出錯（數字辨識、換行、幣別符號），**沒有總額校驗的 OCR 匯入不可上線**。
- **⑤ 樣本先審**：這次「先謄第一天再全速」的節奏，讓錯誤只影響 11 筆而不是 393 筆。

### 4.2 OCR 技術選項

| 選項 | 優點 | 缺點 |
|---|---|---|
| 裝置端 OCR（iOS Vision / ML Kit）| 免費、隱私最好（照片不離開手機）| 中文商家名辨識率較低；PWA 取用受限 |
| 雲端 OCR（Google Vision / Azure）| 辨識率高 | **要花錢**；帳單影像上傳＝隱私議題 |
| 多模態 LLM（Claude / GPT vision）| 能直接吐結構化 JSON、可理解版型差異 | **要花錢**；同樣有隱私議題 |

→ 見**決策點 D3**（技術選型）與 **D4**（隱私）。

---

## 五、黏著度設計

**M1 月底帳單儀式**（核心）
帳單日推播：「8 月帳單來了，拍一張就好」→ 拍照 → OCR → 3 分鐘結完 → 分享給副卡人。
把「每月一次的麻煩事」變成「每月一次的儀式」，這是 Phase 2 的留存主軸。

**M2 副卡即時通知**
副卡人刷卡後主動記一筆（Phase 2 初期靠手動或帳單匯入，Phase 3 才有銀行 API 即時推播）。

**M3 成員清單共用**
Phase 1 建過的人直接出現在 Phase 2 的卡片持有人選單，反之亦然（3.3 的 `people` 層）。

**M4 年度回顧**
「今年你們一起花了 $X，去了 3 個地方，最大一筆是 Y」——沿用 G-08 Highlights 的做法，
把 Phase 1 的旅遊與 Phase 2 的日常合併成一份年度敘事。這是 Phase 1→2 之間最強的黏著點。

---

## 六、範疇決策點（📌 待 Rozi 一次拍板）

### 📌 D1｜Phase 2 的消費要不要塞進現有的 `trips` 表？

🔴 **反方（開新表）**：帳單週期不是旅遊，塞進 `trips` 會讓 `trips` 語意混亂；
`start_date/end_date/currency/share_token` 對帳單多半沒意義。

🟢 **正方（沿用 `trips`）**：結算引擎、`expense_splits`、UI 元件**全部可以直接重用**，
`expenses.trip_id NOT NULL` 不用動。開發量可能只有開新表的三分之一。

⚖️ **建議：沿用 `trips`，加一個 `kind` 欄位區分（`'trip' | 'statement'`）。**
理由：Phase 2 的核心價值在「分帳」，而分帳邏輯與 Phase 1 完全相同；
為了語意純淨去複製一整套結算與 UI，投報率不合。
`trips` 改名的問題可以只在 UI 層處理（旅遊叫「行程」、帳單叫「帳單」）。

### 📌 D2｜要不要現在抽出 `people`（通訊錄）層？

🔴 **反方**：這是 schema 改動，且 Phase 1 已有四趟真實資料要回填 `person_id`。

🟢 **正方**：不抽的話，Phase 2 的卡片持有人無處可綁，只能又做一套；
而且 G-09「預填上趟成員」現在是用「複製上一趟的 name/emoji」硬湊的，本來就該有這層。

⚖️ **建議：抽，但排在 Phase 2 第一個 sprint。** 回填腳本不難（四趟共 16 位成員，
依 name+emoji 去重後約 5 個人），且愈晚抽成本愈高。

### 📌 D3｜OCR 技術選型

🔴 **反方（雲端／LLM）**：要花錢，且每張帳單都是高度敏感的個資。

🟢 **正方（雲端／LLM）**：台灣的信用卡帳單版型雜、中文商家名多，
裝置端 OCR 的辨識率恐怕撐不起「拍一張就好」的體驗承諾。

⚖️ **建議：先做「相簿選圖 ＋ 手動確認表格」的半自動版本驗證需求，OCR 延後。**
理由：Phase 2 真正的價值是「分帳與收款」，不是 OCR。
先用「使用者對著帳單手動輸入 5–10 筆」驗證月底儀式成不成立；
若儀式成立、使用者嫌輸入麻煩，才是投資 OCR 的時機。
**這也讓 D3/D4 的花錢與隱私決策可以延後。**

### 📌 D4｜帳單影像的隱私處理

🔴 **風險**：信用卡帳單含卡號、地址、消費紀錄，屬高敏感個資。

⚖️ **建議（若 D3 選了雲端）**：影像**永不上傳到我們的 DB**，
只在裝置端做遮罩（只留末四碼）後送 OCR，回傳結構化結果即刻丟棄影像；
隱私政策明寫。若 D3 採建議的半自動版本，此決策可暫時擱置。

### 📌 D5｜Phase 2 要不要沿用 Phase 1 的「分帳三型」？

⚖️ **建議：沿用，但預設值不同。**
Phase 1 預設 `shared`（一起分）；Phase 2 的副卡消費預設應為 **`personal`（記在持卡人身上）**，
因為副卡刷的絕大多數是自己的花費，「要不要分」才是例外。

### 📌 D6｜Phase 2 的範圍要做到哪裡？

| 選項 | 內容 | 估點 |
|---|---|---|
| **A 最小可用** | 卡片管理 ＋ 手動記帳 ＋ 月週期結算 ＋ 分享 | 小 |
| **B 加匯入** | A ＋ 半自動帳單匯入（表格貼上／逐筆確認）| 中 |
| **C 完整** | B ＋ 拍照 OCR ＋ 推播通知 | 大 |

⚖️ **建議 A → B 分兩個里程碑走，C 視 A/B 的實際使用狀況再決定。**
理由同 D3：先證明「月底儀式」這個假設成立，再投資自動化。

---

## 七、與現有 backlog 的關係

| 既有項目 | 與 Phase 2 的關係 |
|---|---|
| Phase 1.5 歷史資料匯入 UI | **共用第四節的解析管線**，建議一起設計、先做 Phase 1.5 驗證管線 |
| G-04 OG 圖片 | 與 Phase 2 無關，可獨立排 |
| 指定結算中心人（hub 式）| **Phase 2 高度相關**：主卡人天然就是 hub，副卡人全部還給主卡人 |
| 切換成員視角 | Phase 2 的副卡人視角就是這個功能的延伸 |

---

## 八、建議的下一步

1. Rozi 拍板 D1–D6
2. 依 D6 的結論拆 sprint；若採建議（A→B），第一個 sprint 是
   **`people` 抽層（D2）＋ `cards`／`statements` 表 ＋ 卡片管理 UI**
3. 期間先做 Phase 1.5 匯入 UI，驗證第四節的解析管線
