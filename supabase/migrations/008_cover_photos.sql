-- 008 打磨輪：行程封面照片（Supabase Storage）
--
-- 狀態：Rozi 2026-08-31 拍板同意套用（含追加的 "covers: share read" 政策）。
--
-- ── 需求（Rozi 2026-08-31）──────────────────────────────────────────────────
-- 1. 封面照片必須能讓使用者「日後在產品內自己更換」，不能只是 repo 靜態檔。
--    （原本要放進 repo 的四張照片經確認為網路來源，已作廢，不放任何非自有照片。）
-- 2. 顯示規則：有上傳照片用照片、沒有則用 destinations.ts 的目的地色調 gradient。
--    上線時四趟一律 NULL → 全部走 gradient，功能完成後由 Rozi 自行上傳。
-- 3. 分享頁（免登入）也要看得到封面 → 追加 share read 政策。
--
-- ── 路徑慣例（本版有調整，見下）────────────────────────────────────────────
--   covers/{owner_id}/{trip_id}/{version}.webp
--
--   原提案是 covers/{owner_id}/{trip_id}.webp，改成多一層 trip 資料夾，理由三個：
--   a) share read 政策需要從路徑取出 trip_id。storage.foldername() 只回「資料夾」
--      陣列，不含檔名；舊慣例的 trip_id 在檔名裡，得 split_part 再 cast uuid，
--      而 policy 內對非 uuid 字串做 cast 會直接拋錯、整條 select 掛掉。
--      改成資料夾後 foldername[2] 就是 trip_id，且只做 text 比對，不 cast、不會拋。
--   b) 檔名帶 version（上傳當下的 epoch ms）＝換照片就換路徑，signed URL 與 CDN
--      不會餵到舊圖；固定檔名才需要煩惱快取。
--   c) 換照片時舊檔路徑仍記在 trips.cover_path，好刪。
--
--   owner_id 擺第一層不變：owner 四條政策只比對第一段就能判權，不必 join trips
--   （trip 被刪後變孤兒檔也還判得動）。
--
-- 前端上傳前先壓成 webp、長邊 1600px、≤200KB，bucket 上限設 512KB 已充裕。

begin;

-- ── 1. bucket ────────────────────────────────────────────────────────────────
-- public = false：不給匿名直接讀，一律走 signed URL。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', false, 524288, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Storage RLS：擁有者只能碰自己那層資料夾 ──────────────────────────────
drop policy if exists "covers: owner read"   on storage.objects;
drop policy if exists "covers: owner insert" on storage.objects;
drop policy if exists "covers: owner update" on storage.objects;
drop policy if exists "covers: owner delete" on storage.objects;
drop policy if exists "covers: share read"   on storage.objects;

create policy "covers: owner read" on storage.objects
  for select using (
    bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "covers: owner insert" on storage.objects
  for insert with check (
    bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "covers: owner update" on storage.objects
  for update using (
    bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text
  );
-- DELETE 政策一次補齊（這坑已咬過：expense_splits／settlements／expenses）
create policy "covers: owner delete" on storage.objects
  for delete using (
    bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 2b. 分享讀取（Rozi 2026-08-31 追加）──────────────────────────────────────
-- 沒有這條，免登入訪客換不到 signed URL、分享頁封面必破圖。
-- 條件寫法刻意與 001 既有的五條 "share read" 完全對齊（trips / trip_members /
-- expenses / expense_splits / settlements / settlement_items 都是
-- 「該 trip 的 share_token 非空即可讀」），封面不比它們寬也不比它們嚴。
create policy "covers: share read" on storage.objects
  for select using (
    bucket_id = 'covers'
    and exists (
      select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[2]
        and t.share_token is not null
        and t.share_token <> ''
    )
  );

-- ── 3. trips 記錄封面路徑 ────────────────────────────────────────────────────
-- NULL＝沒有上傳照片 → 前端 fallback 到 destinationOf() 的目的地色調 gradient。
-- 存的是 bucket 內完整 object name，例：{owner_id}/{trip_id}/1756598400000.webp
alter table trips add column if not exists cover_path text;

commit;

-- ── 實作注意（Rozi 2026-08-31 追加，前端責任，非 SQL）──────────────────────
-- A. 刪行程時要同步刪 Storage 封面檔，避免孤兒檔累積。
--    Storage 檔案不會被 FK cascade 帶走（實體檔在物件儲存，不在 Postgres），
--    所以順序是：先 storage.remove([cover_path]) → 再 delete trip。
--    刪檔失敗不可擋住刪行程（照片留著只是浪費空間，行程刪不掉才是 bug），
--    但要照慣例斷言影響筆數並記 log。
-- B. 換封面時：上傳新 version → 更新 trips.cover_path → 刪舊 path。
--    同樣是「刪舊檔失敗不擋流程」。
-- C. 孤兒檔盤點（人工，需 service role）：
--    列出 storage.objects where bucket_id='covers'，比對 trips.cover_path，
--    不在名單內的即為孤兒。

-- ── 套用後自檢（預期）────────────────────────────────────────────────────────
-- 1) bucket 存在且非公開：
--    select id, public, file_size_limit from storage.buckets where id = 'covers';
--    -- 預期 covers | false | 524288
--
-- 2) 五條政策都在：
--    select policyname, cmd from pg_policies
--    where tablename = 'objects' and policyname like 'covers:%' order by policyname;
--    -- 預期 5 條：owner delete / owner insert / owner read / owner update / share read
--    --（SELECT 兩條是刻意的，permissive 政策取聯集）
--
-- 3) trips 新欄位在，且既有四趟仍為 NULL（用 gradient）：
--    select count(*) filter (where cover_path is null) as gradient_count from trips;
--    -- 預期 4
