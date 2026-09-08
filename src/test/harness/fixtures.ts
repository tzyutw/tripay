/* 實作-C-3　版面回歸用的假資料：**與 fixtures/screens.json 同源的那一組**
 * （原型的 demoExpenses()）。版面測試量的是真實元件配真實 CSS，
 * 所以資料也要是真實形狀，不能用一兩筆敷衍——短內容量不出溢出。 */
import type { Trip, TripMember, ExpenseWithSplits } from '@/types/database';
import { rateColumns, rateDirection, TWD_PER_UNIT } from '@/lib/currencyTable';
import { tripSummary, settleTrip } from '@/lib/summary';

export const M = ['m0', 'm1', 'm2', 'm3'];

/* ⚠️ 這個檔會被 push 到**公開的** GitHub，所以不放 Rozi 的真實成員名與真實金額。
   用中性英文短名——**要對齊的是「狀態」，不是「名字」**；
   名字只需維持「英文短名」這個字寬特性（中文名與英文名渲染寬度不同，會影響版面斷言）。 */
const NAMES = ['Alex', 'Robin', 'Sam', 'Kai'];
const EMOJI = ['🐵', '🐱', '🍋', '🐟'];

function mkMembers(withEmoji: boolean): TripMember[] {
  return NAMES.map((name, i) => ({
    id: M[i], trip_id: TRIP_ID, name, emoji: withEmoji ? EMOJI[i] : '', sort_order: i,
    linked_profile_id: null, person_id: null, user_id: null, role: null,
    created_at: '2026-03-01',
  })) as TripMember[];
}

/**
 * `?members=noemoji` 時所有成員都沒有 emoji。
 *
 * **為什麼要有這個模式**：原本的假資料清一色有 emoji，
 * 所以 Avatar 的第二層（名字第一個字＋填色圓底）**從來沒被測到過**——
 * Rozi 在手機上反覆回報「沒有填色圓底」，而版面回歸 263 條全綠。
 * 假資料只走 happy path，等於那條路沒有人守。
 */
const Q = new URLSearchParams(location.search);

/**
 * 實作-K　把假資料切成 Rozi 真實資料的**形狀**。
 *
 * 她每天會打開的三趟：成員全部沒有 emoji、0 筆消費、
 * 其中一趟匯率只填了外幣那一邊、支付方式有自訂的第三項。
 * **原本的假資料一項都不符合**——所以那些路徑從來沒被測到，
 * 而她連續三批回報的問題，版面回歸 263 條全綠。
 *
 * 預設值一律維持現況，不影響既有斷言。
 */
export const membersHaveEmoji = Q.get('members') !== 'noemoji';
/** `?expenses=none`：一趟還沒記過帳的行程 */
export const noExpenses = Q.get('expenses') === 'none';
/** `?rate=half`：匯率只填了外幣那一邊（換算不出台幣） */
export const halfRate = Q.get('rate') === 'half';
/** `?pays=none`：支付方式還沒設定 */
export const noPays = Q.get('pays') === 'none';
/** `?trip=missing`：連結失效／行程已被刪／書籤過期——查不到任何列 */
export const tripMissing = Q.get('trip') === 'missing';
/** `?rate=full`：兩欄都填好（台幣 1／外幣 0.21）——驗端到端真的換算得出來 */
export const fullRate = Q.get('rate') === 'full';
/** `?cur=JPY`：換成「1」在**外幣側**的幣別。
 *  預設的 KRW 剛好 `oneSideOf === 'twd'`，與寫死 `isTwd` 的結果一樣——
 *  不換一個幣別，「placeholder 依 oneSideOf 走」那條斷言驗不出東西。 */
export const currencyOverride = Q.get('cur');
/** `?fill=for`：一筆「各自付各的」＋**各人只填了外幣**。
 *  這條路徑在原型與 harness 上**從來沒被畫過**——而它會讓結算把整筆算到付款人頭上。 */
export const fillFor = Q.get('fill') === 'for';
/** `?forOnly=1`：只有一筆 shared 消費、只有外幣沒有台幣。
 *  單獨掛這一筆，總額與分擔就只反映它，量得出「有沒有被結算跳過」。 */
