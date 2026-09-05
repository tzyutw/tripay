/* B-1③　S-02b-13「這趟怎麼結算？」
   單選＝圓形 .selchip（未選描邊、選了實心點）。**不要用打勾框**——那是複選的形狀。
   選「都轉給同一個人」才要選人，預設帶代墊最多的成員。
   ⚠️ 版位：這一段必須排在「誰一起去？」之後——**要先有成員才選得出中心人**。 */
import type { SharedMember } from './types';
import { firstGrapheme } from '@/lib/format';

export interface SettleModeProps {
  mode: 'direct' | 'hub';
  hubMember: string | null;
  members: SharedMember[];
  onMode: (m: 'direct' | 'hub') => void;
  onHub: (id: string) => void;
}

export default function SettleMode({ mode, hubMember, members, onMode, onHub }: SettleModeProps) {
  return (
    <div className="fld">
      <span className="lbl">這趟怎麼結算？</span>
      <div className="gap">
        <button className={`rowb${mode !== 'hub' ? ' on' : ''}`} onClick={() => onMode('direct')}>
          <span className={`selchip ${mode !== 'hub' ? 'on' : ''}`} aria-hidden="true" />
          <span style={{ flex: 1, fontWeight: 600 }}>誰欠誰就轉給誰</span>
        </button>
        <button className={`rowb${mode === 'hub' ? ' on' : ''}`} onClick={() => onMode('hub')}>
          <span className={`selchip ${mode === 'hub' ? 'on' : ''}`} aria-hidden="true" />
          <span style={{ flex: 1, fontWeight: 600 }}>都轉給同一個人</span>
        </button>
      </div>
      {mode === 'hub' && (
        <div className="chips" style={{ marginTop: 8 }}>
          {members.map(m => (
            <button key={m.id} className={`chip${hubMember === m.id ? ' on' : ''}`} onClick={() => onHub(m.id)}>
              {m.emoji || firstGrapheme(m.name)} {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
