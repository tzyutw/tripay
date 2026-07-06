# 前端即時統計｜useMemo Dependency 設計

**產出者**：Tech Lead  
**日期**：2026-06-26  
**對應算法**：分帳演算法文件 §2、§7.2

---

## 統計計算項目

前端即時計算（不需 API call）的兩個數字：

| 統計項 | 定義 | 顯示位置 |
|--------|------|---------|
| **我的花費**（my_cost） | 登入者成員應分攤的台幣總額 | S-03 頂部統計卡 |
| **全行程總支出**（total_twd） | 所有非 personal、非 twd_pending 費用的 twd_amount 加總 | S-03 頂部統計卡 |

---

## useMemo Dependency Array

```ts
const { myCost, totalTwd, pendingCount } = useMemo(
  () => computeTripStats(expenses, splits, ownerMemberId),
  [expenses, splits, ownerMemberId]
  //  ↑           ↑         ↑
  //  (A)        (B)       (C)
);
```

| 依賴項 | 型別 | 觸發重算的情境 |
|--------|------|--------------|
| **(A) expenses** | `Expense[]` | 新增、編輯、刪除任一筆消費（twd_amount / expense_type / payer / twd_pending 改變） |
| **(B) splits** | `ExpenseSplit[]` | 分帳成員勾選變更、split_amount 輸入、split_pending 狀態改變 |
| **(C) ownerMemberId** | `string \| null` | 使用者切換「視角成員」（非 MVP 主功能，但欄位已在資料模型預留） |

> **注意**：`expenses` 和 `splits` 必須是 stable reference（從 Supabase realtime 或 React Query 取得的 array）。  
> 若父元件每次 render 都產生新 array literal，useMemo 會每次重算，失去效益。  
> 建議用 React Query / SWR 的 `data` 直接作為依賴，或搭配 `useRef` 做 deep equal guard。

---

## computeTripStats 函式簽章

```ts
interface TripStats {
  myCost:       number;  // 我的應分攤金額（排除 twd_pending & split_pending）
  totalTwd:     number;  // 全行程已確認台幣總支出
  pendingCount: number;  // 影響「我的花費」的待填筆數（for ⚠️ 警示）
}

function computeTripStats(
  expenses:      Expense[],
  splits:        ExpenseSplit[],
  ownerMemberId: string | null,
): TripStats
```

### 計算邏輯（對應演算法文件 §2）

```
totalTwd = Σ twd_amount
  where expense_type ≠ 'personal'
    AND twd_pending = false

myCost = Σ my_share
  where expense_type ≠ 'personal'
    AND twd_pending = false

  my_share 依 expense_type：
    shared     → ROUND(twd_amount / participants.length, 0)
                 + remainder（若我是付款人）
    individual → split_amount（我的那筆，split_pending = false 才計）
    personal   → 0（不進計算）

pendingCount = N 筆
  where (twd_pending = true AND 我有參與)
     OR (expense_type = 'individual' AND 我的 split_pending = true)
```

---

## 邊界：pending 筆的統計顯示（方案 C，已確認）

```
若 pendingCount > 0：
  顯示：「我的花費 NT$X ⚠️ 含 {pendingCount} 筆待填，數字僅供參考」
  
若 pendingCount = 0：
  顯示：「我的花費 NT$X」（無警示）
```

---

## 效能備注

- Phase 1 假設單行程 ≤ 200 筆 expense，成員 ≤ 10 人
- `computeTripStats` 複雜度 O(n × m)，n = 費用筆數，m = 成員數，此規模下同步計算無問題
- 不需 Web Worker 或非同步計算
