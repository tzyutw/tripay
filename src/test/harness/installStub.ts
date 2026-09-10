/* 實作-C-3　量測靶的 supabase 樁：量版面不連網路，回傳形狀與真實查詢一致。
   這個檔要在任何畫面模組 evaluate 之前跑完，所以獨立成一個 import。 */
import { trip, expenses, members, settlementItems, allSettlementItems, settlements,
         CONFIRMED_ID, noExpenses, tripMissing } from './fixtures';

/* `?state=settled`：讓 S-05 走到「已結算、逐筆標記付清」那一態，
   才畫得出「查看計算依據」的逐人列。預設維持 active，不動既有版面基準。 */
const st = new URLSearchParams(location.search).get('state');
/* 🔴 實作-AC-6　`?state=stale` 也是**已結算**（只是凍結值與現在的帳對不上）。
   少了這一句，`?state=stale` 會停在未結算態，AC-4 那幾條就驗不到東西。 */
const settled = st === 'settled' || st === 'stale';
/* `?state=archived`：封存態的列**維持唯讀**（決策 B），但點下去要有話講。
   已結算與封存是**兩件事**，所以兩個狀態都要有假資料走過。 */
const archived = st === 'archived';
/* `?expenses=none` 由 fixtures 統一解析——同一個參數不要在兩個檔各判一次 */
const expenses2 = noExpenses ? [] : expenses;

/* 🔴 實作-掛-1　讓樁**能夠失敗**。常設 C12：使用者會撞到的失敗，畫面必須說出
   「發生什麼」＋「下一步能做什麼」。「寫入失敗」與「離線」這兩條路徑
   在量測靶上**根本走不到**，所以從來沒有人在守——功能有，但驗不到。

     `?fail=write`   寫入（insert／update／upsert／delete）失敗，select 不受影響
     `?fail=read`    select 與 rpc 失敗，寫入不受影響
     `?fail=offline` 全部失敗，訊息用 supabase-js **斷網時實際會丟的那一句**
                     （`Failed to fetch`）——不要自己編一個好看的，
                     文案層要處理的就是這種看不懂的原文。
   不帶參數時行為完全不變。 */
const OFFLINE_MSG = 'Failed to fetch';
/* 🔴 實作-掛-4　**每次呼叫時才讀**，不要在模組載入時定成常數。
   `?fail=offline` 是載入時決定的，所以「App 已經開著、然後網路斷了」——
   **真實世界唯一會發生的離線情境**——在量測靶上走不到
   （offline 連讀取都失敗 → 清單是空的 → 根本點不到任何一筆去編輯）。
   改成 `window.__FAIL__` 優先、網址參數次之，複驗就能在執行期切換。 */
const failNow = () =>
  (window as unknown as { __FAIL__?: string | null }).__FAIL__
  ?? new URLSearchParams(location.search).get('fail');
const isFailWrite = () => { const f = failNow(); return f === 'write' || f === 'offline'; };
const isFailRead  = () => { const f = failNow(); return f === 'read'  || f === 'offline'; };
const failMsg = (what: string) =>
  failNow() === 'offline' ? OFFLINE_MSG : `ZZ 樁：${what}失敗`;
/** supabase-js 的錯誤形狀：`{ data: null, error: { message } }` */
const failResult = (what: string) =>
  ({ data: null, error: { message: failMsg(what) }, count: null });
function recordRpc<T extends { data: { trip?: unknown } | null }>(r: T): T {
  (window as unknown as { __RPC_TRIP__: unknown }).__RPC_TRIP__ = r.data && r.data.trip;
  return r;
}

const rows = {
  /* `?trip=missing`：查不到任何列——`.maybeSingle()` 會回 null，畫面要走「找不到」 */
  trips: tripMissing ? [] : [settled ? { ...trip, status: 'settled' }
                           : archived ? { ...trip, status: 'archived' } : trip],
  expenses: tripMissing ? [] : expenses2, trip_members: tripMissing ? [] : members,
  /* 直接查表的路徑（S-05／ShareSheet）只會拿 confirmed 那一筆 */
  settlements: noExpenses ? [] : [{ id: CONFIRMED_ID, trip_id: 't1', status: 'confirmed',
                  created_at: '2026-03-20', settlement_items: settlementItems }],
};
/* 記下有沒有真的送出寫入。「必填沒填就不該送出」這種斷言，
   光看畫面沒變是不夠的——畫面沒變也可能是送出了但回來的資料一樣。 */
const writes: string[] = [];
(window as unknown as { __WRITES__: string[] }).__WRITES__ = writes;

let seqId = 9000;

/* `expenses.expense_splits` 是巢狀查出來的一份，寫入 `expense_splits` 時要同步維護，
   否則「存完再打開」看不到剛填的分帳（真實的 PostgREST 是即時 join 出來的）。 */
