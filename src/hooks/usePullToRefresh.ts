/* 🔴 實作-AF-7　下拉重新整理。全站原本**完全沒有這個功能**，
 * 所以 Rozi 下拉沒反應——不是壞掉，是不存在。
 *
 * 設計上的取捨（都是指令點名的）：
 * - **只在捲動容器已經在最頂端時才觸發**，不然會跟正常捲動打架
 * - 下拉超過 60px（位移量，不是手指距離）放開 → `onRefresh()`；沒到門檻就回彈
 * - 視覺回饋沿用既有的 `.spin`，**不引入任何動畫套件或第三方相依**
 * - ⚠️ **不攔截整頁手勢**：`touchmove` 只在「已在頂端且往下拉」時才
 *   `preventDefault`，其餘一律放行，所以 sheet 內部的捲動不受影響
 * - `passive: false` 是必要的——要 `preventDefault` 就不能是 passive
 *
 * 🔴 修-6（Rozi 2026-09-10：「有點太硬，可以參考 iOS 的設計嗎？」）
 *   舊的是**固定阻尼**（位移一律是手指的一半）：手指從第一毫米開始就只有一半的位移，
 *   一開始就重，而且要拉 120px 才到門檻。iOS 的 rubber-banding 不是固定比例，
 *   是**遞減**的——一開始接近 1:1，拉越遠越黏。改用 `UIScrollView` 那條公式。
 *
 * 🔴 修-7（Rozi 2026-09-10：「一直 loading 看起來很像更有問題」）
 *   轉超過 10 秒就停下來講話，並且**中止那個請求**——放著它背景跑完再默默更新的話，
 *   使用者會看到「畫面說連不上、三秒後資料自己變了」，比一直轉更難懂。
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { MSG_SAVE_OFFLINE } from '@/lib/messages';

export interface PullToRefresh {
  /** 掛在捲動容器上 */
  ref: (el: HTMLElement | null) => void;
  /** 目前下拉的距離（px），拿去畫回饋 */
  pull: number;
  /** 正在重新整理 */
  refreshing: boolean;
  /** 放開之後的回彈動畫還在跑 */
  releasing: boolean;
  /** 指示器要不要留在畫面上（回彈期間也要留著，不然沒有東西可以動畫） */
  visible: boolean;
  /** 指示器容器的 style。**兩頁共用這一份**，不要各寫一個 */
  indicatorStyle: CSSProperties;
}

/** 位移量到這裡就算數（不是手指距離——手指要拉約 67px） */
const THRESHOLD = 60;
/** 拉到底最多顯示這麼多。公式本身會趨緩，這條只是最後的保險 */
const MAX_PULL = 120;

/* 蘋果 `UIScrollView` 的橡皮筋公式。`c = 0.55`、`dim` 是參考尺度（不是上限）。
   對照：手指 20px → 19、60px → 54、70px → 62（過門檻）、200px → 146（被 MAX_PULL 收在 120）。
   ⚠️ 這裡不得再出現任何 `dy * 常數` 的固定阻尼，那正是「太硬」的來源。 */
const RUBBER_C = 0.55;
const RUBBER_DIM = 300;
const rubber = (dy: number) =>
  (1 - 1 / ((dy * RUBBER_C / RUBBER_DIM) + 1)) * RUBBER_DIM / RUBBER_C;

/* 回彈：放開的那一刻才套 transition，**拖曳過程中一定要是 `none`**，
   不然指示器會落後手指一拍（那是「硬」的另一半：舊版放開是瞬間歸零，沒有過渡）。
   動的是 `height` 不是 `transform`——指示器的高度就是它把清單推開的量，
   改用 transform 的話清單會瞬間彈回、只有圈圈在滑，反而更怪。 */
const RELEASE_MS = 280;
const RELEASE_TRANSITION = `height ${RELEASE_MS}ms cubic-bezier(0.23, 1, 0.32, 1)`;

/** 轉這麼久還沒回應就停下來講話 */
const TIMEOUT_MS = 10_000;

export function usePullToRefresh(
  onRefresh: (signal: AbortSignal) => Promise<unknown> | void,
): PullToRefresh {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const { toast } = useToast();

  /* 事件處理是在 effect 裡註冊的閉包，讀不到最新的 state——用 ref 同步一份 */
  const pullRef = useRef(0);
  const busyRef = useRef(false);
  const cb = useRef(onRefresh);
  const toastRef = useRef(toast);
  const releaseTimer = useRef<ReturnType<typeof setTimeout>>();
  pullRef.current = pull;
  busyRef.current = refreshing;
  cb.current = onRefresh;
  toastRef.current = toast;

  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  useEffect(() => () => clearTimeout(releaseTimer.current), []);

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

    /** 歸零，但**帶著回彈動畫**歸零 */
    const springBack = () => {
      clearTimeout(releaseTimer.current);
      setReleasing(true);
      setPull(0);
      releaseTimer.current = setTimeout(() => setReleasing(false), RELEASE_MS);
    };

    const onStart = (e: TouchEvent) => {
      /* 只有「已經在最頂端」才進入下拉模式；否則這一次手勢完全不管 */
      startY = scrollTop() <= 0 ? e.touches[0].clientY : null;
      /* 又摸上來了就把回彈中斷掉，不然新的拖曳會帶著上一次的 transition 跑 */
      clearTimeout(releaseTimer.current);
      setReleasing(false);
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { setPull(0); return; }            // 往上滑＝正常捲動，放行
      if (scrollTop() > 0) { startY = null; setPull(0); return; }
      /* 到這裡才是真的在下拉——這時候才攔，不要一律攔 */
      e.preventDefault();
      setPull(Math.min(MAX_PULL, rubber(dy)));         // 橡皮筋，前 20px 幾乎跟手
    };
    const onEnd = async () => {
      const reached = pullRef.current >= THRESHOLD;
      startY = null;
      springBack();
      if (!reached || busyRef.current) return;
      setRefreshing(true);

      /* 🔴 修-7　十秒沒回應就中止並講話。
         `Promise.race` 的另一邊是「abort 被觸發」——`fail=hang` 那種
         **永遠不 resolve** 的請求靠等它是等不到的，只能自己跳出來。 */
      const ac = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; ac.abort(); }, TIMEOUT_MS);
      const aborted = new Promise<void>(res => {
        ac.signal.addEventListener('abort', () => res(), { once: true });
      });
      try {
        await Promise.race([Promise.resolve(cb.current(ac.signal)), aborted]);
      } finally {
        clearTimeout(timer);
        setRefreshing(false);
        /* 畫面上原本的資料留著不動（跟離線時看得到舊資料一致），只跳一句話。
           **沿用既有字串**——使用者的下一步一樣（等一下再拉一次），不必多一種說法。 */
        if (timedOut) toastRef.current(MSG_SAVE_OFFLINE);
      }
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

  return {
    ref, pull, refreshing, releasing,
    visible: pull > 0 || refreshing || releasing,
    indicatorStyle: {
      height: refreshing ? 44 : pull,
      transition: releasing ? RELEASE_TRANSITION : 'none',
    },
  };
}
