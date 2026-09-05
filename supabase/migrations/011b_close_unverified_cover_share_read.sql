-- 011b 關閉未驗證 token 的封面照片分享讀取（與 011 同一個漏洞形態）
-- 2026-09-05　Cowork 端已套 production。
--
-- storage.objects 上的 "covers: share read" 同樣只檢查 share_token IS NOT NULL，
-- 沒有比對 token 的值。條件式另有一個 bug：storage.foldername(t.name) 取的是
-- trips.name 而不是 storage 物件的 name。
-- Phase 1 沒有任何畫面顯示封面照片（首頁卡／行程頁 hero／分享頁 hero 三處都只畫漸層），
-- 直接關閉；Phase 2 封面上傳上線時改由 get_shared_trip() 回傳 signed URL。
-- 原始定義（還原用）：
--   CREATE POLICY "covers: share read" ON storage.objects AS PERMISSIVE FOR SELECT TO public
--   USING (((bucket_id = 'covers'::text) AND (EXISTS ( SELECT 1 FROM trips t
--     WHERE (((t.id)::text = (storage.foldername(t.name))[2])
--       AND (t.share_token IS NOT NULL) AND (t.share_token <> ''::text))))));

drop policy if exists "covers: share read" on storage.objects;
