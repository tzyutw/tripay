-- 018 後台管理儀表板（唯讀）
--
-- 目的：家人說「怪怪的」時，專案擁有者能在 1 分鐘內看出是哪一趟、哪個人、哪一筆。
--
-- ⚠️ 本檔的四條紀律：
--   1. **只新增**：四張新表（admin_users／admin_meta／audit_log／client_error_log）、
--      三個觸發器、一組函式。既有資料表的既有欄位、既有政策**一個都不改**。
--   2. **權限在資料庫端擋**：跨行程資料只能透過 `admin_*` 函式讀，
--      函式第一行就檢查 `is_admin()`，不是管理者直接拋 42501。
--      **不在既有表上加「管理者可讀」政策**——那會讓管理者自己的行程列表
--      冒出所有人的行程（前台查 trips 沒有加 owner 條件，靠的是 RLS）。
--   3. **後台唯讀**：`admin_*` 讀取函式全部宣告 STABLE。Postgres 不允許
--      STABLE 函式執行 INSERT／UPDATE／DELETE，所以就算之後有人改壞函式內容，
--      也寫不進任何資料。
--   4. **紀錄失敗不可以擋住記帳**：觸發器把寫紀錄包在 exception 區塊裡，
--      寫不進去只留 warning，原本的新增／修改／刪除照常完成。
--
-- 回滾方式（不影響任何既有資料）：見檔尾註解。

-- ── 1. 誰是管理者 ────────────────────────────────────────────────────────────
-- 開 RLS 但**不給任何政策**：前台（anon／authenticated）完全讀不到也寫不進，
-- 只能由專案擁有者在 Supabase 後台的 SQL Editor 手動新增一列。
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ── 2. 紀錄從哪一天開始 ──────────────────────────────────────────────────────
-- 一列就好。畫面上的「紀錄從某日開始」讀的就是這個時間（套用 migration 的那一刻）。
create table if not exists public.admin_meta (
  id               smallint primary key default 1 check (id = 1),
  audit_started_at timestamptz not null default now()
);
insert into public.admin_meta (id) values (1) on conflict (id) do nothing;
alter table public.admin_meta enable row level security;
revoke all on public.admin_meta from anon, authenticated;

-- ── 3. 操作紀錄 ──────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,                 -- auth.uid()；Edge Function 用服務金鑰寫入時為 null
  table_name text not null,        -- expenses／expense_splits／trip_members
  op         text not null,        -- INSERT／UPDATE／DELETE
  row_id     uuid,
  trip_id    uuid,                 -- 刻意不設外鍵：行程刪掉之後紀錄還要留著
  expense_id uuid,
  old_row    jsonb,
  new_row    jsonb
);
create index if not exists audit_log_trip_at  on public.audit_log (trip_id, at desc);
create index if not exists audit_log_actor_at on public.audit_log (actor, at desc);
create index if not exists audit_log_at       on public.audit_log (at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
-- 讀取一律走 admin_* 函式，這裡不開任何政策。

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb; v_new jsonb; v_id uuid; v_trip uuid; v_exp uuid;
begin
  begin
    if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
    if tg_op = 'UPDATE' and v_old = v_new then return null; end if;   -- 沒有實際變動不記

    v_id := coalesce(v_new->>'id', v_old->>'id')::uuid;
    if tg_table_name = 'expense_splits' then
      v_exp := coalesce(v_new->>'expense_id', v_old->>'expense_id')::uuid;
      select e.trip_id into v_trip from public.expenses e where e.id = v_exp;
    else
      v_trip := coalesce(v_new->>'trip_id', v_old->>'trip_id')::uuid;
      if tg_table_name = 'expenses' then v_exp := v_id; end if;
    end if;

    insert into public.audit_log (actor, table_name, op, row_id, trip_id, expense_id, old_row, new_row)
    values ((select auth.uid()), tg_table_name, tg_op, v_id, v_trip, v_exp, v_old, v_new);
  exception when others then
    -- 寫紀錄失敗**絕不**擋住原本的動作
    raise warning 'audit_row_change skipped: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.audit_row_change() from public, anon, authenticated;

drop trigger if exists zz_audit_expenses       on public.expenses;
drop trigger if exists zz_audit_expense_splits on public.expense_splits;
drop trigger if exists zz_audit_trip_members   on public.trip_members;
create trigger zz_audit_expenses       after insert or update or delete on public.expenses
  for each row execute function public.audit_row_change();
create trigger zz_audit_expense_splits after insert or update or delete on public.expense_splits
  for each row execute function public.audit_row_change();
create trigger zz_audit_trip_members   after insert or update or delete on public.trip_members
  for each row execute function public.audit_row_change();

-- ── 4. 前台錯誤紀錄 ──────────────────────────────────────────────────────────
create table if not exists public.client_error_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),     -- 伺服器收到的時間
  occurred_at timestamptz,                            -- 手機上發生的時間（離線時兩者會差很多）
  user_id     uuid not null default auth.uid(),
  trip_id     uuid,                                   -- 不設外鍵：寫錯 id 也不能讓記錄失敗
  screen      text check (char_length(screen)  <= 60),
  path        text check (char_length(path)    <= 300),
  kind        text check (kind in ('save', 'sync', 'other')),
  message     text check (char_length(message) <= 2000),
  user_agent  text check (char_length(user_agent) <= 400),
  app_version text check (char_length(app_version) <= 40)
);
create index if not exists client_error_log_at   on public.client_error_log (at desc);
create index if not exists client_error_log_trip on public.client_error_log (trip_id, at desc);
alter table public.client_error_log enable row level security;
revoke all on public.client_error_log from anon, authenticated;
grant insert on public.client_error_log to authenticated;
-- 每個登入的人只能用自己的身分新增，看不到、改不了、刪不掉任何一筆（包括自己的）。
drop policy if exists "client_error_log: self insert" on public.client_error_log;
create policy "client_error_log: self insert" on public.client_error_log
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ── 5. 後台讀取函式（全部 STABLE＝不能寫入）─────────────────────────────────

