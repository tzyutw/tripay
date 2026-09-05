# 013 權限收斂 ＋ 分享 RPC　（2026-09-05 已套 production）

完整 SQL 記錄在 Supabase 的 `supabase_migrations.schema_migrations`
（version `013_rls_consolidation_and_share_rpc` 的 `statements`），
以及 `013_rls_consolidation_and_share_rpc.sql`。

## 做了什麼
1. 三個 `security definer` 判定函式：`can_access_trip(uuid)`／`can_access_expense(uuid)`／
   `can_access_settlement(uuid)`。都是 `stable`、`set search_path = public, pg_temp`、
   內部用 `(select auth.uid())`、`revoke execute from public` + `grant to authenticated`。
2. **六張「以行程為範圍」的表**（trips／trip_members／expenses／expense_splits／
   settlements／settlement_items）的 SELECT／UPDATE／DELETE／INSERT 政策改成呼叫函式。
   **語意完全不變**，只是同一句話從寫 N 遍變成寫 1 遍。
   共編上線時只改函式（加「或我是這趟的成員」），全部政策同時生效。
3. **不動 cards／people／profiles**——那三張不是行程範圍的資料，共編不影響它們。
4. **`trips: owner insert` 維持 `auth.uid() = owner_id`**——那一列還不存在，
   無法用 `can_access_trip(id)` 表達。這是正確的，不是漏做。
5. `get_shared_trip(text)`：拿 token 換一整包資料，`grant execute to anon`。
   完全相等比對、禁前綴、禁 hashtext、不做「固定時間比較」（Postgres 沒這個原語，
   防線是熵——現有 token 全部是 UUIDv4／122 bit）。
   **回傳欄位逐欄白名單**，排除 `owner_id`／`share_token`／`card_id`／`created_by`／
   `updated_by`／`user_id`／`person_id`／`linked_profile_id`；`deleted_at` 不為 null 的消費不回傳。

## 套用後驗證（實測數字）
| 驗證 | 結果 |
|---|---|
| anon 讀 trips／expenses／trip_members／settlements／expense_splits／storage covers | **全部 0 筆** |
| owner 登入讀 trips／trip_members／expenses | **4／16／404**（與改動前相同） |
| 政策總數 改動前後 | **35 → 35**（只改內容不改數量） |
| 仍含 `auth.uid()` 的政策 | 只有 cards／people／profiles 全部＋`trips: owner insert`。**沒有任何行程範圍表的 SELECT／UPDATE／DELETE 含它** |
| RPC 正確 token | 回 6 個鍵、該趟 132 筆消費；trip 與 member 的鍵集合**不含**任何被排除的欄位 |
| RPC `null`／`''`／隨機字串／**正確 token 前 8 碼** | **四種全部回 null**（前 8 碼那種證明沒有用前綴比對） |

## 還原點
`../backups/rls_policies_2026-09-05_before_refactor.sql`（41 條，011 之前的完整狀態）。
013 之前的狀態 ＝ 該檔**扣掉六條 share 政策**（那六條由 011 移除）＋ storage 的 `covers: share read`（011b 移除）。
