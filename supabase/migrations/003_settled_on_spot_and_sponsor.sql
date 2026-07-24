-- 003 路線1：對帳正確性
-- 1) settled_on_spot：共同但當場各付各的 → 記錄但不進結算
-- 2) is_sponsor：外部贊助/回饋 → 負額共同項，平均扣進每人應付
-- 金額欄 foreign_amount / twd_amount 本為 numeric，已允許負數，無需改型別。

alter table expenses
  add column if not exists settled_on_spot boolean not null default false,
  add column if not exists is_sponsor      boolean not null default false;
