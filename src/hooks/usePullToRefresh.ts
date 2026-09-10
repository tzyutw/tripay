/* 🔴 實作-AF-7　下拉重新整理。全站原本**完全沒有這個功能**，
 * 所以 Rozi 下拉沒反應——不是壞掉，是不存在。
 *
 * 設計上的取捨（都是指令點名的）：
 * - **只在捲動容器已經在最頂端時才觸發**，不然會跟正常捲動打架
 * - 下拉超過 60px 放開 → `onRefresh()`；沒到門檻就回彈
 * - 視覺回饋沿用既有的 `.spin`，**不引入任何動畫套件或第三方相依**
 * - ⚠️ **不攔截整頁手勢**：`touchmove` 只在「已在頂端且往下拉」時才
 *   `preventDefault`，其餘一律放行，所以 sheet 內部的捲動不受影響
 * - `passive: false` 是必要的——要 `preventDefault` 就不能是 passive
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PullToRefresh {
  /** 掛在捲動容器上 */
  ref: (el: HTMLElement | null) => void;
  /** 目前下拉的距離（px），拿去畫回饋 */
  pull: number;
  /** 正在重新整理 */
  refreshing: boolean;
}

const THRESHOLD = 60;
/** 拉到底最多顯示這麼多，避免整頁被推得太開 */
const MAX_PULL = 90;

export function usePullToRefresh(onRefresh: () => Promise<unknown> | void): PullToRefresh {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [el, setEl] = useState<HTMLElement | null>(null);

  /* 事件處理是在 effect 裡註冊的閉包，讀不到最新的 state——用 ref 同步一份 */
  const pullRef = useRef(0);
  const busyRef = useRef(false);
  const cb = useRef(onRefresh);
  pullRef.current = pull;
  busyRef.current = refreshing;
  cb.current = onRefresh;

  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;
    let startY: number | null = null;
    /* ⚠️ 有些頁面**自己不捲，是整份文件在捲**（S-03 就是）。
       那時候 `el.scrollTop` 永遠是 0，光看它會以為「一直在頂端」，
       於是使用者在頁面中間往下滑也會觸發下拉——所以要看真正在捲的那一個。 */
    const scrollTop = () =>
      (el.scrollHeight > el.clientHeight + 1)
        ? el.scrollTop
        : (document.scrollingElement || document.documentElement).scrollTop;

    const onStart = (e: TouchEvent) => {
      /* 只有「已經在最頂端」才進入下拉模式；否則這一次手勢完全不管 */
      startY = scrollTop() <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { setPull(0); return; }            // 往上滑＝正常捲動，放行
      if (scrollTop() > 0) { startY = null; setPull(0); return; }
      /* 到這裡才是真的在下拉——這時候才攔，不要一律攔 */
      e.preventDefault();
      setPull(Math.min(MAX_PULL, dy * 0.5));           // 阻尼，拉起來才有手感
    };
    const onEnd = async () => {
      const reached = pullRef.current >= THRESHOLD;
      startY = null;
      setPull(0);
      if (!reached || busyRef.current) return;
      setRefreshing(true);
      try { await cb.current(); } finally { setRefreshing(false); }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [el]);

  return { ref, pull, refreshing };
}
