/**
 * 產出「謄入計畫」：每趟一份 fixtures/plan-<trip>.json，
 * 內容就是逐筆要在 Tripay UI 上填什麼。已內含 Rozi 核對點 ① 的全部裁示。
 *
 * 金額規則（Rozi 決策 1）：外幣＝Excel 當地金額；台幣＝Excel 台幣，缺則＝外幣×當日匯率。
 * 匯率：東京逐日（F 欄）；福岡逐日（J 欄），11/20 沿用 0.21339（F6）；北海道一律 0.209（H1）。
 * 濟州島 15 筆只有 ₩ 的個人購物：台幣標待填，不補數字（J1）。
 */
const fs = require('fs');
const path = require('path');
const { openSheet, num, str, round2 } = require('./lib.cjs');
const { TRIPS, MEMBERS } = require('./trips.cjs');
const { parseJejuLike, parseTokyo, parseFukuoka } = require('./parse-all.cjs');

const OUT = path.resolve(__dirname, '../fixtures');
const basisFromNote = (n) => { const m = (n || '').match(/[¥₩]\s*([\d,]+)/); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };

// ── 匯率 ────────────────────────────────────────────────────────────────────
function rateTable(id) {
  const cfg = TRIPS[id]; const { ws } = openSheet(cfg.file);
  if (id === 'hokkaido') return { _flat: num(ws, 'C', 140) };                 // H1
  if (id === 'jeju')     return { _flat: null };                              // J1：不補數字
  const dcol = id === 'fukuoka' ? 'A' : 'A';
  const rcol = id === 'fukuoka' ? 'J' : 'F';
  const t = {};
  for (let r = cfg.firstRow; r < cfg.totalRow; r++) {
    const d = str(ws, dcol, r);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) t[d] = num(ws, rcol, r);
  }
  if (id === 'fukuoka') t['2023-11-20'] = t['2023-11-20'] ?? t['2023-11-19']; // F6
  return t;
}
const rateFor = (tbl, date) => tbl._flat !== undefined ? tbl._flat : (tbl[date] ?? null);

const emojiOf = (k) => MEMBERS[k].emoji;

// ── 通用：由解析列 → 計畫列 ──────────────────────────────────────────────────
function toPlan(cfg, rec, rates, opts = {}) {
  const date = rec.date || cfg.start;
  const rate = rateFor(rates, date);
  let foreign = rec.foreign_amount ?? null;
  let twd     = rec.twd_amount ?? null;
  let twdPending = false;
  if (twd == null) {
    if (foreign != null && rate) twd = round2(foreign * rate);
    else twdPending = true;                     // 不補數字
  }
  return {
    srcRow: rec.row, date, title: rec.title, note: rec.note || '',
    baseCur: (rec.twd_amount != null) ? 'twd' : 'foreign',   // 基準 A 該列計在哪個幣別
    foreign, twd, twdPending, foreignPending: false,
    paymentMethod: rec.payment_method,
    type: rec.expense_type, settledOnSpot: !!rec.settled_on_spot,
    payer: rec.payer, participants: rec.participants || [],
    individualAmts: null, rate,
    ...opts,
  };
}

/** individual：各人金額換成台幣（Tripay 的 split_amount 是台幣） */
function individualAmts(cfg, rec, twdTotal) {
  const debtCur = cfg.debtCurrency;
  let basis = debtCur === 'foreign' ? rec.foreign_amount : rec.twd_amount;
  if (basis == null) basis = basisFromNote(rec.note);
  const out = {}; let sum = 0;
  for (const d of rec.debts) {
    const v = debtCur === 'twd' ? d.amount : (basis && twdTotal ? d.amount / basis * twdTotal : d.amount);
    out[d.debtor] = round2((out[d.debtor] || 0) + v); sum += v;
  }
  if (rec.payer) out[rec.payer] = round2(Math.max(0, (twdTotal ?? 0) - sum));
  return out;
}

