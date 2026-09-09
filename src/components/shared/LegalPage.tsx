/* 🔴 實作-登-2／登-3　隱私權政策與服務條款。**兩頁共用這一份版型**——
 * 內容不同、版型完全一樣，分開寫遲早會走鐘（與 statCard／transferView 同一個理由）。
 *
 * ⚠️ 這兩頁**必須在未登入狀態開得起來**：Google Cloud Console 的「品牌」頁面
 *    要填隱私權政策與服務條款連結，沒有這兩頁「發布應用程式」按鈕是灰的。
 *    所以路由掛在 `ProtectedLayout` **之外**（與 `/login`、`/share/:token` 同層）。
 * ⚠️ 版面沿用站上既有的樣式（`.bar` ＋ `Icon name="back"` ＋ `.legal*`），不新造一套。
 */
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';

export interface LegalPageProps {
  title: string;
  /** 內文。`## ` 開頭的是段落標題，其餘是段落；空行分段。 */
  body: string;
}

export default function LegalPage({ title, body }: LegalPageProps) {
  const navigate = useNavigate();
  const blocks = body.trim().split(/\n{2,}/);
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="bar">
        {/* 訪客沒有別的地方可去，返回一律回登入頁 */}
        <button className="ic2" aria-label="返回" onClick={() => navigate('/login')}>
          <Icon name="back" size={20} />
        </button>
        <span className="ttl">{title}</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="legal">
        {blocks.map((b, i) => b.startsWith('## ')
          ? <h2 key={i} className="legal-h">{b.slice(3).trim()}</h2>
          : <p key={i} className="legal-p">{b.trim()}</p>)}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}
