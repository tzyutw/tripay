-- 018 後台的資料庫端實跑測試。
-- 用法（本機）：先依序套 001～018，再 `psql -v ON_ERROR_STOP=1 -f 本檔`。
-- 也可以整段包在 begin … rollback 對線上跑（本檔最後就是 rollback，不會留下任何資料）。
-- 每一條斷言失敗都會 raise exception 讓整支停下來；全部通過最後印出 ALL-PASS。
-- 測試資料一律 ZZ 前綴，id 全部在本檔明列（刪除護欄第 1、2 條）。
\set ON_ERROR_STOP 1
begin;

-- 兩個測試帳號：A＝管理者、B＝家人。線上跑時 auth.users 已有真帳號，這裡用固定的假 id。
insert into auth.users (id, email, last_sign_in_at) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'zz-admin@example.test', now() - interval '1 hour'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'zz-family@example.test', now() - interval '2 hours')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'ZZ管理者'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'ZZ家人')
on conflict do nothing;

create temp table _ok(name text);
grant all on _ok to authenticated, anon;

-- ── 1. 家人（非管理者）的身分 ────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 1a 家人照常記帳：建行程、加成員、記一筆、改一筆、刪一筆（前台的寫法，分次呼叫，含 returning）
insert into public.trips (id, owner_id, name, currency, start_date, end_date)
values ('cccccccc-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-00000000000b',
        'ZZ測試行程', 'JPY', '2026-11-01', '2026-11-05') returning id;
insert into public.trip_members (id, trip_id, name, sort_order) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', 'ZZ甲', 0),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-00000000000c', 'ZZ乙', 1)
returning id;
insert into public.expenses (id, trip_id, payer_member_id, created_by, title, expense_date,
                             twd_amount, payment_method, expense_type)
values ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c',
        'dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b',
        'ZZ拉麵', '2026-11-02', 1000, 'cash', 'shared') returning id;
insert into public.expense_splits (expense_id, member_id, is_participating) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', true),
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', true);
update public.expenses set twd_amount = 1200 where id = 'eeeeeeee-0000-0000-0000-000000000001';
update public.expenses set deleted_at = now() where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- 1b 家人讀不到後台資料
do $$ begin
  begin perform public.admin_snapshot(); raise exception 'FAIL 1b: 家人呼叫 admin_snapshot 竟然成功';
  exception when insufficient_privilege then insert into _ok values ('1b 家人不能讀 admin_snapshot'); end;
  begin perform public.admin_audit(); raise exception 'FAIL 1b: admin_audit';
  exception when insufficient_privilege then insert into _ok values ('1b 家人不能讀 admin_audit'); end;
  begin perform public.admin_errors(); raise exception 'FAIL 1b: admin_errors';
  exception when insufficient_privilege then insert into _ok values ('1b 家人不能讀 admin_errors'); end;
  if public.admin_check() then raise exception 'FAIL 1b: admin_check 對家人回 true'; end if;
  insert into _ok values ('1b admin_check 對家人回 false');
end $$;

-- 1c 家人直接查紀錄表也不行
do $$ begin
  begin perform 1 from public.audit_log; raise exception 'FAIL 1c: 家人讀得到 audit_log';
  exception when insufficient_privilege then insert into _ok values ('1c 家人讀不到 audit_log'); end;
  begin perform 1 from public.client_error_log; raise exception 'FAIL 1c: 家人讀得到 client_error_log';
  exception when insufficient_privilege then insert into _ok values ('1c 家人讀不到 client_error_log'); end;
  begin perform 1 from public.admin_users; raise exception 'FAIL 1c: 家人讀得到 admin_users';
  exception when insufficient_privilege then insert into _ok values ('1c 家人讀不到 admin_users'); end;
  begin insert into public.admin_users values ('bbbbbbbb-0000-0000-0000-00000000000b');
        raise exception 'FAIL 1c: 家人可以把自己加成管理者';
  exception when insufficient_privilege then insert into _ok values ('1c 家人不能把自己加成管理者'); end;
  begin insert into public.audit_log (table_name, op) values ('expenses', 'DELETE');
        raise exception 'FAIL 1c: 家人可以偽造操作紀錄';
  exception when insufficient_privilege then insert into _ok values ('1c 家人不能偽造操作紀錄'); end;