export const forOnly = Q.get('forOnly') === '1';
/** `?settlements=many`：**Rozi 真實資料的形狀**——一趟有十幾次結算，
 *  只有一次是 confirmed。不挑就會把同樣三筆轉帳畫十二遍（實作-G 咬過一次）。 */
export const settlementsMany = Q.get('settlements') === 'many';
/** `?view=foreign`：整頁只有外幣的視角。**那裡不准變灰**——
 *  灰是給「台幣與外幣並列時分主從」用的，整頁灰掉會變成沒東西可讀。 */
export const viewForeign = Q.get('view') === 'foreign';
/** `?settle=hub`：都轉給同一個人。**production 唯一一趟 hub 是 Rozi 正在填的
 *  `驗收：濟州島`，還沒結算過**——實作-T 做的結算三段在 hub 下一次都沒被驗過。
 *  收款人刻意挑**不是付最多錢的那個人**，否則 direct 與 hub 會產生一樣的轉帳清單。 */
export const settleHub = Q.get('settle') === 'hub';
/** `?fill=noforetotal`：各自付各的、填的是外幣、**外幣總額空白**、還有人沒填。
 *  這就是 production「藥局」那一筆的形狀——改之前它會把外幣數字當成台幣。 */
export const fillNoForTotal = Q.get('fill') === 'noforetotal';
/* 實作-AA-3　`?fill=twd`：**台幣填**的「各自付各的」。
   `?fill=for` 是外幣填、`?fill=noforetotal` 是外幣總額空白——這兩個不要動。
   沒有這一筆，「台幣填 → 切外幣 → 再切回來」那條路徑就沒有靶。 */
export const fillTwd = Q.get('fill') === 'twd';
/* 實作-AA　`?fill=oy`：**來回換算會掉精度**的形狀，照 Rozi 那筆「OY髮油」抄
   （整筆台幣 1,118、外幣總額 54,000、兩人 33,000／21,000）。
   ⚠️ 沒有這一筆，「切回去要還原使用者打的值」那條**驗不到**——
   `?fill=for` 的 12,000／18,000 來回換算剛好整除，
   「還原」與「重算」得到一模一樣的結果，金絲雀不會紅。
   重算會得到 32,989／21,011，還原才是 33,000／21,000。 */
export const fillOy = Q.get('fill') === 'oy';
/** `?blanks=1|2|3`：外幣總額空白時**幾個人沒填**——三種文案各要有假資料走過 */
export const blanksN = Number(Q.get('blanks') || 0);

/* 實作-X　`?expenses=allself`：**每一筆都是自己買給自己的**。
   開關打開後清單會是空的——停止條件 16 要驗那時有沒有一句話說明為什麼空。 */
export const allSelf = Q.get('expenses') === 'allself';
/* 實作-X　`?tripid=t2`：換一趟行程。開關的記憶是**以 trip id 為 key**，
   沒有第二個 id 就驗不出「不同行程各自記」（只驗一趟等於沒驗）。 */
export const TRIP_ID = Q.get('tripid') || 't1';
/* 實作-X　`?selfpending=1`：多一筆**自己買給自己、而且金額還沒填**的消費。
   ⚠️ 沒有這一筆，「未定案入口不受開關影響」那條斷言**永遠是綠的**——
   base 假資料裡自己買的兩筆都填了金額，把 unsettledList 搬到篩選後面也照樣過關。
   「查了但沒查到」與「沒有問題」在輸出裡長得一模一樣。 */
export const selfPending = Q.get('selfpending') === '1';

/** 該幣別「好記的那個方向」的代表值 → 正確的兩欄組合 */
function fullRateColumns(code: string) {
  const p = TWD_PER_UNIT[code] ?? 1;
  const n = p < 0.1 ? Number((1 / p).toFixed(0)) : Number(p.toFixed(2));
  return rateColumns(n, rateDirection(code, n));
}

export const members: TripMember[] = mkMembers(membersHaveEmoji);

