/**
 * usePostLoginRedirect
 *
 * G-01：新用戶首次登入後，若無任何行程，直接 replace 到 S-02（建立行程頁），
 * 跳過空的 S-00（行程列表頁）。
 *
 * 呼叫時機：AuthLayout mount 後，確認 session 存在時執行一次。
 *
 * 設計決策：
 * - 用 navigate(..., { replace: true })（非 push），讓 back 鍵不會回到空的 S-00
 * - 只在 count = 0 時跳轉，有行程的用戶正常停在 S-00
 * - 查詢用 head: true（不回傳資料，僅取 count），最小化 payload
 * - 已用 ref 標記「本 session 已檢查過」，避免每次回到 S-00 都重查
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

export function usePostLoginRedirect() {
  const navigate = useNavigate();
  const hasChecked = useRef(false);

  useEffect(() => {
    // 同一 session 內只執行一次
    if (hasChecked.current) return;

    async function checkAndRedirect() {
      // 確認是否已登入
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      try {
        // 查詢行程數量（head mode：只取 count，不回傳資料）
        const { count, error } = await supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', session.user.id)
          .is('deleted_at', null); // 排除軟刪除行程

        if (error) {
          console.error('[usePostLoginRedirect] failed to count trips:', error);
          return; // 查詢失敗：保守處理，停在 S-00，不做跳轉
        }

        if (count === 0) {
          // 無行程 → replace 到 S-02（不留 history entry）
          navigate('/trips/new', { replace: true });
        }
      } finally {
        // Codex CR Issue #8：無論成功或失敗都標記為已檢查，防止錯誤路徑無限重試
        hasChecked.current = true;
      }
    }

    checkAndRedirect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 依賴陣列留空：只在 mount 時執行一次，navigate ref 穩定不需列入
}