end $$;

-- 1d 家人可以寫錯誤紀錄（只能用自己的身分），但改不了、刪不掉
insert into public.client_error_log (trip_id, screen, path, kind, message)
values ('cccccccc-0000-0000-0000-00000000000c', '記帳頁', '/trips/x', 'save', 'ZZ 測試錯誤');
do $$ begin
  insert into _ok values ('1d 家人可以寫一筆錯誤紀錄');
  begin insert into public.client_error_log (user_id, kind, message)
        values ('aaaaaaaa-0000-0000-0000-00000000000a', 'save', 'ZZ 冒名');
        raise exception 'FAIL 1d: 家人可以冒用別人名義寫錯誤紀錄';
  exception when insufficient_privilege then insert into _ok values ('1d 不能冒用別人名義'); end;
  begin update public.client_error_log set message = 'x'; raise exception 'FAIL 1d: 可以改';
  exception when insufficient_privilege then insert into _ok values ('1d 錯誤紀錄改不了'); end;
  begin delete from public.client_error_log; raise exception 'FAIL 1d: 可以刪';
  exception when insufficient_privilege then insert into _ok values ('1d 錯誤紀錄刪不掉'); end;
end $$;

-- ── 2. 未登入（anon）────────────────────────────────────────────────────────
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  begin perform public.admin_snapshot(); raise exception 'FAIL 2: anon 能呼叫 admin_snapshot';
  exception when insufficient_privilege then insert into _ok values ('2 未登入不能呼叫 admin_snapshot'); end;
  begin perform public.admin_check(); raise exception 'FAIL 2: anon 能呼叫 admin_check';
  exception when insufficient_privilege then insert into _ok values ('2 未登入不能呼叫 admin_check'); end;
  begin insert into public.client_error_log (kind, message) values ('save', 'x');
        raise exception 'FAIL 2: anon 能寫錯誤紀錄';
  exception when insufficient_privilege or not_null_violation then insert into _ok values ('2 未登入不能寫錯誤紀錄'); end;
end $$;

-- ── 3. 管理者 ──────────────────────────────────────────────────────────────
reset role;
-- 3a 還沒登記成管理者之前，A 跟家人一樣讀不到
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ begin
  begin perform public.admin_snapshot(); raise exception 'FAIL 3a: 未登記就讀得到';
  exception when insufficient_privilege then insert into _ok values ('3a 未登記的帳號讀不到'); end;
