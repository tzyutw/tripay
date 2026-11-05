/* 常設 C10　假資料必須涵蓋 fallback 與空值路徑（規則由來 第 6 條）
 *
 * 「凡是規格裡寫了『沒有 X 就退回 Y』的，假資料就要有一筆是沒有 X 的。」
 * 這條驗的是**量測靶本身**：每一條分岔都要有一個網址參數，而且開下去之後
 * 端出來的資料（`window.__HARNESS_FIXTURE__`，樁真正端出去的那一份）**形狀真的是那樣**——
 * 只有參數名字、沒有對應形狀，比沒有更糟（會讓人以為驗過了）。
 *
 * 掃哪些分岔：下面 BRANCHES（規則由來第 6 條的清單＋規格 §47／§48／§49）
 * 什麼時間點：載入 `screen=s03&<參數>` 之後讀 fixture
 * 判定：每一條分岔都有參數，而且 predicate 成立；同時畫面掛得起來
 *
 * ⚠️ 機器驗不到的半條：「假資料的 title 若引用正式資料的名稱，形狀必須逐欄相同」——
 *    正式資料快照刻意不帶 title（隱私），這半條要人工對照，見 README。
 */
const H = require('./lib/harness.cjs');

const BRANCHES = [
  { name: '成員沒有 emoji（→ 名字第一個字）', q: 'members=noemoji',
    ok: f => f.members.length > 0 && f.members.every(m => !m.emoji) },
  { name: '成員名字是組合字（👨‍👩‍👧 這種不可切開的字）', q: 'members=zwj',
    ok: f => f.members.some(m => /‍/.test(m.name || '')) },
  { name: '成員名字很長（塞爆 chip）', q: 'members=long', ok: f => f.members.some(m => [...(m.name || '')].length >= 10) },
  { name: '金額未定案：只有外幣、沒有台幣、沒匯率', q: 'forOnly=1',
    ok: f => f.expenses.some(e => e.foreign_amount != null && e.twd_amount == null) },
  { name: '金額未定案：各自付各的有人沒填', q: 'fill=noforetotal',
    ok: f => f.expenses.some(e => e.expense_type === 'individual' && (e.expense_splits || []).some(s => s.is_participating && s.split_amount == null && s.split_amount_foreign == null)) },
  { name: '金額未定案：外幣與台幣都沒填', q: null,
    ok: f => f.expenses.some(e => e.foreign_amount == null && e.twd_amount == null && e.expense_type !== 'individual') },
  { name: '行程沒有回程日', q: 'enddate=none', ok: f => f.trip && f.trip.end_date == null },
  { name: '行程沒有匯率', q: '', ok: f => f.trip && (f.trip.cash_rate_twd == null || f.trip.cash_rate_foreign == null) },
  { name: '匯率只填一邊', q: 'rate=half', ok: f => f.trip && ((f.trip.cash_rate_twd == null) !== (f.trip.cash_rate_foreign == null)) },
  { name: '消費清單為空', q: 'expenses=none', ok: f => f.expenses.length === 0 },
  { name: '§47 外幣總額有值＋有人沒填 → 剩餘歸未填者', q: 'fill=remainder',
    ok: f => f.expenses.some(e => e.expense_type === 'individual' && e.split_fill_currency === 'FOR' && e.foreign_amount != null
      && (e.expense_splits || []).some(s => s.is_participating && s.split_amount_foreign == null)
      && e.foreign_amount > (e.expense_splits || []).reduce((a, s) => a + (s.split_amount_foreign || 0), 0)) },
  { name: '§48 外幣總額空白＋全員都填 → 已填加總當分母', q: 'fill=alltyped',
    ok: f => f.expenses.some(e => e.expense_type === 'individual' && e.split_fill_currency === 'FOR' && e.foreign_amount == null
      && (e.expense_splits || []).filter(s => s.is_participating).every(s => s.split_amount_foreign != null)) },
  { name: '§49 外幣總額空白＋有人沒填 → 不准猜', q: 'fill=noforetotal',
    ok: f => f.expenses.some(e => e.expense_type === 'individual' && e.split_fill_currency === 'FOR' && e.foreign_amount == null
      && (e.expense_splits || []).some(s => s.is_participating && s.split_amount_foreign == null)) },
  { name: '已結算後又改帳', q: 'state=stale', ok: f => f.trip && f.trip.status === 'settled' },
  { name: '已封存', q: 'state=archived', ok: f => f.trip && f.trip.status === 'archived' },
  { name: '查不到行程', q: 'trip=missing', ok: f => !f.trip },
];

module.exports = {
  id: 'C10', title: '假資料涵蓋每一條分岔',
  async run({ page, base }) {
    const rows = [];
    for (const b of BRANCHES) {
      /* 沒有專屬參數的分岔：先在「預設＋所有已知參數」都找一遍，找得到就算有靶（會寫出是哪個） */
      const tries = b.q != null ? [b.q] : ['', 'members=noemoji', 'expenses=allself', 'selfpending=1', 'fill=for', 'fill=twd', 'fill=oy', 'blanks=2'];
      let hit = null, err = '';
      for (const q of tries) {
        try {
          await H.open(page, base, `screen=s03${q ? '&' + q : ''}`, { wait: 150 });
          const f = await page.evaluate(() => {
            const x = window.__HARNESS_FIXTURE__ || {};
            return { trip: (x.trip && x.trip.id) ? x.trip : null, members: x.members || [], expenses: x.expenses || [] };
          });
          if (b.ok(f)) { hit = q; break; }
        } catch (e) { err = e.message; }
      }
      rows.push({ where: b.name, element: b.q != null ? `參數 ${b.q || '（預設）'}` : '沒有專屬參數，掃了既有參數',
        measured: hit != null ? `有靶（${hit || '預設'}），形狀成立` : `沒有任何一組假資料是這個形狀${err ? '；' + err : ''}`,
        limit: '要有一組假資料走過', ok: hit != null });
    }
    return { rows };
  },
};