// ── 各趟 ────────────────────────────────────────────────────────────────────
function planJejuLike(id) {
  const cfg = TRIPS[id]; const rates = rateTable(id);
  const parsed = parseJejuLike(cfg);
  return parsed.rows.map(rec => {
    const p = toPlan(cfg, rec, rates);
    if (rec.expense_type === 'individual') p.individualAmts = individualAmts(cfg, rec, p.twd);
    if (rec.expense_type === 'personal')   p.participants = [rec.payer];
    return p;
  });
}

function planTokyo() {
  const cfg = TRIPS.tokyo; const rates = rateTable('tokyo');
  const ws2 = openSheet(cfg.file).ws;
  const parsed = parseTokyo(cfg);
  const A = JSON.parse(fs.readFileSync(path.join(OUT, 'tokyo-assign.json'), 'utf8')).assignments;
  const out = [];
  const NING_TREAT = new Set([67, 68, 73, 101, 123]);   // 備註「🍋請大家」「🍋說不記帳」，Excel B 小計刻意不算
  for (const rec of parsed.rows) {
    const a = A[rec.row];
    if (NING_TREAT.has(rec.row)) {
      out.push(toPlan(cfg, rec, rates, { type: 'personal', settledOnSpot: false, payer: 'ning', participants: ['ning'],
        rule: 'Excel B 小計排除（🍋請大家／不記帳）→ Ning 個人款項，不進共同池' }));
      continue;
    }
    if (rec.excel_cat === '共同（在小計範圍內）') { out.push(toPlan(cfg, rec, rates)); continue; }
    if (!a) {                                     // T1：r14 TOYSQ → Ning personal・已結
      out.push(toPlan(cfg, rec, rates, { type: 'personal', settledOnSpot: false, payer: 'ning', participants: ['ning'], note: (rec.note || '') + '（T1 裁示：Ning 個人・已結）' }));
      continue;
    }
    const p = toPlan(cfg, rec, rates);
    const payer = a.payer || a.owner;
    p.payer = payer;
    const J = rec.foreign_amount ?? 0;
    const twdTotal = p.twd ?? 0;
    const conv = (jpy) => J > 0 && twdTotal ? round2(jpy / J * twdTotal) : round2(jpy * (p.rate || 0));
    if (a.equal3) {
      p.type = 'individual';
      p.individualAmts = Object.fromEntries(a.equal3.map(m => [m, round2(twdTotal / a.equal3.length)]));
    } else if (a.wholeToOwnerUnsettled) {         // 規則4 代替X刷卡
      p.type = 'individual';
      p.individualAmts = { [a.owner]: twdTotal, ...(payer !== a.owner ? { [payer]: 0 } : {}) };
    } else if (a.splits && a.splits.length) {
      // ✅ 已結的拆分：旅程中當場結清，不得生欠款 → 另立一筆 personal 記在該人名下。
      // 未結的拆分：留在本列的 individual 拆帳，由付款人代墊 → 生欠款（＝Excel「給X」欄）。
      const settled   = a.splits.filter(s => s.settled);
      const unsettled = a.splits.filter(s => !s.settled);
      let settledJpy = 0, settledTwd = 0;
      settled.forEach((s, i) => {
        const v = conv(s.jpy); settledJpy += s.jpy; settledTwd += v;
        out.push({ ...p, srcRow: rec.row, subSeq: i + 1,
          title: `${rec.title}（${emojiOf(s.to)} 當場已結）`,
          foreign: J > 0 ? s.jpy : null, twd: round2(v), twdPending: false,
          type: 'personal', settledOnSpot: false, payer: s.to, participants: [s.to],
          individualAmts: null, rule: '規則2 ✅ 已結 → 個人款項，不進結算' });
      });
      const restJpy = J > 0 ? round2(J - settledJpy) : null;
      const restTwd = round2(twdTotal - settledTwd);
      p.foreign = restJpy; p.twd = restTwd;
      if (unsettled.length) {
        p.type = 'individual';
        const amts = {}; let sum = 0;
        for (const s of unsettled) { const v = conv(s.jpy); amts[s.to] = round2((amts[s.to] || 0) + v); sum += v; }
        amts[a.owner] = round2(Math.max(0, restTwd - sum));
        p.individualAmts = amts;
      } else {
        p.type = 'personal'; p.participants = [a.owner]; p.payer = a.owner;
      }
      if (restTwd <= 0 && (restJpy == null || restJpy <= 0)) continue;   // 整筆都是已結拆分
    } else {
      p.type = 'personal'; p.participants = [a.owner]; p.payer = a.owner;
    }
    p.rule = a.rule || null;
    out.push(p);
  }
  // Excel 把這 3 筆放在「七天消費總計」之後，但每人平均總花費 D164 有把它們算進共同池
  const POST = [
    { row: 160, title: '2/14 京城快線（上野到機場車票）', twd: num(ws2, 'D', 160), date: cfg.end },
    { row: 161, title: '富士山住宿',                     twd: num(ws2, 'D', 161), date: cfg.start },
    { row: 162, title: '上野住宿',                       twd: num(ws2, 'D', 162), date: cfg.start },
  ];
  for (const x of POST) out.push({
    srcRow: x.row, date: x.date, title: x.title, note: 'Excel 總計後的台幣共同消費（D160:D162），每人平均有算進共同池',
    baseCur: 'twd', foreign: null, twd: round2(x.twd), twdPending: false, foreignPending: false,
    paymentMethod: 'credit_card', type: 'shared', settledOnSpot: true,
    payer: 'ziyu', participants: [...cfg.members], individualAmts: null, rate: null,
  });
  return out;
}

