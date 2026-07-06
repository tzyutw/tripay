import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

export default function SettingsPage() {
  const navigate             = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [loading,    setLoading]    = useState(false);

  const { data: user } = useQuery<User | null>({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: 60_000,
  });

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#F5F4F2] animate-slide-in">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#FEF9EE] border-b border-[#EFEBE6]">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-primary text-[13px] font-medium"
        >
          ‹ 返回
        </button>
        <span className="text-[14px] font-semibold text-mid">設定</span>
        <div className="w-12" />
      </div>

      <div className="px-5 pt-6">
        {/* Account section */}
        <p className="text-[11px] font-bold text-muted tracking-widest uppercase mb-3">登入帳號</p>
        <div className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3 mb-5">
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url as string}
              alt=""
              className="w-12 h-12 rounded-full flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              {((user?.user_metadata?.full_name as string) ?? 'U')[0]}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-ink truncate">
              {(user?.user_metadata?.full_name as string) ?? '使用者'}
            </p>
            <p className="text-[13px] text-muted truncate">{user?.email}</p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => setShowDialog(true)}
          className="w-full h-[50px] bg-white rounded-2xl shadow-card text-warn text-[15px] font-bold active:scale-[0.97] transition-transform"
        >
          登出
        </button>
      </div>

      {/* Logout confirm dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setShowDialog(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-sheet">
            <p className="text-[17px] font-bold text-ink mb-2 text-center">確定要登出嗎？</p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowDialog(false)}
                className="flex-1 h-[46px] bg-[#F5F4F2] text-ink rounded-xl text-[14px] font-bold"
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="flex-1 h-[46px] bg-warn text-white rounded-xl text-[14px] font-bold disabled:opacity-60"
              >
                {loading ? '登出中…' : '登出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
