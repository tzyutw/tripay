/**
 * reopen-settlement
 *
 * 兩種模式（mode 參數）：
 *
 * mode = "reopen"（預設）
 *   結算後發現帳目有誤，重新開啟行程以便修改帳目並重算。
 *   trip.status: settled → planned | active（依 today vs start_date 判斷）
 *   舊 settlement 記錄保留（歷史備查）。
 *   修改帳目後再次呼叫 calculate-settlement 產生新一筆 settlement。
 *
 * mode = "unarchive"（決策 B，2026-06-26）
 *   封存後使用者點「重新開啟行程」，解除只讀狀態。
 *   trip.status: archived → settled
 *   不回退 active/planned（封存行程通常旅遊已結束，回到結算狀態最合理）。
 *
 * POST /functions/v1/reopen-settlement
 * Body: { trip_id: string, mode?: "reopen" | "unarchive" }
 * Auth: Bearer <supabase jwt>
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
    const { trip_id, mode = "reopen" } = body;

    if (!trip_id) return json({ error: "trip_id required" }, 400);
    if (!["reopen", "unarchive"].includes(mode)) {
      return json({ error: 'mode must be "reopen" or "unarchive"' }, 400);
    }

    // ── 3. Load & verify ownership ───────────────────────────────────────────
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, owner_id, status, start_date")
      .eq("id", trip_id)
      .single();

    if (tripErr || !trip) return json({ error: "Trip not found" }, 404);
    if (trip.owner_id !== user.id) return json({ error: "Forbidden" }, 403);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 4a. mode = "unarchive"：archived → settled ───────────────────────────
    if (mode === "unarchive") {
      if (trip.status !== "archived") {
        return json({ error: `Cannot unarchive a trip with status "${trip.status}"` }, 409);
      }

      const { error: updateErr } = await admin
        .from("trips")
        .update({ status: "settled" })
        .eq("id", trip_id);

      if (updateErr) throw updateErr;

      return json({ ok: true, trip_id, status: "settled" });
    }

    // ── 4b. mode = "reopen"：settled → planned | active ──────────────────────
    if (trip.status === "archived") {
      return json(
        { error: 'Archived trips must use mode "unarchive" to reopen' },
        409,
      );
    }
    if (trip.status === "planned" || trip.status === "active") {
      return json({ ok: true, message: `Already ${trip.status}`, status: trip.status });
    }

    // 依 today vs start_date 決定回退到 planned 還是 active
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(trip.start_date);
    const targetStatus = today < startDate ? "planned" : "active";

    const { error: updateErr } = await admin
      .from("trips")
      .update({ status: targetStatus })
      .eq("id", trip_id);

    if (updateErr) throw updateErr;

    return json({ ok: true, trip_id, status: targetStatus });
  } catch (err) {
    console.error("[reopen-settlement]", err);
    return json({ error: "Internal server error", detail: String(err) }, 500);
  }
});