export const trip = {
  id: TRIP_ID, owner_id: 'u1', name: '2026 濟州島四寶團', emoji: '✈️',
  currency: currencyOverride || 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: M[0], collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: noPays ? null : ['現金', '信用卡', 'Linepay'],
  ...(settleHub ? { settlement_mode: 'hub', hub_member_id: M[2] } : {}),
  /* `?rate=full`：**照該幣別正確的方向**組出兩欄（實作-Q-1）。
     先前寫死 `twd:1, for:0.21`，那對 KRW 是對的、對 JPY 是**反的**——
     於是 JPY 的端到端測試會拿到 1,469,048 而不是 64,785，
     而那正是 production 出事的那個數字。假資料反了，測試就守不到東西。 */
  ...(fullRate ? fullRateColumns(currencyOverride || 'KRW')
               : { cash_rate_twd: null, cash_rate_foreign: halfRate ? 0.19 : null }),
  tone_seq: 0, created_at: '2026-03-01', updated_at: '2026-03-01',
  trip_members: members,
} as unknown as Trip & { trip_members: TripMember[] };

let seq = 0;
function mk(o: Record<string, unknown>): ExpenseWithSplits {
  seq += 1;
  const parts = (o.parts as string[]) ?? M;
  const indiv = (o.indiv as Record<string, number>) ?? {};
  /* 各人只填外幣時走這一袋——`calc()` 讀的是 `split_amount_foreign` */
  const indivFor = (o.indivFor as Record<string, number>) ?? {};
  return {
    id: `e${seq}`, trip_id: TRIP_ID, created_by: 'u1', title: '', category_emoji: '➕',
    expense_date: '2026-03-14', foreign_amount: null, twd_amount: null, exchange_rate: null,
    foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false,
    split_fill_currency: 'TWD', individual_member_id: null, payment_label: null,
    category_emoji_manual: false, updated_by: null, card_id: null, deleted_at: null,
    created_at: new Date(2026, 0, seq).toISOString(), updated_at: '2026-03-01',
    ...o,
    expense_splits: parts.map(id => ({
      id: `s${seq}-${id}`, expense_id: `e${seq}`, member_id: id, is_participating: true,
      split_amount: indiv[id] ?? null, split_amount_foreign: indivFor[id] ?? null,
      split_pending: !(id in indiv) && !(id in indivFor), created_at: '2026-03-01',
    })),
  } as unknown as ExpenseWithSplits;
}

/** `?fill=for` 專用：各人只有外幣金額的「各自付各的」。
 *  整筆台幣 690、外幣總額 30000 → 比例回推（§2.2，不用匯率）：
 *  12000→276、18000→414，加起來剛好 690（差額歸付款人）。 */
const fillForExpense = mk({
  title: '各自付各的（只填外幣）', category_emoji: '🛍️', expense_date: '2026-03-16',
  foreign_amount: 30000, twd_amount: 690, expense_type: 'individual',
  split_fill_currency: 'FOR', parts: [M[0], M[1]],
  indivFor: { [M[0]]: 12000, [M[1]]: 18000 }, payer_member_id: M[0],
});



/** `?forOnly=1` 專用：只有外幣、沒有台幣的一筆 shared 消費。 */
const forOnlyExpense = mk({
  title: '只有外幣沒有台幣', category_emoji: '🛍️', expense_date: '2026-03-15',
  foreign_amount: 12000, payer_member_id: M[0],
});

