/**
 * 由解析結果推出兩項驗收基準：
 *   基準 A｜每人分擔總額（burden）：逐列把金額分配到成員
 *   基準 B｜每人結算淨額（net）  ：payout − cost，來源＝Excel「給X」欠款欄
 * 兩者都保留原幣與台幣，不做跨幣強制換算。
 */
const fs = require('fs');
const path = require('path');
const { openSheet, num, round2 } = require('./lib.cjs');
const { TRIPS, MEMBERS } = require('./trips.cjs');
const { parseJejuLike, parseTokyo, parseFukuoka, OUT_DIR } = require('./parse-all.cjs');

/** 從備註抓 ¥/₩ 基準金額（欠款幣別的列總額，用於 C/E 欄缺值時） */
function basisFromNote(note) {
  const m = (note || '').match(/[¥₩]\s*([\d,]+)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

function zero(members) { return Object.fromEntries(members.map(m => [m, 0])); }

/** 回傳每位參與者對該列的佔比 */
function fractions(rec, cfg) {
  const members = cfg.members;
  if (rec.split_mode === 'equal') {
    const p = rec.participants.length ? rec.participants : members;
    return Object.fromEntries(p.map(m => [m, 1 / p.length]));
  }
  if (rec.split_mode === 'self') {
    return rec.payer ? { [rec.payer]: 1 } : {};
  }
  if (rec.split_mode === 'from_shares') {          // 福岡 E/F/G
    const tot = Object.values(rec.jpy_shares).reduce((a, b) => a + b, 0);
    if (!tot) return {};
    return Object.fromEntries(Object.entries(rec.jpy_shares).map(([k, v]) => [k, v / tot]));
  }
  if (rec.split_mode === 'from_debts') {
    const debtCur = cfg.debtCurrency;              // 'foreign' | 'twd'
    let basis = debtCur === 'foreign' ? rec.foreign_amount : rec.twd_amount;
    if (basis == null) basis = basisFromNote(rec.note);
    const sum = rec.debts.reduce((a, d) => a + d.amount, 0);
    if (basis == null || basis <= 0) { rec.flags.push('欠款列缺基準總額，改以 Σ欠款 為基準'); basis = sum; }
    const f = {};
    for (const d of rec.debts) f[d.debtor] = (f[d.debtor] || 0) + d.amount / basis;
    const rest = 1 - Object.values(f).reduce((a, b) => a + b, 0);
    if (rec.payer) f[rec.payer] = (f[rec.payer] || 0) + rest;
    if (rest < -0.005) rec.flags.push(`Σ欠款超過該列總額（付款人佔比 ${round2(rest * 100)}%）`);
    return f;
  }
  return {};
}

function buildBaselines(cfg, parsed) {
  const members = cfg.members;
  const burdenF = zero(members), burdenT = zero(members);   // 基準 A
  const payoutF = zero(members), payoutT = zero(members);
  const costF   = zero(members), costT   = zero(members);   // 進結算的部分

  for (const rec of parsed.rows) {
    if (cfg.id === 'fukuoka') {
      // 福岡：E/F/G＝各人日幣分擔，K/L/M＝各人刷自己卡台幣。
      // 同一筆「刷自己卡」列的日幣(H)與台幣(K/L/M)是同一筆錢的兩種幣別表述，
      // 因此兩個基準各自只取 Excel 對應欄位，不互相加總。
      for (const [m, v] of Object.entries(rec.jpy_shares || {}))    burdenF[m] += v;
      for (const [m, v] of Object.entries(rec.twd_self_card || {})) burdenT[m] += v;
      continue;
    }
    const f = fractions(rec, cfg);
    const aF = rec.foreign_amount ?? null;
    const aT = rec.twd_amount ?? null;
    // 一列只用一種幣別計入分擔：有台幣就用台幣，外幣僅作參考；
    // 沒有台幣才用外幣（該筆謄入時 twd 需以當日匯率換算或標待填）。
    // 這與 Excel 自己的小計邏輯一致（東京/北海道的 B 小計只加沒有 D 的列）。
    for (const [m, frac] of Object.entries(f)) {
      if (aT != null)      burdenT[m] += aT * frac;
      else if (aF != null) burdenF[m] += aF * frac;
    }
  }

  // 基準 B：直接由「給X」欠款欄推淨額（Excel 唯一明確記錄誰欠誰之處）
  const netF = zero(members), netT = zero(members);
  let hasDebtCols = false;
  if (cfg.debtGroups) {
    const { ws } = openSheet(cfg.file);
    const cur = cfg.debtCurrency;
    for (const g of cfg.debtGroups) {
      for (const [debtor, col] of Object.entries(g.debtors)) {
        const total = num(ws, col, cfg.totalRow);
        if (total == null || total === 0) continue;
        hasDebtCols = true;
        const tgt = cur === 'foreign' ? netF : netT;
        tgt[g.creditor] += total;    // 債主收
        tgt[debtor]     -= total;    // 欠款人付
      }
    }
  }

  return {
    burden: { foreign: mapRound(burdenF), twd: mapRound(burdenT) },
    net: hasDebtCols ? { foreign: mapRound(netF), twd: mapRound(netT), currency: cfg.debtCurrency }
                     : null,
    payoutF, payoutT, costF, costT,
  };
}

const mapRound = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round2(v)]));

