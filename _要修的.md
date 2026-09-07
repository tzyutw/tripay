# 要修的（Cowork 複驗 2026-09-07　實作-V）

> **產品程式碼複驗通過，這一節可以推**（`_可以推了.txt` 已經在了）。
> 下面這一項是**量測靶**的缺口，不是產品的 bug——但它讓停止條件 4 量不到，
> 所以要補完才算做完。修完直接 push，不用等 Cowork 再看一次。

## H-1　V-0 只補了「寫入會改動假資料」，沒補「寫入之後讀出來要帶著關聯資料」

`src/test/harness/installStub.ts` 的 `insert` 把新列直接推進 `rows.expenses`，
但**新列沒有 `expense_splits` 這個欄位**。真實的 PostgREST
（`.from('expenses').select('*, expense_splits(*)')`）一定會回一個陣列，空的就是 `[]`。

於是在量測靶上「記一筆 → 存 → 立刻點開它」時：
`src/components/ExpenseFormSheet.tsx:311` 的 `e.expense_splits.filter(...)`
拿到 `undefined` → `TypeError: Cannot read properties of undefined (reading 'filter')`
→ **整個 app 白屏**。停止條件 4（新增路徑）因此量不到。

**要做的**（只改 `src/test/harness/installStub.ts`，不要動產品程式碼）：

1. `insert` 進 `expenses` 的新列，補上 `expense_splits: []`
2. `insert` 進 `expense_splits` 的列，同時 append 到 `rows.expenses` 裡
   `id === expense_id` 那一列的 `expense_splits`
3. `delete().eq('expense_id', x)` 也要把那一列的 `expense_splits` 清掉
   （不然「改分帳方式」會愈存愈多）

**驗收（Cowork 會跑）**：`?screen=s03` → 記一筆 →
填標題 `ZZ新增的一筆`＋台幣 999 ＋選一個付款人 → 記下來 →
在清單上點那一筆 → **1.2 秒內標題欄讀到 `ZZ新增的一筆`，而且沒有 pageerror**。

⚠️ 不要用「在 `ExpenseFormSheet.tsx:311` 加 `?? []`」來繞過。
產品那一行在正式環境拿不到 `undefined`（PostgREST 一定回陣列），
**改產品等於把量測靶的問題藏起來**。要修的是量測靶。
（`?? []` 這件事本身值不值得加，另外列在「順手看到但沒動」，等 Rozi 決定，這一輪不要動。）
