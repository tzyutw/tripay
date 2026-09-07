-- 016　expenses.note：「記一筆」的備註欄（Rozi 2026-09-07 驗收中發現的新需求）
--
-- 她的話：「『記一筆』要多一個備注欄，但這個備注不用列在總行程頁。」
-- 所以它只在 S-04（記一筆／編輯那一筆）看得到，
-- S-03 消費列表、S-05 結算頁、S-06 分享頁**都不顯示**。
--
-- **不參與任何計算**：不進結算、不進統計、不能搜尋。
-- 可回滾：欄位加錯就 drop，既有資料不受影響（rollback 語句在檔尾，已註解）。

alter table expenses
  add column if not exists note text;

comment on column expenses.note is
  '這一筆的備註。只在記一筆／編輯那一筆看得到，總行程頁與分享頁都不顯示。
   不參與任何計算。空的時候存 null，不要存空字串。';

-- 上限 200 字由前端擋（超過就不再收字，不跳錯誤訊息）。
-- 這裡加一道保險，避免任何路徑塞進超長字串。
alter table expenses
  drop constraint if exists expenses_note_len;
alter table expenses
  add constraint expenses_note_len check (note is null or char_length(note) <= 200);

-- rollback：
-- alter table expenses drop constraint expenses_note_len;
-- alter table expenses drop column note;
