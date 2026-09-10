/* 實作-A-4　未定案狀態的文案：**同一句只准寫一次**。
 * 逐字搬自 Tripay_原型.html 第 1884–1886 行，不得在別處另寫一份。
 *
 * 寫法的兩條規則（#30-5a 定）：
 *   ① 先說東西還在——「先記著了」。使用者最怕的不是算不出來，
 *      是以為自己記的東西不見了。
 *   ② 用可行動的語氣講解除條件——「補上台幣金額就會算進結算」，
 *      不要寫「沒有 X 就不算／會跳過／無效」。
 *      「會跳過這筆」把一個隨時可以解除的暫時狀態寫成永久的判決，
 *      讀起來像在說「別記了」。
 *
 * 理由與 statCard()／expenseGroups() 相同：兩處分開寫，遲早會走鐘。
 * 實作_文案唯一性測試.cjs 會擋住任何在 src/ 其他地方重打這三句的寫法。
 */

/** 這趟還沒設現金匯率，外幣換算不出來 */
export const MSG_NO_RATE = '先記著了。設好這趟的現金匯率就會自動換算。';

/** 只填了外幣、還沒有台幣金額——結算暫時算不進去，補上就會 */
export const MSG_TWD_PENDING = '先記著了。補上台幣金額就會算進結算。';

/** 有匯率時，台幣與外幣兩欄只要填一邊 */
/* 實作-S-5　從金額欄下方**移到「金額」那一列的右側**，改成常駐的小灰字——
   Rozi：「說明文字有兩段，但在不同狀態會各自出現，應該讓他們要同時顯示」。
   文案縮短（拿掉「會」）。320px 塞不下時由 CSS 縮成「填一邊就好」。 */
export const MSG_FILL_ONE = '填一邊就好，另一邊自動換算';

/* 實作-R-4　已結算的行程改了帳之後。
   **不自動作廢那筆結算、不自動重算**——那會抹掉已經「標記付清」的紀錄，而且不可逆。 */
export const MSG_SETTLED_STALE = '帳改了。記得到「結算」分頁按「重新計算」';

/* 封存態的列點下去。封存＝預設只讀（決策 B），但點了完全沒反應跟壞掉分不出來。 */
export const MSG_ARCHIVED_TAP = '這趟封存了。要改的話，先按下面的「重新開啟行程」';

/* 實作-U-1-b　填的是外幣、外幣總額卻空白時，比例回推的分母缺了，
   **每一個參與者都算不出台幣**。使用者必須知道要補哪一格，
   否則只是把錯的數字換成看不懂的狀態。
   逐字取自 `規格_金額未定案與幣別.md` §2.3。 */
export const MSG_NO_FOR_TOTAL = '還沒填外幣總額，先補上才算得出各自要付多少';

/* ══════════════════════════════════════════════════════════════
   實作-U-7　外幣總額空白時的四層提示。
   Rozi：「這一筆金額不是一定不對，是他現在資訊不夠完整……
   他還不知道說這一筆帳不清楚，是不清楚在另外兩個人到底是零，
   還是他們有要負擔的金額。所以我覺得是在我們的標示不夠清楚。」
   ⚠️ 語氣不能寫成「錯了」——是資訊不完整，不是錯。
   ⚠️ 一律用「他們」，不要猜性別。
   ══════════════════════════════════════════════════════════════ */