create or replace function public.admin_check()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin();
$$;

-- 全部行程＋成員＋帳目（含分帳）＋已確認的結算＋帳號。
-- 形狀刻意與前台 PostgREST 查回來的一樣（to_jsonb 整列），
-- 後台才能直接把它餵給前台的 tripSummary／settleTrip，算出一模一樣的結算。
create or replace function public.admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'audit_started_at', (select audit_started_at from public.admin_meta where id = 1),
    'trips', coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object(
        'trip_members', coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order)
                                  from public.trip_members m where m.trip_id = t.id), '[]'::jsonb),
        'last_activity_at', greatest(
          t.updated_at,
          (select max(greatest(e.created_at, e.updated_at)) from public.expenses e where e.trip_id = t.id),
          (select max(m.created_at) from public.trip_members m where m.trip_id = t.id),
          (select max(a.at) from public.audit_log a where a.trip_id = t.id)),
        'deleted_expense_count', (select count(*) from public.expenses e
                                  where e.trip_id = t.id and e.deleted_at is not null),
        'recent_error_count', (select count(*) from public.client_error_log c
                               where c.trip_id = t.id and c.at > now() - interval '7 days'))
      order by t.start_date desc)
      from public.trips t), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(to_jsonb(e) || jsonb_build_object(
        'expense_splits', coalesce((select jsonb_agg(to_jsonb(s)) from public.expense_splits s
                                    where s.expense_id = e.id), '[]'::jsonb))
      order by e.expense_date, e.created_at)
      from public.expenses e where e.deleted_at is null), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(to_jsonb(st) || jsonb_build_object(
        'settlement_items', coalesce((select jsonb_agg(to_jsonb(si)) from public.settlement_items si
                                      where si.settlement_id = st.id), '[]'::jsonb))
      order by st.created_at desc)
      from public.settlements st where st.status = 'confirmed'), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'display_name', coalesce(p.display_name, u.raw_user_meta_data->>'full_name', u.email),
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'last_active_at', greatest(
          u.last_sign_in_at,
          (select max(greatest(ss.updated_at, ss.refreshed_at::timestamptz)) from auth.sessions ss
            where ss.user_id = u.id),
          (select max(a.at) from public.audit_log a where a.actor = u.id),
          (select max(e.created_at) from public.expenses e where e.created_by = u.id),
          (select max(c.at) from public.client_error_log c where c.user_id = u.id)),
        'is_admin', exists (select 1 from public.admin_users au where au.user_id = u.id))
      order by u.created_at)
      from auth.users u left join public.profiles p on p.id = u.id), '[]'::jsonb)
  );
end $$;

-- 操作紀錄。三個篩選都可以不給：p_trip（某一趟）、p_actor（某個人）、p_before（往前翻頁）。
create or replace function public.admin_audit(
  p_trip uuid default null, p_actor uuid default null,
  p_limit int default 200, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
      select a.* from public.audit_log a
      where (p_trip   is null or a.trip_id = p_trip)
        and (p_actor  is null or a.actor   = p_actor)
        and (p_before is null or a.at      < p_before)
      order by a.at desc, a.id desc
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) x), '[]'::jsonb);
end $$;

create or replace function public.admin_errors(
  p_trip uuid default null, p_user uuid default null, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
      select c.* from public.client_error_log c
      where (p_trip is null or c.trip_id = p_trip)
        and (p_user is null or c.user_id = p_user)
      order by c.at desc, c.id desc
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) x), '[]'::jsonb);
end $$;

revoke execute on function public.admin_check()                          from public, anon;
revoke execute on function public.admin_snapshot()                       from public, anon;
revoke execute on function public.admin_audit(uuid, uuid, int, timestamptz) from public, anon;
revoke execute on function public.admin_errors(uuid, uuid, int)          from public, anon;
grant  execute on function public.admin_check()                          to authenticated;
grant  execute on function public.admin_snapshot()                       to authenticated;
grant  execute on function public.admin_audit(uuid, uuid, int, timestamptz) to authenticated;
grant  execute on function public.admin_errors(uuid, uuid, int)          to authenticated;

-- ── 套用後要做的一件事（不放進 migration：repo 裡不寫任何人的 email）──────────
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = '<你的 Google 帳號>';
--
-- ── 回滾（只拆新增的東西，既有資料完全不受影響）──────────────────────────────
--   drop trigger if exists zz_audit_expenses       on public.expenses;
--   drop trigger if exists zz_audit_expense_splits on public.expense_splits;
--   drop trigger if exists zz_audit_trip_members   on public.trip_members;
--   drop function if exists public.admin_errors(uuid, uuid, int);
--   drop function if exists public.admin_audit(uuid, uuid, int, timestamptz);
--   drop function if exists public.admin_snapshot();
--   drop function if exists public.admin_check();
--   drop function if exists public.audit_row_change();
--   drop table if exists public.client_error_log, public.audit_log, public.admin_meta;
--   drop function if exists public.is_admin();
--   drop table if exists public.admin_users;
