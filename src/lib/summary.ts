/* 實作-B-3　行程層彙總：把資料庫的列換算成共用元件吃的 `SharedSummary`。
 *
 * `calc()` 與 `tripSummary()` **逐條移植自 `Tripay_原型.html`（第 1767–1900 行）**，
 * 規則編號對應 `規格_金額未定案與幣別.md` 的 §1 §2 §3 §5.1 §5.2 §5.6。
 * 數值邏輯不得在這裡自行調整——要改就改原型與規格，再搬過來。
 *
 * ⚠️ 這是**呈現層**的彙總，不是結算引擎。
 * 結算的淨額與轉帳由 `settlement-engine` 算（C-1 只做查證、不動它）。
 * 兩者本來就分開：這裡要畫出「還沒填完」的樣子，引擎只認填完的。
 */
import type { Trip, TripMember, ExpenseWithSplits } from '@/types/database';
import type { SharedExpense, SharedCalc, SharedSummary, SharedTrip, SelfPaidBucket } from '@/components/shared/types';

/** 這趟的現金匯率：1 外幣 = rate 台幣。兩欄任一沒填就是 null（換算不了） */
export function tripRate(t: Pick<Trip, 'cash_rate_twd' | 'cash_rate_foreign'>): number | null {
  const twd = Number(t.cash_rate_twd), fr = Number(t.cash_rate_foreign);
  if (!Number.isFinite(twd) || !Number.isFinite(fr) || twd <= 0) return null;
  return fr / twd;
}

/** 單筆消費的判定結果，比 SharedCalc 多帶表單／未定案清單要用的中間值 */
export interface ExpenseCalc extends SharedCalc {
  rate: number | null;
  twdFromRate: boolean;
  needRateLink: boolean;
  isEach: boolean;
  blanks: string[];
  forTotalEff: number | null;
  forTotalAuto: boolean;
  noAutoReason: 'noForeignTotal' | null;
  fillsAreForeign: boolean;
  /** 每人在「填寫幣別」下的金額 */
  valInCur: Record<string, number | null>;
  /** 每人換算成台幣的分擔 */
  shares: Record<string, number | null>;
  /** 這一筆整體還沒算清楚（進 S-03d） */
  unsettled: boolean;
  /** 這一筆產生的債權債務：參與者欠付款人 */
  debts: { from: string; to: string; amount: number }[];
}

/** 參與這一筆的成員 id（照成員順序，不照 split 的建立順序） */
function partsOf(e: ExpenseWithSplits, members: TripMember[]): string[] {
  if (e.expense_type === 'personal') return [];
  if (e.individual_member_id) return [e.individual_member_id];
  const on = new Set((e.expense_splits ?? []).filter(s => s.is_participating).map(s => s.member_id));
  return members.filter(m => on.has(m.id)).map(m => m.id);
}

