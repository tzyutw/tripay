-- ============================================================
-- confirm_settlement RPC（CR Issue #3：交易式結算確認）
-- ============================================================
-- 注意：此函式在 001_initial_schema.sql 已建立。
-- 002 以 CREATE OR REPLACE 確保版本一致，同時作為獨立 migration 紀錄。

CREATE OR REPLACE FUNCTION confirm_settlement(
  p_settlement_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trip_id     uuid;
  v_trip_status trip_status;
BEGIN
  -- 1. 取得 settlement 對應的 trip_id，確認狀態為 draft 且使用者擁有該行程
  SELECT s.trip_id INTO v_trip_id
  FROM settlements s
  JOIN trips t ON t.id = s.trip_id
  WHERE s.id = p_settlement_id
    AND s.status = 'draft'
    AND t.owner_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_not_found_or_unauthorized';
  END IF;

  -- 2. 確認這是 trip 最新的 draft（若有更新的 draft 存在，代表此筆已被 superseded）
  IF EXISTS (
    SELECT 1 FROM settlements
    WHERE trip_id = v_trip_id
      AND status = 'draft'
      AND id != p_settlement_id
      AND created_at > (SELECT created_at FROM settlements WHERE id = p_settlement_id)
  ) THEN
    RAISE EXCEPTION 'settlement_superseded';
  END IF;

  -- 3. 在同一 transaction 內更新 settlement 與 trip（atomic）
  UPDATE settlements
    SET status = 'confirmed', settled_at = now()
  WHERE id = p_settlement_id;

  UPDATE trips
    SET status = 'settled', updated_at = now()
  WHERE id = v_trip_id;
END;
$$;
