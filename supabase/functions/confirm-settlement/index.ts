/**
 * confirm-settlement
 *
 * 將 draft settlement 確認為 confirmed，並將 trip.status 改為 settled。
 * 改呼叫 confirm_settlement RPC，在單一 DB transaction 內完成兩表更新。
 *
 * POST /functions/v1/confirm-settlement
 * Body: { settlement_id: string }
 * Auth: Bearer <supabase jwt>
 *
 * CR Issue #3 修正：
 *   移除原本的 Promise.all（非原子性），改呼叫 Postgres RPC（transactional）。
 *   RPC 內部處理 superseded 判斷，Edge Function 只需翻譯錯誤代碼。
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/helpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── 2. Validate input ────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { settlement_id } = body;
    if (!settlement_id) return json({ error: "settlement_id required" }, 400);

    // ── 3. 呼叫 confirm_settlement RPC（CR Issue #3：transactional）──────────
    //
    // RPC 在單一 transaction 內完成：
    //   - 驗證 settlement 狀態為 draft 且 user 擁有 trip
    //   - 確認無更新的 draft（防止 superseded）
    //   - 更新 settlements.status = confirmed
    //   - 更新 trips.status = settled
    const { error } = await supabase.rpc("confirm_settlement", {
      p_settlement_id: settlement_id,
      p_user_id:       user.id,
    });

    if (error) {
      if (error.message.includes("settlement_superseded")) {
        return json({ error: "settlement_superseded" }, 409);
      }
      if (error.message.includes("settlement_not_found_or_unauthorized")) {
        return json({ error: "Settlement not found or unauthorized" }, 404);
      }
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, settlement_id });
  } catch (err) {
    console.error("[confirm-settlement]", err);
    return json({ error: "Internal server error", detail: String(err) }, 500);
  }
});