end $$;
reset role;
insert into public.admin_users (user_id) values ('aaaaaaaa-0000-0000-0000-00000000000a') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare snap jsonb; aud jsonb; err jsonb; n int;
begin
  if not public.admin_check() then raise exception 'FAIL 3b: admin_check 對管理者回 false'; end if;
  insert into _ok values ('3b admin_check 對管理者回 true');

  snap := public.admin_snapshot();
  if not exists (select 1 from jsonb_array_elements(snap->'trips') t
                 where t->>'id' = 'cccccccc-0000-0000-0000-00000000000c')
    then raise exception 'FAIL 3c: 快照裡沒有家人的行程'; end if;
  if (select (t->>'deleted_expense_count')::int from jsonb_array_elements(snap->'trips') t
       where t->>'id' = 'cccccccc-0000-0000-0000-00000000000c') <> 1
    then raise exception 'FAIL 3c: 刪除筆數不對'; end if;
  if exists (select 1 from jsonb_array_elements(snap->'expenses') e
             where e->>'id' = 'eeeeeeee-0000-0000-0000-000000000001')
    then raise exception 'FAIL 3c: 已刪除的帳目不該出現在快照（前台也看不到）'; end if;
  if snap->>'audit_started_at' is null then raise exception 'FAIL 3c: 沒有紀錄起始日'; end if;
  insert into _ok values ('3c 快照看得到家人的行程、刪除筆數、紀錄起始日');

  -- 3d 管理者自己的前台查詢**不受影響**：直接查 trips 仍只看得到自己的
  select count(*) into n from public.trips where id = 'cccccccc-0000-0000-0000-00000000000c';
  if n <> 0 then raise exception 'FAIL 3d: 管理者的前台行程列表會看到家人的行程'; end if;
  insert into _ok values ('3d 管理者自己的行程列表不會冒出家人的行程');

  -- 3e 操作紀錄：誰、做了什麼、改前改後
  aud := public.admin_audit('cccccccc-0000-0000-0000-00000000000c');
  select count(*) into n from jsonb_array_elements(aud) a
   where a->>'actor' = 'bbbbbbbb-0000-0000-0000-00000000000b';
  -- 2 成員 INSERT ＋ 1 帳目 INSERT ＋ 2 分帳 INSERT ＋ 2 帳目 UPDATE（改金額、軟刪除）＝ 7
  if n <> 7 then raise exception 'FAIL 3e: 預期 7 筆操作紀錄，實際 %', n; end if;
  if not exists (select 1 from jsonb_array_elements(aud) a
                 where a->>'op' = 'UPDATE' and a->'old_row'->>'twd_amount' = '1000'
                   and a->'new_row'->>'twd_amount' = '1200')
    then raise exception 'FAIL 3e: 沒記到改前改後'; end if;
  if not exists (select 1 from jsonb_array_elements(aud) a
                 where a->>'table_name' = 'expense_splits'
                   and a->>'trip_id' = 'cccccccc-0000-0000-0000-00000000000c')
    then raise exception 'FAIL 3e: 分帳列沒對到行程'; end if;
  insert into _ok values ('3e 操作紀錄記到 7 筆、改前改後、分帳對到行程');

  aud := public.admin_audit(null, 'bbbbbbbb-0000-0000-0000-00000000000b', 20);
  if jsonb_array_length(aud) <> 7 then raise exception 'FAIL 3f: 依人查不對'; end if;
  insert into _ok values ('3f 依人查得到同一批紀錄');

  err := public.admin_errors();
  if not exists (select 1 from jsonb_array_elements(err) x
                 where x->>'user_id' = 'bbbbbbbb-0000-0000-0000-00000000000b' and x->>'screen' = '記帳頁')
    then raise exception 'FAIL 3g: 錯誤紀錄看不到'; end if;
  insert into _ok values ('3g 管理者看得到家人的錯誤紀錄（時間、誰、行程、畫面、訊息）');

  if (select (u->>'last_active_at') is null from jsonb_array_elements(snap->'users') u
        where u->>'id' = 'bbbbbbbb-0000-0000-0000-00000000000b')
    then raise exception 'FAIL 3h: 沒有最後使用時間'; end if;
  insert into _ok values ('3h 帳號有最後使用時間');
end $$;

-- 3i 後台函式寫不進資料：STABLE 函式裡的寫入會被 Postgres 擋下
reset role;
create function pg_temp.zz_try_write() returns void language plpgsql stable as $$
begin insert into public.admin_meta (id) values (1) on conflict do nothing; end $$;
do $$ begin
  begin perform pg_temp.zz_try_write(); raise exception 'FAIL 3i: STABLE 函式竟然能寫';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    insert into _ok values ('3i STABLE 函式不能寫入（後台函式全部是 STABLE）');
  end;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname like 'admin\_%' and p.provolatile <> 's')
    then raise exception 'FAIL 3i: 有 admin_ 函式不是 STABLE'; end if;
  insert into _ok values ('3i 所有 admin_ 函式都是 STABLE');
end $$;

-- ── 4. 紀錄寫不進去時，記帳照常完成 ─────────────────────────────────────────
-- 模擬紀錄表壞掉（改名），家人照樣能記一筆。
alter table public.audit_log rename to audit_log_zz_broken;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}';
set local client_min_messages = error;   -- 不印那條預期中的 warning
insert into public.expenses (id, trip_id, payer_member_id, created_by, title, expense_date,
                             twd_amount, payment_method, expense_type)
values ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-00000000000c',
        'dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b',
        'ZZ紀錄壞掉時記的', '2026-11-03', 500, 'cash', 'shared') returning id;
reset role;
do $$ begin
  if not exists (select 1 from public.expenses where id = 'eeeeeeee-0000-0000-0000-000000000002')
    then raise exception 'FAIL 4: 紀錄壞掉時記帳失敗'; end if;
  insert into _ok values ('4 紀錄表壞掉時，記帳照常成功');
end $$;
alter table public.audit_log_zz_broken rename to audit_log;

select name as "通過" from _ok order by name;
select 'ALL-PASS ' || count(*) || ' 條' from _ok;
rollback;