/** 規格 §1 §2 §3。移植自原型 calc()。 */
export function calc(
  e: ExpenseWithSplits,
  t: Pick<Trip, 'cash_rate_twd' | 'cash_rate_foreign'>,
  members: TripMember[],
): ExpenseCalc {
  const rate = tripRate(t);          // #17-4 匯率只有 S-02b 一個入口，沒有單筆覆寫
  const parts = partsOf(e, members);
  const forT = e.foreign_amount, twdIn = e.twd_amount;

  /* #17-4 換算規則，與支付方式無關：
     有台幣 → 直接用（實付最準）｜只有外幣 → 用行程匯率｜兩者都有 → 用台幣，外幣只當紀錄
     只有外幣且還沒設匯率 → twdPending，結算跳過，但照樣可以存檔 */
  let twdTotal: number | null = Number.isFinite(twdIn as number) ? (twdIn as number) : null;
  let twdFromRate = false;
  if (twdTotal == null && Number.isFinite(forT as number) && rate) {
    twdTotal = Math.round((forT as number) / rate); twdFromRate = true;
  }
  const needRateLink = twdTotal == null && Number.isFinite(forT as number) && !rate;
  const twdPending = twdTotal == null;

  /* 各自金額（§2.2 §2.3） */
  const isEach = e.expense_type === 'individual';
  const manual: Record<string, number> = {}, blanks: string[] = [];
  let sumManual = 0;
  if (isEach) {
    const byId = new Map((e.expense_splits ?? []).map(s => [s.member_id, s]));
    for (const id of parts) {
      const s = byId.get(id);
      /* 填寫幣別是外幣時讀 split_amount_foreign——P1-0 就是這兩欄搞混造成的靜默錯帳 */
      const raw = e.split_fill_currency === 'FOR' ? s?.split_amount_foreign : s?.split_amount;
      if (raw != null && Number.isFinite(raw)) { manual[id] = raw; sumManual += raw; }
      else blanks.push(id);
    }
  }

  /* #20-3／#20-4 填寫幣別是使用者**明確選的狀態**，不是從「有沒有外幣總額」推斷。
     餘額的基準跟著它走——填台幣就用台幣總額，根本用不到外幣總額。 */
  const fillsAreForeign = isEach && e.split_fill_currency === 'FOR';
  let forTotalEff: number | null = Number.isFinite(forT as number) ? (forT as number) : null;
  let forTotalAuto = false;
  let noAutoReason: 'noForeignTotal' | null = null;
  if (fillsAreForeign && forTotalEff == null) {
    if (blanks.length === 0 && sumManual > 0) { forTotalEff = sumManual; forTotalAuto = true; }   // R6
    else if (sumManual > 0 || blanks.length) noAutoReason = 'noForeignTotal';
  }

  const valInCur: Record<string, number | null> = {};
  const shares: Record<string, number | null> = {};
  if (isEach) {
    const base = fillsAreForeign ? forTotalEff : twdTotal;      // #20-4 基準跟著填寫幣別
    if (base != null && !noAutoReason) {
      const remain = base - sumManual;
      const auto = blanks.length ? Math.max(0, Math.floor(remain / blanks.length)) : null;
      for (const id of parts) valInCur[id] = (id in manual) ? manual[id] : (auto ?? 0);
      if (blanks.length && remain > 0 && auto != null)
        valInCur[blanks[blanks.length - 1]]! += remain - auto * blanks.length;
    } else {
      for (const id of parts) valInCur[id] = (id in manual) ? manual[id] : null;
    }
    /* 換算台幣：比例回推（§2.2 `各人台幣 = 台幣總額 × 各人外幣 ÷ 外幣總額`），不用匯率 */
    for (const id of parts) {
      const v = valInCur[id];
      if (v == null || twdPending) { shares[id] = null; continue; }
      /* 🔴 實作-U-1　填的是外幣、但**外幣總額空白**時，比例回推的分母缺了
         → **每一個參與者都算不出台幣**，包含已經填了金額的人。
         改之前這裡會掉進 `Math.round(v)`，**直接把外幣數字當成台幣**：
         production 的「藥局」那筆台幣只有 1,140，各人分擔卻加到 52,000（灌水 50,860），
         總花費 97,622 而四個成員加起來 148,482——**畫面上沒有任何一句話說它算錯了**。
         §2.2 明寫用比例回推、§2.5 明寫「不得由系統推斷，那會猜錯」，
         所以**不准拿行程匯率來補**這個分母。 */
      if (fillsAreForeign && !forTotalEff) { shares[id] = null; continue; }
      shares[id] = fillsAreForeign
        ? Math.round(twdTotal! * v / forTotalEff!)               // R5 比例回推
        : Math.round(v);
    }
    if (!twdPending && e.payer_member_id && parts.includes(e.payer_member_id)
        && parts.every(id => shares[id] != null)) {
      const sum = parts.reduce((a, id) => a + (shares[id] as number), 0);
      shares[e.payer_member_id] = (shares[e.payer_member_id] as number) + twdTotal! - sum;
    }
  } else if (!twdPending && parts.length) {
    const per = Math.round(twdTotal! / parts.length);
    for (const id of parts) { shares[id] = per; valInCur[id] = per; }
    if (e.payer_member_id && parts.includes(e.payer_member_id))
      shares[e.payer_member_id] = per + twdTotal! - per * parts.length;
  } else {
    for (const id of parts) { shares[id] = null; valInCur[id] = null; }
  }

  /* §3 未定案判定：未輸入 0 或 1 人不標記，2 人以上才標記 */
  const estimated: Record<string, boolean> = {};
  if (isEach && blanks.length >= 2 && !noAutoReason) for (const id of blanks) estimated[id] = true;
  const unsettled = twdPending || (isEach && blanks.length >= 2);

  const debts = parts
    .filter(id => id !== e.payer_member_id && shares[id])
    .map(id => ({ from: id, to: e.payer_member_id as string, amount: shares[id] as number }));

  return { rate, twdTotal: twdTotal ?? 0, twdPending, twdFromRate, needRateLink, isEach,
           blanks, forTotalEff, forTotalAuto, noAutoReason, fillsAreForeign,
           valInCur, shares, estimated, unsettled, debts };
}

