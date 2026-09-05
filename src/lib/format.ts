/* 實作-A2-③　共用元件用得到的格式化工具，逐字對齊 Tripay_原型.html。
 * 文字只要差一個字，實作-B 拿元件去接畫面時就會跟原型對不起來。 */

/** 一個 grapheme——emoji 或一個中文字都算一個 */
export function firstGrapheme(s: string): string {
  const v = (s || '').trim();
  if (!v) return '';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(v);
    for (const g of seg) return g.segment;
  }
  return Array.from(v)[0] || '';
}

/** 3/14 這種短日期。
 *  ⚠️ 純字串切片，不走 `new Date()`——`new Date('2026-03-14')` 是 UTC 午夜，
 *  再用 local 的 getMonth／getDate 讀出來，在 UTC 以西的時區會整整少一天。
 *  原型的 md() 也是字串切片，兩邊必須同一種算法。 */
export function md(iso: string): string {
  if (!iso) return '';
  return `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
}

/** 行程卡的日期區間：3/14 – 3/18 · 2026；單日則 3/14 · 2026（單日） */
export function dateRange(start: string, end?: string | null): string {
  if (!start) return '';
  const y = start.slice(0, 4);
  return end && end !== start ? `${md(start)} – ${md(end)} · ${y}` : `${md(start)} · ${y}（單日）`;
}

/** 星期幾（單字） */
export function weekday(iso: string): string {
  return '日一二三四五六'[new Date(iso).getDay()];
}

/**
 * 金額。結算恆為台幣；統計可切外幣（決策 34）。
 * 原型的 money() 直接讀全域 store，元件不能那樣做——幣別與匯率當參數傳進來。
 */
export function money(v: number, opts: { sym?: string; rate?: number | null } = {}): string {
  const { sym, rate } = opts;
  if (sym && rate) return `${sym} ${Math.round(v * rate).toLocaleString()}`;
  return `$ ${Math.round(v).toLocaleString()}`;
}

/** 日期分組標題：出發前 ／ 第 N 天 · 3/14（六） */
export function dayLabel(tripStart: string, d: string): string {
  if (d < tripStart) return '出發前';
  const n = Math.floor((new Date(d).getTime() - new Date(tripStart).getTime()) / 86400000) + 1;
  return `第 ${n} 天 · ${md(d)}（${weekday(d)}）`;
}

/** 成員的顯示名：emoji ＋ 名字。沒有 emoji 就取名字的第一個字 */
export function memberLabel(m: { name: string; emoji?: string | null }): string {
  return `${m.emoji || firstGrapheme(m.name)} ${m.name}`;
}
