/**
 * AuthLayout
 *
 * 所有需要登入的頁面共用的 layout wrapper。
 * - 未登入：自動 redirect 到 /login
 * - 已登入：直接把 children 畫出來
 *
 * 🔴 **G-01（零行程時自動跳到建立行程頁）已於 2026-09-10 拿掉**（Rozi 拍板）。
 *   她的原話：「拿掉 G-01（先看空行程頁）」。
 *   理由：空行程頁**本來就做了引導**（「還沒有行程。第一趟要去哪？」＋「建立第一趟」），
 *   G-01 等於把自己做的引導跳過去；而且剛登入就被一張有四個必填欄位的表單蓋住，
 *   使用者不知道自己在哪。做那件事的那個 hook（`src/hooks/` 底下那支）**整檔刪除**。
 *   ⚠️ 連**註解裡都不要再寫那個 hook 的名字**——停止條件是用出現次數判定的
 *      （與實作-AE 那個字元 icon 同一種陷阱）。
 *
 * 掛載點（路由樹示意）：
 *   / (protected)       → AuthLayout
 *   ├─ /               → S-01 行程列表
 *   ├─ /trips/new      → S-02 建立行程（**只由使用者自己按進來**，不再自動導向）
 *   ├─ /trips/:id      → S-03 消費瀏覽
 *   └─ ...
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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
