# icon 授權

> 全站功能 icon 的來源與授權，**逐一列出**。#27-3 建立，#28-1 定案為 Feather 單一組。
> 規則：來源不明的一律自己重畫，不放進來。上線前這份檔案要能對得起來。

## 不能用的：Apple 的系統圖示與系統字體

Apple 的授權明文限制：字體與符號**僅授權用於「執行在 Apple 作業系統上的軟體」**，
且**不得修改、不得內嵌到軟體產品中**。Tripay 是跑在瀏覽器裡的網頁，不在授權範圍內。

因此本專案**不得下載、內嵌或轉描**任何 Apple 系統圖示或系統字體的檔案。
可以做的是**做出接近的風格**——風格本身不受著作權保護，受保護的是具體的字形檔案。

## 現行來源：Feather Icons（MIT）

**Rozi 2026-09-05 從 #27 提出的三組開源候選中選定 Feather**，
另外兩組與稿頭的對照條同時移除。

| 項目 | 內容 |
|---|---|
| 來源 | Feather Icons |
| 授權 | **MIT** |
| 網址 | https://feathericons.com |
| 取得方式 | npm `feather-icons` 套件的 `dist/icons/*.svg` |
| 原始規格 | 24×24 viewBox、`stroke-width:2`、圓端圓角 |

MIT 允許商業使用、修改與再散布，條件是保留授權聲明——本檔案即為該聲明。

## 15 個 icon 逐一對照

「用在哪裡」與 `icons_自備/請看這裡.md` 的對照表一致（該表寫的是 13 個；
`more` 是 #28-6b 做 ⋯ 選單時新增的，`archive` 是 #29-8c 給「封存行程」新增的）。

| 鍵名 | 用在哪裡 | Feather 原始檔名 |
|---|---|---|
| `back` | 各頁左上角的返回鍵（#28-4 起是純 icon，無文字）| `chevron-left` |
| `next` | 設定頁每列右邊的箭頭、可點進去的列 | `chevron-right` |
| `down` | 統計卡與結算頁的展開鍵（收合時）| `chevron-down` |
| `up` | 同上（展開時）| `chevron-up` |
| `edit` | 編輯行程（#28-6b 起在 ⋯ 選單裡）| `edit-2` |
| `copy` | 複製分享連結／文字摘要 | `copy` |
| `share` | 分享 | `share-2` |
| `settings` | 設定入口（#28-6c 起在首頁標題列，不在行程頁）| `settings` |
| `add` | 記一筆、新增行程 | `plus` |
| `del` | 刪除行程、刪除這筆 | `trash-2` |
| `check` | 標記付清、確認 | `check` |
| `warn` | 「還沒算清楚」「還沒填」的提示 | `alert-circle` |
| `close` | 彈窗右上角的關閉 | `x` |
| `more` | S-03 hero 右上的 ⋯ 選單觸發鈕（#28-6b 新增）| `more-horizontal` |
| `archive` | ⋯ 選單的「封存行程」（#29-8c 新增）| `archive` |

**全站就這 15 個，沒有第 16 個。**
`filter` 與 `money` 兩個定義全站沒有任何 `ic()` 呼叫用到，已於 #27-5a 刪除。

### 沒有沒人用的 icon

／／／ 曾在 #28-6b 因 ⋯ 選單改成純文字而失去呼叫點，
**#29-8c 裁示選單項要配 icon，四個都回到使用中**。
 是為了「封存行程」新增的——Feather 本來就有這個造形，不必自己畫。

## 取用方式（不是原樣貼進去）

取進原型時做了正規化：移除每個子元素自帶的 `fill`／`stroke`／`stroke-width`／
`stroke-linecap`／`stroke-linejoin`／`class`／`xmlns`，只留造形；
顏色與線寬統一由 `ic()` 的外層 `<svg>` 給
（`fill="none"`、`stroke="currentColor"`、`stroke-width` 見 `ICON_STROKE`、圓端圓角）。

## Rozi 自備的 icon

`icons_自備/`。**Rozi 2026-09-05 裁示不採用**：
「不要管我放進 `icons_自備/` 的 svg，因為我原本以為你做不到我要的，
但現在看 Feather 這組我覺得可以接受。」
六個檔案已由 Cowork 端移到 `icons_自備/未採用/`。

**往後檢查該資料夾時只看第一層，`未採用/` 子資料夾一律忽略。**
之後若有新檔案被採用，要在上面的表格補一列，
來源欄寫「Rozi 提供」＋她在 `icons_自備/請看這裡.md` 底部填的來源。