const baseExpenses: ExpenseWithSplits[] = [
  /* 備註只在 S-04 看得到——S-03／S-05／S-06 都不顯示（Rozi 2026-09-07）。
     這一筆帶備註，就是給那三條反向斷言當靶子的。 */
  mk({ title: '機票 ×4', category_emoji: '✈️', expense_date: '2026-02-10',
       twd_amount: 28400, payment_method: 'credit_card', payer_member_id: M[0],
       note: 'ZZ 這句備註只該出現在記一筆' }),
  mk({ title: '黑豬肉晚餐', category_emoji: '🍜', expense_date: '2026-03-14',
       foreign_amount: 108000, twd_amount: 2480, payment_method: 'credit_card', payer_member_id: M[2] }),
  mk({ title: '藥妝店', category_emoji: '🛍️', expense_date: '2026-03-15',
       foreign_amount: 45000, twd_amount: 1035, payment_method: 'credit_card',
       expense_type: 'individual', indiv: { [M[0]]: 12000, [M[1]]: 18000 }, payer_member_id: M[1] }),
  mk({ title: '城山日出峰門票', category_emoji: '🎡', expense_date: '2026-03-15',
       foreign_amount: 20000, payer_member_id: M[3] }),
  /* 「自己的」三種情況各一筆——先前假資料只有第一種，另兩種從來沒被畫到過 */
  mk({ title: '紀念品', category_emoji: '🛍️', expense_date: '2026-03-16',
       twd_amount: 860, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[1] }),
  mk({ title: '幫小美買的藥', category_emoji: '🛍️', expense_date: '2026-03-16',
       twd_amount: 500, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[0] }),
  mk({ title: '阿明的計程車', category_emoji: '🚕', expense_date: '2026-03-17',
       twd_amount: 300, parts: [], expense_type: 'personal', payer_member_id: M[2] }),
  /* 只有外幣、沒有台幣——有匯率才換算得出來。`?rate=full` 時要顯示金額，
     沒匯率時顯示「還沒填」。這一筆就是 Rozi 遇到的那種。 */
  mk({ title: '只有外幣的一筆', category_emoji: '🛍️', expense_date: '2026-03-15',
       foreign_amount: 5000, payer_member_id: M[0] }),
  mk({ title: '機場接送', category_emoji: '🚌', expense_date: '2026-03-18',
       twd_amount: 1600, payer_member_id: M[0], settled_on_spot: true }),
  mk({ title: '計程車', category_emoji: '🚕', expense_date: '2026-03-16', payer_member_id: M[0] }),
  mk({ title: '爸爸贊助', category_emoji: '💝', expense_date: '2026-03-14',
       twd_amount: 50000, payer_member_id: M[0], is_sponsor: true }),
];

/* ⚠️ 這兩筆**一定要定義在 `baseExpenses` 後面**：`mk()` 的 `seq` 是模組層級的
   計數器，插在前面會把 base 那 11 筆的 id 整組往後推，任何寫死 id 的測試都會壞。 */
/** `?fill=twd` 專用：台幣填的「各自付各的」。整筆台幣 690、外幣總額 30,000，
 *  兩人已填台幣 276／414（＝ `?fill=for` 那筆換算過來的值，兩邊互為反向）。 */
const fillTwdExpense = mk({
  title: '各自付各的（填台幣）', category_emoji: '🛍️', expense_date: '2026-03-16',
  foreign_amount: 30000, twd_amount: 690, expense_type: 'individual',
  split_fill_currency: 'TWD', parts: [M[0], M[1]],
  indiv: { [M[0]]: 276, [M[1]]: 414 }, payer_member_id: M[0],
});

/** `?fill=oy` 專用：來回換算會掉精度的「各自付各的」。第三人**沒填**，
 *  用來驗「空白格換算後仍是空白」。 */
const fillOyExpense = mk({
  title: '各自付各的（會掉精度）', category_emoji: '💄', expense_date: '2026-03-17',
  foreign_amount: 54000, twd_amount: 1118, expense_type: 'individual',
  split_fill_currency: 'FOR', parts: [M[0], M[1], M[2]],
  indivFor: { [M[0]]: 33000, [M[1]]: 21000 }, payer_member_id: M[0],
});

/** `?fill=noforetotal` 專用：台幣 1,140、外幣總額空白、兩人填了外幣、兩人沒填。
 *  形狀逐項照 production 的「藥局」抄——那一筆改之前被算成 52,000。 */
const noForTotalExpense = mk({
  title: '藥局（外幣總額空白）', category_emoji: '💄', expense_date: '2026-03-17',
  twd_amount: 1140, foreign_amount: null, expense_type: 'individual',
  split_fill_currency: 'FOR', indivFor: { [M[0]]: 12000, [M[1]]: 40000 },
  payer_member_id: M[1],
});

/** `?blanks=N`：**恰好 N 個人沒填**（其餘都填了），驗 1／2／3 人三種文案。
 *  外幣總額一樣空白——那才是這個狀態。 */
const blanksExpense = (n: number) => {
  const filled: Record<string, number> = {};
  for (let i = 0; i < M.length - n; i++) filled[M[i]] = 10000 * (i + 1);
  return mk({
    title: `藥局（${n} 人沒填）`, category_emoji: '💄', expense_date: '2026-03-17',
    twd_amount: 1140, foreign_amount: null, expense_type: 'individual',
    split_fill_currency: 'FOR', indivFor: filled, payer_member_id: M[0],
  });
};