function planFukuoka() {
  const cfg = TRIPS.fukuoka; const rates = rateTable('fukuoka');
  const parsed = parseFukuoka(cfg);
  // Rozi 裁示
  const RULED = { 5:'shared', 58:'shared', 60:'shared', 76:'shared', 74:'shared', 52:'individual', 55:'individual' };
  const SPLIT2 = new Set([8, 30]);          // F1/F2：拆成兩筆 personal
  const IND_NING = { 38:'individual', 43:'individual' };   // F3/F4
  const out = [];
  for (const rec of parsed.rows) {
    const date = rec.date || cfg.start;
    const rate = rateFor(rates, date);
    const shares = rec.jpy_shares || {};
    const selfCard = rec.twd_self_card || {};

    if (SPLIT2.has(rec.row)) {                 // F1 r8 / F2 r30
      const parts = rec.row === 8
        ? [['ziyu', 1980, null], ['ning', 3574, null]]
        : [['mei', 6175, null], ['ning', 11067, selfCard.ning ?? null]];
      parts.forEach(([m, jpy, twdKnown], i) => out.push({
        srcRow: rec.row, subSeq: i + 1, baseCur: 'foreign', date, title: `${rec.title}（${emojiOf(m)}）`, note: `F${rec.row === 8 ? 1 : 2} 裁示：拆為個人款項`,
        foreign: jpy, twd: twdKnown != null ? round2(twdKnown) : round2(jpy * rate), twdPending: false, foreignPending: false,
        paymentMethod: rec.payment_method || 'credit_card', type: 'personal', settledOnSpot: false,
        payer: m, participants: [m], individualAmts: null, rate,
      }));
      continue;
    }

    const total = rec.foreign_amount ?? null;
    const twd = total != null ? round2(total * rate) : null;
    const base = {
      srcRow: rec.row, date, title: rec.title, note: rec.note || '',
      baseCur: Object.keys(selfCard).length && !Object.keys(shares).length ? 'twd' : 'foreign',
      foreign: total, twd, twdPending: twd == null, foreignPending: false,
      paymentMethod: rec.payment_method || (rec.excel_cat && rec.excel_cat.includes('現金') ? 'cash' : 'credit_card'),
      rate, individualAmts: null,
    };

    if (RULED[rec.row]) {
      const parts = Object.keys(shares);
      const vals = Object.values(shares);
      const equal = vals.length > 0 && Math.max(...vals) - Math.min(...vals) < 1;
      if (RULED[rec.row] === 'shared' && equal) {
        out.push({ ...base, type: 'shared', settledOnSpot: false, payer: 'ning', participants: parts });
      } else {
        // Rozi 總原則：分擔金額以 E/F/G 為準。不等額時 Tripay 的 shared（均分）表達不了，
        // 必須用 individual 逐人填金額（例：r60 唐吉軻德 2000/16498/2000）。
        const amts = {}; for (const [m, v] of Object.entries(shares)) amts[m] = round2(v * rate);
        out.push({ ...base, type: 'individual', settledOnSpot: false, payer: 'ning', participants: cfg.members, individualAmts: amts });
      }
      continue;
    }
    if (IND_NING[rec.row]) {                   // F3 r38 / F4 r43
      const amts = {}; for (const [m, v] of Object.entries(shares)) amts[m] = round2(v * rate);
      const tot = Object.values(shares).reduce((a, b) => a + b, 0);
      out.push({ ...base, foreign: tot, twd: round2(tot * rate), twdPending: false,
        type: 'individual', settledOnSpot: false, payer: 'ning', participants: cfg.members, individualAmts: amts,
        note: `F${rec.row === 38 ? 3 : 4} 裁示：付款人 Ning、照 E/F/G 分擔` });
      continue;
    }
    if (rec.expense_type === 'shared') {       // 均付現金＝當場分
      out.push({ ...base, type: 'shared', settledOnSpot: true, payer: rec.payer || 'ziyu', participants: Object.keys(shares).length ? Object.keys(shares) : cfg.members });
      continue;
    }
    // personal（刷自己卡 / 各自分擔）
    const owner = rec.payer || Object.keys(selfCard)[0] || Object.keys(shares)[0];
    const twdSelf = selfCard[owner];
    out.push({ ...base,
      foreign: rec.foreign_amount ?? (shares[owner] ?? null),
      twd: twdSelf != null ? round2(twdSelf) : (rec.foreign_amount != null ? round2(rec.foreign_amount * rate) : (shares[owner] != null ? round2(shares[owner] * rate) : null)),
      twdPending: false, type: 'personal', settledOnSpot: false, payer: owner, participants: [owner] });
  }
  return out;
}

