-- 007 Phase 2 sprint 1：cards 表 ＋ trips.kind（帳單週期沿用 trips）
--
-- ⚠️ 這是 schema 變更，需 Rozi 拍板後才可套用 production。
--
-- ── 依據 ──────────────────────────────────────────────────────────────────────
-- D1（Rozi 2026-08-30 拍板）：帳單週期**沿用 trips 表**，加 kind 欄位區分，
--   不為帳單另開一套結算與 UI。因此本檔**不建 statements 表**。
-- D2（已落地 006）：people 通訊錄層 → 卡片持有人指向 people。
-- D5：分帳三型沿用，Phase 2 副卡消費預設 personal（前端預設值，不在 schema）。
--
-- ── 設計原則：不動 Phase 1 ────────────────────────────────────────────────────
-- 1. trips.kind 有 default 'trip'，既有四趟自動歸類為旅遊，語意不變。
-- 2. expenses.card_id 早在 001 就是預留欄位（無 FK），本檔只補上 FK，不改其他欄位。
-- 3. 結算引擎、expense_splits、settlement_items 完全不動。

begin;

-- ── 1. cards：主卡／副卡 ─────────────────────────────────────────────────────
create table if not exists cards (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references profiles(id) on delete cascade,
  nickname         text not null,                                  -- 「玉山主卡」「小美的副卡」
  last4            text,                                           -- 卡號末四碼，帳單比對用
  card_issuer      text,                                           -- 發卡行；Phase 3 銀行合作預留
  is_primary       bool not null default false,                    -- 主卡 / 副卡
  parent_card_id   uuid references cards(id) on delete cascade,    -- 副卡指向主卡
  holder_person_id uuid references people(id) on delete set null,  -- 持卡人（D2 的 people 層）
  sort_order       int  not null default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists cards_owner_idx  on cards (owner_id);
create index if not exists cards_parent_idx on cards (parent_card_id);

alter table cards enable row level security;

drop policy if exists "cards: owner read"   on cards;
drop policy if exists "cards: owner insert" on cards;
drop policy if exists "cards: owner update" on cards;
drop policy if exists "cards: owner delete" on cards;

create policy "cards: owner read"   on cards for select using (auth.uid() = owner_id);
create policy "cards: owner insert" on cards for insert with check (auth.uid() = owner_id);
create policy "cards: owner update" on cards for update using (auth.uid() = owner_id);
-- DELETE 政策一次補齊（這坑已咬四次：expense_splits／settlements／expenses／people）
create policy "cards: owner delete" on cards for delete using (auth.uid() = owner_id);

-- ── 2. trips.kind：區分「旅遊」與「帳單週期」（D1）────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'trip_kind') then
    create type trip_kind as enum ('trip', 'statement');
  end if;
end $$;

alter table trips
  add column if not exists kind trip_kind not null default 'trip',
  -- 帳單週期屬於哪張卡（kind='trip' 時為 NULL）
  add column if not exists card_id uuid references cards(id) on delete cascade;

create index if not exists trips_kind_idx    on trips (kind);
create index if not exists trips_card_id_idx on trips (card_id);

-- 資料完整性：statement 必須有卡、trip 不得有卡
alter table trips drop constraint if exists trips_kind_card_chk;
alter table trips add constraint trips_kind_card_chk check (
  (kind = 'statement' and card_id is not null) or
  (kind = 'trip'      and card_id is null)
);

-- ── 3. expenses.card_id 補上 FK（001 就有欄位，一直沒有 FK）──────────────────
alter table expenses drop constraint if exists expenses_card_id_fkey;
alter table expenses
  add constraint expenses_card_id_fkey
  foreign key (card_id) references cards(id) on delete set null;

create index if not exists expenses_card_id_idx on expenses (card_id);

commit;

-- ── 套用後自檢（預期）────────────────────────────────────────────────────────
-- 1) 既有四趟仍是 trip、且沒有 card_id：
--    select kind, count(*), count(card_id) from trips group by kind;
--    -- 預期：trip | 4 | 0
--
-- 2) cards 的四條 RLS 政策都在：
--    select cmd, count(*) from pg_policies where tablename='cards' group by cmd;
--    -- 預期 SELECT/INSERT/UPDATE/DELETE 各 1
--
-- 3) expenses.card_id 的 FK 已建立且為 SET NULL：
--    select conname, confdeltype from pg_constraint where conname='expenses_card_id_fkey';
--    -- 預期 confdeltype = 'n'
--
-- 4) check constraint 生效（以下應失敗）：
--    insert into trips (owner_id,name,emoji,currency,start_date,end_date,status,share_token,kind)
--    values (auth.uid(),'x','💳','TWD','2026-08-01','2026-08-31','planned',gen_random_uuid(),'statement');
--    -- 預期：violates check constraint "trips_kind_card_chk"
