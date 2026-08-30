/**
 * Stage 0：解析四份歷史 Excel，產出 fixtures + 驗收基準（ground truth）。
 *
 * 鐵律：解析出的合計必須對上 Excel 自己的 小計／總計 列。
 * Excel 自身 SUM 公式漏加的列，一律「照實揭露」，不手調數字。
 */
const fs = require('fs');
const path = require('path');
const { openSheet, num, str, asDate, round2 } = require('./lib.cjs');
const { MEMBERS, EMOJI_TO_KEY, TRIPS, paymentMethodFromNote, payerFromNote } = require('./trips.cjs');

const OUT_DIR = path.resolve(__dirname, '../fixtures');
const COMMON_CATS = new Set(['行前共同', '共同', '÷4', '÷3']);
const INDIV_CATS  = new Set(['分開結算', '各自結算']);

// ── 共用：讀某列的「給X」欠款 ────────────────────────────────────────────────
function readDebts(ws, row, cfg) {
  const out = [];
  for (const g of cfg.debtGroups || []) {
    for (const [debtor, col] of Object.entries(g.debtors)) {
      const v = num(ws, col, row);
      if (v != null && v !== 0) {
        out.push({ creditor: g.creditor, debtor, amount: v, cell: `${col}${row}`, group: g.label });
      }
    }
  }
  return out;
}

// ── 北海道 / 濟州島（同一種版型）────────────────────────────────────────────
function parseJejuLike(cfg) {
  const { ws } = openSheet(cfg.file);
  const C = cfg.cols;
  const rows = [];
  const issues = [];
  let cat = null, date = null, rate = null;

  for (let r = cfg.firstRow; r < cfg.totalRow; r++) {
    const a = str(ws, C.cat, r);
    if (a) cat = a;

    const d = asDate(ws, C.item, r);
    if (d) { date = d; const gr = num(ws, C.note, r); if (gr) rate = gr; continue; }

    const itemRaw = ws[`${C.item}${r}`] ? ws[`${C.item}${r}`].v : null;
    const item = str(ws, C.item, r);
    if (item === '小計') continue;
    // 縮排列＝上一筆的金額分解註記，不是消費
    if (typeof itemRaw === 'string' && /^\s/.test(itemRaw)) continue;

    const foreign = num(ws, C.foreign, r);
    const twd     = num(ws, C.twd, r);
    if (foreign == null && twd == null) continue;
    if (!item) { issues.push({ row: r, kind: '無品項但有金額', detail: `F=${foreign} T=${twd}` }); continue; }

    const note = str(ws, C.note, r) || '';
    const debts = readDebts(ws, r, cfg);
    const { pm, src } = paymentMethodFromNote(note);
    const notePayer = payerFromNote(note);

    const rec = {
      row: r, excel_cat: cat, date: cat === '行前共同' ? null : date,
      title: item, note, day_rate: rate,
      foreign_amount: foreign, twd_amount: twd,
      payment_method: pm, payment_source: src,
      debts, flags: [],
    };

    if (COMMON_CATS.has(cat)) {
      if (debts.length) {
        const creditors = [...new Set(debts.map(d => d.creditor))];
        if (creditors.length > 1) rec.flags.push('同列有多組給X欠款');
        rec.expense_type = 'shared';
        rec.settled_on_spot = false;
        rec.payer = creditors[0];
        rec.participants = [...new Set([creditors[0], ...debts.map(d => d.debtor)])];
        rec.split_mode = 'from_debts';
      } else {
        rec.expense_type = 'shared';
        rec.settled_on_spot = true;              // 當場各付各的：記錄但不進結算
        rec.payer = notePayer || 'ziyu';         // 形式上的付款人，不影響結算
        rec.participants = [...cfg.members];
        rec.split_mode = 'equal';
      }
    } else if (INDIV_CATS.has(cat)) {
      rec.expense_type = 'individual';
      rec.payer = notePayer || (debts.length ? debts[0].creditor : null);
      rec.participants = [...cfg.members];
      rec.split_mode = 'from_debts';
      if (!rec.payer) { rec.flags.push('分開結算但無法判定付款人'); issues.push({ row: r, kind: '分開結算無付款人', detail: item }); }
    } else if (EMOJI_TO_KEY[cat] || cat === '自付') {
      const owner = EMOJI_TO_KEY[cat] || notePayer;
      if (debts.length) {
        // 個人分類的列仍可能帶「給X」欠款＝該成員代買、別人要還錢（例：濟州島 r153 白咳嗽藥）
        rec.expense_type = 'individual';
        rec.payer = debts[0].creditor || owner;
        rec.participants = [...cfg.members];
        rec.split_mode = 'from_debts';
        rec.flags.push('個人分類但有「給X」欠款 → 改判 individual');
      } else {
        rec.expense_type = 'personal';
        rec.payer = owner;
        rec.participants = owner ? [owner] : [];
        rec.split_mode = 'self';
        if (!owner) { rec.flags.push('自付但無法判定付款人'); issues.push({ row: r, kind: '自付無付款人', detail: item }); }
      }
    } else {
      rec.flags.push(`未知分類「${cat}」`);
      issues.push({ row: r, kind: '未知分類', detail: `${cat} / ${item}` });
      continue;
    }
    rows.push(rec);
  }
  return { rows, issues, rate };
}

