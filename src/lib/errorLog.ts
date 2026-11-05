/* 後台-D　前台錯誤紀錄。
 *
 * 存檔或讀取（同步）失敗時，在 `client_error_log` 記一筆，後台看得到：
 * 時間、誰（資料庫用登入身分自動填）、哪個行程、哪個畫面、錯誤訊息。
 *
 * 🔴 **記錄失敗絕不可以影響記帳**——這支檔案的每一個出口都吞掉例外：
 *   - 不 await：呼叫端不會因為記錄而變慢
 *   - 送不出去（離線、資料表還沒建、權限不對）→ 先放進這台手機的佇列，
 *     等網路回來或下次開 app 再補送；佇列最多 20 筆，滿了丟最舊的
 *   - localStorage 用不了（無痕模式）→ 直接放棄，不重試
 *   - insert **不加 `.select()`**：家人沒有讀取這張表的權限，
 *     加了 `returning` 會被 RLS 擋成失敗（CLAUDE.md「只讀的驗證證明不了能不能用」①）
 */
import { supabase } from '@/lib/supabaseClient';

export type ErrorKind = 'save' | 'sync' | 'other';

export interface ClientErrorRow {
  occurred_at: string;
  trip_id: string | null;
  screen: string;
  path: string;
  kind: ErrorKind;
  message: string;
  user_agent: string;
  app_version: string;
}

const QUEUE_KEY = 'tripay.errlog.queue.v1';
const QUEUE_MAX = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 從網址判斷畫面名稱與行程。純函式，單元測試直接打。 */
export function screenOf(pathname: string): { screen: string; tripId: string | null } {
  /* 正式站掛在 /tripay/ 底下，先把 base 拿掉 */
  const p = pathname.replace(/^\/tripay(?=\/|$)/, '') || '/';
  const m = p.match(/^\/trips\/([^/]+)(?:\/([^/]+))?/);
  if (m) {
    const id = UUID.test(m[1]) ? m[1] : null;
    if (m[1] === 'new') return { screen: '建立行程', tripId: null };
    const sub: Record<string, string> = {
      edit: '編輯行程', more: '行程選單', share: '分享', copy: '複製行程',
      delete: '刪除行程', settlement: '結算',
    };
    return { screen: m[2] ? (sub[m[2]] ?? m[2]) : '記帳頁', tripId: id };
  }
  if (p === '/' || p === '') return { screen: '行程列表', tripId: null };
  if (p.startsWith('/settings')) return { screen: '設定', tripId: null };
  if (p.startsWith('/login')) return { screen: '登入', tripId: null };
  if (p.startsWith('/share/')) return { screen: '分享頁', tripId: null };
  if (p.startsWith('/admin')) return { screen: '後台', tripId: null };
  return { screen: p.slice(0, 60), tripId: null };
}

/** 錯誤物件 → 一行訊息。Supabase 的錯誤是 `{ message, code, details }`，不是 Error。 */
export function messageOf(e: unknown): string {
  if (e == null) return '（沒有訊息）';
  if (typeof e === 'string') return e.slice(0, 2000);
  const o = e as { message?: unknown; code?: unknown; details?: unknown };
  const parts = [o.message, o.code ? `code=${String(o.code)}` : null, o.details]
    .filter(v => v != null && v !== '').map(String);
  const s = parts.length ? parts.join(' · ') : (() => {
    try { return JSON.stringify(e); } catch { return String(e); }
  })();
  return s.slice(0, 2000);
}

function readQueue(): ClientErrorRow[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function writeQueue(q: ClientErrorRow[]): void {
  try {
    if (q.length) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_MAX)));
    else window.localStorage.removeItem(QUEUE_KEY);
  } catch { /* 無痕模式：放棄 */ }
}

let flushing = false;

/** 把佇列裡的送出去。送成功的才移除；任何一步失敗就整批留著，下次再送。 */
export async function flushErrorQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const q = readQueue();
    if (!q.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const { error } = await supabase.from('client_error_log').insert(q);
    if (!error) {
      /* 送出期間可能又進來新的，只移除送出去的那幾筆 */
      writeQueue(readQueue().slice(q.length));
    }
  } catch { /* 吞掉 */ }
  finally { flushing = false; }
}

/** 記一筆。**同步回傳、永不拋錯**。 */
export function logClientError(kind: ErrorKind, err: unknown, pathname?: string): void {
  try {
    const path = pathname ?? (typeof location !== 'undefined' ? location.pathname : '');
    const { screen, tripId } = screenOf(path);
    if (screen === '後台') return;          // 後台自己的錯誤不記，免得洗版
    const row: ClientErrorRow = {
      occurred_at: new Date().toISOString(),
      trip_id: tripId,
      screen: screen.slice(0, 60),
      path: path.slice(0, 300),
      kind,
      message: messageOf(err),
      user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 400),
      app_version: (typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev').slice(0, 40),
    };
    writeQueue([...readQueue(), row]);
    void flushErrorQueue();
  } catch { /* 吞掉 */ }
}

/** 開 app 時呼叫一次：補送上次沒送出的，並在網路回來時再補送。 */
export function installErrorLogFlush(): void {
  try {
    window.addEventListener('online', () => { void flushErrorQueue(); });
    void flushErrorQueue();
  } catch { /* 吞掉 */ }
}
