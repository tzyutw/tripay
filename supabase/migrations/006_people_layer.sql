-- 006 Phase 2 D2：抽出 people（通訊錄）層
--
-- ⚠️ 這是 schema 變更 ＋ 資料回填，需 Rozi 拍板後才可套用 production。
--
-- ── 為什麼 ────────────────────────────────────────────────────────────────────
-- trip_members 是「行程內的成員」——同一個人在四趟裡是四筆不同的 id。
-- Phase 2 的副卡持有人是「跨週期存在的人」，綁不到任何一趟，需要一層「人」。
-- 另外 G-09「預填上趟成員」目前是複製上一趟的 name/emoji 硬湊的，本來就該有這層。
--
-- ── 設計原則：不動結算 ────────────────────────────────────────────────────────
-- 結算引擎、expense_splits、settlement_items **一律仍以 trip_members.id 運作**。
-- person_id 只是「這位行程成員對應通訊錄裡的誰」的指標，可為 NULL。
-- 因此本 migration 對既有結算數字的影響為零。

begin;

-- ── 1. people：使用者的通訊錄 ────────────────────────────────────────────────
create table if not exists people (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  name       text not null,
  emoji      text not null default '🙂',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 同一位使用者的通訊錄內，name+emoji 不重複（回填的去重依據）
create unique index if not exists people_owner_name_emoji_uniq
  on people (owner_id, name, emoji);

alter table people enable row level security;

drop policy if exists "people: owner read"   on people;
drop policy if exists "people: owner insert" on people;
drop policy if exists "people: owner update" on people;
drop policy if exists "people: owner delete" on people;

create policy "people: owner read"   on people for select using (auth.uid() = owner_id);
create policy "people: owner insert" on people for insert with check (auth.uid() = owner_id);
create policy "people: owner update" on people for update using (auth.uid() = owner_id);
-- DELETE 政策一併補齊：這坑已咬過三次（expense_splits／settlements／expenses）
create policy "people: owner delete" on people for delete using (auth.uid() = owner_id);

-- ── 2. trip_members 掛上 person_id（可為 NULL，不影響結算）─────────────────
alter table trip_members
  add column if not exists person_id uuid references people(id) on delete set null;

create index if not exists trip_members_person_id_idx on trip_members (person_id);

-- ── 3. 回填：依 (行程擁有者, name, emoji) 去重 ───────────────────────────────
-- 冪等：people 有 unique index、on conflict do nothing；person_id 只補 NULL 的列。
insert into people (owner_id, name, emoji)
select distinct t.owner_id, tm.name, tm.emoji
from trip_members tm
join trips t on t.id = tm.trip_id
on conflict (owner_id, name, emoji) do nothing;

update trip_members tm
set person_id = p.id
from trips t, people p
where tm.trip_id = t.id
  and p.owner_id = t.owner_id
  and p.name  = tm.name
  and p.emoji = tm.emoji
  and tm.person_id is null;

commit;

-- ── 套用後自檢（預期）────────────────────────────────────────────────────────
-- 1) 每位行程成員都對到人：
--    select count(*) as unlinked from trip_members where person_id is null;   -- 預期 0
--
-- 2) 去重後的人數：
--    select count(*) from people;                                            -- 預期 5
--
-- 3) 結算未受影響（settlement_items 仍指向 trip_members）：
--    select count(*) from settlement_items si
--    left join trip_members m1 on m1.id = si.from_member_id
--    left join trip_members m2 on m2.id = si.to_member_id
--    where m1.id is null or m2.id is null;                                    -- 預期 0