/** 一列消費換成共用元件的形狀 */
export function toSharedExpense(e: ExpenseWithSplits, members: TripMember[]): SharedExpense {
  return {
    id: e.id,
    title: e.title,
    emoji: e.category_emoji,
    date: e.expense_date,
    created: new Date(e.created_at).getTime(),
    payer: e.payer_member_id,
    type: e.individual_member_id ? 'single'
        : e.expense_type === 'individual' ? 'individual' : 'shared',
    parts: e.individual_member_id ? [e.individual_member_id] : partsOf(e, members),
    onSpot: e.settled_on_spot,
    sponsor: e.is_sponsor,
    /* production 有 128 筆歷史消費是 `personal`（四趟舊行程的個人購物）。
       它們本來就不進結算（`partsOf()` 回空陣列），但畫面上完全沒有標記，
       跟「一起分」長得一模一樣。這個旗標**只給顯示層**用，金額一分都不變。 */
    personal: e.expense_type === 'personal',
  };
}

/**
 * 實作-X-0　一筆消費算不算「自己幫自己付的」。
 *
 * 兩個條件任一成立：
 *   (a) `expense_type === 'personal'`（畫面上標「自己的」那種）
 *   (b) 實際參與者剛好一個人，而且那個人就是付款人
 *
 * ⚠️ **(a) 不可以省**：`personal` 那種筆根本沒有參與列（`parts` 是空陣列），
 *    只用 (b) 會整批漏掉（原型的「阿明的計程車」就是）。
 * ⚠️ **不可以用 `individual_member_id` 代替 (b)**：正式帳裡有筆
 *    `expense_type='shared'`、`individual_member_id` 是 null、
 *    但使用者把其他人全部取消勾選只留自己——要看**實際的參與列**。
 * ⚠️ 反向：「別人付、只算某一個人」（參與一人但**不是**付款人）會產生欠款，
 *    絕對不能收起來。
 */
export function isSelfPaid(row: ExpenseWithSplits, se: SharedExpense): boolean {
  if (row.expense_type === 'personal') return true;
  const parts = se.parts ?? [];
  return parts.length === 1 && parts[0] === row.payer_member_id;
}

