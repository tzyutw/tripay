-- 008 打磨輪：行程封面照片（Supabase Storage）
--
-- ⚠️ 這是 schema 層變更（Storage bucket ＋ RLS 政策 ＋ trips 新欄位），
--    需 Rozi 拍板後才可套用 production。
--
-- ── 需求（Rozi 2026-08-31）──────────────────────────────────────────────────
-- 封面照片必須能讓使用者「日後在產品內自己更換」，不能只是 repo 靜態檔。
-- 顯示規則：有上傳照片用照片、沒有則用 destinations.ts 的目的地色調 gradient。
--
-- ── 設計 ──────────────────────────────────────────────────────────────────────
-- 路徑慣例：covers/{owner_id}/{trip_id}.webp
--   把 owner_id 放在第一層，RLS 只要比對 path 的第一段就能判斷擁有者，
--   不必每次 join trips（也避免刪 trip 後成為孤兒檔時無法判權）。
-- 前端上傳前先壓成 webp、長邊 1600px、≤200KB，所以 bucket 限制設 512KB 已充裕。

begin;

-- ── 1. bucket ────────────────────────────────────────────────────────────────
-- public = false：不給匿名直接讀，一律走 signed URL。
-- 分享頁（免登入）也用 signed URL，由前端在載入分享資料時一併換取。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', false, 524288, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Storage RLS：只能碰自己那層資料夾 ────────────────────────────────────
drop policy if exists "covers: owner read"   on storage.objects;
drop policy if exists "covers: owner insert" on storage.objects;
drop policy if exists "covers: owner update" on storage.objects;
drop policy if exists "covers: owner delete" on storage.objects;

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
-- DELETE 政策一次補齊（這坑已咬五次：expense_splits／settlements／expenses／people／cards）
create policy "covers: owner delete" on storage.objects
  for delete using (
    bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3. trips 記錄封面路徑 ────────────────────────────────────────────────────
-- NULL＝沒有上傳照片 → 前端 fallback 到 destinationOf() 的目的地色調 gradient。
alter table trips add column if not exists cover_path text;

commit;

-- ── 套用後自檢（預期）────────────────────────────────────────────────────────
-- 1) bucket 存在且非公開：
--    select id, public, file_size_limit from storage.buckets where id = 'covers';
--    -- 預期 covers | false | 524288
--
-- 2) 四條政策都在：
--    select cmd, count(*) from pg_policies
--    where tablename = 'objects' and policyname like 'covers:%' group by cmd;
--    -- 預期 SELECT/INSERT/UPDATE/DELETE 各 1
--
-- 3) 既有四趟仍為 NULL（用 gradient）：
--    select count(*) from trips where cover_path is null;   -- 預期 4
