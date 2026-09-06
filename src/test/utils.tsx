/* 實作-A2-②　可重複用的 render 工具。
 *
 * 三個外部依賴一定要先擋掉，不然畫面 render 不起來：
 *   supabase client（會發網路請求）、react-query（要 provider）、router（要 context）。
 *
 * supabase 的 mock 做成**鏈式**的：`.from().select().eq().order()` 每一段都回自己，
 * 最後 await 時才回資料——這樣元件裡怎麼串都不會炸，
 * 不必為每個畫面各寫一份 mock。
 */
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render as rtlRender } from '@testing-library/react';
import { ToastProvider } from '@/contexts/ToastContext';
import { vi } from 'vitest';

/** 一張假的 Supabase 查詢結果 */
export type MockRows = Record<string, unknown[]>;

/**
 * 造一個鏈式的 supabase client mock。
 * @param rows 以表名為鍵；`from('trips')` 之後 await 到的就是 rows.trips
 * @param user 目前登入者；傳 null 代表沒登入
 */
/**
 * 送出去的每一次寫入。**斷言「畫面沒變」是不夠的**——畫面沒變也可能是
 * 送出了但回來的資料一樣；而「這一欄改了會不會真的寫進去」只有看 payload 才知道。
 * 用之前先 `supabaseWrites.length = 0`。
 */
export const supabaseWrites: { table: string; op: string; payload: unknown }[] = [];

export function makeSupabaseMock(rows: MockRows = {}, user: { id: string } | null = { id: 'u1' }) {
  const build = (table: string) => {
    const data = rows[table] ?? [];
    const result = { data, error: null, count: data.length };
    /* then 讓這個物件本身是 thenable：元件不論在哪一段 await 都拿得到結果 */
    const chain: Record<string, unknown> = {
      then: (res: (v: typeof result) => unknown) => Promise.resolve(result).then(res),
      catch: () => chain,
    };
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'range',
                     'filter', 'gte', 'lte', 'match', 'or', 'returns', 'abortSignal'])
      chain[m] = vi.fn(() => chain);
    for (const m of ['insert', 'update', 'upsert', 'delete'])
      chain[m] = vi.fn((payload: unknown) => { supabaseWrites.push({ table, op: m, payload }); return chain; });
    chain.single = vi.fn(() => Promise.resolve({ data: data[0] ?? null, error: null }));
    chain.maybeSingle = chain.single;
    return chain;
  };

  return {
    from: vi.fn((t: string) => build(t)),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: user ? { user } : null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    storage: { from: vi.fn(() => ({
      createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: '' }, error: null })),
      upload: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  };
}

/** react-query 在測試裡不要重試，否則失敗會拖到 timeout 才顯示 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
}

export function Providers({ children, route = '/' }: { children: ReactNode; route?: string }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      {/* useToast() 會在沒有 provider 時 throw，畫面直接整個炸掉——
          真正的 App 由 App.tsx 包著，測試也要一樣包 */}
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/**
 * 包好 provider 的 render。
 * @param path 有 `useParams()` 的畫面要給——沒有 `<Route path>` 比對，
 *             `useParams()` 一律回空物件，元件會停在載入中而**不報錯**，
 *             測試只會說「找不到那段文字」，看不出根因。
 */
export function render(
  ui: ReactElement,
  { route = '/', path }: { route?: string; path?: string | string[] } = {},
) {
  /* path 可以給多條——畫面裡有 `navigate()` 的話，目的地那條 route 也要掛上，
     否則導航過去只會渲染出空白，測試看起來像「元件壞了」。 */
  const paths = path === undefined ? [] : Array.isArray(path) ? path : [path];
  return rtlRender(
    <Providers route={route}>
      {paths.length
        ? <Routes>{paths.map(pt => <Route key={pt} path={pt} element={ui} />)}</Routes>
        : ui}
    </Providers>,
  );
}

/** 畫面上所有看得見的文字，用來跟原型比對「字串集合」 */
export function visibleTexts(root: HTMLElement = document.body): string[] {
  const out: string[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walk.nextNode())) {
    const t = (n.textContent ?? '').trim();
    if (t) out.push(t);
  }
  return out;
}