// ── 執行 ────────────────────────────────────────────────────────────────────
const parsers = {
  fukuoka:  () => parseFukuoka(TRIPS.fukuoka),
  tokyo:    () => parseTokyo(TRIPS.tokyo),
  hokkaido: () => parseJejuLike(TRIPS.hokkaido),
  jeju:     () => parseJejuLike(TRIPS.jeju),
};

const out = {};
for (const [key, run] of Object.entries(parsers)) {
  const cfg = TRIPS[key];
  const parsed = run();
  const bl = buildBaselines(cfg, parsed);
  const fc = cfg.currency === 'KRW' ? '₩' : '¥';

  console.log(`\n══════ ${cfg.name}（${cfg.members.length} 人，主幣別 ${fc}）`);
  console.log('  基準 A｜每人分擔總額');
  console.log('    成員       ' + fc.padStart(14) + '        台幣');
  for (const m of cfg.members) {
    console.log(`    ${(MEMBERS[m].emoji + ' ' + MEMBERS[m].name).padEnd(10)} ${String(bl.burden.foreign[m]).padStart(14)}  ${String(bl.burden.twd[m]).padStart(12)}`);
  }
  const sF = round2(Object.values(bl.burden.foreign).reduce((a, b) => a + b, 0));
  const sT = round2(Object.values(bl.burden.twd).reduce((a, b) => a + b, 0));
  console.log(`    ${'合計'.padEnd(9)} ${String(sF).padStart(14)}  ${String(sT).padStart(12)}`);

  if (bl.net) {
    console.log(`  基準 B｜每人結算淨額（來源：「給X」欠款欄，幣別＝${bl.net.currency === 'twd' ? '台幣' : fc}）`);
    const t = bl.net.currency === 'twd' ? bl.net.twd : bl.net.foreign;
    for (const m of cfg.members) {
      const v = t[m];
      console.log(`    ${(MEMBERS[m].emoji + ' ' + MEMBERS[m].name).padEnd(10)} ${String(v).padStart(12)}  ${v > 0 ? '債主（應收）' : v < 0 ? '應付' : '打平'}`);
    }
    console.log(`    Σ淨額 = ${round2(Object.values(t).reduce((a, b) => a + b, 0))}（必須為 0）`);
  } else {
    console.log('  基準 B｜不適用：此檔無「給X」欠款欄，無法推得每人淨額');
  }
  out[key] = { trip: cfg.name, members: cfg.members, baselines: bl, rowCount: parsed.rows.length, issues: parsed.issues, parsed: parsed.rows };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [k, v] of Object.entries(out)) {
  fs.writeFileSync(path.join(OUT_DIR, `${k}.json`), JSON.stringify(v, null, 2));
}
console.log(`\n已寫出 fixtures：${Object.keys(out).map(k => k + '.json').join(', ')}`);
