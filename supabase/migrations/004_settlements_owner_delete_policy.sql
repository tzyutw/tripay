-- 004 hotfix_3：settlements 缺少 RLS DELETE 政策
--
-- 背景（2026-08-30）：刪除舊展示行程時發現，settlements 只有 read/insert/update
-- 三條政策，沒有 delete。DELETE 會被 RLS 靜默過濾成「影響 0 列」（回 200、不報錯），
-- 與 2026-07-22 Bug #4（expense_splits 缺 DELETE 政策）完全同一根因。
--
-- 影響：任何做過結算的行程都刪不掉——settlement_items 對 trip_members 的兩條 FK
-- 沒有 ON DELETE CASCADE，刪 trip 時 cascade 的執行順序會先動 trip_members 而
-- settlement_items 還在，觸發 23503；而要在應用層「先刪 settlements」又被 RLS 擋。
--
-- 本檔只補這一條政策（owner 條件對齊既有 read/update 寫法）。
-- 已由 Cowork 端以 migration「settlements_owner_delete_policy」套上 production 並驗證生效，
-- 此檔為 repo 同步留底。
--
-- 尚未處理（Phase 1.5「刪除行程」功能的前置條件，見 專案狀態.md P9）：
--   1. settlement_items.from_member_id / to_member_id → trip_members 缺 ON DELETE CASCADE
--   2. expenses / settlement_items 仍無 DELETE 政策

drop policy if exists "settlements: owner delete" on settlements;
create policy "settlements: owner delete" on settlements
  for delete using (
    exists (
      select 1 from trips
      where trips.id = settlements.trip_id
        and trips.owner_id = auth.uid()
    )
  );
