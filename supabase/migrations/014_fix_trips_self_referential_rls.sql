-- 014　修 013 留下的 bug：trips 的政策不可以繞過 can_access_trip() 查自己
--
-- 症狀：使用者按「出發！」建立行程 → 畫面顯示「儲存中…」→ 什麼都沒發生，行程沒建立。
--       後端 POST /rest/v1/trips 回 403，postgres log 是
--       "new row violates row-level security policy for table trips"。
--
-- 根因：can_access_trip(p_trip_id) 是 STABLE，函式內的 select 看到的是「敘述開始時」的快照。
--       trips 的 SELECT 政策寫成 can_access_trip(id) 之後，
--       `insert into trips ... returning *`（PostgREST 的 .insert().select() 就是這個）
--       在檢查剛插入的那一列時，函式回頭查 trips 看不到它 → false → 整筆被 RLS 擋下。
--
-- 修法：trips 自己的政策直接比對 owner_id，不要繞函式回查自己。
--       其他表不受影響，維持原樣——它們的函式查的是「別張表、且該列早就存在」：
--         expenses／trip_members／settlements → can_access_trip(trip_id)（查 trips）
--         expense_splits                      → can_access_expense(expense_id)（查 expenses）
--         settlement_items                    → can_access_settlement(settlement_id)（查 settlements）
--
-- 已驗證（2026-09-05，Cowork 以 authenticated 身分實跑後 rollback）：
--   insert + returning 通過；owner 仍讀得到 4 趟／404 筆／16 位成員；
--   anon 六張表仍全部 0 列；get_shared_trip 正確 token→74 筆、改一碼→null。
--
-- 回滾：改回 can_access_trip(id) 即可，但那會讓「建立行程」再度壞掉。

alter policy "trips: owner read"   on public.trips using (owner_id = (select auth.uid()));
alter policy "trips: owner update" on public.trips using (owner_id = (select auth.uid()));
alter policy "trips: owner delete" on public.trips using (owner_id = (select auth.uid()));
