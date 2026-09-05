-- 012 Phase 1 欄位補齊（七項缺口＋色調序號＋四項共編前置＋索引）
-- 2026-09-05 Cowork 端已套 production 並逐欄驗證（12/12 present）。
-- 全部是加欄位／加約束／加索引，可回滾、不影響既有資料。
alter table public.expense_splits add column if not exists split_amount_foreign numeric;
alter table public.expenses add column if not exists split_fill_currency text not null default 'TWD';
do $$ begin alter table public.expenses add constraint expenses_split_fill_currency_check
  check (split_fill_currency in ('TWD','FOR')); exception when duplicate_object then null; end $$;
alter table public.expenses add column if not exists individual_member_id uuid;
do $$ begin alter table public.expenses add constraint expenses_individual_member_id_fkey
  foreign key (individual_member_id) references public.trip_members(id) on delete restrict;
  exception when duplicate_object then null; end $$;
alter table public.trips add column if not exists payment_methods jsonb;
alter table public.expenses add column if not exists payment_label text;
alter table public.trips add column if not exists cash_rate_twd numeric,
  add column if not exists cash_rate_foreign numeric;
alter table public.expenses add column if not exists category_emoji_manual boolean not null default false;
alter table public.trips add column if not exists tone_seq smallint;
do $$ begin alter table public.trips add constraint trips_tone_seq_check
  check (tone_seq is null or (tone_seq >= 0 and tone_seq <= 7)); exception when duplicate_object then null; end $$;
alter table public.trip_members add column if not exists user_id uuid;
do $$ begin alter table public.trip_members add constraint trip_members_trip_user_uniq
  unique (trip_id, user_id); exception when duplicate_object then null; end $$;
alter table public.expenses add column if not exists updated_by uuid;
alter table public.trip_members add column if not exists role text;
do $$ begin alter table public.trip_members add constraint trip_members_role_check
  check (role is null or role in ('editor','viewer')); exception when duplicate_object then null; end $$;
create index if not exists trips_share_token_idx on public.trips (share_token) where share_token is not null;
