/* 實作-B-7　S-07 設定（8 項）。
 *
 * **不要補做**「我的資料」（S-07-4）與「顯示設定」（S-07-5）——
 * 兩段都已裁示整段拿掉（#30-4／#27-2）。編號保留不回收，但畫面上不渲染。
 * 理由是同一個毛病：畫面承諾了產品沒有的東西。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { firstGrapheme } from '@/lib/format';
import { Icon } from '@/components/Icon';
import type { User } from '@supabase/supabase-js';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: user } = useQuery<User | null>({
    queryKey: ['auth-user'],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 60_000,
  });

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  const name   = (user?.user_metadata?.full_name as string) ?? '使用者';
  const avatar = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* S-07-1 */}
      <div className="bar">
        <button className="ic2" aria-label="返回" onClick={() => navigate(-1)}>
          <Icon name="back" size={20} />
        </button>
        <span className="ttl">設定</span>
        <span style={{ width: 40 }} />
      </div>

      {/* S-07-2／3 */}
      <div className="sec">登入帳號</div>
      <div style={{ margin: '0 14px' }}>
        <div className="rowb">
          {avatar
            ? <img src={avatar} alt="" className="avatar" />
            : <span className="avatar letter" style={{ background: '#2D6A8A' }}>
                {firstGrapheme(name)}
              </span>}
          <span className="flex-1 min-w-0">
            <span className="trunc text-strong font-semibold">{name}</span>
            <span className="trunc text-sub text-gr">{user?.email}</span>
          </span>
        </div>
      </div>

      {/* S-07-6　登出是描邊、文字用中性色 --md——**不是 --dg**。
          登出可復原（再登入就好），不該跟「刪除行程」共用同一組危險語彙。 */}
      <div style={{ margin: '16px 14px 0' }}>
        <button className="btn qt" style={{ color: 'var(--md)' }}
          onClick={() => setShowDialog(true)}>登出</button>
      </div>

      {/* S-07-7　照原型沒有版本號，不要自己加 */}
      <div className="verfoot">Tripay · 每一趟，都記得</div>

      {/* S-07-8　確認框也是描邊 */}
      {showDialog && (
        <>
          <div className="scrim" onClick={() => setShowDialog(false)} />
          <div className="dlgwrap">
            <div className="dlg">
              <p className="dlgt" style={{ textAlign: 'center', marginBottom: 14 }}>確定要登出嗎？</p>
              <div className="dlgrow">
                <button className="btn qt" onClick={() => setShowDialog(false)}>取消</button>
                <button className="btn gh" disabled={loading} onClick={handleLogout}>
                  {loading ? '登出中…' : '登出'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
