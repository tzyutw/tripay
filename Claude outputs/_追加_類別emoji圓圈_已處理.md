# 追加需求（Rozi 2026-09-06，**不是複驗退回**）

> ⚠️ 這份檔案平常是 Cowork 複驗退回用的，這次不是——是 Rozi 在你跑 `實作-N` 的
> 途中追加的需求，借這個檔讓你做完 N 之後接著做，**她不必再打一次「收」**。
> 先把 `實作-N` 那節做完並標 `[已處理]`，再回頭做這一項。

## 類別 emoji 的就地編輯要跟成員識別「長得」一樣（加圓圈）

**Rozi 的原話**：「也要跟輸入成員模式的編輯規則一樣，如果無法判別就先預設 ➕」，
並附上原型 S-02c 的截圖，標題是「編輯：點識別圓圈，就地改」。

**Cowork 查到的現況**：

- **互動行為已經一樣了**——`useInlineEdit.ts` 的註解就寫「行程成員與消費類別共用這一套」，
  兩邊都是「點 → 變單字元輸入框 → 自動聚焦 → 輸入後自動存檔收合」。這部分不用動。
- **「推不出來就 ➕」也已經是現況**（`emojiForTitle` 最後一行 `return '➕'`）。不用動。
- **差在外觀**：成員是 `<Avatar>`＝28px 的 `.avatar` 圓框，一眼看得出可以點；
  類別 emoji（`ExpenseFormSheet.tsx:351`）是**裸的 `<button>`＋一個 emoji，沒有框**。
  Rozi 要的是那個「識別圓圈」。

**這是設計變更，不是實作跑掉**：原型 `Tripay_原型.html:2167` 的類別 emoji 也是裸的
（`<button data-av="exp:g" style="font-size:…;width:22px">`），只有進入編輯時才包成
24px 的 `.avatar`。Rozi 推翻了這個設計，要求未編輯時也要有圓圈。

### 要做的

1. `ExpenseFormSheet.tsx` 的類別 emoji：**未編輯時也用 `.avatar` 圓框包起來**，
   與成員識別同一個視覺（白底、1px 線、`--r-base` 圓角）。
   尺寸優先用 **28px**（與成員的 `<Avatar>` 一致）。
   ⚠️ 它住在 `.fieldrow` 裡（上下 padding 7px）——**如果 28px 會把那一列撐高，
   改用 24px 並在 `_停點.md` 回報你選了哪個、量到的列高是多少。**
2. **編輯狀態沿用同一個外框尺寸**，把 input 塞在 `.avatar` 裡面
   （`.avatar input { width:100%;height:100%;… }` 這條 CSS 已經存在，直接用），
   **不要讓外框在切換編輯狀態時改變大小**——那會讓整列跳動。
3. 原型 `Tripay_原型.html:2165-2167` 一併同步成同樣的樣子。

### ⛔ 界線

- **不要**改 `useInlineEdit` 的行為（互動已經一致）。
- **不要**改 `emojiForTitle` 的 fallback（`➕` 已經是現況）——
  字典擴充是 `實作-N` 第 2 項的事，這裡不重複。
- **不要**順手改成員那邊的 `<Avatar>`（成員編輯時是 32px、非編輯 28px，
  Rozi 沒抱怨過，這一輪不動）。寫進 `_延後與不做清單.md` 就好。

### 停止條件（機器判斷，反向驗證要紅）

1. `?screen=s04`：類別 emoji 那顆元素 `classList.contains('avatar')` 為 true，
   且 `getBoundingClientRect()` 寬高相等、介於 **24–28px**。
   反向驗證：拿掉 `.avatar`，必須紅。
2. 點它進入編輯後，該外框的寬高**與點之前完全相同**（差 ≤1px），
   且 `document.activeElement` 是框內的 input。
   反向驗證：讓編輯狀態用不同尺寸，必須紅。
3. 該 `.fieldrow` 的高度在「未編輯／編輯中」兩種狀態下相同，
   且與 `實作-N` 之前量到的值差 ≤2px（把兩個數字都印出來）。
4. 320／390／414 三寬度下 s04 不橫向捲動。
5. `npx tsc --noEmit` 0 錯；`npx vitest run` 全綠、不含 `Unhandled Errors`；
   `pnpm run build` 成功；已 commit **並 push**。
6. 做完把本檔改名為 `Claude outputs/_追加_類別emoji圓圈_已處理.md`，
   回報併進 `_停點.md`。

### 五類例外

無。可以一路做完。
