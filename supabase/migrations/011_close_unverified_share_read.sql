-- 011 關閉未驗證 token 的分享讀取
-- 2026-09-05　Rozi 於對話中確認「關」。Cowork 端已套用 production 並驗證。
--
-- 【問題】原本六條 "share read" 政策的條件是 share_token IS NOT NULL，
--   **沒有比對 token 的值**——等於「只要這趟有分享連結，任何人都讀得到」，
--   而不是「拿到那條連結的人才讀得到」。前端 SharePage.tsx:55 有 .eq('share_token', token)，
--   所以畫面上只會出現一趟；但繞過前端直接打資料庫（anon key 本來就在前端 bundle 裡）
--   就能讀到所有已分享行程的全部消費、成員與結算。
--   實測當下：4 趟全部有 token → 404 筆消費、16 位成員全部可被匿名讀取。
--
-- 【處置】先關閉。正確做法（拿 token 跟後端換資料、後端驗 token）隨前端一起上線，
--   屆時以 security definer 的 RPC 取代，不再開放 anon 直接 SELECT 這些表。
--   **在那之前分享頁會讀不到資料，這是預期行為。**
--
-- 【還原點】supabase/backups/rls_policies_2026-09-05_before_refactor.sql（41 條完整備份）
--
-- 【套用後驗證結果】
--   anon：trips 0／expenses 0／trip_members 0／settlements 0／expense_splits 0
--   owner（登入本人）：trips 4／expenses 404／trip_members 16 —— 未受影響

drop policy if exists "trips: share_token read"        on public.trips;
drop policy if exists "expenses: share read"           on public.expenses;
drop policy if exists "expense_splits: share read"     on public.expense_splits;
drop policy if exists "settlements: share read"        on public.settlements;
drop policy if exists "settlement_items: share read"   on public.settlement_items;
drop policy if exists "trip_members: share read"       on public.trip_members;
