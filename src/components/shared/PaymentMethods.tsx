/* B-1①　S-02b-11「這趟的支付方式」——清單管理。
 *
 * 三件事不可以省：
 * ① **只能從把手起拖**：`touch-action:none` 只給把手，列本身仍要捲得動。
 *    整列都吃掉觸控的話，使用者在這一段就滑不動頁面了。
 * ② **已經有消費在用的不能刪**：點了給中性色訊息，不是靜靜沒反應。
 * ③ 把手是真的能拖的把手，不是一個 `⠿` 字元。看起來可以操作，就必須真的可以操作。
 */
import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

export interface PaymentMethodsProps {
  pays: string[];
  /** 每種支付方式被幾筆消費用到 */
  used: Record<string, number>;
  onChange: (next: string[]) => void;
  onBlocked?: (label: string) => void;
}

export default function PaymentMethods({ pays, used, onChange, onBlocked }: PaymentMethodsProps) {
  const [newPay, setNewPay] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const add = () => {
    const v = newPay.trim();
    if (!v || pays.includes(v)) return;
    onChange([...pays, v]);
    setNewPay('');
  };

  const remove = (i: number) => {
    const label = pays[i];
    if ((used[label] ?? 0) > 0) { onBlocked?.(label); return; }
    onChange(pays.filter((_, k) => k !== i));
  };

  /* 拖曳排序：Pointer Events，指標移過哪一列就換到那個位置 */
  const onGripDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragIdx(i);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragIdx === null || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll('[data-payrow]')] as HTMLElement[];
    const over = rows.findIndex(r => {
      const b = r.getBoundingClientRect();
      return e.clientY >= b.top && e.clientY <= b.bottom;
    });
    if (over >= 0 && over !== dragIdx) {
      const next = [...pays];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(over, 0, moved);
      onChange(next);
      setDragIdx(over);
    }
  };
  const endDrag = () => setDragIdx(null);

  return (
    <div className="fld">
      <span className="lbl">這趟的支付方式</span>
      <div className="gap" ref={listRef} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {pays.map((p, i) => {
          const n = used[p] ?? 0;
          return (
            <div className="rowb" data-payrow={i} key={p} style={{ padding: '11px 14px' }}>
              <span
                className="grip"
                role="button"
                aria-label="拖曳排序"
                style={{ touchAction: 'none' }}
                onPointerDown={onGripDown(i)}
              >
                <Icon name="menu" size={16} />
              </span>
              <span style={{ flex: 1, fontSize: 'var(--fs-body)', fontWeight: 600 }}>{p}</span>
              <span style={{ fontSize: 'var(--fs-sub)', color: 'var(--gr)' }}>
                {n ? `${n} 筆在用` : '還沒用到'}
              </span>
              <button
                className="rmbtn"
                aria-label={`移除 ${p}`}
                style={{ color: n ? '#CDD3D0' : 'var(--gr)' }}
                onClick={() => remove(i)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
        <input
          type="text"
          value={newPay}
          placeholder="新增一種支付方式"
          style={{ flex: 1 }}
          onChange={e => setNewPay(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button className="btn" style={{ width: 'auto', padding: '0 14px' }} onClick={add}>加入</button>
      </div>
      <p className="hint">已經有消費在用的不能刪</p>
    </div>
  );
}
