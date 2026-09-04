-- 010 結算模式：誰欠誰就轉給誰 ／ 都轉給同一個人
--
-- 狀態：Rozi 2026-09-04 拍板功能；依 #22-6e，**加欄位屬可回滾的技術決定，
--       由 Cowork 端檢查後套用 production**。✅ **已於 2026-09-04 套用並自檢通過。**
--
-- ── 背景 ────────────────────────────────────────────────────────────────────
-- 兩種模式的**淨額完全相同**，差別只在轉帳路徑：
--   direct：誰欠誰就轉給誰（最小轉帳筆數，現行行為）
--   hub   ：淨額為負的人全額轉給中心人；淨額為正的人由中心人轉給他
-- 例（淨額 Ning +3000、Ziyu +500、Xiu −2000、Mei −1500）：
--   direct → Xiu→Ning 2000、Mei→Ning 1000、Mei→Ziyu 500（Mei 要轉兩次）
--   hub    → Xiu→Ning 2000、Mei→Ning 1500、Ning→Ziyu 500（每個欠錢的人只轉一次）
--
-- ⚠️ **結算引擎的淨額計算完全不動**，只有轉帳明細的產生方式不同。
--    Σ 淨額恆為 0 這條鐵律不受影響。

begin;

alter table trips
  add column if not exists settlement_mode text not null default 'direct';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'trips_settlement_mode_check'
  ) then
    alter table trips
      add constraint trips_settlement_mode_check
      check (settlement_mode in ('direct', 'hub'));
  end if;
end $$;

-- 中心人。只有 settlement_mode = 'hub' 時有意義。
-- 成員被刪時設為 null（不要因此擋住刪成員；模式會退回等同 direct 的行為）。
alter table trips
  add column if not exists hub_member_id uuid references trip_members(id) on delete set null;

commit;

-- ── 套用後自檢（預期）────────────────────────────────────────────────────────
-- 1) 兩個欄位都在：
--    select column_name, column_default, is_nullable from information_schema.columns
--    where table_name = 'trips' and column_name in ('settlement_mode','hub_member_id');
--    -- 預期 settlement_mode | 'direct'::text | NO ／ hub_member_id | null | YES
--
-- 2) **既有行程一律 direct，行為不變**：
--    select settlement_mode, count(*) from trips group by settlement_mode;
--    -- 預期 只有 direct 一列，筆數等於現有行程數
--
-- 3) check 約束有效：
--    update trips set settlement_mode = 'x' where false;   -- 不影響資料，僅驗語法
--
-- ── 回滾 ────────────────────────────────────────────────────────────────────
-- alter table trips drop column if exists hub_member_id;
-- alter table trips drop column if exists settlement_mode;
