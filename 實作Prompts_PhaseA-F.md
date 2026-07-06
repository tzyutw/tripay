# Tripay｜Claude Code 實作 Prompts（Phase A–E）

> 使用方式：開終端機 Claude Code，依序貼入對應 Phase prompt。
> 每個 Phase 跑完，逐項確認 DoD 無誤後再進下一個。
> 專案路徑：`/Users/romy/Claude/Projects/家庭旅遊分帳Dashboard`
>
> 執行順序：A → B → C（原 C+D 合併）→ D（原 E）→ E（原 F）

---

## Phase A｜專案建置

```
你是 Tripay 的 Frontend Lead（凱）。
Tripay 是一款旅遊分帳 PWA，技術棧：Vite + React + TypeScript + TailwindCSS + Supabase + Google Auth。

### 前置條件
- 專案根目錄已有 package.json（目前只有 Supabase JS + Vitest 的 devDeps）
- src/components/AuthLayout.tsx 已存在
- src/hooks/usePostLoginRedirect.ts 已存在（注意：useRouter 目前寫的是 next/navigation，需改成 react-router-dom 的 useNavigate）

### 任務

1. 初始化前端專案（覆蓋 package.json，保留現有 devDeps）
   - Vite + React + TypeScript
   - TailwindCSS v3
   - react-router-dom v6
   - @supabase/supabase-js（已有）
   - vite-plugin-pwa（PWA 支援）
   - React Query（@tanstack/react-query）v5，伺服器狀態管理
   - Zustand，UI 狀態管理

2. 目錄結構
   src/
   ├── components/        # 共用元件
   │   └── AuthLayout.tsx  # 已存在，保留
   ├── hooks/             # 自定義 hook
   │   └── usePostLoginRedirect.ts  # 已存在，修正 useRouter → useNavigate
   ├── lib/
   │   └── supabaseClient.ts   # Supabase client 初始化
   ├── pages/             # 各畫面
   │   ├── LoginPage.tsx   # S-00
   │   ├── TripListPage.tsx # S-01
   │   ├── TripFormPage.tsx # S-02（新增/編輯行程）
   │   ├── ExpenseListPage.tsx # S-03
   │   ├── SettlementPage.tsx  # S-05
   │   └── SharePage.tsx   # S-06（唯讀，不需登入）
   ├── types/
   │   └── database.ts     # 從 Supabase schema 產生的型別（先手寫，之後用 supabase gen types）
   ├── App.tsx
   └── main.tsx

3. 路由設定（react-router-dom）
   /                     → TripListPage（需登入）
   /trips/new            → TripFormPage（新增模式，需登入）
   /trips/:id            → ExpenseListPage（需登入）
   /trips/:id/edit       → TripFormPage（編輯模式，需登入）
   /trips/:id/settlement → SettlementPage（需登入）
   /share/:token         → SharePage（不需登入）
   /login                → LoginPage

4. AuthLayout 整合
   - 所有需要登入的路由包進 <AuthLayout>
   - /share/:token 和 /login 不包
   - 未登入自動 redirect 到 /login

5. supabaseClient.ts
   - 讀取 import.meta.env.VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY
   - 建立 createClient，export 為 supabase

6. Google Auth 設定
   - LoginPage：一個按鈕「用 Google 帳號繼續」
   - 呼叫 supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
   - Auth callback 由 Supabase 自動處理，無需另設 callback route

7. PWA 設定（vite-plugin-pwa）
   - name: "Tripay"
   - short_name: "Tripay"
   - theme_color: "#7C2D12"
   - background_color: "#FEF9EE"
   - display: "standalone"
   - 暫用 placeholder icon（之後替換）

8. 修正 usePostLoginRedirect.ts
   - 將 import { useRouter } from "next/navigation" 改成 import { useNavigate } from "react-router-dom"
   - router.replace("/trips/new") 改成 navigate("/trips/new", { replace: true })
   - 錯誤路徑：在 finally 設定 hasChecked.current = true（Codex CR Issue #8 修正）

9. CSS Design Tokens（在 tailwind.config.js 或 index.css 加入）
   --color-primary: #7C2D12
   --color-accent: #B45309
   --color-surface: #FEF9EE
   --color-ink: #292524
   --color-mid: #57534E
   --color-muted: #A8A29E
   --color-bg: #F5F4F2
   --color-ok: #15803D
   --color-warn: #C2410C

10. .env.example
    VITE_SUPABASE_URL=
    VITE_SUPABASE_ANON_KEY=

### 完成定義（DoD）
- [ ] npm run dev 啟動無報錯
- [ ] /login 能看到 Google 登入按鈕
- [ ] 點登入按鈕跳轉 Google OAuth
- [ ] 登入後 redirect 到 /（TripListPage，目前可以是空殼）
- [ ] /share/test 不需登入可開啟（SharePage 空殼）
- [ ] TypeScript 無 error（strict mode）
- [ ] PWA manifest 正常（DevTools Application tab 可見）

### 不要動
- supabase/ 資料夾（Edge Functions、tests）
- vitest.config.ts
- *.md 文件
```

