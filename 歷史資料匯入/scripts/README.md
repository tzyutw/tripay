# Stage 0 解析腳本

四份 Excel 各有各的版型，因此各寫各的 parser。全部唯讀，不碰資料庫。

## 準備

```bash
cd 歷史資料匯入/scripts
npm init -y && npm i xlsx@0.18.5     # 專案根目錄是 ESM，故本資料夾腳本一律用 .cjs
```

## 檔案

| 檔案 | 用途 |
|------|------|
| `lib.cjs` | 讀 xlsx（取公式計算後的值）、格子存取、日期/數字判讀、對帳工具 |
| `trips.cjs` | 四份 Excel 的欄位配置宣告（成員、欄位、「給X」欠款欄、小計列） |
| `parse-all.cjs` | 三支 parser：福岡／東京／濟州島版型（北海道共用）→ `fixtures/_raw-parse.json` |
| `recon.cjs` | **鐵律驗證**：讀 Excel 真正的 SUM 公式重算，並列出 Excel 自己漏加的列 |
| `baselines.cjs` | 推出基準 A（每人分擔總額）與基準 B（每人結算淨額）→ `fixtures/<行程>.json` |
| `anchors.cjs` | 與 2026-08-11「整趟總花費」錨點交叉驗證 |
| `baseline-b-twd.cjs` | 基準 B 台幣版（Rozi 決策 2）→ `../基準B_台幣版.md` |
| `tokyo-assign.cjs` | 東京：套用 Rozi 付款人指認、重算基準 A、一致性檢核 (b)、衝突列 (c) |
| `fukuoka-apply.cjs` | 福岡：套用 Rozi 7 筆判讀，算出隱含欠款與預期 Tripay 淨額 |
| `tokyo-orphans.cjs` | 產出 `../東京_待指認付款人.md`（已完成指認，保留為紀錄）|
| `report.cjs` | 舊版基準表產生器（已由 `report-final.cjs` 取代）|
| `report-final.cjs` | **產出最終 `../驗收基準表.md`** |

## 執行順序

```bash
node parse-all.cjs && node recon.cjs && node baselines.cjs && node anchors.cjs \
  && node baseline-b-twd.cjs && node tokyo-assign.cjs && node fukuoka-apply.cjs \
  && node report-final.cjs
```

## 設計原則

- **嚴禁手調數字讓它對上 Excel**。解析與 Excel 合計對不上時，一律先查解析；
  確認是 Excel 自己的 SUM 公式漏加時，照實揭露（見 `recon.cjs` 輸出與 `../驗收基準表.md` 末節）。
- 付款人優先序：Excel「給X」欠款欄 → 備註 emoji → 分類欄 emoji。
  四份檔的「付款人」欄（福岡 D、其餘 D/F）**全檔為空**，不可依賴。
- 備註 emoji → payment_method：💰 cash／💳🍎 credit_card／🍉 WOWPASS Linepay stored_value／空白 credit_card。
- **基準 A 一列只用一種幣別**：有台幣就用台幣、沒有才用外幣。同列的外幣與台幣多半是同一筆錢的
  兩種表述（東京 B/D、濟州島 C/E、福岡 E-F-G 與 K-L-M 的 6 列重疊），相加會重複計算。
  此規則與 Excel 自己的小計一致（東京／北海道的外幣小計只加沒有台幣的列）。