// ── 東京（無分類欄；以 小計 公式範圍界定「共同」）──────────────────────────
function parseTokyo(cfg) {
  const { ws } = openSheet(cfg.file);
  const C = cfg.cols;
  const rows = [];
  const issues = [];
  let date = null, rate = null;

  // 先算出每個 小計 所涵蓋的列（共同池）：D 欄公式範圍是連續的，取它當日區塊
  const commonRows = new Set();
  for (const sr of cfg.subtotalRows) {
    const f = ws[`D${sr}`] && ws[`D${sr}`].f;                  // 例：SUM(D5:D11)
    const m = f && f.match(/SUM\(D(\d+):D(\d+)\)/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) commonRows.add(i);
  }

  for (let r = cfg.firstRow; r < cfg.totalRow; r++) {
    const d = asDate(ws, C.item, r);
    if (d) { date = d; const fr = num(ws, C.note, r); if (fr) rate = fr; continue; }

    const item = str(ws, C.item, r);
    if (!item || item === '小計') continue;

    const foreign = num(ws, C.foreign, r);
    const twd     = num(ws, C.twd, r);
    if (foreign == null && twd == null) continue;

    const note  = str(ws, C.note, r) || '';
    const debts = readDebts(ws, r, cfg);
    const { pm, src } = paymentMethodFromNote(note);

    const rec = {
      row: r, date, title: item, note, day_rate: rate,
      foreign_amount: foreign, twd_amount: twd,
      payment_method: twd != null ? 'credit_card' : (pm === 'credit_card' ? 'cash' : pm),
      payment_source: twd != null ? 'D欄有台幣→刷卡' : src,
      debts, flags: [],
    };

    if (commonRows.has(r)) {
      rec.excel_cat = '共同（在小計範圍內）';
      rec.expense_type = 'shared';
      rec.settled_on_spot = debts.length === 0;
      rec.payer = debts.length ? debts[0].creditor : 'ziyu';
      rec.participants = debts.length
        ? [...new Set([debts[0].creditor, ...debts.map(x => x.debtor)])]
        : [...cfg.members];
      rec.split_mode = debts.length ? 'from_debts' : 'equal';
      if (debts.length) rec.flags.push('共同池內同時有給X欠款（需 Rozi 判讀是否重複計）');
    } else if (debts.length) {
      rec.excel_cat = '小計後・有欠款';
      rec.expense_type = 'individual';
      rec.payer = debts[0].creditor;
      rec.participants = [...new Set([debts[0].creditor, ...debts.map(x => x.debtor)])];
      rec.split_mode = 'from_debts';
    } else {
      rec.excel_cat = '小計後・無欠款';
      rec.expense_type = 'personal';
      rec.payer = payerFromNote(note);
      rec.participants = rec.payer ? [rec.payer] : [];
      rec.split_mode = 'self';
      if (!rec.payer) {
        rec.flags.push('小計後個人消費，Excel 未記付款人');
        issues.push({ row: r, kind: '個人消費無付款人', detail: `${item} / ${note}` });
      }
    }
    rows.push(rec);
  }
  return { rows, issues, rate };
}

