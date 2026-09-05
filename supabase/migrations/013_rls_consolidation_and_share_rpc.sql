-- 013 權限收斂成判定函式 ＋ 分享改成後端驗 token
-- 2026-09-05 Cowork 端已套 production 並驗證（驗證數字見 README_013.md）。
-- 語意不變：改動前後「誰看得到什麼」完全相同，只是同一句話從寫 N 遍變成寫 1 遍。

create or replace function public.can_access_trip(p_trip_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (select 1 from public.trips t
                 where t.id = p_trip_id and t.owner_id = (select auth.uid()));
$$;

create or replace function public.can_access_expense(p_expense_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (select 1 from public.expenses e join public.trips t on t.id = e.trip_id
                 where e.id = p_expense_id and t.owner_id = (select auth.uid()));
$$;

create or replace function public.can_access_settlement(p_settlement_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (select 1 from public.settlements s join public.trips t on t.id = s.trip_id
                 where s.id = p_settlement_id and t.owner_id = (select auth.uid()));
$$;

revoke execute on function public.can_access_trip(uuid)       from public;
revoke execute on function public.can_access_expense(uuid)    from public;
revoke execute on function public.can_access_settlement(uuid) from public;
grant  execute on function public.can_access_trip(uuid)       to authenticated;
grant  execute on function public.can_access_expense(uuid)    to authenticated;
grant  execute on function public.can_access_settlement(uuid) to authenticated;

alter policy "trips: owner read"   on public.trips using (public.can_access_trip(id));
alter policy "trips: owner update" on public.trips using (public.can_access_trip(id));
alter policy "trips: owner delete" on public.trips using (public.can_access_trip(id));

alter policy "trip_members: owner read"   on public.trip_members using (public.can_access_trip(trip_id));
alter policy "trip_members: owner update" on public.trip_members using (public.can_access_trip(trip_id));
alter policy "trip_members: owner delete" on public.trip_members using (public.can_access_trip(trip_id));
alter policy "trip_members: owner insert" on public.trip_members with check (public.can_access_trip(trip_id));

alter policy "expenses: owner read"   on public.expenses using (public.can_access_trip(trip_id));
alter policy "expenses: owner update" on public.expenses using (public.can_access_trip(trip_id));
alter policy "expenses: owner delete" on public.expenses using (public.can_access_trip(trip_id));
alter policy "expenses: owner insert" on public.expenses with check (public.can_access_trip(trip_id));

alter policy "expense_splits: owner read"   on public.expense_splits using (public.can_access_expense(expense_id));
alter policy "expense_splits: owner update" on public.expense_splits using (public.can_access_expense(expense_id));
alter policy "expense_splits: owner delete" on public.expense_splits using (public.can_access_expense(expense_id));
alter policy "expense_splits: owner insert" on public.expense_splits with check (public.can_access_expense(expense_id));

alter policy "settlements: owner read"   on public.settlements using (public.can_access_trip(trip_id));
alter policy "settlements: owner update" on public.settlements using (public.can_access_trip(trip_id));
alter policy "settlements: owner delete" on public.settlements using (public.can_access_trip(trip_id));
alter policy "settlements: owner insert" on public.settlements with check (public.can_access_trip(trip_id));

alter policy "settlement_items: owner read"   on public.settlement_items using (public.can_access_settlement(settlement_id));
alter policy "settlement_items: owner update" on public.settlement_items using (public.can_access_settlement(settlement_id));
alter policy "settlement_items: owner delete" on public.settlement_items using (public.can_access_settlement(settlement_id));
alter policy "settlement_items: owner insert" on public.settlement_items with check (public.can_access_settlement(settlement_id));

create or replace function public.get_shared_trip(p_token text)
returns jsonb language sql security definer set search_path = public, pg_temp stable as $$
  with t as (
    select * from public.trips
    where share_token is not null and share_token <> '' and share_token = p_token
    limit 1
  )
  select case when not exists (select 1 from t) then null::jsonb else jsonb_build_object(
    'trip', (select jsonb_build_object(
        'id',t.id,'name',t.name,'currency',t.currency,'start_date',t.start_date,
        'end_date',t.end_date,'status',t.status,'kind',t.kind,
        'settlement_mode',t.settlement_mode,'hub_member_id',t.hub_member_id,
        'tone_seq',t.tone_seq,'payment_methods',t.payment_methods,
        'cash_rate_twd',t.cash_rate_twd,'cash_rate_foreign',t.cash_rate_foreign) from t),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id',m.id,'trip_id',m.trip_id,'name',m.name,'emoji',m.emoji,'sort_order',m.sort_order)
        order by m.sort_order) from public.trip_members m, t where m.trip_id = t.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id,'trip_id',e.trip_id,'payer_member_id',e.payer_member_id,'title',e.title,
        'category_emoji',e.category_emoji,'category_emoji_manual',e.category_emoji_manual,
        'expense_date',e.expense_date,'foreign_amount',e.foreign_amount,'twd_amount',e.twd_amount,
        'exchange_rate',e.exchange_rate,'foreign_pending',e.foreign_pending,'twd_pending',e.twd_pending,
        'payment_method',e.payment_method,'payment_label',e.payment_label,'expense_type',e.expense_type,
        'settled_on_spot',e.settled_on_spot,'is_sponsor',e.is_sponsor,
        'individual_member_id',e.individual_member_id,'split_fill_currency',e.split_fill_currency,
        'created_at',e.created_at) order by e.expense_date, e.created_at)
        from public.expenses e, t where e.trip_id = t.id and e.deleted_at is null), '[]'::jsonb),
    'splits', coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'expense_id',s.expense_id,'member_id',s.member_id,
        'is_participating',s.is_participating,'split_amount',s.split_amount,
        'split_amount_foreign',s.split_amount_foreign,'split_pending',s.split_pending))
        from public.expense_splits s
        join public.expenses e on e.id = s.expense_id, t
        where e.trip_id = t.id and e.deleted_at is null), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(jsonb_build_object(
        'id',st.id,'trip_id',st.trip_id,'status',st.status,'settled_at',st.settled_at))
        from public.settlements st, t where st.trip_id = t.id), '[]'::jsonb),
    'settlement_items', coalesce((select jsonb_agg(jsonb_build_object(
        'id',si.id,'settlement_id',si.settlement_id,'from_member_id',si.from_member_id,
        'to_member_id',si.to_member_id,'amount',si.amount,'is_cleared',si.is_cleared))
        from public.settlement_items si
        join public.settlements st on st.id = si.settlement_id, t
        where st.trip_id = t.id), '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.get_shared_trip(text) from public;
grant  execute on function public.get_shared_trip(text) to anon, authenticated;
