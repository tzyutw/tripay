-- 009 成員識別：trip_members.emoji 預設改空字串
--
-- 狀態：Rozi 2026-08-31 已核可（指令佇列 #8-C-4）。✅ **已於 2026-09-04 由 Cowork 端套用 production**（自檢通過）。
--
-- ── 背景 ────────────────────────────────────────────────────────────────────
-- Emoji 選擇器（EmojiPicker）整個移除，成員識別改為三層 fallback：
--   ① 有 emoji → 顯示 emoji
--   ② 無 emoji → 名字第一個 grapheme，放在填色圓底
--   ③ 名字也空 → 🙂
-- 第二層要生效，新成員的 emoji 就不能再自動帶 '🙂'——否則永遠停在第一層。
--
-- ── 範圍 ────────────────────────────────────────────────────────────────────
-- **只改預設值，不動既有資料**（Rozi 明訂「既有資料不追溯修改」）。
-- 四趟歷史行程的成員 emoji 是 Rozi 親自指定的（🐵🐱🍋🐟），必須原樣保留。

begin;

alter table trip_members alter column emoji set default '';

commit;

-- ── 套用後自檢（預期）────────────────────────────────────────────────────────
-- 1) 預設值已改：
--    select column_default from information_schema.columns
--    where table_name = 'trip_members' and column_name = 'emoji';
--    -- 預期 ''::text
--
-- 2) 既有資料未被動到（四趟成員的 emoji 仍在）：
--    select count(*) from trip_members where emoji is not null and emoji <> '';
--    -- 預期 與套用前相同，不得變少
--
-- ── 回滾 ────────────────────────────────────────────────────────────────────
-- alter table trip_members alter column emoji set default '🙂';