/** 名字們：1 人直接寫、2 人用「和」、3 人以上不寫名字改寫人數 */
function nameList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} 和 ${names[1]}`;
  return `還有 ${names.length} 人`;
}

/** U-7-a　金額區的灰字：這個狀態下要說「卡在哪」，不是說「填一邊就好」 */
export function msgNeedForTotal(cur: string): string {
  return `還需要 ${cur} 總額`;
}

/** U-7-b　各自金額區下方的警示：**點名是誰沒填**，並給出兩條解除路徑 */
export function msgNoForTotal(names: string[], cur: string): string {
  const they = names.length === 1 ? '他' : '他們';
  /* 名字後面留一個空格（與其他文案的「{名字} 的金額」一致）；
     「還有 N 人」是量詞不是名字，後面**不留空格**——指令原文就是「還有 {N} 人沒填」。 */
  const head = names.length >= 3 ? `還有 ${names.length} 人沒填` : `${nameList(names)} 還沒填`;
  return `${head}，不知道是 0 還是有金額。補上 ${cur} 總額，或幫${they}填 0。`;
}

/** U-7-c　存檔後的第五種 toast。**排在人數分支之前**——那幾句寫「先照均分算」，
 *  在這個狀態下是假的（根本沒有均分，是算不出來）。 */
export function msgSavedNoForTotal(names: string[], cur: string): string {
  return `已存。還沒填 ${cur} 總額，${nameList(names)} 的金額算不出來，補上總額就會算進去。`;
}

/* 🔴 實作-文-1　失敗時的話要讓人看得懂（Copywriter ＋ UX ＋ Aria 定稿，逐字）。
 *
 * 舊寫法是 `toast(e.message || '存不起來，請再試一次')`——`e.message` 有值時
 * 把**後端原文**丟到畫面上。斷網時 supabase-js 丟的是 `Failed to fetch`，
 * 使用者看到那行字，答不出「所以我現在該做什麼」。
 *
 * 交付前檢查第 7 條的三題：
 *   ① 什麼情境看到？在國外按「記下來」，帳沒存進去——Tripay 的**核心情境**。
 *   ② 要幫使用者做什麼決定？要不要再按一次；還有**我剛打的東西白打了嗎**。
 *   ③ 有沒有給出做決定需要的資訊？舊文案沒有。實測程式：失敗時 `onError` 只跳 toast，
 *      **表單不會關、值也還在**——所以「你打的還在」這句話是有依據的，可以講。
 *
 * ⚠️ **後端原文不再顯示在畫面上**，改成 `console.error` 留給除錯。
 *    （登入頁那邊會顯示原文，是因為那一頁的訊息是常駐的，而且使用者需要把那行字轉給 Rozi。）
 */

/** 這個錯誤是不是「連不上網路」。斷網時 supabase-js 丟的是 `Failed to fetch`。
 *
 *  ⚠️ **supabase-js 丟的不是 `Error` 實例，是普通物件** `{ message, code, … }`
 *  （`if (error) throw error` 直接把它丟出來）。只判斷 `e instanceof Error` 的話，
 *  斷網時會落到 `String(e)` ＝ `'[object Object]'`，比對不到而誤判成「一般錯誤」——
 *  第一版就是這樣，畫面跳的是「存不起來」而不是「連不上網路」。 */
export function isOffline(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = typeof e === 'string' ? e
    : (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string')
      ? (e as { message: string }).message
      : '';
  return /Failed to fetch|NetworkError|network/i.test(m);
}

/* 🔴 實作-AF-6　**會自己消失的提示只講發生什麼事，12 字以內。**
   `ToastProvider` 的 toast 只活 2200ms，中文那段時間讀得完約 12–15 字——
   原本那句 30 字的**讀不完就消失，寫了等於沒寫**。
   「你打的還在」「等收訊回來再按一次」拿掉的理由：表單沒關、值還在畫面上、
   按鈕也回到可按狀態，**畫面本身已經回答了**，不需要用文字再講一次。 */
export const MSG_SAVE_OFFLINE   = '現在連不上網路';
export const MSG_SAVE_FAIL      = '存不起來，再試一次';
export const MSG_DELETE_FAIL    = '刪不掉，再試一次';
export const MSG_SETTLE_OFFLINE = '現在連不上網路';
export const MSG_SETTLE_FAIL    = '結算失敗，再試一次';

/* 🔴 實作-讀-1　**讀不到的時候，不准畫成「你還沒有資料」。**
 *
 * 事故形狀：`?fail=read` 時行程列表顯示「還沒有行程。第一趟要去哪？」——
 * 讀不到被畫成「新使用者」。這比登入失敗那個更嚴重：
 * 登入失敗只是沒說話，**這個是說了錯的話**。
 * 使用者在收訊差的地方打開 App，會以為自己的帳不見了——
 * 而「在國外、收訊差」正是 Tripay 的核心情境。
 *
 * 三題：①旅遊中收訊差或斷線時打開 App　②分辨「資料沒了」還是「現在拿不到」、要不要重試
 *       ③需要「**資料還在**」這四個字——舊畫面完全沒回答，還誤導成相反的意思。
 *
 * ⚠️ 「還沒有資料」的空狀態**要保留**，那是真的沒資料時該顯示的。
 *    這一組文案只在**查詢有錯誤**時出現；查詢成功但結果是空的，仍走原本的空狀態。
 */
export const MSG_READ_FAIL_TRIPS_T = '現在讀不到你的行程';
/* 🔴 實作-AF-2　結算頁讀不到時**不准端出任何關於錢的結論**。
   實測 `?screen=s05&fail=read` 顯示「大家剛好打平」——讀不到卻說不用付錢。 */
export const MSG_READ_FAIL_SETTLE_T = '現在讀不到這趟的帳';
export const MSG_READ_FAIL_EXP_T   = '現在讀不到這趟的帳';
/* ⚠️ **這一句是 12 字規則的例外，不要縮短。** 它用在**整頁的錯誤狀態**、
   會一直停在畫面上讓人看；而且那時候畫面是空白的、本身在暗示「你沒有資料」，
   需要一句話把它擋回來。它不是會消失的提示。 */
export const MSG_READ_FAIL_BODY    = '資料還在，只是連不上。等收訊回來再重新整理一次。';
export const MSG_READ_FAIL_RETRY   = '重新整理';

/* 🔴 實作-AF-5　**斷網時 fetch 不會 reject，而是掛在那裡等**（iOS 飛航模式的行為）。
 * 所以 `onError` 永遠不會被呼叫，按鈕停在「存檔中…」，離線文案寫好了卻永遠觸發不到
 * ——Rozi 實測到的就是這個。等網路回來之後那筆才默默存進去。
 *
 * 兩道防線（Rozi 拍板「甲案：立刻告訴我沒存成功」）：
 *   ① 送出前先看 `navigator.onLine`，是 false 就**直接不送出**
 *   ② 有連上網路但連不到伺服器 → **15 秒逾時**，逾時視同失敗走同一條路
 */
export const WRITE_TIMEOUT_MS = 15_000;

/** 送出前的離線守門。回 true 表示「現在不要送」。 */
export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** 15 秒還沒回來就當失敗。**不要把逾時做成靜靜地什麼都不做**——那就是原本的 bug。 */
export function withWriteTimeout<T>(p: Promise<T>, ms = WRITE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Failed to fetch（逾時）')), ms);
    p.then(v => { clearTimeout(t); resolve(v); },
           e => { clearTimeout(t); reject(e); });
  });
}

/**
 * 把一個寫入動作包上**兩道防線**：送出前的離線守門 ＋ 15 秒逾時。
 * 用法：`mutationFn: guardedWrite(async () => { … })`
 *
 * 包成一個函式而不是在每個 `mutationFn` 裡各寫兩行，理由與 `statCard()` 相同——
 * 四個寫入動作各抄一份，遲早有一個漏掉，而漏掉的那個就是下一次「卡在存檔中…」。
 */
export function guardedWrite<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args: A) => {
    if (isDeviceOffline()) return Promise.reject(new Error('Failed to fetch'));
    return withWriteTimeout(fn(...args));
  };
}
