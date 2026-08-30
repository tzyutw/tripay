-- 005 P9：讓「刪除行程／刪除成員」在資料層真的可行且不留孤兒
--
-- ⚠️ 這是 schema 變更，需 Rozi 拍板後才可套用 production。
--
-- ── 背景 ──────────────────────────────────────────────────────────────────────
-- 2026-08-30 刪除 5 筆舊展示行程時連續撞到兩層問題：
--   (1) settlement_items 對 trip_members 的兩條 FK 沒有 ON DELETE 子句（＝NO ACTION）。
--       刪 trip 時 cascade 是「逐條觸發語句」執行、順序不保證：
--       trips→trip_members 那一波先跑完時，trips→settlements→settlement_items
--       這條較深的鏈還沒跑到，於是 NO ACTION 檢查炸出 23503。
--       實測：沒有 settlement 的行程刪得掉；有 settlement 的行程一律刪不掉。
--   (2) settlements 當時沒有 RLS DELETE 政策，想在應用層「先刪 settlements 再刪 trip」
--       也不行——DELETE 被 RLS 靜默過濾成影響 0 列，回 200 不報錯。
--       已由 004 補上該政策，本檔處理其餘部分。
--
-- 與 2026-07-22 Bug #4（expense_splits 缺 DELETE 政策）為同一根因的第二、三次發作。
--
-- ── 本檔做兩件事 ──────────────────────────────────────────────────────────────
-- A. settlement_items 的兩條 member FK 改 ON DELETE CASCADE
-- B. 補齊 expenses 與 settlement_items 的 RLS DELETE 政策（對齊既有 owner 慣例）
--
-- ── 刻意不做 ──────────────────────────────────────────────────────────────────
-- expenses.payer_member_id → trip_members 維持 NO ACTION。
--   理由：改成 CASCADE 會讓「刪一位成員」連帶刪掉他付過的所有消費，語意過重且危險。
--   實測刪 trip 時這條不會擋（expenses 由 trips 直接 cascade，與 trip_members 同一波，
--   NO ACTION 於語句結束時檢查、兩邊都已刪除）。成員層級的保護改在應用層做
--   （TripFormSheet 已擋下「有消費或分帳紀錄的成員」）。

begin;

-- ── A. settlement_items → trip_members 改 CASCADE ────────────────────────────
alter table settlement_items
  drop constraint if exists settlement_items_from_member_id_fkey,
  add  constraint settlement_items_from_member_id_fkey
       foreign key (from_member_id) references trip_members(id) on delete cascade;

alter table settlement_items
  drop constraint if exists settlement_items_to_member_id_fkey,
  add  constraint settlement_items_to_member_id_fkey
       foreign key (to_member_id) references trip_members(id) on delete cascade;

-- ── B. 補齊缺少的 DELETE 政策（寫法對齊同表既有的 read/update 政策）──────────
drop policy if exists "expenses: owner delete" on expenses;
create policy "expenses: owner delete" on expenses
  for delete using (
    exists (select 1 from trips where trips.id = expenses.trip_id and trips.owner_id = auth.uid())
  );

drop policy if exists "settlement_items: owner delete" on settlement_items;
create policy "settlement_items: owner delete" on settlement_items
  for delete using (
    exists (
      select 1 from settlements s
      join trips t on t.id = s.trip_id
      where s.id = settlement_items.settlement_id and t.owner_id = auth.uid()
    )
  );

commit;

-- ── 套用後自檢（預期全部回 0 / true）──────────────────────────────────────────
-- 1) 兩條 FK 應為 CASCADE：
--    select conname, confdeltype from pg_constraint
--    where conname in ('settlement_items_from_member_id_fkey','settlement_items_to_member_id_fkey');
--    -- confdeltype 應為 'c'
--
-- 2) 六張表都該有 DELETE 政策：
--    select tablename, count(*) filter (where cmd = 'DELETE') as del_policies
--    from pg_policies where schemaname = 'public'
--    group by tablename order by tablename;
--    -- trips / trip_members / expenses / expense_splits / settlements / settlement_items 皆 >= 1
