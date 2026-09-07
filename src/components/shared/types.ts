/* 實作-A2-③　六個共用元件的資料形狀。
 * 這一層刻意是「已經算好的結果」——元件只負責畫，不負責算。
 * 引擎（calc／tripSummary）是實作-C 的事；現在把邊界切在這裡，
 * 兩邊才能各自往前走而不互相卡住。 */

export interface SharedMember {
  id: string;
  name: string;
  emoji?: string | null;
}

export interface SharedTrip {
  id: string;
  name: string;
  start: string;                 // ISO date
  members: SharedMember[];
  settleMode?: 'direct' | 'hub';
  hubMember?: string | null;     // settleMode='hub' 時的中心人 id
}

/** 一筆消費，已經算完的樣子 */
export interface SharedExpense {
  id: string;
  title: string;
  emoji: string;
  date: string;                  // ISO date
  created?: number;              // 同一天之內的排序用
  payer: string | null;          // member id
  type: 'shared' | 'individual' | 'single';
  parts?: string[];              // type='single' 時第一個是被算的那個人
  onSpot?: boolean;              // 當場就清了
  sponsor?: boolean;             // 贊助回饋
  /** 歷史資料的 `expense_type='personal'`。**純顯示用**——不進結算的行為沒變 */
  personal?: boolean;
}

/** calc() 的結果：這一筆算出來的金額與未定案狀態 */
export interface SharedCalc {
  twdTotal: number;
  twdPending: boolean;                    // 整筆還沒填台幣
  estimated: Record<string, boolean>;     // 哪些成員的金額是「約」
  /* 實作-T-7　外幣視角要**優先顯示使用者自己填的數字**，不要顯示回推值。
     `forTotalEff` 是這一筆的外幣總額、`forTotalAuto` 說它是不是系統推算出來的。
     兩個值 `calc()` 本來就算好了，只是清單一直沒有用（顯示的都是台幣 × 匯率）。 */
  forTotalEff?: number | null;
  forTotalAuto?: boolean;
  /** 實作-U-2　算到每個人頭上的台幣。算不出來時是 null（`calc()` 本來就有這個值） */
  shares?: Record<string, number | null>;
}

/** tripSummary() 的結果 */
export interface SharedSummary {
  t: SharedTrip;
  list: SharedExpense[];
  calcOf: (e: SharedExpense) => SharedCalc;
  total: number;
  per: Record<string, number>;            // 每人分擔
  approx: Record<string, boolean>;        // 哪幾個人的分擔是「約」
  readonly?: boolean;
  /* 實作-T-7　外幣視角的總花費：填過外幣的那幾筆用原值加總（`forTotalRaw`），
     其餘用台幣回推（`forTotalBackTwd` × 匯率）。`forTotalHasRaw` 說有沒有原值可用。 */
  forTotalRaw?: number;
  forTotalBackTwd?: number;
  forTotalHasRaw?: boolean;
  /* 實作-X　「只看共同的帳」。開關打開時 `list`／`total`／`per` 都**已經**是篩過的，
     被收起來的那幾筆整包放在 `self` 裡給摘要行用。
     ⚠️ `unsettledList` 不受影響——那是「你的資料還沒填完」，跟想看哪一批帳無關。 */
  onlyShared?: boolean;
  self?: SelfPaidBucket;
}

/** 被「只看共同的帳」收起來的那幾筆（自己幫自己付的） */
export interface SelfPaidBucket {
  list: SharedExpense[];
  /** 台幣合計。**只加算得出來、且不是贊助的那幾筆**——與 `total` 的口徑一致，
      否則「總花費(關) − 共同的帳(開) ＝ 摘要行」這條恆等式不會成立 */
  total: number;
  /** 收起來的筆裡算不出台幣的有幾筆。它們的金額**不混進** `total` */
  pending: number;
  /** 外幣視角用，口徑與 `forTotalRaw`／`forTotalBackTwd` 相同 */
  forRaw: number;
  forBackTwd: number;
  hasRaw: boolean;
}

/** 一筆轉帳 */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** 金額顯示選項：整頁切外幣時傳進來 */
export interface MoneyOpts {
  sym?: string;
  rate?: number | null;
  /** 實作-T-7　使用者自己填的外幣原值。有值就原樣顯示，不用台幣回推 */
  raw?: number | null;
}
