-- 015　expenses.twd_from_rate：「這個台幣金額是系統用行程匯率算出來的」
--
-- 為什麼需要它（實作-Q-1d）：
-- 目前的設計是「存檔當下就把外幣換算成台幣寫進 twd_amount，之後不追溯」。
-- 匯率的方向判定改掉之後（Q-1b），已經算錯的那些金額**不會自己變對**——
-- 例如 production 的行程「2155測試 實作OP」，308500 日圓被存成 1,469,048 台幣
-- （正確 64,785），而且 twd_pending=false，看起來是個確定的數字。
--
-- 要重算就必須先分得出「哪些台幣是系統算的、哪些是使用者自己打的」。
-- **不要用 exchange_rate 有沒有值來猜**——手打台幣時它也會被寫入。
--
-- 可回滾：欄位加錯就 drop，既有資料不受影響（rollback 語句在檔尾，已註解）。

alter table expenses
  add column if not exists twd_from_rate boolean not null default false;

comment on column expenses.twd_from_rate is
  '這筆的 twd_amount 是系統用行程匯率換算出來的（true）還是使用者自己輸入的（false）。
   改匯率時只有 true 的會被重算。';

-- ── 既有資料的一次性標記 ────────────────────────────────────────────────
-- 判準：現在的台幣金額**正好等於**用該行程匯率算出來的值 → 判定為系統算的。
-- 差值放寬到 1 是因為存檔時走的是 round()。
-- 使用者剛好手打出一模一樣的數字時會被誤標，但那種情形重算的結果也相同，無害。
update expenses e
   set twd_from_rate = true
  from trips t
 where t.id = e.trip_id
   and e.deleted_at is null
   and e.foreign_amount is not null
   and e.twd_amount is not null
   and t.cash_rate_twd is not null
   and t.cash_rate_foreign is not null
   and t.cash_rate_twd > 0
   and abs(e.twd_amount - round(e.foreign_amount / (t.cash_rate_foreign / t.cash_rate_twd))) < 1;

-- ⚠️ 這個 migration **只加欄位與標記**，不重算任何金額。
--    重算由 App 在使用者按下「儲存匯率」時走正常寫入路徑做
--    （決策：不寫批次腳本去改 Rozi 現有的資料）。

-- rollback：
-- alter table expenses drop column twd_from_rate;
