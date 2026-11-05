-- 019　Phase 2 A：主卡的結帳日＋同一張主卡同一個月只能有一份帳單（2026-11-05）
--
-- 依據：Phase2_團隊討論.md
--   D4　卡片要有結帳日（1 到 31 號，預設月底），依主卡結帳日切月份；
--       結帳日 31 遇到 2 月就取 2 月最後一天（這個「取月底」在前端算，資料庫只存 1～31）
--   D5　不用手動建帳單：記一筆選了卡，就自動落到對應月份，沒有就自動建
--       → 兩支手機同時記第一筆時可能各建一份，所以由資料庫擋重複
--
-- 套用前實測（2026-11-05）：cards 0 列、kind='statement' 的 trips 0 列——
-- **不影響任何既有資料**。旅遊行程（kind='trip'）的 card_id 一律是 NULL，不在唯一索引的範圍內。
-- 可回滾：兩項都是新增，rollback 在檔尾。

-- 1　結帳日。副卡也有這一欄，但不使用（副卡跟著主卡切月份）
alter table cards
  add column if not exists statement_day smallint not null default 31;

alter table cards drop constraint if exists cards_statement_day_chk;
alter table cards
  add constraint cards_statement_day_chk check (statement_day between 1 and 31);

comment on column cards.statement_day is
  '主卡的結帳日（1～31，預設 31＝月底）。該月沒有那一天時取那個月最後一天（前端算）。
   副卡不使用，一律跟著主卡切月份。';

-- 2　同一張主卡、同一個起始日，只能有一份帳單
create unique index if not exists trips_statement_card_start_uniq
  on trips (card_id, start_date)
  where kind = 'statement';

-- rollback：
-- drop index if exists trips_statement_card_start_uniq;
-- alter table cards drop constraint if exists cards_statement_day_chk;
-- alter table cards drop column if exists statement_day;
