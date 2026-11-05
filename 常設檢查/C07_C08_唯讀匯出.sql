-- 常設 C7／C8 的正式資料匯出（**唯讀**：整支只有一個 SELECT，沒有任何寫入）
--
-- 用法：在 Supabase MCP `execute_sql` 或 SQL editor 跑這一支，
--       把回傳的 `snapshot` 欄位（一段 JSON）存成檔案，然後
--         C78_SNAPSHOT=<檔案路徑> node 常設檢查/run-all.cjs
--
-- 為什麼是精簡格式：
--   ① 不帶任何成員名字、email、備註——快照只放「算帳需要的數字」，不怕外流
--   ② 成員 id 換成「這趟裡的順位」（依 sort_order），腳本端再還原成 m0、m1…
--   ③ 只取 deleted_at is null 的消費——跟 S-03／S-05 前端查詢的條件一模一樣
--
-- 每筆消費的陣列欄位順序（腳本 C07_C08_帳務守恆.mjs 依這個順序解）：
--   [ expense_type, payer 順位, individual_member 順位, foreign_amount, twd_amount,
--     split_fill_currency, settled_on_spot, is_sponsor,
--     [[member 順位, is_participating, split_amount, split_amount_foreign], …] ]
with mem as (
  select m.id, m.trip_id,
         (row_number() over (partition by m.trip_id order by m.sort_order, m.created_at) - 1)::int as ix
  from trip_members m
)
select json_build_object(
  'exported_at', now(),
  'trips', (
    select json_agg(json_build_object(
      'id', t.id, 'name', t.name, 'status', t.status,
      'mode', t.settlement_mode,
      'hub', (select ix from mem where mem.id = t.hub_member_id),
      'rt', t.cash_rate_twd, 'rf', t.cash_rate_foreign,
      'n_members', (select count(*) from mem where mem.trip_id = t.id),
      'e', coalesce((
        select json_agg(json_build_array(
          e.expense_type,
          (select ix from mem where mem.id = e.payer_member_id),
          (select ix from mem where mem.id = e.individual_member_id),
          e.foreign_amount, e.twd_amount, e.split_fill_currency,
          e.settled_on_spot, e.is_sponsor,
          coalesce((select json_agg(json_build_array(
                      (select ix from mem where mem.id = s.member_id),
                      s.is_participating, s.split_amount, s.split_amount_foreign)
                      order by s.created_at)
                    from expense_splits s where s.expense_id = e.id), '[]'::json)
        ) order by e.expense_date, e.created_at)
        from expenses e where e.trip_id = t.id and e.deleted_at is null), '[]'::json)
    ) order by t.created_at)
    from trips t
  )
) as snapshot;
