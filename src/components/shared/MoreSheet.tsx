/* S-03 的 ⋯ 選單。#28-6b 把編輯／複製／分享從 hero 的 icon 排移進這裡。
   #29-8c 每項配一個 16px 的 icon：刪除配上垃圾桶，**危險訊號在按下去之前就看得到**，
   不是等對話框跳出來才知道。只有「刪除行程」的 icon 與文字同時用 --dg。
   #31-6 整列撐滿、分隔線由面板負責——原本每顆按鈕只有內容寬，
   畫面上成了四條長短不一的短線，而且可點區只有文字那麼寬。
   逐字對齊 Tripay_原型.html 的 s03MoreSheet()。 */
import { Icon, type IconName } from '@/components/Icon';

export type TripStatusForMenu = 'planned' | 'active' | 'settled' | 'archived';

export interface MoreSheetProps {
  status: TripStatusForMenu;
  onEdit?: () => void;
  onShare?: () => void;
  onCopy?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onClose?: () => void;
}

function Item({ icon, text, del, onClick }: {
  icon: IconName; text: string; del?: boolean; onClick?: () => void;
}) {
  return (
    <button className={`shopt mi${del ? ' del' : ''}`} onClick={onClick}>
      <Icon name={icon} size={16} />
      <p className="t">{text}</p>
    </button>
  );
}

export default function MoreSheet({ status, onEdit, onShare, onCopy, onArchive, onDelete, onClose }: MoreSheetProps) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet">
        <div className="grab" />
        <div style={{ padding: '6px 14px 0' }}>
          {/* 封存＝預設只讀，所以封存態不出現「編輯行程」 */}
          {status !== 'archived' && <Item icon="edit" text="編輯行程" onClick={onEdit} />}
          <Item icon="share" text="分享" onClick={onShare} />
          <div className="mrule" />
          {/* 「複製成新的一趟」：它產出的是一趟新行程，屬於首頁層級 */}
          <Item icon="copy" text="複製成新的一趟" onClick={onCopy} />
          <div className="mrule" />
          {status === 'settled' && <Item icon="archive" text="封存行程" onClick={onArchive} />}
          <Item icon="del" text="刪除行程" del onClick={onDelete} />
        </div>
        <div style={{ padding: '6px 14px 16px' }}>
          <button className="btn qt" style={{ minHeight: 44 }} onClick={onClose}>取消</button>
        </div>
      </div>
    </>
  );
}
