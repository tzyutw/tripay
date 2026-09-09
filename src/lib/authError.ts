/* 🔴 實作-登-1　OAuth 失敗時，Supabase 把錯誤放在**導回網址的 hash**
 * （`…/tripay/#error=access_denied&error_description=…`），少數情況放 query。
 * Rozi 的家人選完 Google 帳號之後畫面直接跳回登入頁、一個字都沒有，就是因為
 * 沒有任何一段程式讀它，而 `AuthLayout` 看到 session 是 null 就
 * `<Navigate to="/login" replace />`——react-router 換 location 時**hash 被丟掉**。
 *
 * ⚠️ 所以這裡在**模組載入時**（App 開始 render 之前）就把它抓下來存成快照，
 *    不管後面誰轉址、轉幾次都不會弄丟。實測過：只在 LoginPage 的 effect 裡讀，
 *    從 `/` 被轉到 `/login` 之後就讀不到了。
 * ⚠️ 抓完立刻 `history.replaceState` 把參數清掉，不然重新整理又跳出來。
 */

export interface AuthError {
  /** `error` 參數，例如 `access_denied` */
  code: string;
  /** `error_description`，已經 URL decode（`+` 也還原成空白）。沒有就是 null */
  description: string | null;
}

/* ⚠️ **不要自己 decode**。`URLSearchParams.get()` 走的是 form-urlencoded 規則，
   已經把 `+` 還原成空白（`Test+reason` → `Test reason`），
   而且把 `%2B` 正確還原成**字面的 `+`**（`a%2Bb` → `a+b`）。
   我原本多寫了一行 `.replace(/\+/g, ' ')`——對 `Test+reason` 沒有差別（所以金絲雀不會紅），
   但會把 `a+b` 這種**真的有加號**的說明字串弄成 `a b`。實測確認後拿掉。 */
function pick(search: string): AuthError | null {
  if (!search) return null;
  const q = new URLSearchParams(search.replace(/^[?#]/, ''));
  const code = q.get('error');
  if (!code) return null;
  return { code, description: q.get('error_description') };
}

function capture(): AuthError | null {
  if (typeof window === 'undefined') return null;
  /* hash 先看——Supabase 放那裡；query 是少數情況 */
  const hit = pick(window.location.hash) ?? pick(window.location.search);
  if (!hit) return null;
  /* 清掉網址上的錯誤參數，重新整理才不會又跳出來 */
  try {
    const url = new URL(window.location.href);
    url.hash = '';
    for (const k of ['error', 'error_description', 'error_code']) url.searchParams.delete(k);
    window.history.replaceState(null, '', url.pathname + url.search);
  } catch { /* 舊瀏覽器不支援就算了，訊息還是看得到 */ }
  return hit;
}

/** 開機時抓下來的那一份。**在任何轉址發生之前**就已經存好。 */
export const bootAuthError: AuthError | null = capture();
