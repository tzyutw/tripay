/**
 * 共用工具：讀 xlsx（取計算後的值）、格子存取、數字/日期判讀。
 * 鐵律：所有解析結果都必須對得上 Excel 自己的 小計 / 總計 列。
 */
const X = require('xlsx');
const path = require('path');

const EXCEL_DIR = path.resolve(__dirname, '../excel');

function openSheet(filename) {
  const wb = X.readFile(path.join(EXCEL_DIR, filename), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = X.utils.decode_range(ws['!ref']);
  return { ws, lastRow: range.e.r + 1, lastCol: range.e.c + 1 };
}

/** 取單一格原始值（公式取快取結果，等同 openpyxl data_only）。 */
function cell(ws, col, row) {
  const c = ws[`${col}${row}`];
  if (!c) return null;
  let v = c.v;
  if (v === '' || v === undefined) return null;
  return v;
}

function num(ws, col, row) {
  const v = cell(ws, col, row);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(ws, col, row) {
  const v = cell(ws, col, row);
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** 日期列：格子是 Date，或形如 2025-05-29 / 5月29日。 */
function asDate(ws, col, row) {
  const v = cell(ws, col, row);
  if (v instanceof Date) {
    // xlsx 以 UTC 建 Date，直接取 UTC 日期避免時區位移
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** 對帳：實際 vs Excel 自己的合計。差距 > tol 即視為解析錯誤。 */
function reconcile(label, actual, expected, tol = 0.5) {
  const diff = round2(actual - expected);
  const ok = Math.abs(diff) <= tol;
  return { label, actual: round2(actual), expected: round2(expected), diff, ok };
}

function printRecon(rows) {
  let allOk = true;
  for (const r of rows) {
    if (!r.ok) allOk = false;
    console.log(
      `   ${r.ok ? '✅' : '❌'} ${r.label.padEnd(40)} 解析=${String(r.actual).padStart(14)}  Excel=${String(r.expected).padStart(14)}  差=${r.diff}`,
    );
  }
  return allOk;
}

module.exports = { X, openSheet, cell, num, str, asDate, round2, reconcile, printRecon, EXCEL_DIR };
