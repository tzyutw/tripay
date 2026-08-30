-- Tripay Hotfix 2026-07-22
-- 問題：登入者在 profiles 表沒有資料列，導致建立行程失敗（trips_owner_id_fkey / 23503）
-- 根因：handle_new_user 觸發器未在 production 生效，新註冊者不會自動建立 profile
-- 在 Supabase Dashboard → SQL Editor 執行本檔

-- 1) 補建所有缺失的 profiles（修好現有帳號，含 Rozi）
insert into profiles (id, google_sub, display_name, avatar_url)
select u.id,
       u.raw_user_meta_data->>'sub',
       u.raw_user_meta_data->>'full_name',
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
left join profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 2) 重建觸發器（之後註冊的人自動建立 profile）
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, google_sub, display_name, avatar_url)
  values (new.id,
          new.raw_user_meta_data->>'sub',
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 3) 驗證：應回傳 0（沒有任何 auth.users 缺 profile）
select count(*) as missing_profiles
from auth.users u
left join profiles p on p.id = u.id
where p.id is null;
