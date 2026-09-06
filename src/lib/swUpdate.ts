/**
 * PWA 的更新策略：**偵測到新版就立刻換掉，不要等下一次打開。**
 *
 * 🔴 事故（Rozi 2026-09-06，連續兩輪被誤判成「功能壞掉」）：
 * `registerType: 'autoUpdate'` 的實際行為是「這一次還是舊的，下一次打開才換新」。
 * 而在換新之前，舊的進入點會去要**新部署已經刪掉的 chunk**——
 * 所以不是「舊版還能用」，而是整頁空白、功能不見。
 * 她的瀏覽器停在 `index-r5SPsY2e.js`（實作-M），伺服器上是 `index-DoWZjtTI.js`；
 * 「匯率沒帶 1」「刪除／分享按了沒反應」三件事都不是功能壞掉，
 * 是她拿不到新版。使用者完全無從得知要重新整理。
 *
 * ⚠️ **不要改成 `registerType: 'prompt'` 跳「有新版本，要更新嗎」的橫幅。**
 * 這是給她一個人用的工具，多一個要她按的東西沒有意義，直接換就好。
 */

/** sessionStorage 旗標：記住上一次自救重載的時間，防無限重載 */
export const RELOAD_FLAG = 'tripay:chunk-reload';
/** 兩次自救之間至少要隔這麼久，否則就是清了快取還是載不到——不要再轉了 */
export const RELOAD_COOLDOWN_MS = 60_000;

export interface SWRegisterOptions {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onRegisteredSW?: (url: string, r?: { update?: () => unknown } | undefined) => void;
}
export type RegisterSW = (o: SWRegisterOptions) => (reload?: boolean) => Promise<void>;

/**
 * 接管 SW 註冊。`register` 由呼叫端注入（`virtual:pwa-register` 是建置期虛擬模組，
 * 測試環境解析不到——所以這個檔本身不 import 它）。
 */
export function installUpdater(register: RegisterSW): (reload?: boolean) => Promise<void> {
  const updateSW: (reload?: boolean) => Promise<void> = register({
    /* immediate：不等 window load，掛上就註冊 */
    immediate: true,
    /* 新的 SW 一裝好就 skipWaiting ＋ reload，不等下一次開啟 */
    onNeedRefresh() { void updateSW(true); },
    /* 瀏覽器自己的更新排程可能好幾小時才跑一次——掛載後主動問一次 */
    onRegisteredSW(_url, r) { void r?.update?.(); },
  });
  return updateSW;
}

type RecoveryWindow = {
  addEventListener: (t: string, h: () => void) => void;
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
  location: { reload: () => void };
  caches?: { keys: () => Promise<string[]>; delete: (k: string) => Promise<boolean> };
};

/**
 * **最後一道防線**：chunk 載不到時自己救回來。
 * 沒有它，任何一次 SW 更新失敗都會變成整頁空白。
 *
 * 偵測到 `vite:preloadError`（動態 import 的 chunk 404）→
 * 清掉 workbox 的 precache → 重載一次。
 */
export function installChunkRecovery(w: RecoveryWindow): () => Promise<boolean> {
  const recover = async (): Promise<boolean> => {
    const last = Number(w.sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    /* 剛剛才救過一次還是載不到 → 清快取也沒用，不要再轉了 */
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    w.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    const keys = (await w.caches?.keys()) ?? [];
    await Promise.all(
      keys.filter(k => /workbox|precache|tripay/i.test(k)).map(k => w.caches!.delete(k)));
    w.location.reload();
    return true;
  };
  w.addEventListener('vite:preloadError', () => { void recover(); });
  return recover;
}