const expenseRows = () => (rows as unknown as
  Record<string, Record<string, unknown>[]>).expenses ?? [];
function attachSplit(r: Record<string, unknown>) {
  const e = expenseRows().find(x => x.id === r.expense_id);
  if (!e) return;
  if (!e.expense_splits) e.expense_splits = [];
  (e.expense_splits as Record<string, unknown>[]).push(r);
}
function detachSplit(r: Record<string, unknown>) {
  const e = expenseRows().find(x => x.id === r.expense_id);
  const arr = e && (e.expense_splits as Record<string, unknown>[] | undefined);
  if (!arr) return;
  const i = arr.indexOf(r);
  if (i >= 0) arr.splice(i, 1);
}

function chain(table: string) {
  /* ⚠️ `rows[table]` 會被寫入改動，所以**每次取用都要重讀**，
     不能在函式開頭抓一份快照——抓了快照就等於寫進去也讀不到。 */
  const R = rows as unknown as Record<string, Record<string, unknown>[]>;
  const list = () => (R[table] ??= []);
  /* `.eq('id', …)` 要真的過濾——不然「編輯第 N 筆」永遠拿到第一筆，
     所有「載入既有消費」的斷言都會在錯的資料上跑（U-1-b 就是這樣差點驗不出來）。 */
  /* `.eq()` 要真的過濾——不然「編輯第 N 筆」永遠拿到第一筆（U-1-b 差點驗在錯的資料上），
     而 `delete().eq('expense_id', …)` 會把整張表清掉。所以記下**每一個**條件，不只 id。 */
  const conds: [string, unknown][] = [];
  const hits = () => list().filter(x => conds.every(([k, v]) => String(x[k]) === String(v)));
  const one = () => hits()[0] ?? null;
  /* 🔴 讀出去要**複製一份**。回傳同一個陣列／物件參考的話，
     react-query 的 structural sharing 會判定「沒變」→ 畫面不重繪，
     於是「改了資料但清單沒更新」看起來像快取沒清（V-1 的斷言就這樣卡住過）。
     真實的網路回應本來就是新物件。 */
  const copy = (a: Record<string, unknown>[]) => a.map(x => ({ ...x }));
  const res = () => {
    if (isFailRead()) return failResult('讀取') as unknown as { data: Record<string, unknown>[]; error: null; count: number };
    const d = copy(hits()); return { data: d, error: null, count: d.length };
  };
  /* 寫入之後 `.select()` 要回傳被動到的那幾列（PostgREST 的行為，
     而且「斷言影響列數」那條帳務鐵律靠它） */
  let affected: Record<string, unknown>[] | null = null;
  let pending: null | (() => Record<string, unknown>[]) = null;
  /** 這一條 chain 上有沒有寫入動作（有的話 `fail=write` 要擋） */
  let isWrite = false;
  const flush = () => {
    /* 失敗時**不要真的改資料**——不然「存不起來」卻已經寫進去了，
       比不擋更糟（使用者按第二次會變成兩筆）。 */
    if (isWrite && isFailWrite()) { pending = null; return; }
    if (pending) { affected = pending(); pending = null; }
  };
  const out = () => {
    if (isWrite && isFailWrite()) return failResult('寫入') as unknown as
      { data: Record<string, unknown>[]; error: null; count: number };
    return affected ? { data: copy(affected), error: null, count: affected.length } : res();
  };

  const c: Record<string, unknown> = {
    then: (r: (v: ReturnType<typeof res>) => unknown) => { flush(); return Promise.resolve(out()).then(r); },
    single: () => { flush(); const d = affected ? affected[0] : one();
      return Promise.resolve({ data: d ? { ...d } : null, error: null }); },
    maybeSingle: () => { flush(); const d = affected ? affected[0] : one();
      return Promise.resolve({ data: d ? { ...d } : null, error: null }); },
  };
  for (const m of ['select', 'neq', 'in', 'is', 'not', 'order', 'limit', 'range',
                   'filter', 'gte', 'lte', 'match', 'or', 'returns', 'abortSignal'])
    c[m] = () => c;
  c.eq = (col: string, v: unknown) => { conds.push([col, v]); return c; };

  /* 🔴 實作-V-0　寫入要**真的改動假資料**。
     改之前這裡只把動作記進 `__WRITES__`、完全不動 `rows`，
     所以在量測靶上「改標題 → 存 → 重開」永遠讀到同一份原始假資料
     ——**修好與沒修好量起來一模一樣**，V-1 的正反兩條停止條件都是假的。
     `__WRITES__` 的記錄照舊，既有斷言在用它。

     ⚠️ **寫入必須延後到真的 await 才執行**：PostgREST 的寫法是
     `.update(row).eq('id', x)`，`.eq()` 在 `.update()` **之後**才被呼叫。
     一收到 `.update()` 就動手的話 `byId` 還是 null，會把整張表都改掉。 */

  c.insert = (payload: unknown) => {
    writes.push(`insert:${table}`);
    isWrite = true;
    pending = () => {
      const arr = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
      const added = arr.map(r => ({ id: `x${++seqId}`, ...r }));
      list().push(...added);
      /* 🔴 H-1　真實的 PostgREST 對 `select('*, expense_splits(*)')` **一定回一個陣列**，
         空的就是 `[]`。新列少了這個欄位的話，`e.expense_splits.filter(...)` 會拿到
         undefined → 整個 app 白屏，而那是**量測靶造出來的假故障**。
         ⚠️ 不要跑去產品那一行加 `?? []` 繞過——那等於把量測靶的問題藏起來。 */
      if (table === 'expenses') for (const r of added) (r as Record<string, unknown>).expense_splits ??= [];
      /* 分帳列要掛回它所屬的那一筆消費，不然存完再打開會看不到自己剛填的分帳 */
      if (table === 'expense_splits') for (const r of added) attachSplit(r);
      return added;
    };
    return c;
  };
  c.update = (patch: unknown) => {
    writes.push(`update:${table}`);
    isWrite = true;
    pending = () => {
      const hit = hits();
      for (const r of hit) Object.assign(r, patch as Record<string, unknown>);
      return hit;
    };
    return c;
  };
  c.upsert = (payload: unknown) => {
    writes.push(`upsert:${table}`);
    isWrite = true;
    pending = () => {
      const arr = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
      return arr.map(r => {
        const cur = list().find(x => x.id === r.id);
        if (cur) { Object.assign(cur, r); return cur; }
        const add = { id: `x${++seqId}`, ...r }; list().push(add); return add;
      });
    };
    return c;
  };
  c.delete = () => {
    writes.push(`delete:${table}`);
    isWrite = true;
    pending = () => {
      const arr = list();
      const hit = hits();
      for (const r of hit) arr.splice(arr.indexOf(r), 1);
      /* 巢狀的那一份也要清掉，不然「改分帳方式」會愈存愈多 */
      if (table === 'expense_splits') for (const r of hit) detachSplit(r);
      return hit;
    };
    return c;
  };
  return c;
}
const stub = {
  from: (t: string) => chain(t),
  /* 實作-W-1b　**把 rpc 真正端出去的那一份露出來**。
     原本斷言讀的是 `__HARNESS_FIXTURE__.trip`（＝`rows.trips[0]`，一律套用過
     `?state=`），所以 rpc 回原始 `trip` 的時候它照樣是 settled——
     那條斷言在量「別人」，不是在量分享頁拿到什麼。 */
  rpc: (_fn: string) => isFailRead()
    ? Promise.resolve(failResult('讀取') as unknown as { data: unknown; error: null })
    : Promise.resolve(recordRpc({
    /* 分享頁的 RPC 查不到 token 時回 null（get_shared_trip 的實際行為） */
    data: tripMissing ? null : {
      /* 🔴 實作-W-1b　**要端出套用過 `?state=` 的那一份**（`rows.trips[0]`），
         不是 fixtures 匯入的原始 `trip`——原本分享頁永遠看到 `status:'active'`，
         於是「已結算的行程在分享頁不標約」這件事在量測靶上**根本量不到**。 */
      trip: rows.trips[0], members,
      expenses: expenses2.map(({ expense_splits: _s, ...e }) => e),
      splits: expenses2.flatMap(e => e.expense_splits),
      /* RPC 回的是這趟**所有**結算與**所有** items——分享頁自己挑 */
      settlements: noExpenses ? [] : settlements,
      settlement_items: noExpenses ? [] : allSettlementItems,
    },
    error: null,
  })),
  auth: {
    getUser: () => Promise.resolve({ data: { user: {
      id: 'u1', email: 'msziyu@gmail.com', user_metadata: { full_name: 'Rozi' },
    } }, error: null }),
    getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: () => Promise.resolve({ error: null }),
    signInWithOAuth: () => Promise.resolve({ error: null }),
  },
  functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: { signedUrl: '' }, error: null }) }) },
  channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
  removeChannel: () => {},
};
(window as unknown as { __SUPABASE_STUB__: unknown }).__SUPABASE_STUB__ = stub;
/* 把這一趟的 trip 掛出來給量測腳本查——只在量測靶裡，production bundle 碰不到 */
(window as unknown as { __TRIP__: unknown }).__TRIP__ = rows.trips[0];
/* **真正被端出去的那一份**（已套用 `?expenses=none`／`?trip=missing` 等開關）。
   `__HARNESS_FIXTURE__` 要照這一份掛，不能直接掛 fixtures 的原始清單——
   兩者不同時，「參數有沒有作用」的反向斷言會拿對照組當通過。 */
(window as unknown as { __SERVED__: unknown }).__SERVED__ = {
  trip: rows.trips[0], expenses: rows.expenses, members: rows.trip_members,
};