---

## Phase B｜Supabase Schema + Backend 修正

```
你是 Tripay 的 Tech Lead。
Phase A 前端專案已建置完成。現在處理 Supabase schema migration 與 Codex code review 發現的 critical 問題。

### 前置條件
- 本地已安裝 Supabase CLI（supabase --version 可執行）
- Docker 已啟動
- 專案根目錄執行 supabase init（若 supabase/ 資料夾已存在則跳過）
- 執行 supabase start，取得本地 DB URL 與 anon key

### 任務一：建立 Schema Migration

建立 supabase/migrations/001_initial_schema.sql，依照 資料模型.md 建立以下資料表：

**Enum 型別**
- payment_method: cash / credit_card / stored_value
- expense_type: shared / individual / personal
- trip_status: planned / active / settled / archived
- settlement_status: draft / confirmed / superseded  ← superseded 是新增的（CR Issue #4）

**資料表（依照 資料模型.md 定義）**
- profiles
- trips（含 share_token，預設 gen_random_uuid()::text）
- trip_members
- expenses（含 deleted_at）
- expense_splits
- settlements（status 使用新的 settlement_status enum，含 superseded）
- settlement_items

**RLS Policies**
- profiles：本人可讀寫
- trips：owner_id = auth.uid() 可讀寫；share_token 持有者（anon）唯讀
- trip_members：同 trip 的 owner 可讀寫；share_token anon 唯讀
- expenses：同 trip 的 owner 可讀寫（刪除以軟刪除處理）；share_token anon 唯讀
- expense_splits：同上
- settlements：owner 可讀寫；share_token anon 唯讀
- settlement_items：同上

**Postgres RPC（CR Issue #3：confirm-settlement 改為交易式）**
建立 supabase/migrations/002_confirm_settlement_rpc.sql：

```sql
CREATE OR REPLACE FUNCTION confirm_settlement(
  p_settlement_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trip_id uuid;
  v_trip_status trip_status;
BEGIN
  -- 1. 取得 settlement 對應的 trip_id，確認非 superseded
  SELECT s.trip_id INTO v_trip_id
  FROM settlements s
  JOIN trips t ON t.id = s.trip_id
  WHERE s.id = p_settlement_id
    AND s.status = 'draft'
    AND t.owner_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_not_found_or_unauthorized';
  END IF;

  -- 2. 確認這是 trip 最新的 draft（非 superseded）
  IF EXISTS (
    SELECT 1 FROM settlements
    WHERE trip_id = v_trip_id
      AND status = 'draft'
      AND id != p_settlement_id
      AND created_at > (SELECT created_at FROM settlements WHERE id = p_settlement_id)
  ) THEN
    RAISE EXCEPTION 'settlement_superseded';
  END IF;

  -- 3. 更新 settlement status（在同一 transaction 內）
  UPDATE settlements SET status = 'confirmed', settled_at = now()
  WHERE id = p_settlement_id;

  -- 4. 更新 trip status
  UPDATE trips SET status = 'settled', updated_at = now()
  WHERE id = v_trip_id;
END;
$$;
```

### 任務二：修正 Edge Function（calculate-settlement）

檔案：supabase/functions/calculate-settlement/index.ts

**CR Issue #1：加入 canSettle() guard**
在查詢 trip 時加入 status 欄位，owner 驗證後立即呼叫 canSettle()：
```ts
import { canSettle } from "../_shared/trip-status.ts";
// ...
const { data: trip } = await supabase.from("trips")
  .select("id, owner_id, status")  // 加 status
  .eq("id", trip_id).single();

if (!canSettle(trip.status)) {
  return new Response(JSON.stringify({ error: "trip_archived" }), { status: 409 });
}
```

**CR Issue #2：排除軟刪除費用**
所有 expenses 查詢加上 .is("deleted_at", null)

**CR Issue #4：標記舊 draft 為 superseded**
建立新 draft 前，先將同 trip 的舊 draft 標記 superseded：
```ts
await supabase.from("settlements")
  .update({ status: "superseded" })
  .eq("trip_id", trip_id)
  .eq("status", "draft");
```

**CR Issue #5：改呼叫 shared runSettlement**
移除 index.ts 內重複的演算法實作，改用：
```ts
import { runSettlement } from "../_shared/settlement-engine.ts";
const result = runSettlement(members, expenses, allSplits);
```

**CR Issue #6：shared 零參與人回 422**
```ts
if (expense.expense_type === 'shared' && participants.length === 0) {
  return new Response(JSON.stringify({
    error: "invalid_expense_splits",
    expense_id: expense.id
  }), { status: 422 });
}
```

**CR Issue #7：金額型別驗證**
載入 expenses 後加上：
```ts
for (const exp of expenses) {
  if (!Number.isFinite(exp.twd_amount) || exp.twd_amount < 0) {
    return new Response(JSON.stringify({
      error: "invalid_amount",
      expense_id: exp.id
    }), { status: 422 });
  }
}
```

**CR Issue #9：日期比較改純字串**
supabase/functions/_shared/trip-status.ts 中的日期比較：
```ts
// 改為純字串比較，避免時區問題
const todayYmd = today.toISOString().slice(0, 10);
return todayYmd < trip.start_date ? 'planned' : 'active';
```

### 任務三：修正 confirm-settlement Edge Function

改呼叫上面的 Postgres RPC，不再用 Promise.all：
```ts
const { error } = await supabase.rpc('confirm_settlement', {
  p_settlement_id: settlement_id,
  p_user_id: user.id
});
if (error) {
  if (error.message.includes('superseded')) {
    return new Response(JSON.stringify({ error: "settlement_superseded" }), { status: 409 });
  }
  return new Response(JSON.stringify({ error: error.message }), { status: 500 });
}
```

### 任務四：補充測試案例（Codex CR 缺口）

在 supabase/functions/__tests__/settlement.test.ts 新增：
- archived trip 呼叫 calculate-settlement 應回 409
- soft-deleted expense 不進結算（twd_amount 不計入）
- 同 trip 兩筆 draft，舊 draft 呼叫 confirm 應回 409
- shared 零參與人應回 422
- twd_amount 為負數應回 422

執行並確認 vitest run 全數通過。

### 完成定義（DoD）
- [ ] supabase migration 跑完無錯誤（supabase db push）
- [ ] 本地 supabase start 可用
- [ ] calculate-settlement 修正後，archived trip 回 409
- [ ] calculate-settlement 排除 deleted_at IS NOT NULL 的費用
- [ ] confirm_settlement RPC 在 DB transaction 內完成兩表更新
- [ ] 舊 draft 在新 calculate 後變成 superseded
- [ ] 全測試通過（vitest run，至少 58/58）
- [ ] TypeScript 無 error

### 不要動
- src/ 前端檔案
- *.md 文件
- vitest.config.ts 的 test runner 設定
```

---

## Phase C｜行程管理 + 消費管理（原 C+D 合併）

```
你是 Tripay 的 Frontend Lead（凱）。
Phase A 專案建置完成、Phase B schema 已建好。現在一次實作行程管理與消費管理頁面。

### 前置條件
- Supabase 本地環境已啟動，schema 已建好
- .env.local 已設定 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY
- src/lib/supabaseClient.ts 已存在

### 設計規格參考
- 文案：Tripay_文案_v1.4.md（專案根目錄）
- 視覺：prototype_v2.html（色碼、間距、元件參考，用瀏覽器開啟對照）
- 資料模型：資料模型.md

### Design Tokens（CSS variables，已在 Phase A 設定）
--color-primary: #7C2D12
--color-surface: #FEF9EE
--color-ink: #292524
--color-mid: #57534E
--color-muted: #A8A29E
--color-bg: #F5F4F2
--color-ok: #15803D
--color-warn: #C2410C

### 動效規則（CSS only，不用 Framer Motion）
- 畫面切換：slide-in，translateX(100%) → 0，opacity 0 → 1，200ms ease
- Bottom sheet 升起：translateY(100%) → 0，250ms ease-out
- 按鈕點擊：active:scale-[0.97]，100ms

---

### 【行程管理】

#### 任務一：型別定義（src/types/database.ts）

手寫對應 資料模型.md 的 TypeScript 型別：
```ts
export type TripStatus = 'planned' | 'active' | 'settled' | 'archived';
export type ExpenseType = 'shared' | 'individual' | 'personal';
export type PaymentMethod = 'cash' | 'credit_card' | 'stored_value';
export type SettlementStatus = 'draft' | 'confirmed' | 'superseded';

export interface Trip {
  id: string; owner_id: string; name: string; emoji: string;
  currency: string; start_date: string; end_date: string; status: TripStatus;
  share_token: string; owner_member_id: string | null;
  created_at: string; updated_at: string;
}
export interface TripMember {
  id: string; trip_id: string; name: string; emoji: string;
  sort_order: number; created_at: string;
}
export interface Expense {
  id: string; trip_id: string; payer_member_id: string; created_by: string;
  title: string; category_emoji: string; expense_date: string;
  foreign_amount: number | null; twd_amount: number | null; exchange_rate: number | null;
  foreign_pending: boolean; twd_pending: boolean;
  payment_method: PaymentMethod; expense_type: ExpenseType;
  deleted_at: string | null; created_at: string; updated_at: string;
}
export interface ExpenseSplit {
  id: string; expense_id: string; member_id: string;
  is_participating: boolean; split_amount: number | null; split_pending: boolean;
}
```

#### 任務二：S-00 登入頁（src/pages/LoginPage.tsx）

視覺：
- 背景漸層（深磚紅色系，參考 prototype_v2）
- App 名稱「Tripay」（serif，大字）
- Slogan「每一趟，都記得」（斜體）
- 行動引導短句「大家一起出發，帳交給 Tripay。」（小字）
- Google 登入按鈕（白底 + 「用 Google 帳號繼續」）

G-02 Ghost Card（未登入時顯示）：
- 行程卡片預覽（opacity: 0.4，filter: blur(2px)）
- 文字「你的下一趟在哪？」
- ghostPulse 動效：opacity 0.5 ↔ 0.28，3.2s ease-in-out infinite

#### 任務三：S-01 行程列表（src/pages/TripListPage.tsx）

資料：useQuery，查 trips where owner_id = auth.uid()，order by created_at desc

狀態 derive（純前端）：
```ts
function deriveDisplayStatus(trip: Trip): 'planned'|'active'|'settled'|'archived' {
  if (trip.status === 'settled')  return 'settled';
  if (trip.status === 'archived') return 'archived';
  const todayYmd = new Date().toISOString().slice(0, 10);
  return todayYmd < trip.start_date ? 'planned' : 'active';
}
```

行程卡片：emoji + 名稱 + 日期 + 狀態標籤
- planned → 「出發前」／active → 「旅途中」／settled → 「✅ 已結算」／archived → 「已封存」
- 待填筆數 > 0 → 「⏳ N 筆待填」（橘色）

空白狀態：「還沒有行程。\n第一趟要去哪？」

G-02（S-01 底部）：幽靈佔位卡「你的下一趟在哪？」，點擊 → /trips/new
G-06 Banner（S-01 底部，G-02 下方）：「分享行程連結，朋友免下載就能看帳」+ 「複製連結」chip

頂部：「＋ 新增行程」→ 開啟 TripFormSheet

#### 任務四：S-02 新增/編輯行程（src/components/TripFormSheet.tsx）

呈現：底部 Sheet（覆蓋 S-01）

欄位：
- 行程封面 emoji（Emoji Picker，分類「旅遊」/「成員」，placeholder「搜尋，或直接貼上」，確認鈕「就用這個」）
- 去哪？（name，必填，placeholder「例如：沖繩四人行 ☀️」）
- 當地幣別（currency，搜尋選擇，placeholder「搜尋幣別名稱或代碼」）
- 出發（start_date）／回程（end_date）
- 誰一起去？（trip_members，每人：emoji + 名字最多 10 字）
  - ＋ 新增成員（inline mini sheet，placeholder「叫什麼名字？」，CTA「加進來」）
- 這是我（owner_member_id 標記，引導文字「標記哪位是你，之後可以切換視角看自己的花費。」）

標題：新增「這趟去哪？」／編輯「編輯行程」
按鈕：新增「出發！」／編輯「儲存」，次要「取消」

儲存後：新增 → navigate /trips/:id；編輯 → back

---

### 【消費管理】

#### 任務五：S-03 消費列表（src/pages/ExpenseListPage.tsx）

頁面結構：
1. Hero 區（行程名 + 成員 emoji 列 + 漸層背景）
2. 統計條（總花費 / 我的花費 / 幣別 toggle）
3. 消費列表（依日期分組）
4. 底部操作按鈕（依行程狀態）
5. 右下角 FAB「＋ 新增消費」（進行中狀態）

資料：useQuery，expenses where trip_id = :id AND deleted_at IS NULL，+ expense_splits

分組邏輯：
- expense_date < start_date → 「出發前」
- 旅程中 → 「第 N 天 · M/DD（週）」（N = expense_date - start_date + 1）

消費 Row：
- category_emoji + title + payer 名 + badge（individual→「各付各的」；personal→「只算我」；shared→無 badge）
- 待填（twd_pending）：橘紅左邊框，金額顯示「—」

即時統計（useMemo，dependencies: expenses, owner_member_id, currencyMode）：
- 總花費：Σ twd_amount where !twd_pending
- 我的花費：owner 成員的應分攤金額
- 待填筆數：twd_pending = true 的筆數
- 有待填 → 「⚠️ 含 N 筆待填，數字僅供參考」

幣別 toggle：「$ 台幣」/「¥ 外幣」，切換後列表顯示對應欄位

空白狀態：
- todayYmd < start_date → 「出發前的費用也先記\n訂票、換外幣、買行李，都算這趟的帳」
- todayYmd >= start_date → 「第一筆從哪裡開始？\n早餐、計程車、門票，都可以記」

底部按鈕（依 deriveDisplayStatus）：
- planned/active → FAB「＋ 新增消費」+ 「前往結算」
- settled → 「查看結算」+ 「封存行程」
- archived → 無按鈕；頂部工具列顯示「重新開啟」

右上角：「分享」icon（開 Share Action Sheet）+ 「設定」icon → /settings

Share Action Sheet（三選項）：
- 「複製結算摘要」（副說明：貼到 LINE 群組，讓大家知道誰付誰）
- 「複製分享連結」（副說明：任何人打開都能看消費明細，不用登入）→ origin + /share/ + share_token
- 「預覽分享頁面」→ navigate /share/:token

G-05 Share Banner（一次性，sessionStorage 控制）：
- 列表從 0 筆變 1+ 筆後顯示
- 「記完了嗎？讓大家看看。」CTA「分享給大家」／「之後再說」

#### 任務六：S-04 新增/編輯消費（src/components/ExpenseFormSheet.tsx）

呈現：底部 Sheet，由 S-03 FAB 觸發

欄位（依序）：
1. 什麼花費？（title，必填，placeholder「例如：午餐 🍜」）
   - 關鍵字 → category_emoji 自動建議：
     餐/吃 → 🍜　交通/車/巴士 → 🚌　住/飯店 → 🏨　票/景點 → 🎡　買/購物 → 🛍️　其他 → ➕
2. 外幣金額（foreign_amount，toggle「之後再填」→ foreign_pending = true）
3. 台幣金額（twd_amount，toggle「之後再填」→ twd_pending = true）
   - 兩者都有值 → 自動回推 exchange_rate
4. 怎麼付的？（payment_method：現金 / 信用卡 / 儲值卡，必填）
5. 日期（expense_date，預設今天）
6. 分帳方式（expense_type 三選一）：
   - 「一起分」（shared）：勾選成員 → 即時顯示「每人 $X」
   - 「各付各的」（individual）：每人輸入 split_amount → 即時顯示「已填 $X／總額 $X」或「差 $Y」
   - 「只算我」（personal）：顯示說明卡「這筆不分帳\n只記給自己，不進分帳計算。」
7. 誰請客？/ 誰付的？（payer_member_id）
   - shared/personal → 「誰請客？」；individual → 「誰付的？」
8. 分給誰？（shared 模式，預設全選）

操作按鈕：
- 新增：「記下來」/ 「取消」
- 編輯：「記下來」/ 「取消」/ 「刪除這筆」
- 刪除確認：Dialog「刪除後無法復原。」→ 軟刪除（set deleted_at = now()）

寫入：INSERT expenses + expense_splits
- shared/individual → 建 splits；personal → 不建 splits

### 完成定義（DoD）
**行程管理**
- [ ] S-00：Google 登入可用，ghost card pulse 動效正常
- [ ] S-01：從 Supabase 正確讀取行程，狀態標籤 derive 正確
- [ ] S-01：空白狀態顯示正確文案
- [ ] S-02：新增行程寫入 trips + trip_members，owner_member_id 正確
- [ ] G-01：新用戶無行程時自動跳 /trips/new

**消費管理**
- [ ] S-03：消費列表依「出發前 / 第 N 天」正確分組
- [ ] S-03：幣別切換即時更新金額顯示
- [ ] S-03：統計條正確（useMemo，待填警示正確）
- [ ] S-04：三種分帳模式均可儲存至 Supabase
- [ ] S-04：individual 差額警示顯示，允許儲存
- [ ] S-04：軟刪除正確（deleted_at 有值，列表消失）
- [ ] S-04：category_emoji 自動建議 6 種關鍵字
- [ ] TypeScript strict mode 無 error

### 不要動
- supabase/functions/（Edge Functions）
- Vitest 測試檔（__tests__/）
- *.md 文件
```

---

## Phase D｜結算流程（原 Phase E）

```
你是 Tripay 的 Frontend Lead（凱）。
Phase C 行程管理與消費管理已完成。現在實作結算與分享功能。

### 前置條件
- expenses、expense_splits 已可新增
- Supabase Edge Functions 已部署（supabase functions deploy）
- Edge Function URL：從 VITE_SUPABASE_URL 取得

### 任務一：S-05 結算頁（SettlementPage.tsx）

三種狀態：

**狀態一：未執行結算**
- 說明文字：「準備好了嗎？結算後可以標記付清，也可以隨時回來修改。」
- 有待填時警示：「⚠️ 還有 N 筆沒填完，結算數字可能不準確」
  - 兩個按鈕：「回去補填」/ 「先這樣算」
- 沒有待填：直接顯示「算清楚」按鈕
- 點「算清楚」→ 呼叫 calculate-settlement Edge Function

**呼叫 calculate-settlement：**
```ts
const { data, error } = await supabase.functions.invoke('calculate-settlement', {
  body: { trip_id }
});
// 錯誤處理：409 trip_archived、422 invalid_amount/invalid_expense_splits
```

**狀態二：已結算（部分付清）**
每筆 settlement_item 顯示：
- 「[from] 付給 [to]　$ X」
- 「標記付清」button（PUT settlement_items.is_cleared = true）
- 已付清顯示「✅ 已付清」

進度：
- 「N / M 筆已確認」+ progress bar
- 全部付清 → 自動切換狀態三

計算依據（預設折疊）：
- 「查看計算依據」展開
- 每位成員：實際付出 / 應分攤 / 差額

**狀態三：全員付清（S-05DONE）**
- 大 emoji 慶祝：「帳算清楚了 ✨」
- 副標：「下次去哪？」
- G-08 Highlights 數據卡（3 欄）：
  - 出遊 N 天（end_date - start_date）
  - 共記了 N 筆
  - 最大手筆：最高單筆 twd_amount
- 「封存行程」按鈕 → PUT trips.status = 'archived'
- G-07：「＋ 建立新行程」→ /trips/new

**標記付清邏輯：**
```ts
await supabase.from('settlement_items')
  .update({ is_cleared: true, cleared_at: new Date().toISOString() })
  .eq('id', item.id);
```

### 任務二：分享功能（Share Action Sheet）

在 S-03 右上角「分享」icon，點擊開啟 Action Sheet：

選項 A：「複製結算摘要」（副說明：貼到 LINE 群組，讓大家知道誰付誰）
- 組成文字：「[行程名稱] 結算\n[from] 付給 [to]：$X\n...」
- navigator.clipboard.writeText()
- 複製成功 Toast：「連結已複製 ✓」

選項 B：「複製分享連結」（副說明：任何人打開都能看消費明細，不用登入）
- 組成 URL：window.location.origin + /share/ + trip.share_token
- navigator.clipboard.writeText(url)

選項 C：「預覽分享頁面」→ navigate to /share/:share_token

**結算後重新計算（reopen）：**
S-05 底部「重新計算」按鈕 → 呼叫 reopen-settlement（mode="reopen"）→ trip.status 回 planned/active → 回到狀態一

**封存後解除封存（unarchive）：**
S-03 封存狀態顯示「重新開啟」→ 呼叫 reopen-settlement（mode="unarchive"）→ trip.status 回 settled
成功 Toast：「重新開啟了，繼續記吧」

### 任務三：S-06 唯讀分享頁（SharePage.tsx）

路由：/share/:token（不需登入）

資料查詢：
- 用 share_token 查詢 trips（anon 用戶，RLS 允許）
- 查詢對應的 trip_members、expenses（deleted_at IS NULL）、settlement_items

顯示：
- 行程名稱 + 日期區間 + 成員 emoji 橫排
- 「朋友檢視」badge（右上角，提示唯讀）
- 「誰付給誰」區塊（有結算時顯示）
- 「消費明細」列表（所有費用，唯讀，不顯示編輯/刪除）
- 底部統計：總花費 / 人均

G-06 下載 CTA（頁尾）：
- 「想自己記帳？下載 Tripay」
- PWA install button（beforeinstallprompt event）

### 完成定義（DoD）
- [ ] calculate-settlement 成功呼叫，settlement + settlement_items 正確建立
- [ ] 標記付清即時更新 UI
- [ ] 全員付清後自動切換慶祝畫面
- [ ] G-08 Highlights 數字正確
- [ ] 封存行程成功，S-01 卡片顯示「已封存」
- [ ] 複製分享連結成功，/share/:token 可開啟唯讀頁
- [ ] S-06 在未登入狀態可正常讀取資料
- [ ] 重新開啟行程（reopen + unarchive）均正常
- [ ] TypeScript 無 error
```

---

## Phase E｜PWA 精修 + Growth + 部署（原 Phase F）

```
你是 Tripay 的 Frontend Lead（凱）。
Phase D 結算流程已完成。最後一個 Phase：PWA 優化、動效完整實作、Growth 元件補齊，以及 GitHub Pages 部署。

### 任務一：CSS 動效完整實作

所有動效用 CSS transition/animation，不引入 Framer Motion。

1. 畫面切換 slide-in
   - 進入：translateX(100%) → translateX(0)，opacity 0 → 1，200ms ease
   - 離開：translateX(0) → translateX(-8%)，opacity 1 → 0，200ms ease
   - 用 React Router 的 location.key 觸發

2. Bottom Sheet 升起/收起
   - 開：translateY(100%) → translateY(0)，250ms ease-out
   - 關：translateY(0) → translateY(100%)，200ms ease-in
   - 背景 overlay：opacity 0 → 0.5，200ms

3. 按鈕點擊回饋
   所有 primary/secondary button：active:scale-[0.97]，transition 100ms

4. Ghost card pulse（G-02）
   @keyframes ghostPulse：opacity 0.5 → 0.28 → 0.5，3.2s ease-in-out infinite

5. Toast 通知
   - 出現：translateY(-20px) + opacity 0 → 0 + 1，150ms
   - 消失：同反向，2 秒後自動消失

### 任務二：Toast 系統

建立 src/components/Toast.tsx + useToast hook：
- 全局 Toast，掛在 App root
- 使用方式：const { toast } = useToast(); toast("連結已複製 ✓");
- 同時只顯示一個，後進者替換

### 任務三：PWA 優化

1. Service Worker（vite-plugin-pwa workbox）
   - 快取策略：
     - 靜態資源（JS/CSS/fonts）：CacheFirst，30 天
     - API 請求（supabase）：NetworkFirst，fallback 到 cache
   - 離線時顯示「網路好像斷了，請稍後再試。」

2. Install prompt（G-06 延伸）
   - 監聽 beforeinstallprompt 事件，儲存到 state
   - S-06 頁尾「下載 Tripay」按鈕觸發 prompt
   - 已安裝則隱藏按鈕

3. App Icon
   - 用 Canvas 或 SVG 生成：磚紅色（#7C2D12）底，白色「T」字，圓角
   - 輸出 512x512 和 192x192 PNG
   - 更新 manifest.json

### 任務四：S-07 設定頁（SettingsPage.tsx）

路由：/settings（從 S-03 右上角「設定」icon 進入）

欄位：
- 帳號區塊：顯示 Google 大頭貼 + display_name
- 「登出」按鈕 → 確認 Dialog「確定要登出嗎？」→ supabase.auth.signOut() → navigate to /login

### 任務五：GitHub Pages 部署

1. vite.config.ts 加入 base: '/tripay/'（依實際 repo 名稱調整）

2. 建立 .github/workflows/deploy.yml：
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

3. 確認 Supabase Auth allowed origins 加入 GitHub Pages URL

4. React Router 在 GitHub Pages 的 SPA fallback：
   - 建立 public/404.html，內容跳轉回 index.html

### 任務六：TC-STATUS-18~20 E2E（如環境就緒）

執行：
```bash
supabase start
cp .env.example .env.test
# 填入本地 Supabase URL 和 service role key
npx vitest run __tests__/trip-status-e2e.test.ts
```

### 完成定義（DoD）
- [ ] 所有畫面切換有 slide-in 動效
- [ ] Bottom Sheet 開關有動效
- [ ] Ghost card pulse 正常運作
- [ ] Toast 系統可用（複製成功、錯誤訊息）
- [ ] PWA：DevTools 顯示 Service Worker active
- [ ] App Icon 正確顯示（非瀏覽器預設）
- [ ] S-07 設定頁：登出正常
- [ ] npm run build 無錯誤
- [ ] GitHub Actions deploy 成功
- [ ] GitHub Pages 上可開啟，Google Auth 可用
- [ ] TypeScript 無 error
```

---

## 注意事項（所有 Phase 通用）

- 台幣金額顯示一律寫「$」，絕對不寫「NT$」或「NT」
- 外幣顯示用對應符號（JPY → ¥，USD → $，EUR → €）
- 所有錯誤狀態顯示對應文案（見 Tripay_文案_v1.4.md 通用錯誤區塊）
- API 呼叫一律加 loading state
- Supabase 查詢加 .is("deleted_at", null) 排除軟刪除
- 不要修改 supabase/functions/ 以外的後端邏輯
