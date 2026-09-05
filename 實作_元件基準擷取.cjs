/* 實作-A2-③　從 Tripay_原型.html 擷取共用元件的「同一組資料 → 該長出來的文字」。
 *
 * 產出 src/test/fixtures/shared-components.json，內容兩半：
 *   input  —— 餵給 React 元件的資料（SharedSummary 的形狀）
 *   expect —— 原型用同一組資料 render 出來的文字集合
 * React 元件拿 input 畫出來的文字，必須等於 expect。
 *
 * 為什麼要從原型抓、不自己寫預期值：自己寫的預期值只證明「元件跟我想的一樣」，
 * 證明不了「元件跟原型一樣」——而原型才是唯一真相。
 */
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve('Tripay_原型.html');
const OUT = 'src/test/fixtures/shared-components.json';

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.goto('file://' + FILE, { waitUntil: 'load' });

  const data = await p.evaluate(() => {
    /* 文字集合：把一段 HTML 丟進暫存節點，取出所有非空白文字 */
    const texts = html => {
      const d = document.createElement('div');
      d.innerHTML = html;
      /* 稿註徽章與遮罩的說明字都是原型的鷹架，不是產品內容 */
      d.querySelectorAll('.bdg, .scrim').forEach(x => x.remove());
      const out = [];
      const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { const t = n.textContent.trim(); if (t) out.push(t); }
      /* ⚠️ 比對的是 textContent，不是文字節點陣列、也不是用空白接起來的節點。
         JSX 會把 {'都跟 '}{name}{' 結算'} 拆成三個節點、把 −{money} 拆成兩個，
         原型的字串內插是一個節點；用節點比或用空白接，比到的是實作方式不是行為
         （會冒出「− $ 50,000」對不上「−$ 50,000」這種假失敗）。
         textContent 兩邊都不插分隔符，結構不同也不影響。 */
      /* 空白一律拿掉再比：原型的空白有一部分來自 HTML 模板的縮排與換行，
         JSX 根本不會產生那些；留著就會比出「刪除行程 取消」對不上「刪除行程取消」。
         比的是字元內容，不是誰的原始碼怎麼排版。 */
      return { nodes: out, text: d.textContent.replace(/\s+/g, '') };
    };

    store.expenses.t1 = demoExpenses();
    store.s03Trip = 't1';
    store.s03Cur = 'TWD';
    const S = tripSummary('t1');
    const t = S.t;

    /* ── input：轉成 SharedSummary 的形狀 ── */
    const members = t.members.map(m => ({ id: m.id, name: m.name, emoji: m.emoji || null }));
    const list = S.list.map(e => ({
      id: e.id, title: e.title, emoji: e.emoji, date: e.date, created: e.created || 0,
      payer: e.payer || null, type: e.type,
      parts: e.parts || [], onSpot: !!e.onSpot, sponsor: !!e.sponsor,
    }));
    const calcs = {};
    S.list.forEach(e => {
      const c = calc(e, t);
      calcs[e.id] = { twdTotal: c.twdTotal, twdPending: !!c.twdPending,
                      estimated: Object.fromEntries(Object.keys(c.estimated || {}).map(k => [k, true])) };
    });
    const per = {}, approx = {};
    t.members.forEach(m => { per[m.id] = S.per[m.id]; approx[m.id] = !!S.approx[m.id]; });

    const trip = { id: t.id, name: t.name, start: t.start, members,
                   settleMode: t.settleMode || 'direct', hubMember: t.hubMember || null };

    /* ── expect：原型用同一組資料 render 出來的文字 ── */
    const sc = statCard(S, { totId: 'x', open: true, readonly: false });
    const scRo = statCard({ ...S, readonly: true }, { totId: 'x', open: true, readonly: true });

    /* 轉帳：direct 與 hub 兩種都要 */
    const tx = [{ from: members[1].id, to: members[0].id, amount: 1200 },
                { from: members[2].id, to: members[0].id, amount: 800 }];
    const tDirect = { ...t, settleMode: 'direct', hubMember: null };
    const tHub = { ...t, settleMode: 'hub', hubMember: members[0].id };

    return {
      input: {
        trip, list, calcs, per, approx, total: S.total,
        tx, hubMemberId: members[0].id,
      },
      expect: {
        statCard: texts(sc.tot + sc.per + sc.foot),
        statCardReadonly: texts(scRo.tot + scRo.per + scRo.foot),
        expenseGroups: texts(expenseGroups(S, {})),
        expenseGroupsReadonly: texts(expenseGroups(S, { readonly: true })),
        transferDirect: texts(transferView(tDirect, tx, {})),
        transferHub: texts(transferView(tHub, tx, {})),
        transferEmpty: texts(transferView(tDirect, [], {})),
        moreSheetActive: (store.s03Menu = true, texts(s03MoreSheet('active'))),
        moreSheetSettled: texts(s03MoreSheet('settled')),
        moreSheetArchived: texts(s03MoreSheet('archived')),
      },
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  await b.close();
  console.log('已寫出', OUT);
  for (const [k, v] of Object.entries(data.expect)) console.log(`   ${k.padEnd(22)} ${v.length} 段文字`);
  console.log(`   成員 ${data.input.trip.members.length}｜消費 ${data.input.list.length} 筆`);
})();