// ── 執行 ────────────────────────────────────────────────────────────────────
const plans = { fukuoka: planFukuoka(), tokyo: planTokyo(), hokkaido: planJejuLike('hokkaido'), jeju: planJejuLike('jeju') };
for (const [id, rows] of Object.entries(plans)) {
  rows.forEach((r, i) => { r.seq = i + 1; });
  const cfg = TRIPS[id];
  fs.writeFileSync(path.join(OUT, `plan-${id}.json`), JSON.stringify({
    trip: { id, name: `${cfg.name}（Excel重謄）`, currency: cfg.currency, start: cfg.start, end: cfg.end,
            members: cfg.members.map(m => ({ key: m, name: MEMBERS[m].name, emoji: MEMBERS[m].emoji })), owner: 'ziyu' },
    expenses: rows,
  }, null, 2));
  const byType = {}; for (const r of rows) { const k = r.type + (r.settledOnSpot ? '(當場分)' : ''); byType[k] = (byType[k] || 0) + 1; }
  const pend = rows.filter(r => r.twdPending).length;
  const noPayer = rows.filter(r => !r.payer).length;
  console.log(`${cfg.name.padEnd(18)} ${String(rows.length).padStart(3)} 筆　${JSON.stringify(byType)}　台幣待填 ${pend}　無付款人 ${noPayer}`);
}
console.log('\n已寫出 fixtures/plan-*.json');
