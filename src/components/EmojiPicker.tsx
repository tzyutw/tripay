import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  TRAVEL_EMOJIS, MEMBER_EMOJIS,
  MEMBER_EMOJIS_COMMON, MEMBER_EMOJIS_MORE,
  normalizeEmojiInput,
} from '@/lib/emoji';

type Mode = 'cover' | 'member';

interface Props {
  mode: Mode;
  value: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * 共用 Emoji 選擇器（S-02 封面／S-02MEM 成員共用）。
 * 除了預設清單，另提供「搜尋，或直接貼上」欄位，可輸入任意 emoji
 * ——含 ZWJ 組合序列、膚色修飾、國旗，一律以 grapheme cluster 取用、不截斷。
 */
export default function EmojiPicker({ mode, value, onPick, onClose }: Props) {
  const [section, setSection] = useState<'travel' | 'member'>(mode === 'cover' ? 'travel' : 'member');
  const [custom, setCustom]   = useState('');
  const [error, setError]     = useState('');
  const [preview, setPreview] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPreview(value); }, [value]);

  // Aria 審查：原本只能點背景關閉，補上 Esc
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleCustom(raw: string) {
    setCustom(raw);
    if (!raw.trim()) { setError(''); setPreview(value); return; }
    const e = normalizeEmojiInput(raw);
    if (e) { setError(''); setPreview(e); }
    else   { setError('這看起來不是 emoji，換一個試試'); }
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { handleCustom(t); inputRef.current?.focus(); return; }
    } catch { /* 沒有剪貼簿權限就退回手動貼上 */ }
    inputRef.current?.focus();
    setError('請直接在上面欄位貼上（⌘V）');
  }

  function confirm() {
    const picked = custom.trim() ? normalizeEmojiInput(custom) : preview;
    if (custom.trim() && !picked) { setError('這看起來不是 emoji，換一個試試'); return; }
    if (picked) onPick(picked);
    onClose();
  }

  const groups: { title: string; items: string[] }[] =
    mode === 'member'
      ? [{ title: '大家常用', items: MEMBER_EMOJIS_COMMON }, { title: '旅遊風格', items: MEMBER_EMOJIS_MORE }]
      : section === 'travel'
        ? [{ title: '', items: TRAVEL_EMOJIS }]
        : [{ title: '', items: MEMBER_EMOJIS }];

  // 用 portal 掛到 body：頁面根層的 animate-slide-in 帶 transform，
  // 會讓 position:fixed 以該元素為定位基準（而非視窗），sheet 會被推到整頁最底部。
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={onClose} />

      <div className="relative bg-white rounded-t-panel shadow-sheet animate-sheet-up max-h-[80vh] flex flex-col">
        <div className="w-9 h-1 bg-[#D0CBC5] rounded-chip mx-auto mt-3 flex-shrink-0" />

        {/* 標題列（版位與 S-02／S-04 的 sheet header 一致） */}
        <div className="px-4 pt-3 pb-0 flex items-center justify-between flex-shrink-0">
          <h3 className="text-strong font-bold text-ink">
            {mode === 'cover' ? '挑個封面' : '挑個 emoji'}
          </h3>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="w-[30px] h-[30px] rounded-chip bg-[#EAE6E1] flex items-center justify-center text-md text-sub flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* 分類 tab（封面模式才有；成員模式直接分兩區塊） */}
        {mode === 'cover' && (
          <div className="flex gap-2 px-4 pt-4 pb-2 flex-shrink-0">
            {(['travel', 'member'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`px-4 py-[6px] rounded-chip text-xs font-bold border transition-colors ${section === s ? 'bg-w text-white border-w' : 'text-gr border-[#E4DFD9]'}`}
              >
                {s === 'travel' ? '旅遊' : '人物'}
              </button>
            ))}
          </div>
        )}

        {/* 搜尋／貼上 */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="flex gap-2 flex-wrap">
            <input
              ref={inputRef}
              type="text"
              value={custom}
              onChange={e => handleCustom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }}
              placeholder="搜尋，或直接貼上"
              aria-label="搜尋，或直接貼上 emoji"
              className="flex-1 min-w-[150px] h-10 px-3 bg-white rounded-base border-[1.5px] border-[#E4DFD9] text-body text-ink placeholder-gr outline-none focus:border-w transition-colors"
            />
            <button
              onClick={pasteFromClipboard}
              className="px-3 h-10 rounded-base border-[1.5px] border-[#E4DFD9] bg-white text-md text-sub font-bold flex-shrink-0"
            >
              直接貼上
            </button>
          </div>
          {error && <p className="text-tag text-out mt-1">{error}</p>}
        </div>

        {/* 清單 */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pb-3">
          {groups.map(g => (
            <div key={g.title || 'all'} className="mb-3 last:mb-0">
              {g.title && <p className="text-tag font-bold text-md mb-2">{g.title}</p>}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
                {g.items.map(e => (
                  <button
                    key={e}
                    onClick={() => { setCustom(''); setError(''); setPreview(e); }}
                    className={`aspect-square rounded-base text-title flex items-center justify-center border-[1.5px] transition-colors ${preview === e ? 'border-w bg-[#FFF5F0]' : 'border-[#E4DFD9] bg-white'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 預覽 ＋ 確認 */}
        <div className="px-4 pb-8 pt-3 flex-shrink-0 border-t border-black/[0.05]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-tag font-bold text-md">選的是</span>
            <span className="text-title leading-none">{preview || '—'}</span>
          </div>
          <button
            onClick={confirm}
            className="w-full h-[50px] bg-w text-white text-body font-bold rounded-base active:scale-[0.97] transition-transform"
          >
            就用這個
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