/* 兩個新模式各自**只掛那一筆**——總額與每人分擔就只反映它，
   量得出「這一筆有沒有被結算跳過／有沒有整筆算到付款人頭上」。 */
const allSelfExpenses: ExpenseWithSplits[] = [
  /* (b) 參與者一人且就是付款人 */
  mk({ title: '自己的紀念品', category_emoji: '🛍️', expense_date: '2026-03-16',
       twd_amount: 860, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[1] }),
  /* (a) personal——這種**沒有參與列**，只用 (b) 判斷會整批漏掉 */
  mk({ title: '自己的計程車', category_emoji: '🚕', expense_date: '2026-03-17',
       twd_amount: 300, parts: [], expense_type: 'personal', payer_member_id: M[2] }),
];

const selfPendingExpense = () => mk({
  title: '自己買的（還沒填）', category_emoji: '🛍️', expense_date: '2026-03-17',
  parts: [M[1]], individual_member_id: M[1], payer_member_id: M[1],
});

export const expenses: ExpenseWithSplits[] =
  selfPending ? [...baseExpenses, selfPendingExpense()]
  : allSelf ? allSelfExpenses
  : fillOy ? [fillOyExpense]
  : fillTwd ? [fillTwdExpense]
  : fillFor ? [fillForExpense] : forOnly ? [forOnlyExpense]
  : blanksN > 0 ? [blanksExpense(blanksN)]
  : fillNoForTotal ? [...baseExpenses, noForTotalExpense] : baseExpenses;

/** 這一趟被 confirmed 的那一次結算的 id */
export const CONFIRMED_ID = 'stl-confirmed';

/**
 * `?settlements=many`：**10 筆 superseded ＋ 1 筆 confirmed ＋ 1 筆 draft**。
 * Rozi 的真實資料就是這個形狀（福岡／東京／北海道各 12 筆、濟州島 7 筆），
 * 而 harness 原本只有一組——`pickConfirmed()` 挑得對不對根本量不到。
 */
export const settlements = settlementsMany
  ? [
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `stl-old-${i}`, trip_id: TRIP_ID, status: 'superseded',
        settled_at: `2026-03-${String(19 - i).padStart(2, '0')}`,
      })),
      { id: CONFIRMED_ID, trip_id: TRIP_ID, status: 'confirmed', settled_at: '2026-03-20' },
      { id: 'stl-draft', trip_id: TRIP_ID, status: 'draft', settled_at: null },
    ]
  : [{ id: CONFIRMED_ID, trip_id: TRIP_ID, status: 'confirmed', settled_at: '2026-03-20' }];

/**
 * confirmed 那一次的轉帳。
 *
 * 🔴 **從假消費真的算出來**，不要寫死金額（實作-T-4 才發現的）：
 * 原本寫死 20220/17740/8220，與這些消費算出來的淨額對不起來，
 * 於是結算頁「應分攤 − 實際付出 = 差額」那條恆等式在假資料上就是不成立的
 * ——**驗不了，也分不出是實作錯還是假資料錯**。
 * 真實的 confirmed 結算本來就是從消費算出來的，假資料照做才守得住那條恆等式。
 */
export const settlementItems = (() => {
  const S = tripSummary(trip as never, expenses, 'active');
  /* hub 模式時 `settleTrip()` 會把每個人都轉給中心人——**假結算也要照那個結果**，
     不然 `?settle=hub` 進去看到的還是 direct 的清單，等於沒驗到。 */
  const { tx } = settleTrip(S, expenses, trip as never);
  return tx.map((x, i) => ({
    id: `i${i + 1}`, settlement_id: CONFIRMED_ID,
    from_member_id: x.from, to_member_id: x.to, amount: x.amount,
    is_cleared: i === 0,
  }));
})();

/** **每一次結算都帶自己的 items**——不然「有沒有挑對」與「只有一組資料」長得一樣 */
export const allSettlementItems = settlements.flatMap(st =>
  st.id === CONFIRMED_ID
    ? settlementItems
    : settlementItems.map((it, k) => ({
        ...it, id: `${st.id}-${k}`, settlement_id: st.id, amount: it.amount + k + 1,
      })));
