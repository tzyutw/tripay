# icon 授權

> 全站功能 icon 的來源與授權，**逐一列出**。#27-3 建立。
> 規則：來源不明的一律自己重畫，不放進來。上線前這份檔案要能對得起來。

## 不能用的：SF Symbols / SF 字體

Apple 的授權明文限制：字體與符號**僅授權用於「執行在 Apple 作業系統上的軟體」**，
且**不得修改、不得內嵌到軟體產品中**。Tripay 是跑在瀏覽器裡的網頁，不在授權範圍內。

因此本專案**不得下載、內嵌或轉描** SF Symbols、SF Pro、SF Compact、SF Mono 的任何檔案。
可以做的是**做出接近的風格**——風格本身不受著作權保護，受保護的是具體的字形檔案。

## 現行三組候選

原型的對照條並排三組供 Rozi 挑選（`Tripay_原型.html` 的 `ICON_SETS`）。
三組都允許商業使用與修改，**目前預設 Lucide**，Rozi 選定後改 `ICON_SET` 一行即可。

| 組 | 來源 | 授權 | 網址 | 版本 |
|---|---|---|---|---|
| `lucide` | Lucide | **ISC** | https://lucide.dev | npm `lucide-static` |
| `feather` | Feather Icons | **MIT** | https://feathericons.com | npm `feather-icons` |
| `hero` | Heroicons（Tailwind Labs）| **MIT** | https://heroicons.com | npm `heroicons` 24/outline |

ISC 與 MIT 都允許商業使用、修改與再散布，條件是保留授權聲明——本檔案即為該聲明。

## 13 個 icon 逐一對照

「用在哪裡」與 `icons_自備/請看這裡.md` 的對照表一致。
每一組的來源檔名不同（同一個概念在三個圖示集裡叫不同名字），一併列出以便追查。

| 鍵名 | 用在哪裡 | Lucide | Feather | Heroicons |
|---|---|---|---|---|
| `back` | 各頁左上角的返回鍵 | `chevron-left` | `chevron-left` | `chevron-left` |
| `next` | 設定頁每列右邊的箭頭、可點進去的列 | `chevron-right` | `chevron-right` | `chevron-right` |
| `down` | 統計卡與結算頁的展開鍵（收合時）| `chevron-down` | `chevron-down` | `chevron-down` |
| `up` | 同上（展開時）| `chevron-up` | `chevron-up` | `chevron-up` |
| `edit` | 編輯行程入口 | `square-pen` | `edit-2` | `pencil` |
| `copy` | 複製分享連結／文字摘要 | `copy` | `copy` | `document-duplicate` |
| `share` | 行程頁右上角的分享 | `share-2` | `share-2` | `share` |
| `settings` | 行程頁右上角的齒輪 | `settings` | `settings` | `cog-6-tooth` |
| `add` | 記一筆、新增行程 | `plus` | `plus` | `plus` |
| `del` | 刪除這趟行程、刪除這筆 | `trash-2` | `trash-2` | `trash` |
| `check` | 標記付清、確認 | `check` | `check` | `check` |
| `warn` | 「還沒算清楚」「還沒填」的提示 | `circle-alert` | `alert-circle` | `exclamation-circle` |
| `close` | 彈窗右上角的關閉 | `x` | `x` | `x-mark` |

**全站就這 13 個，沒有第 14 個。**
原本還有 `filter` 與 `money` 兩個定義，全站沒有任何 `ic()` 呼叫用到，已於 #27-5a 刪除。

## 取用方式（不是原樣貼進去）

三組都是 24×24 viewBox。取進原型時做了正規化：
移除每個子元素自帶的 `fill`／`stroke`／`stroke-width`／`stroke-linecap`／`stroke-linejoin`／
`class`／`xmlns`，只留造形；顏色與線寬統一由 `ic()` 的外層 `<svg>` 給
（`fill="none"`、`stroke="currentColor"`、`stroke-width` 見 `ICON_STROKE`、圓端圓角）。
**這樣三組才只差造形**，比較才有意義。

## Rozi 自備的 icon

`icons_自備/` 資料夾。**本輪（#27）執行時裡面有 6 個 `.svg`，但檔名都是下載時的雜湊亂碼，
不在 13 個鍵名之內，依規則全部忽略、一個都沒有採用。**
下面逐一說明每個檔案實際上是什麼、該改成什麼檔名才會生效——渲染出來看過，不是憑猜：

| 現在的檔名 | 實際上畫的是 | 該改成 | 造形 | 備註 |
|---|---|---|---|---|
| `11900620631556279759.svg` | 鉛筆 | `edit.svg` | **實心** | Sketch 匯出，18×18 |
| `16494424801543238918.svg` | 分享（三點連線）| `share.svg` | 線稿 | 就是 Feather 的 `share-2`，與現行 Lucide 組幾乎相同 |
| `19204967841691070991.svg` | 向左的迴轉箭頭 | `back.svg` | **實心** | 64×64。注意它是「返回上一步」的迴轉箭頭，不是 chevron |
| `5412118401556279780.svg` | 向右箭頭 | `next.svg` | **實心** | Sketch 匯出，7×12，原名 `navigate_next` |
| `6579874521655460134.svg` | 兩張疊起來的方框 | `copy.svg` | 線稿 | 24×24 |
| `6952612681543238917.svg` | 齒輪 | `settings.svg` | 線稿 | 就是 Feather 的 `settings` |

**三個是實心的**（鉛筆、迴轉箭頭、向右箭頭）。依 #27-5b 第 1 條，
**實心圖示不自動轉線稿**——轉出來一定歪。這三個跟其餘 10 個線稿混在一起會不一致，
建議換成線稿版本；要保留實心的話請說一聲，那是另一個方向的決定（整組改實心）。

六個檔案都沒有漸層、遮罩、內嵌點陣圖或文字圖層，**格式本身都可以收**，
卡住的只有檔名與實心／線稿這兩件事。

Rozi 之後採用的每一個都要在上面的 13 個 icon 表格補一列，
來源欄寫「Rozi 提供」＋她在 `icons_自備/請看這裡.md` 底部填的來源。
**該檔底部的來源欄目前是空的，上線前要補。**
