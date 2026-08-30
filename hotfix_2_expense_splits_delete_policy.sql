-- Tripay Hotfix #2  2026-07-22
-- 問題：編輯消費會重複建立 expense_splits，導致分帳金額與結算錯誤
-- 根因：expense_splits 缺少 RLS DELETE 政策，前端「刪舊 splits 再重建」的 delete 被 RLS 靜默擋掉（刪 0 筆），
--       insert 又補一組 → 每次編輯累積一組重複。
-- 在 Supabase Dashboard → SQL Editor 執行本檔。

-- 1) 補上缺少的 DELETE 政策（對齊其他表的 owner 權限寫法）
--    先 drop if exists，讓本檔可安全重複執行、不會因「已存在」報錯
drop policy if exists "expense_splits: owner delete" on expense_splits;
create policy "expense_splits: owner delete" on expense_splits
  for delete using (
    exists (
      select 1 from expenses e
      join trips t on t.id = e.trip_id
      where e.id = expense_id and t.owner_id = auth.uid()
    )
  );

-- 2) 清掉已存在的重複 splits（每個 expense_id + member_id 只保留一筆）
delete from expense_splits a
using expense_splits b
where a.expense_id = b.expense_id
  and a.member_id = b.member_id
  and a.ctid < b.ctid;

-- 3) 驗證：應回傳 0（沒有任何 expense_id+member_id 重複）
select count(*) as duplicate_split_groups from (
  select expense_id, member_id
  from expense_splits
  group by expense_id, member_id
  having count(*) > 1
) d;
