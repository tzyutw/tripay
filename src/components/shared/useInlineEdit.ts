/* emoji 就地編輯：**行程成員與消費類別共用這一套**。
 *
 * 兩條不可以違反的規則：
 * ① **禁止 autofocus**。它綁的是「元素被放進 DOM」，不是「使用者要編輯」——
 *    只要有任何一次重繪把輸入框插回畫面，瀏覽器就再聚焦一次，
 *    手機上就是鍵盤關掉又跳出來。聚焦一律由 begin() 在使用者真的觸發時呼叫。
 * ② 限一個 grapheme，emoji 或文字皆可。
 *
 * 逐字對齊 Tripay_原型.html 的 beginInlineEdit()／commitInlineEdit()。 */
import { useCallback, useRef, useState } from 'react';
import { firstGrapheme } from '@/lib/format';

export interface InlineEditApi {
  /** 目前正在編輯哪一個 key；沒有就是 null */
  editing: string | null;
  /** 使用者真的要編輯時才呼叫——這裡才 focus，不用 autofocus */
  begin: (key: string) => void;
  /** 送出：回傳取到的那一個 grapheme（空字串代表沒改） */
  commit: (raw: string) => string;
  cancel: () => void;
  /** 綁到 <input ref=…> 上 */
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
}

export function useInlineEdit(onCommit?: (key: string, value: string) => void): InlineEditApi {
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const begin = useCallback((key: string) => {
    setEditing(key);
    /* 下一格才 focus——這一刻 input 還沒進 DOM */
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const commit = useCallback((raw: string) => {
    const one = firstGrapheme(raw);
    if (editing !== null && one) onCommit?.(editing, one);
    setEditing(null);
    return one;
  }, [editing, onCommit]);

  const cancel = useCallback(() => setEditing(null), []);

  return { editing, begin, commit, cancel, inputRef };
}
