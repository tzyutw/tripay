/* 實作-C-3　量測靶專用的 supabase 樁。
 * 由 vite.config.ts 在 `--mode harness` 下把 `@/lib/supabaseClient` alias 到這裡，
 * 元件的 import 一行都不用改——**production bundle 不會碰到這個檔**。
 *
 * ⚠️ 必須**延遲取值**：ES import 會被提升，這個模組的本體比 main.tsx 的本體早執行，
 * 直接讀 `window.__SUPABASE_STUB__` 只會拿到 undefined，
 * 然後畫面靜靜地空白——不報錯，所以看起來像「元件壞了」。
 */
type AnyRec = Record<string, unknown>;

export const supabase = new Proxy({} as AnyRec, {
  get(_t, k) {
    const real = (window as unknown as { __SUPABASE_STUB__?: AnyRec }).__SUPABASE_STUB__;
    if (!real) throw new Error('量測靶的 supabase 樁還沒掛上（main.tsx 尚未執行）');
    const v = real[k as string];
    return typeof v === 'function' ? v.bind(real) : v;
  },
}) as never;