// ── 福岡（3 人；E/F/G＝各人日幣分擔、K/L/M＝各人刷自己卡台幣）───────────────
function parseFukuoka(cfg) {
  const { ws } = openSheet(cfg.file);
  const C = cfg.cols;
  const rows = [];
  const issues = [];
  let date = null, rate = null;

  for (let r = cfg.firstRow; r < cfg.totalRow; r++) {
    const d = asDate(ws, C.item, r);
    if (d) { date = d; const jr = num(ws, C.rate, r); if (jr) rate = jr; continue; }

    const item = str(ws, C.item, r);
    if (!item || item === '小計') continue;

    const cash = num(ws, C.cashShared, r);      // B：均付現金
    const card = num(ws, C.cardShared, r);      // C：均付刷卡
    const cardPayer = str(ws, C.cardPayer, r);  // D：刷卡人
    const noteRaw = ws[`${C.note}${r}`] ? ws[`${C.note}${r}`].v : null;
    const noteNum = typeof noteRaw === 'number' ? noteRaw : null;   // H 為數字＝該筆日幣總額
    const noteTxt = typeof noteRaw === 'string' ? noteRaw : '';

    const shares = {};   // 日幣分擔
    for (const [k, col] of Object.entries(cfg.shareCols)) {
      const v = num(ws, col, r);
      if (v != null && v !== 0) shares[k] = v;
    }
    const selfCard = {}; // 台幣刷自己卡
    for (const [k, col] of Object.entries(cfg.selfCardCols)) {
      const v = num(ws, col, r);
      if (v != null && v !== 0) selfCard[k] = v;
    }

    if (cash == null && card == null && noteNum == null &&
        Object.keys(shares).length === 0 && Object.keys(selfCard).length === 0) continue;

    const rec = {
      row: r, date, title: item, note: noteTxt || (noteNum != null ? `H=${noteNum}` : ''),
      cash_shared: cash, card_shared: card, card_payer: cardPayer,
      foreign_total_note: noteNum,
      jpy_shares: shares, twd_self_card: selfCard,
      exchange_rate: rate, flags: [],
    };

    const shareVals = Object.values(shares);
    const equalShare = shareVals.length === cfg.members.length &&
                       Math.max(...shareVals) - Math.min(...shareVals) < 1;

    if (cash != null) {
      rec.expense_type = 'shared'; rec.settled_on_spot = true;   // 均付現金＝當場分掉
      rec.payer = 'ziyu'; rec.participants = Object.keys(shares).length ? Object.keys(shares) : [...cfg.members];
      rec.foreign_amount = cash; rec.split_mode = equalShare ? 'equal' : 'from_shares';
      rec.excel_cat = '均付・現金(B)';
      if (!equalShare && shareVals.length) rec.flags.push('均付現金但 E/F/G 不等額');
    } else if (card != null) {
      rec.expense_type = 'shared'; rec.settled_on_spot = false;  // 均付刷卡＝有人代墊
      rec.payer = cardPayer ? (EMOJI_TO_KEY[cardPayer] || cardPayer.toLowerCase()) : null;
      rec.participants = Object.keys(shares).length ? Object.keys(shares) : [...cfg.members];
      rec.foreign_amount = card; rec.split_mode = equalShare ? 'equal' : 'from_shares';
      rec.excel_cat = '均付・刷卡(C)';
      if (!rec.payer) {
        // D 欄全檔皆空 → 改由 K/L/M 推刷卡人
        const sc = Object.keys(selfCard);
        if (sc.length === 1) { rec.payer = sc[0]; rec.flags.push('刷卡人由 K/L/M 推得'); }
        else { rec.flags.push('均付刷卡但無刷卡人（D 欄空、K/L/M 無法判定）'); issues.push({ row: r, kind: '刷卡無付款人', detail: item }); }
      }
    } else if (Object.keys(selfCard).length && Object.keys(shares).length === 0) {
      const owner = Object.keys(selfCard)[0];
      rec.expense_type = 'personal'; rec.settled_on_spot = false;
      rec.payer = owner; rec.participants = [owner];
      rec.foreign_amount = noteNum; rec.twd_amount = selfCard[owner];
      rec.split_mode = 'self'; rec.excel_cat = '刷自己卡自付(K/L/M)';
    } else if (Object.keys(shares).length) {
      rec.expense_type = 'personal'; rec.settled_on_spot = false;
      rec.participants = Object.keys(shares);
      rec.foreign_amount = noteNum != null ? noteNum : shareVals.reduce((a, b) => a + b, 0);
      rec.split_mode = 'from_shares'; rec.excel_cat = '各自分擔/自付(E/F/G)';
      rec.payer = Object.keys(selfCard)[0] || (rec.participants.length === 1 ? rec.participants[0] : null);
      if (Object.keys(selfCard).length) rec.flags.push('同列同時有 E/F/G 日幣分擔與 K/L/M 台幣刷卡（幣別重疊，需 Rozi 判讀）');
      if (!rec.payer) rec.flags.push('多人分擔但無付款人線索');
    } else {
      rec.flags.push('無法歸類'); issues.push({ row: r, kind: '無法歸類', detail: item }); continue;
    }
    rows.push(rec);
  }
  return { rows, issues, rate };
}

module.exports = { parseJejuLike, parseTokyo, parseFukuoka, COMMON_CATS, INDIV_CATS, OUT_DIR };

// ── 執行 ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const results = {};
  results.fukuoka  = parseFukuoka(TRIPS.fukuoka);
  results.tokyo    = parseTokyo(TRIPS.tokyo);
  results.hokkaido = parseJejuLike(TRIPS.hokkaido);
  results.jeju     = parseJejuLike(TRIPS.jeju);

  for (const [k, v] of Object.entries(results)) {
    console.log(`\n=== ${TRIPS[k].name}：解析 ${v.rows.length} 筆，疑義 ${v.issues.length} 筆`);
    const byType = {};
    for (const r of v.rows) {
      const key = `${r.expense_type}${r.settled_on_spot ? '(當場分)' : ''}`;
      byType[key] = (byType[key] || 0) + 1;
    }
    console.log('   分類：', JSON.stringify(byType));
    const flagged = v.rows.filter(r => r.flags.length);
    if (flagged.length) {
      console.log(`   ⚠️ 需判讀 ${flagged.length} 筆：`);
      for (const r of flagged.slice(0, 8)) console.log(`      r${r.row} ${r.title} — ${r.flags.join('；')}`);
      if (flagged.length > 8) console.log(`      …另 ${flagged.length - 8} 筆`);
    }
    for (const i of v.issues.slice(0, 6)) console.log(`   ❗ r${i.row} ${i.kind}：${i.detail}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, '_raw-parse.json'), JSON.stringify(results, null, 2));
  console.log(`\n已寫出 ${path.join(OUT_DIR, '_raw-parse.json')}`);
}
