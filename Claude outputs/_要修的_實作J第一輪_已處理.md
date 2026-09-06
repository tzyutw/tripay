# 要修的（Cowork 複驗退回 · 實作-J 第一輪）　2026-09-06

實作-J 的八條停止條件我自己量過，**七條過**。以下兩項要補。

**第 1 項是我（Cowork）指令寫錯造成的，不是你做漏。** 我把 `memberLabel()` 一律
歸成「C 類純文字、不要動」，實際上它的六個呼叫點裡有三個是「識別圖＋名字並排」，
跟 chip 同一種東西，不是句子。結果 Rozi 最常看的三個畫面
（消費列表每一列、結算頁誰付給誰、分享頁）還是裸字母。

---

## 1. `memberLabel()` 的三個「識別位」要改用 Avatar（20px）

**我量到的**（`?members=noemoji`，390×844，實測渲染）：

| 畫面 | `.avatar.letter` | 畫面上實際顯示 |
|---|---:|---|
| s03 消費列付款人 | 0 | 「R Rozi 當場就清了」裸字母 |
| s05 誰付給誰（預設狀態） | 0 | 「小 小魚給R Rozi約$ 20,220」裸字母 |
| s06 分享頁 | 0 | 同上 |

**要改成 `<Avatar size={20} />`＋名字的，只有這三處：**

1. `src/components/shared/ExpenseGroups.tsx:48`
   `<span className="s">{payer ? memberLabel(payer) : ''} {badges}</span>`
   → 消費列的付款人（S-03、S-03d、S-06 的明細列都走這裡）
2. `src/components/shared/TransferView.tsx:27-30` 的 `nm2()`
   → 轉帳列 `{nm2(t,x.from)} → {nm2(t,x.to)}`（S-06 分享頁、S-05 對帳）
   `nm2()` 目前回傳 string，改成回傳 JSX（或改在呼叫點組）
3. `src/pages/SettlementPage.tsx:360、362`
   「誰付給誰」列 `{memberLabel(from)} → {memberLabel(to)}`

排版：`→` 兩側各是一組「圓底＋名字」，用 flex（`display:inline-flex; align-items:center; gap:4px`），
不要讓圓底跟名字在窄螢幕上被拆到兩行。名字沿用 `.trunc`。

**維持純文字、不要動的（這三處是真的句子）：**

- `src/pages/SettlementPage.tsx:260`「這趟有 N% 是 ○○○ 先付的。」
- `src/pages/SettlementPage.tsx:441`「給 ○○○ $1,234」
- `src/pages/SettlementPage.tsx:443`「○○○ 給你 $1,234」

`memberLabel()` 本身**保留**（上面三處還在用），不要刪。

**原型同步**：`Tripay_原型.html:1946`（S-03 消費列付款人）與 `:2507`（`nm2()`）
上一輪你判斷「對應 C 類所以不動」——現在 C 類縮小了，這兩處要一併改成識別圓底＋名字。

---

## 2. 分享頁在「還沒記帳」時橫向溢出 14px

`src/components/shared/TransferView.tsx:63`：

```jsx
<div className="rowb" style={{ margin: '0 14px' }}>
  <span className="flex-1 text-body text-gr">這趟旅程還沒結算。</span>
</div>
```

`.rowb` 是 `width:100%`，這裡又套 `margin:0 14px`，實際佔 344+28。
我在原型上量到 `#scr-s06` `scrollWidth 358 / clientWidth 344`，溢出元素就是這一列。

- 原型同源：`Tripay_原型.html:2921`（S-06-8），**兩邊都要改**
- 改法：`width: calc(100% - 28px)`，或去掉 margin 改用父層 padding
  （原型其他同類 `.exprow`、`.tcard` 用的是 `calc(100% - 28px)`）
- 影響：分享一趟還沒記帳的行程給旅伴，旅伴的畫面會左右滑動。
  違反 `CLAUDE.md`「版面守則：不得橫向滑動」
- 同一支檔案第 71 行的轉帳列也是 `.rowb`，那裡只有 `marginBottom`，**沒問題，不要動**

---

## ⛔ 界線

只做這兩項。不要碰資料庫裡任何一筆成員資料（有一筆 `name` 是「🤣Ning」，
那是 Rozi 自己輸入的，等她決定）。覺得可以更好但沒壞掉的寫進 `_延後與不做清單.md`。

## 停止條件（機器判斷，每條都要有反向驗證會紅）

1. `?members=noemoji`、390×844，**s03 預設狀態**：消費列每一列的付款人位置渲染出
   `.avatar.letter`，數量 **≥ 5**（demo 有 8 筆消費，扣掉沒付款人的）。
   斷言要印出實際數量。
2. 同上，**s05 預設狀態**（不做任何點擊）：「誰付給誰」區塊的
   `.avatar.letter` **≥ 6**（3 條轉帳 × 2 人）。
3. 同上，**s06 預設狀態**：轉帳列 `.avatar.letter` **≥ 6**；消費明細列 **≥ 5**。
4. s05／s06 那三處**句子**（`給 ○○○`、`○○○ 給你`、`N% 是 ○○○ 先付的`）
   內部 `querySelectorAll('.avatar').length === 0`——句子裡不准長出圓底。
5. 320／390／414 三個寬度下，s03／s05／s06 每一個真正會捲的容器
   `scrollWidth <= clientWidth + 1`。
6. **s06 在「沒有任何消費」的 fixture 下**（另加一個 `?expenses=none` 模式）
   `scrollWidth <= clientWidth + 1`，且畫面上出現「這趟旅程還沒結算。」。
   反向驗證：把 `width: calc(100% - 28px)` 拿掉，這條必須紅。
7. `npx tsc --noEmit` 0 錯；`npx vitest run` 全綠且項數 **≥ 上一輪的數字**；
   `pnpm run build` 成功；已 commit **並 push**。
8. 做完把本檔改名為 `Claude outputs/_要修的_實作J第一輪_已處理.md`，
   並把回報寫進 `_停點.md`（≤50 行）。

## 五類例外

無。可以一路做完。
