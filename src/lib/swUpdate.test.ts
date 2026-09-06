/* 實作-O-4　新版部署成功了，使用者卻拿不到——SW 把舊版釘在裝置上。
 *
 * 這一組守的是「拿到新版」這件事本身。它壞掉的時候，任何功能測試都還是綠的
 * ——Rozi 那兩輪回報的「匯率沒帶 1」「刪除／分享沒反應」全部是這個。 */
import { describe, it, expect, vi } from 'vitest';
import { installUpdater, installChunkRecovery, RELOAD_FLAG,
         type SWRegisterOptions } from './swUpdate';

describe('O-④a　偵測到新版就立刻換掉', () => {
  it('registerSW 以 immediate: true 呼叫', () => {
    const reload = vi.fn(async () => {});
    const register = vi.fn((_o: SWRegisterOptions) => reload);
    installUpdater(register);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0].immediate).toBe(true);
  });

  it('onNeedRefresh 會呼叫 updateSW(true)——不等下一次打開', () => {
    const reload = vi.fn(async () => {});
    let opts: SWRegisterOptions | null = null;
    installUpdater(o => { opts = o; return reload; });
    expect(opts).not.toBeNull();
    opts!.onNeedRefresh!();
    expect(reload).toHaveBeenCalledWith(true);
  });

  it('掛載後主動 registration.update() 一次，不只靠瀏覽器排程', () => {
    let opts: SWRegisterOptions | null = null;
    installUpdater(o => { opts = o; return vi.fn(async () => {}); });
    const update = vi.fn();
    opts!.onRegisteredSW!('/sw.js', { update });
    expect(update).toHaveBeenCalledTimes(1);
    /* registration 是 undefined 時不能爆——那會讓整個 app 掛不起來 */
    expect(() => opts!.onRegisteredSW!('/sw.js', undefined)).not.toThrow();
  });
});

describe('O-④b　chunk 載不到時自己救回來', () => {
  function fakeWindow() {
    const store: Record<string, string> = {};
    const handlers: Record<string, () => void> = {};
    return {
      handlers, store,
      addEventListener: (t: string, h: () => void) => { handlers[t] = h; },
      sessionStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
      },
      location: { reload: vi.fn() },
      caches: {
        keys: vi.fn(async () => ['workbox-precache-v2-abc', 'supabase-api', 'google-fonts']),
        delete: vi.fn(async () => true),
      },
    };
  }

  it('掛上 vite:preloadError 的處理器', () => {
    const w = fakeWindow();
    installChunkRecovery(w);
    expect(typeof w.handlers['vite:preloadError']).toBe('function');
  });

  it('第一次：清掉 workbox precache 後重載一次', async () => {
    const w = fakeWindow();
    const recover = installChunkRecovery(w);
    expect(await recover()).toBe(true);
    expect(w.caches.delete).toHaveBeenCalledWith('workbox-precache-v2-abc');
    /* Supabase 與字體的快取不要動——那不是造成空白畫面的原因 */
    expect(w.caches.delete).not.toHaveBeenCalledWith('supabase-api');
    expect(w.caches.delete).not.toHaveBeenCalledWith('google-fonts');
    expect(w.location.reload).toHaveBeenCalledTimes(1);
    expect(w.store[RELOAD_FLAG]).toBeTruthy();
  });

  it('第二次不會再重載——清了快取還是載不到就不要無限轉', async () => {
    const w = fakeWindow();
    const recover = installChunkRecovery(w);
    await recover();
    (w.location.reload as ReturnType<typeof vi.fn>).mockClear();
    expect(await recover()).toBe(false);
    expect(w.location.reload).not.toHaveBeenCalled();
  });

  it('caches 不存在（舊瀏覽器／無痕）也要照樣重載，不能整段拋錯', async () => {
    const w = { ...fakeWindow(), caches: undefined };
    const recover = installChunkRecovery(w as never);
    expect(await recover()).toBe(true);
    expect(w.location.reload).toHaveBeenCalledTimes(1);
  });
});

describe('O-④c　畫面上看得到版本', () => {
  it('__BUILD_SHA__ 有被注入（正式建置是 commit 短碼）', () => {
    expect(typeof __BUILD_SHA__).toBe('string');
    expect(__BUILD_SHA__.length).toBeGreaterThan(0);
  });
});
