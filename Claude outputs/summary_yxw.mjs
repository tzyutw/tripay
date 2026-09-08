// src/lib/summary.ts
function tripRate(t) {
  const twd = Number(t.cash_rate_twd), fr = Number(t.cash_rate_foreign);
  if (!Number.isFinite(twd) || !Number.isFinite(fr) || twd <= 0) return null;
  return fr / twd;
}
function partsOf(e, members) {
  if (e.expense_type === "personal") return [];
  if (e.individual_member_id) return [e.individual_member_id];
  const on = new Set((e.expense_splits ?? []).filter((s) => s.is_participating).map((s) => s.member_id));
  return members.filter((m) => on.has(m.id)).map((m) => m.id);
}
function calc(e, t, members) {
  const rate = tripRate(t);
  const parts = partsOf(e, members);
  const forT = e.foreign_amount, twdIn = e.twd_amount;
  let twdTotal = Number.isFinite(twdIn) ? twdIn : null;
  let twdFromRate = false;
  if (twdTotal == null && Number.isFinite(forT) && rate) {
    twdTotal = Math.round(forT / rate);
    twdFromRate = true;
  }
  const needRateLink = twdTotal == null && Number.isFinite(forT) && !rate;
  const twdPending = twdTotal == null;
  const isEach = e.expense_type === "individual";
  const manual = {}, blanks = [];
  let sumManual = 0;
  if (isEach) {
    const byId = new Map((e.expense_splits ?? []).map((s) => [s.member_id, s]));
    for (const id of parts) {
      const s = byId.get(id);
      const raw = e.split_fill_currency === "FOR" ? s?.split_amount_foreign : s?.split_amount;
      if (raw != null && Number.isFinite(raw)) {
        manual[id] = raw;
        sumManual += raw;
      } else blanks.push(id);
    }
  }
  const fillsAreForeign = isEach && e.split_fill_currency === "FOR";
  let forTotalEff = Number.isFinite(forT) ? forT : null;
  let forTotalAuto = false;
  let noAutoReason = null;
  if (fillsAreForeign && forTotalEff == null) {
    if (blanks.length === 0 && sumManual > 0) {
      forTotalEff = sumManual;
      forTotalAuto = true;
    } else if (sumManual > 0 || blanks.length) noAutoReason = "noForeignTotal";
  }
  const valInCur = {};
  const shares = {};
  if (isEach) {
    const base = fillsAreForeign ? forTotalEff : twdTotal;
    if (base != null && !noAutoReason) {
      const remain = base - sumManual;
      const auto = blanks.length ? Math.max(0, Math.floor(remain / blanks.length)) : null;
      for (const id of parts) valInCur[id] = id in manual ? manual[id] : auto ?? 0;
      if (blanks.length && remain > 0 && auto != null)
        valInCur[blanks[blanks.length - 1]] += remain - auto * blanks.length;
    } else {
      for (const id of parts) valInCur[id] = id in manual ? manual[id] : null;
    }
    for (const id of parts) {
      const v = valInCur[id];
      if (v == null || twdPending) {
        shares[id] = null;
        continue;
      }
      if (fillsAreForeign && !forTotalEff) {
        shares[id] = null;
        continue;
      }
      shares[id] = fillsAreForeign ? Math.round(twdTotal * v / forTotalEff) : Math.round(v);
    }
    if (!twdPending && e.payer_member_id && parts.includes(e.payer_member_id) && parts.every((id) => shares[id] != null)) {
      const sum = parts.reduce((a, id) => a + shares[id], 0);
      shares[e.payer_member_id] = shares[e.payer_member_id] + twdTotal - sum;
    }
  } else if (!twdPending && parts.length) {
    const per = Math.round(twdTotal / parts.length);
    for (const id of parts) {
      shares[id] = per;
      valInCur[id] = per;
    }
    if (e.payer_member_id && parts.includes(e.payer_member_id))
      shares[e.payer_member_id] = per + twdTotal - per * parts.length;
  } else {
    for (const id of parts) {
      shares[id] = null;
      valInCur[id] = null;
    }
  }
  const estimated = {};
  if (isEach && blanks.length >= 2 && !noAutoReason) for (const id of blanks) estimated[id] = true;
  const unsettled = twdPending || isEach && blanks.length >= 2;
  const debts = parts.filter((id) => id !== e.payer_member_id && shares[id]).map((id) => ({ from: id, to: e.payer_member_id, amount: shares[id] }));
  return {
    rate,
    twdTotal: twdTotal ?? 0,
    twdPending,
    twdFromRate,
    needRateLink,
    isEach,
    blanks,
    forTotalEff,
    forTotalAuto,
    noAutoReason,
    fillsAreForeign,
    valInCur,
    shares,
    estimated,
    unsettled,
    debts
  };
}
function toSharedExpense(e, members) {
  return {
    id: e.id,
    title: e.title,
    emoji: e.category_emoji,
    date: e.expense_date,
    created: new Date(e.created_at).getTime(),
    payer: e.payer_member_id,
    type: e.individual_member_id ? "single" : e.expense_type === "individual" ? "individual" : "shared",
    parts: e.individual_member_id ? [e.individual_member_id] : partsOf(e, members),
    onSpot: e.settled_on_spot,
    sponsor: e.is_sponsor,
    /* production 有 128 筆歷史消費是 `personal`（四趟舊行程的個人購物）。
       它們本來就不進結算（`partsOf()` 回空陣列），但畫面上完全沒有標記，
       跟「一起分」長得一模一樣。這個旗標**只給顯示層**用，金額一分都不變。 */
    personal: e.expense_type === "personal"
  };
}
function isSelfPaid(row, se) {
  if (row.expense_type === "personal") return true;
  const parts = se.parts ?? [];
  return parts.length === 1 && parts[0] === row.payer_member_id;
}
function tripSummary(trip, expenses, displayStatus, opts = {}) {
  const onlyShared = Boolean(opts.onlyShared);
  const members = [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
  const readonly = displayStatus === "settled" || displayStatus === "archived";
  const t = {
    id: trip.id,
    name: trip.name,
    start: trip.start_date,
    members: members.map((m) => ({ id: m.id, name: m.name, emoji: m.emoji })),
    settleMode: trip.settlement_mode,
    hubMember: trip.hub_member_id
  };
  let total = 0;
  let forTotalRaw = 0, forTotalBackTwd = 0, forTotalHasRaw = false;
  const per = {}, approx = {};
  for (const m of members) {
    per[m.id] = 0;
    approx[m.id] = false;
  }
  const calcCache = /* @__PURE__ */ new Map();
  const unsettledList = [];
  const list = [];
  const self = {
    list: [],
    total: 0,
    pending: 0,
    forRaw: 0,
    forBackTwd: 0,
    hasRaw: false
  };
  for (const row of expenses) {
    const c = calc(row, trip, members);
    calcCache.set(row.id, c);
    const se = toSharedExpense(row, members);
    if (c.unsettled) unsettledList.push({ e: se, c });
    if (onlyShared && isSelfPaid(row, se)) {
      self.list.push(se);
      if (!c.twdPending && !row.is_sponsor) {
        self.total += c.twdTotal;
        if (c.forTotalEff != null && !c.forTotalAuto) {
          self.forRaw += c.forTotalEff;
          self.hasRaw = true;
        } else self.forBackTwd += c.twdTotal;
      } else if (c.twdPending) self.pending += 1;
      continue;
    }
    list.push(se);
    if (!c.twdPending && !row.is_sponsor) {
      total += c.twdTotal;
      if (c.forTotalEff != null && !c.forTotalAuto) {
        forTotalRaw += c.forTotalEff;
        forTotalHasRaw = true;
      } else forTotalBackTwd += c.twdTotal;
    }
    for (const id of se.parts ?? []) {
      const s = c.shares[id];
      if (s != null) per[id] = (per[id] ?? 0) + s;
      if (c.twdPending || c.estimated[id]) approx[id] = true;
    }
  }
  return {
    t,
    list,
    readonly,
    total,
    per,
    approx,
    unsettledList,
    onlyShared,
    self,
    forTotalRaw,
    forTotalBackTwd,
    forTotalHasRaw,
    calcOf: (e) => calcCache.get(e.id) ?? {
      twdTotal: 0,
      twdPending: true,
      estimated: {},
      forTotalEff: null,
      forTotalAuto: false
    }
  };
}
function settleTrip(S, expenses, trip) {
  const members = [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
  const net = {};
  for (const m of members) net[m.id] = 0;
  for (const row of expenses) {
    if (row.settled_on_spot) continue;
    const c = calc(row, trip, members);
    if (c.twdPending) continue;
    for (const d of c.debts) {
      net[d.from] -= d.amount;
      net[d.to] += d.amount;
    }
  }
  const tx = [];
  if (trip.settlement_mode === "hub" && trip.hub_member_id) {
    const hub = trip.hub_member_id;
    for (const [id, v] of Object.entries(net)) {
      if (id === hub) continue;
      if (v < 0) tx.push({ from: id, to: hub, amount: -v });
      else if (v > 0) tx.push({ from: hub, to: id, amount: v });
    }
  } else {
    const cred = [], debt = [];
    for (const [id, v] of Object.entries(net)) {
      if (v > 0) cred.push([id, v]);
      else if (v < 0) debt.push([id, -v]);
    }
    cred.sort((a, b) => b[1] - a[1]);
    debt.sort((a, b) => b[1] - a[1]);
    let i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      const amt = Math.min(debt[i][1], cred[j][1]);
      if (amt > 0) tx.push({ from: debt[i][0], to: cred[j][0], amount: amt });
      debt[i][1] -= amt;
      cred[j][1] -= amt;
      if (debt[i][1] === 0) i++;
      if (cred[j][1] === 0) j++;
    }
  }
  void S;
  return { net, tx };
}
function prepaidShare(expenses, trip) {
  const members = [...trip.trip_members].sort((a, b) => a.sort_order - b.sort_order);
  const by = {};
  for (const m of members) by[m.id] = 0;
  let total = 0;
  for (const row of expenses) {
    if (row.settled_on_spot || row.is_sponsor) continue;
    const c = calc(row, trip, members);
    if (c.twdPending || !row.payer_member_id) continue;
    by[row.payer_member_id] = (by[row.payer_member_id] ?? 0) + c.twdTotal;
    total += c.twdTotal;
  }
  let top = null, ratio = 0;
  for (const [id, v] of Object.entries(by))
    if (total > 0 && v / total > ratio) {
      ratio = v / total;
      top = id;
    }
  return { top, ratio, total };
}
export {
  calc,
  isSelfPaid,
  prepaidShare,
  settleTrip,
  toSharedExpense,
  tripRate,
  tripSummary
};
