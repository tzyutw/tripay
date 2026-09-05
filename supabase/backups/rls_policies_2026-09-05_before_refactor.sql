-- Tripay production RLS 政策完整備份
-- 匯出時間：2026-09-05，來源：production（ykdlfdlnmoaxwbywikwe）
-- 用途：RLS 收斂重構之前的還原點。要還原：先 DROP 現有政策，再整份執行本檔。
-- 共 42 條（不是先前文件寫的 22 條）。
--
-- ⚠️ 本檔忠實記錄「改之前」的狀態，其中包含一個已查出的漏洞：
--    六條「share read」政策只檢查 share_token IS NOT NULL，**沒有比對 token 的值**。
--    等於「只要這趟有分享連結，任何人都讀得到」，不是「拿到連結的人才讀得到」。
--    還原時請一併評估是否要連漏洞一起還原。

CREATE POLICY "cards: owner delete" ON public.cards AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_id));
CREATE POLICY "cards: owner insert" ON public.cards AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "cards: owner read" ON public.cards AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_id));
CREATE POLICY "cards: owner update" ON public.cards AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_id));
CREATE POLICY "expense_splits: owner delete" ON public.expense_splits AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1 FROM (expenses e JOIN trips t ON ((t.id = e.trip_id))) WHERE ((e.id = expense_splits.expense_id) AND (t.owner_id = auth.uid())))));
CREATE POLICY "expense_splits: owner insert" ON public.expense_splits AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1 FROM (expenses e JOIN trips t ON ((t.id = e.trip_id))) WHERE ((e.id = expense_splits.expense_id) AND (t.owner_id = auth.uid())))));
CREATE POLICY "expense_splits: owner read" ON public.expense_splits AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM (expenses e JOIN trips t ON ((t.id = e.trip_id))) WHERE ((e.id = expense_splits.expense_id) AND (t.owner_id = auth.uid())))));
CREATE POLICY "expense_splits: owner update" ON public.expense_splits AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1 FROM (expenses e JOIN trips t ON ((t.id = e.trip_id))) WHERE ((e.id = expense_splits.expense_id) AND (t.owner_id = auth.uid())))));
CREATE POLICY "expense_splits: share read" ON public.expense_splits AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM (expenses e JOIN trips t ON ((t.id = e.trip_id))) WHERE ((e.id = expense_splits.expense_id) AND (t.share_token IS NOT NULL)))));
CREATE POLICY "expenses: owner delete" ON public.expenses AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = expenses.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "expenses: owner insert" ON public.expenses AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = expenses.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "expenses: owner read" ON public.expenses AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = expenses.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "expenses: owner update" ON public.expenses AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = expenses.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "expenses: share read" ON public.expenses AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = expenses.trip_id) AND (trips.share_token IS NOT NULL)))));
CREATE POLICY "people: owner delete" ON public.people AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_id));
CREATE POLICY "people: owner insert" ON public.people AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "people: owner read" ON public.people AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_id));
CREATE POLICY "people: owner update" ON public.people AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_id));
CREATE POLICY "profiles: owner insert" ON public.profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY "profiles: owner read" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY "profiles: owner update" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY "settlement_items: owner delete" ON public.settlement_items AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1 FROM (settlements s JOIN trips t ON ((t.id = s.trip_id))) WHERE ((s.id = settlement_items.settlement_id) AND (t.owner_id = auth.uid())))));
CREATE POLICY "settlement_items: owner insert" ON public.settlement_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1 FROM (settlements s JOIN trips t ON ((t.id = s.trip_id))) WHERE ((s.id = settlement_items.settlement_id) AND (t.owner_id = auth.uid())))));
CREATE POLICY "settlement_items: owner read" ON public.settlement_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM (settlements s JOIN trips t ON ((t.id = s.trip_id))) WHERE ((s.id = settlement_items.settlement_id) AND (t.owner_id = auth.uid())))));
CREATE POLICY "settlement_items: owner update" ON public.settlement_items AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1 FROM (settlements s JOIN trips t ON ((t.id = s.trip_id))) WHERE ((s.id = settlement_items.settlement_id) AND (t.owner_id = auth.uid())))));
CREATE POLICY "settlement_items: share read" ON public.settlement_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM (settlements s JOIN trips t ON ((t.id = s.trip_id))) WHERE ((s.id = settlement_items.settlement_id) AND (t.share_token IS NOT NULL)))));
CREATE POLICY "settlements: owner delete" ON public.settlements AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = settlements.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "settlements: owner insert" ON public.settlements AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = settlements.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "settlements: owner read" ON public.settlements AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = settlements.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "settlements: owner update" ON public.settlements AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = settlements.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "settlements: share read" ON public.settlements AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = settlements.trip_id) AND (trips.share_token IS NOT NULL)))));
CREATE POLICY "trip_members: owner delete" ON public.trip_members AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = trip_members.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "trip_members: owner insert" ON public.trip_members AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = trip_members.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "trip_members: owner read" ON public.trip_members AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = trip_members.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "trip_members: owner update" ON public.trip_members AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = trip_members.trip_id) AND (trips.owner_id = auth.uid())))));
CREATE POLICY "trip_members: share read" ON public.trip_members AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = trip_members.trip_id) AND (trips.share_token IS NOT NULL)))));
CREATE POLICY "trips: owner delete" ON public.trips AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_id));
CREATE POLICY "trips: owner insert" ON public.trips AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "trips: owner read" ON public.trips AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_id));
CREATE POLICY "trips: owner update" ON public.trips AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_id));
CREATE POLICY "trips: share_token read" ON public.trips AS PERMISSIVE FOR SELECT TO public USING (((share_token IS NOT NULL) AND (share_token <> ''::text)));