/** 規格 §5.1 §5.2 §5.6。移植自原型 tripSummary()。 */
export function tripSummary(
  trip: Trip & { trip_members: TripMember[] },
  expenses: ExpenseWithSplits[],
  displayStatus: string,
  /* 實作-X　「只看共同的帳」。**篩選放在引擎裡**，不在畫面層各算一套——
     總行程頁、`{名字} 的帳` 與統計卡三處都吃這一份結果，才不會對不起來。 */
  opts: { onlyShared?: boolean } = {},
): SharedSummary & { unsettledList: { e: SharedExpense; c: ExpenseCalc }[] } {
  const onlyShared = Boolean(opts.onlyShared);
  const members = [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
  const readonly = displayStatus === 'settled' || displayStatus === 'archived';   // §5.6

  const t: SharedTrip = {
    id: trip.id, name: trip.name, start: trip.start_date,
    members: members.map(m => ({ id: m.id, name: m.name, emoji: m.emoji })),
    settleMode: trip.settlement_mode as 'direct' | 'hub',
    hubMember: trip.hub_member_id,
  };

  let total = 0;
  /* 實作-T-7　外幣視角的總花費：**使用者填過外幣的那幾筆用原值加總**，其餘回推。
     `forTotalRaw` 是「已經有原值的那部分」，`forTotalBackTwd` 是「還要回推的台幣部分」。
     ⚠️ 這裡**不改任何計算**——台幣的 `total` 一行都沒動，只是多算一組給外幣視角看。 */
  let forTotalRaw = 0, forTotalBackTwd = 0, forTotalHasRaw = false;
  const per: Record<string, number> = {}, approx: Record<string, boolean> = {};
  for (const m of members) { per[m.id] = 0; approx[m.id] = false; }

  const calcCache = new Map<string, ExpenseCalc>();
  const unsettledList: { e: SharedExpense; c: ExpenseCalc }[] = [];
  const list: SharedExpense[] = [];
  const self: SelfPaidBucket = {
    list: [], total: 0, pending: 0, forRaw: 0, forBackTwd: 0, hasRaw: false,
  };

  for (const row of expenses) {
    const c = calc(row, trip, members);
    calcCache.set(row.id, c);
    const se = toSharedExpense(row, members);

    /* §5.2 同筆只算一次。**放在篩選之前**——「有 N 筆還沒算清楚」是
       「你的資料還沒填完」，跟現在想看哪一批帳無關；讓它跟著開關變，
       等於一個開關可以把警告藏起來。 */
    if (c.unsettled) unsettledList.push({ e: se, c });

    if (onlyShared && isSelfPaid(row, se)) {
      self.list.push(se);
      /* 口徑與下面的 `total` 一模一樣，恆等式才會成立 */
      if (!c.twdPending && !row.is_sponsor) {
        self.total += c.twdTotal;
        if (c.forTotalEff != null && !c.forTotalAuto) { self.forRaw += c.forTotalEff; self.hasRaw = true; }
        else self.forBackTwd += c.twdTotal;
      } else if (c.twdPending) self.pending += 1;
      continue;
    }

    list.push(se);

    /* 總花費排除贊助（負額），否則把總支出灌低；當場就清了仍計入（確實花了） */
    if (!c.twdPending && !row.is_sponsor) {
      total += c.twdTotal;
      if (c.forTotalEff != null && !c.forTotalAuto) { forTotalRaw += c.forTotalEff; forTotalHasRaw = true; }
      else forTotalBackTwd += c.twdTotal;
    }
    for (const id of se.parts ?? []) {
      const s = c.shares[id];
      if (s != null) per[id] = (per[id] ?? 0) + s;
      if (c.twdPending || c.estimated[id]) approx[id] = true;     // §5.1 (a)(b)
    }
  }

  return {
    t, list, readonly, total, per, approx, unsettledList, onlyShared, self,
    forTotalRaw, forTotalBackTwd, forTotalHasRaw,
    calcOf: (e: SharedExpense) => calcCache.get(e.id) ?? {
      twdTotal: 0, twdPending: true, estimated: {}, forTotalEff: null, forTotalAuto: false,
    } as SharedCalc,
  };
}


/** 一筆轉帳 */
export interface Tx { from: string; to: string; amount: number }

/**
 * 結算：每人淨額 ＋ 轉帳路徑。移植自原型 settleTrip()。
 *
 * #22-6c **兩種模式的淨額完全相同**，只有轉帳路徑不同——
 * `net` 由這裡算（與後端引擎同一套規則），`tx` 只是把 net 拆成幾筆怎麼轉。
 * 這也表示 hub 不需要跑四趟 verify：淨額沒動。
 */
export function settleTrip(
  S: ReturnType<typeof tripSummary>,
  expenses: ExpenseWithSplits[],
  trip: Trip & { trip_members: TripMember[] },
): { net: Record<string, number>; tx: Tx[] } {
  const members = [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
  const net: Record<string, number> = {};
  for (const m of members) net[m.id] = 0;

  for (const row of expenses) {
    if (row.settled_on_spot) continue;              // 當場就清了：記錄但不進結算
    const c = calc(row, trip, members);
    if (c.twdPending) continue;                      // 待填的筆跳過，不影響整趟
    for (const d of c.debts) { net[d.from] -= d.amount; net[d.to] += d.amount; }
  }

  const tx: Tx[] = [];
  if (trip.settlement_mode === 'hub' && trip.hub_member_id) {
    const hub = trip.hub_member_id;
    for (const [id, v] of Object.entries(net)) {
      if (id === hub) continue;                                  // 中心人不轉給自己
      if (v < 0) tx.push({ from: id, to: hub, amount: -v });      // 欠錢的人全額轉給中心人
      else if (v > 0) tx.push({ from: hub, to: id, amount: v });  // 該拿回的人由中心人轉給他
    }
  } else {
    /* minimum transactions：最大債主配最大債權人 */
    const cred: [string, number][] = [], debt: [string, number][] = [];
    for (const [id, v] of Object.entries(net)) {
      if (v > 0) cred.push([id, v]); else if (v < 0) debt.push([id, -v]);
    }
    cred.sort((a, b) => b[1] - a[1]); debt.sort((a, b) => b[1] - a[1]);
    let i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      const amt = Math.min(debt[i][1], cred[j][1]);
      if (amt > 0) tx.push({ from: debt[i][0], to: cred[j][0], amount: amt });
      debt[i][1] -= amt; cred[j][1] -= amt;
      if (debt[i][1] === 0) i++;
      if (cred[j][1] === 0) j++;
    }
  }
  void S;
  return { net, tx };
}

/** 代墊比例：誰先付了最多、佔幾成。S-05-31 的引導條件用它。 */
export function prepaidShare(
  expenses: ExpenseWithSplits[],
  trip: Trip & { trip_members: TripMember[] },
): { top: string | null; ratio: number; total: number } {
  const members = [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
  const by: Record<string, number> = {};
  for (const m of members) by[m.id] = 0;
  let total = 0;
  for (const row of expenses) {
    if (row.settled_on_spot || row.is_sponsor) continue;
    const c = calc(row, trip, members);
    if (c.twdPending || !row.payer_member_id) continue;
    by[row.payer_member_id] = (by[row.payer_member_id] ?? 0) + c.twdTotal;
    total += c.twdTotal;
  }
  let top: string | null = null, ratio = 0;
  for (const [id, v] of Object.entries(by))
    if (total > 0 && v / total > ratio) { ratio = v / total; top = id; }
  return { top, ratio, total };
}
