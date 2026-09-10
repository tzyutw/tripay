-- 017　SECURITY DEFINER 的 search_path
--
-- 🔴 由來（2026-09-10 中午，新使用者完全註冊不了：`Database error saving new user`）
--
-- `public.handle_new_user()` 是 SECURITY DEFINER 但**沒設 search_path**，
-- 執行時沿用**呼叫者**的設定。呼叫者是 GoTrue 的 `supabase_auth_admin`，
-- 它的 role 設定是 `search_path=auth`（**沒有 public**），
-- 而函式裡寫的是無前綴的 `insert into profiles ...`
--   → `relation "profiles" does not exist` → trigger 失敗 → 註冊失敗。
--
-- ⚠️ 這一段 Cowork 2026-09-10 已經直接對 production 套用過
--    （`apply_migration`，名稱 `fix_handle_new_user_search_path`），
--    因為當下新使用者完全註冊不了。**這個檔是把 repo 補回與 production 一致**，
--    不要再對 production 跑一次。
--
-- 終端機覆核意見（實作-補-1）：
--   1. `set search_path = public, auth` ✅ 正確。函式同時要碰 `public.profiles`
--      與 trigger 傳進來的 `auth.users` 那一列（`new`），兩個 schema 都要在。
--   2. **同時把 schema 寫進 SQL 本體**（`insert into public.profiles`）✅ 更好。
--      search_path 是「找不到時的退路」，寫死前綴才是「不依賴呼叫者環境」。
--      兩道都做，比只做一道穩。
--   3. `on conflict (id) do nothing` ✅ 保留原本的冪等性，重試不會炸。
--   4. 沒有加 `pg_temp`：這個函式與 `auth` schema 有關，
--      與其他四個（`public, pg_temp`）不同是**刻意的**，不是漏寫。

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, auth
as $function$
begin
  insert into public.profiles (id, google_sub, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'sub',
          new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$function$;


-- ── 同一個地雷的第二處：`confirm_settlement` ──────────────────────────────
--
-- 盤點 public schema 的 6 個 SECURITY DEFINER 函式（2026-09-10 對 production 實查）：
--   can_access_expense     search_path=public, pg_temp   ✅
--   can_access_settlement  search_path=public, pg_temp   ✅
--   can_access_trip        search_path=public, pg_temp   ✅
--   get_shared_trip        search_path=public, pg_temp   ✅
--   handle_new_user        search_path=public, auth      ✅（上面剛補的）
--   confirm_settlement     **沒設**                       ❌ ← 這一段要補
--
-- 它現在沒壞：前端以 `authenticated` 呼叫，那條路的 search_path 含 public。
-- 但寫法與出事的那個一模一樣，而且它炸的是**結算**。
--
-- ⚠️ **函式主體一個字都沒改**，只加 `SET search_path`。
--    主體逐字取自 production 的 `pg_get_functiondef()`（改前改後的 diff 見 `_停點.md`）。

CREATE OR REPLACE FUNCTION public.confirm_settlement(p_settlement_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_trip_id uuid;
BEGIN
  SELECT s.trip_id INTO v_trip_id
  FROM settlements s
  JOIN trips t ON t.id = s.trip_id
  WHERE s.id = p_settlement_id
    AND s.status = 'draft'
    AND t.owner_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_not_found_or_unauthorized';
  END IF;

  IF EXISTS (
    SELECT 1 FROM settlements
    WHERE trip_id = v_trip_id
      AND status = 'draft'
      AND id != p_settlement_id
      AND created_at > (SELECT created_at FROM settlements WHERE id = p_settlement_id)
  ) THEN
    RAISE EXCEPTION 'settlement_superseded';
  END IF;

  UPDATE settlements SET status = 'confirmed', settled_at = now()
  WHERE id = p_settlement_id;

  UPDATE trips SET status = 'settled', updated_at = now()
  WHERE id = v_trip_id;
END;
$function$;
