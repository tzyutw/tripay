/* 實作-Q-2　金額的千分位。
 *
 * 🔴 最容易漏的是**存檔前把逗號剝掉**：`Number('308,500')` 回 `NaN`，
 * 帳會直接壞掉而且不會有任何警告。所以剝離與格式化寫在同一個檔、
 * 由同一組測試守著——分開寫遲早會有一邊忘了。
 *
 * 欄位維持 `type="text"` ＋ `inputMode="decimal"`：
 * `type=number` 放不進逗號，而且不支援 selection API（游標會歸 0、字元倒序，#13）。
 */

/** 使用者打進去的字 → 數字。空字串與純逗號回 `null`（＝沒填，不是 0）。 */
export function parseAmount(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '' || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 顯示用的千分位。**保留使用者正在打的東西**——
 * 尾巴那個還沒接數字的小數點不能吃掉，不然打「12.」會變回「12」，
 * 下一個字元就接不上去。
 */
export function formatAmount(v: string | number | null | undefined, decimals: 0 | 2 = 2): string {
  if (v == null) return '';
  let s = String(v);
  if (s === '') return '';
  const neg = s.trim().startsWith('-');
  s = s.replace(/[^\d.]/g, '');
  if (decimals === 0) s = s.replace(/\./g, '');
  const dot = s.indexOf('.');
  let int = dot >= 0 ? s.slice(0, dot) : s;
  let frac = dot >= 0 ? s.slice(dot + 1).replace(/\./g, '').slice(0, decimals) : null;
  if (int === '' && frac == null) return '';
  int = int.replace(/^0+(?=\d)/, '');
  const grouped = int === '' ? '' : Number(int).toLocaleString('en-US');
  return (neg ? '-' : '') + grouped + (dot >= 0 ? '.' + (frac ?? '') : '');
}

/**
 * 格式化之後游標該落在哪。
 *
 * 沒有這一段，每打一個字游標就跳到最後——打「308500」會變成「008503」那種倒序。
 * 做法：數出游標左側有幾個**數字字元**，格式化後往回找到第幾個數字的後面。
 */
export function caretAfterFormat(raw: string, caret: number, formatted: string): number {
  const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
  if (digitsBefore === 0) return formatted.startsWith('-') ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen++;
    if (seen === digitsBefore) return i + 1;
  }
  return formatted.length;
}
