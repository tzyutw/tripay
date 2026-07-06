/**
 * AuthLayout
 *
 * 所有需要登入的頁面共用的 layout wrapper。
 * - 未登入：自動 redirect 到 /login
 * - 已登入：呼叫 usePostLoginRedirect，確保 G-01（新用戶跳轉 S-02）保護
 *
 * 掛載點（路由樹示意）：
 *   / (protected)       → AuthLayout
 *   ├─ /               → S-01 行程列表
 *   ├─ /trips/new      → S-02 建立行程
 *   ├─ /trips/:id      → S-03 消費瀏覽
 *   └─ ...
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { usePostLoginRedirect } from '@/hooks/usePostLoginRedirect';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  // G-01：新用戶無行程時自動跳轉 S-02
  usePostLoginRedirect();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return null; // 載入中
  if (session === null) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
