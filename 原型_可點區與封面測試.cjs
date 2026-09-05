/* #34：六顆移除鈕的可點區／複選用方框打勾／「N 人均分」併列／
 *      日期欄高度／封面區暫時隱藏＋色調自動
 *
 *   BASE=<改動前的截圖目錄>   SHOTS=<改動後的截圖目錄>
 */
const fs = require('fs'), path = require('path');
let puppeteer, PNG, pixelmatch;
try { puppeteer = require('puppeteer-core'); }
catch (e) { if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
            else { console.error('需要 puppeteer-core'); process.exit(2); } }
try { PNG = require('pngjs').PNG;
      pixelmatch = require('pixelmatch');
      if (typeof pixelmatch !== 'function') pixelmatch = pixelmatch.default; } catch (e) {}
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = path.resolve(process.argv[2] || 'Tripay_原型.html');
const SRC  = fs.readFileSync(FILE, 'utf8');
const BASE = process.env.BASE, SHOTS = process.env.SHOTS;

/* 這一輪展開的摺疊面板——#34 停止條件第 4 條要求先展開再掃 */
const OPENED = ['S-04「要排除誰？」的成員列', 'S-02b 支付方式清單', 'S-03 統計卡的每人分擔列'];

const SETUP = () => {
  setDev(true);
  store.expenses.t1 = demoExpenses();
  f = blankForm(store.trips[0].members); f.start = '2026-03-14'; f.end = ''; renderS02();
  fb = null; renderS02b();
  store.s03Tab = 'exp'; store.s03StatOpen = true; renderS03();
  store.s03Filter = { kind: 'all' }; renderS03d();
  store.s03bView = 'share'; renderS03b();
  store.s06StatOpen = true; renderS06();
  store.s07dlg = false; renderS07();
  const t = tripOf('t1'), M = t.members.map(m => m.id);
  g = exp({ title: '午餐', twdAmt: '1200', pay: t.pays[0], type: 'shared', parts: M, payer: M[0] });
  renderS04();
  const btn = document.querySelector('#scr-s04 [data-eexpand]');
  if (btn) btn.click();
  store.s05 = 'partial'; store.s05open = true; renderS05();
};

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('file://' + FILE, { waitUntil: 'load' });
  console.log('\n=== 0　載入 ===');
  console.log('   錯誤', errs.length, errs.slice(0, 2).join(' | '));
  ok(errs.length === 0, `載入時有 ${errs.length} 個錯誤`);
  console.log('   本輪展開的摺疊面板：' + OPENED.join('、'));

  /* 1　六顆移除鈕：無容器，可點區 ≥44×44 */
  console.log('\n=== 1　六顆移除鈕 ===');
  const rm = await pg.evaluate(setup => {
    eval('(' + setup + ')()');
    devScreen = 's02b'; renderDevBar();
    return [...document.querySelectorAll('.scr.devon .rmbtn')].map((el, i) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      /* 用 elementFromPoint 打四個角，量真正吃得到點擊的範圍（不是 border box）*/
      const hits = d => [[cx - d, cy - d], [cx + d, cy - d], [cx - d, cy + d], [cx + d, cy + d]]
        .every(([x, y]) => { const e = document.elementFromPoint(x, y);
          return e === el || el.contains(e) || (e && e.closest && e.closest('.rmbtn') === el); });
      /* 量「最大的 S，使 ±(S/2-0.5) 的四個角都還打得到」——
         直接打 ±S/2 會落在 border box 的排除邊界上，會少量到 2px */
      let S = 2; while (S < 80 && hits(S / 2 + 0.5)) S += 2;
      return { i, 可見: `${r.width.toFixed(0)}×${r.height.toFixed(0)}`,
               可點: `${S}×${S}`, span: S,
               bg: cs.backgroundColor, bw: cs.borderTopWidth, cls: el.className,
               icon: el.querySelector('svg') ? el.querySelector('svg').getAttribute('width') : null,
               color: cs.color };
    });
  }, SETUP.toString());
  rm.forEach(x => console.log(`   #${x.i}　可見 ${x.可見}　可點 ${x.可點}　icon ${x.icon}px　class="${x.cls}"　${x.color}`));
  ok(rm.length === 6, `應有六顆，實際 ${rm.length}`);
  ok(rm.every(x => !x.cls.includes('ic2')), '不要圓形容器——Rozi 明確裁示');
  ok(rm.every(x => x.bg === 'rgba(0, 0, 0, 0)' && parseFloat(x.bw) === 0), '應為裸 icon，無底色無外框');
  ok(rm.every(x => x.icon === '16'), `icon 應為 16px（與同列的拖曳把手同尺寸），實際 ${rm.map(x => x.icon).join('/')}`);
  ok(rm.every(x => x.span >= 44), `可點區應 ≥44×44，實際 ${rm.map(x => x.可點).join('、')}`);
  ok(rm.every(x => /rgb\(106, 121, 128\)|rgb\(205, 211, 208\)/.test(x.color)),
    `顏色應維持 --gr／#CDD3D0，不得改成刪除紅：${[...new Set(rm.map(x => x.color))].join('、')}`);

  /* 2　.selchip 三處：兩處圓形單選、一處改方框複選 */
  console.log('\n=== 2　單選鈕與複選框 ===');
  const chips = await pg.evaluate(setup => {
    eval('(' + setup + ')()');
    /* 量尺寸前先讓兩個畫面都看得見——藏起來的元素量到的是 0，
       #33 就是這樣把「查了但沒查到」誤讀成「沒有問題」 */
    document.querySelectorAll('#scr-s02b,#scr-s04').forEach(e =>
      (e.closest('.scr') || e).classList.add('devon'));
    const sel = [...document.querySelectorAll('.ui .selchip')].map(el => ({
      txt: el.textContent, aria: el.getAttribute('aria-hidden'), scr: el.closest('.ui').id,
      r: getComputedStyle(el).borderRadius }));
    const chk = [...document.querySelectorAll('.ui .chkchip')].map(el => ({
      txt: el.textContent, aria: el.getAttribute('aria-hidden'), scr: el.closest('.ui').id,
      r: getComputedStyle(el).borderRadius, on: el.classList.contains('on'),
      after: getComputedStyle(el, '::after').content,
      w: +el.getBoundingClientRect().width.toFixed(0) }));
    return { sel, chk, s04sel: document.querySelectorAll('#scr-s04 .selchip').length,
             selW: sel.length ? +document.querySelector('.ui .selchip').getBoundingClientRect().width.toFixed(1) : null };
  }, SETUP.toString());
  console.log(`   .selchip ${chips.sel.length} 顆（${[...new Set(chips.sel.map(x => x.scr))].join('/')}）`);
  console.log(`   .chkchip ${chips.chk.length} 顆（${[...new Set(chips.chk.map(x => x.scr))].join('/')}）`);
  ok(chips.sel.length === 2, `.selchip 應只剩結算模式那兩顆，實際 ${chips.sel.length}`);
  ok(chips.sel.every(x => x.txt.trim() === '' && x.aria === 'true'), '.selchip 內不得有文字、要 aria-hidden');
  ok(chips.sel.every(x => x.r === '50%'), '.selchip 應是圓形（單選）');
  ok(chips.s04sel === 0, 'S-04 的複選不該再用單選鈕的形狀');
  ok(chips.chk.length === 4, `.chkchip 應是四位成員各一顆，實際 ${chips.chk.length}`);
  ok(chips.chk.every(x => x.txt.trim() === '' && x.aria === 'true'), '.chkchip 內不得有文字、要 aria-hidden');
  ok(chips.chk.every(x => x.r !== '50%' && parseFloat(x.r) > 0), '.chkchip 應是圓角方框（複選）');
  console.log(`   .selchip 寬 ${chips.selW}｜.chkchip 寬 ${[...new Set(chips.chk.map(x => x.w))].join('/')}`);
  ok(chips.chk.every(x => Math.abs(x.w - chips.selW) <= 1),
    `.chkchip 尺寸應與 .selchip 相當，實際 ${chips.chk.map(x => x.w).join('/')} vs ${chips.selW}`);
  ok(chips.chk.filter(x => x.on).every(x => x.after !== 'none'), '選中的方框裡要有打勾');

  /* 3　「N 人均分」與「每人 ⋯」同一列 */
  console.log('\n=== 3　N 人均分與每人 ⋯ 併列 ===');
  const line = await pg.evaluate(setup => {
    eval('(' + setup + ')()');
    const l = document.querySelector('#scr-s04 .shareline');
    if (!l) return null;
    const seg = [...l.children].filter(x => !x.classList.contains('sep'));
    const money = l.querySelector('.money');
    const head = l.parentElement;
    const cs = getComputedStyle(head);
    return { tops: seg.map(x => +x.getBoundingClientRect().top.toFixed(1)),
             txt: seg.map(x => x.textContent.trim()),
             moneyFam: getComputedStyle(money).fontVariantNumeric,
             moneyFs: getComputedStyle(money).fontSize,
             padT: cs.paddingTop, padB: cs.paddingBottom };
  }, SETUP.toString());
  console.log('   ' + JSON.stringify(line));
  ok(line && line.tops.length === 2 && line.tops[0] === line.tops[1],
    `兩段文字應在同一列，實際 top ${line ? line.tops.join('/') : '—'}`);
  ok(line && /人均分/.test(line.txt[0]) && /每人/.test(line.txt[1]), '兩段文字內容不對');
  ok(line && line.moneyFam.includes('tabular-nums'), '「每人 ⋯」仍要是等寬字');
  ok(line && line.padT === line.padB, `併列後上下內距要配平，實際 ${line ? line.padT + '/' + line.padB : '—'}`);

  /* 4　日期欄高度 */
  console.log('\n=== 4　日期欄位高度 ===');
  const dates = await pg.evaluate(() => {
    setDev(true); devScreen = 's02'; renderDevBar();
    const q = () => [...document.querySelectorAll('#scr-s02 input[type=date]')].map(i => {
      const r = i.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), v: i.value };
    });
    f = blankForm(store.trips[0].members); f.start = '2026-03-14'; f.end = ''; renderS02();
    const empty = q();
    f.end = '2026-03-18'; renderS02();
    const filled = q();
    const box = el => +el.getBoundingClientRect().height.toFixed(1);
    const txtFld = document.querySelector('#scr-s02 input[type=text]').closest('.fld,.inp,.row') ||
                   document.querySelector('#scr-s02 input[type=text]').parentElement;
    const dateFld = document.querySelector('#scr-s02 .datefield');
    return { empty, filled, txtH: box(txtFld), dateFldH: dateFld ? box(dateFld) : null,
             txtCls: txtFld.className, dateCls: dateFld ? dateFld.className : null };
  });
  console.log('   空值:', JSON.stringify(dates.empty));
  console.log('   有值:', JSON.stringify(dates.filled));
  console.log(`   日期欄外框 .${dates.dateCls} 高 ${dates.dateFldH}（.${dates.txtCls} 含標籤 ${dates.txtH}，兩者結構不同不互比）`);
  ok(dates.empty[0].h === dates.empty[1].h, '空值時兩框應等高');
  ok(dates.filled[0].h === dates.filled[1].h, '有值時兩框應等高');
  ok(dates.empty[0].h === dates.filled[0].h, '有值與空值的高度必須相同——iOS 上塌掉的就是這個');
  ok(dates.empty[0].w === dates.empty[1].w && dates.filled[0].w === dates.filled[1].w, '兩框應等寬');
  ok(dates.filled[0].h >= 40, `日期框高度要撐得住手指，實際 ${dates.filled[0].h}`);
  ok(/input\[type=date\][^{]*\{[^}]*height:\s*\d+px/.test(SRC.replace(/\n/g, ' ')),
    'CSS 必須給日期欄明確高度，不能靠內容撐');
  ok(/::-webkit-date-and-time-value/.test(SRC), '必須處理 Safari 的內層盒子（Chrome 上不存在，永遠測不到）');

  /* 5　封面區暫時隱藏 */
  console.log('\n=== 5　封面區暫時隱藏 ===');
  const cover = await pg.evaluate(() => {
    fb = null; renderS02b();
    const txt = document.getElementById('scr-s02b').textContent;
    const first = document.querySelector('#scr-s02b .fld .lbl');
    return { txt, first: first ? first.textContent.trim() : null,
             hasCode: typeof COVER_UI !== 'undefined' };
  });
  for (const k of ['封面', '更換照片', '重選色調', '目前：目的地色調', '只有你和拿到分享連結的人看得到']) {
    console.log(`   含「${k}」:`, cover.txt.includes(k));
    ok(!cover.txt.includes(k), `S-02b 仍有「${k}」`);
  }
  ok(cover.first === '誰一起去？', `S-02b 第一個區塊應是「誰一起去？」，實際「${cover.first}」`);
  ok(cover.hasCode && /const COVER_UI = false/.test(SRC), '要用開關關掉，不是刪掉');
  /* 把開關打開跑一次，確認整區完整重現 */
  const pg2 = await browser.newPage();
  await pg2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await pg2.setContent(SRC.replace('const COVER_UI = false', 'const COVER_UI = true'), { waitUntil: 'load' });
  const on = await pg2.evaluate(() => {
    fb = null; renderS02b();
    fb.tonePick = true; renderS02b();   /* S-02b-10 的色票盤要按「重選色調」才出現 */
    const txt = document.getElementById('scr-s02b').textContent;
    return { has: ['封面', '更換照片', '重選色調'].every(k => txt.includes(k)),
             badges: ['S-02b-2', 'S-02b-3', 'S-02b-4', 'S-02b-5', 'S-02b-10']
               .filter(id => [...document.querySelectorAll('#scr-s02b .bdg')].some(b => b.textContent === id)) };
  });
  await pg2.close();
  console.log('   把開關打開：整區回來 =', on.has, '｜編號', on.badges.join(' '));
  ok(on.has && on.badges.length === 5, '把開關打開時封面區應完整重現（含五個編號）');

  /* 6　色調自動：關鍵字優先、循環色跟著存下來的序號 */
  console.log('\n=== 6　色調自動 ===');
  const tone = await pg.evaluate(() => {
    const keyed = toneFor('2026 濟州島四寶團', null, 5);
    const jeju = TONES.find(x => x.k === '濟州').g;
    /* 連開九趟不含關鍵字的行程 */
    const seqs = [];
    for (let i = 0; i < 9; i++) {
      f = blankForm(store.trips[0].members);
      f.name = '阿明生日 ' + i; f.start = '2026-05-01'; f.members = [m('🐵', 'A')];
      createTrip();
      seqs.push(store.trips[store.trips.length - 1].toneSeq);
    }
    /* 刪掉倒數第二趟，最後一趟的顏色不該變 */
    const last = store.trips[store.trips.length - 1];
    const before = toneFor(last.name, last.tone, last.toneSeq);
    store.trips.splice(store.trips.length - 2, 1);
    const after = toneFor(last.name, last.tone, last.toneSeq);
    return { keyed, jeju, seqs, stable: before === after,
             fallbackGone: typeof FALLBACK_TONE === 'undefined' };
  });
  console.log('   九趟的循環序號:', tone.seqs.join(','));
  console.log('   關鍵字優先:', tone.keyed === tone.jeju, '｜刪掉前一趟後顏色不變:', tone.stable);
  ok(tone.keyed === tone.jeju, '含關鍵字的行程要維持該關鍵字的色系（即使有循環序號）');
  ok(JSON.stringify(tone.seqs) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 0]),
    `循環色應依 TONES 順序輪、第 9 趟回到第 1 色，實際 ${tone.seqs.join(',')}`);
  ok(tone.stable, '刪掉前面的行程後，顏色不得位移——序號要在建立時就存起來');
  ok(tone.fallbackGone, 'FALLBACK_TONE 不得再被使用');

  /* 7　改 A 壞 B 的攔截網：逐張像素比對 */
  console.log('\n=== 7　改 A 壞 B 攔截網（像素比對）===');
  if (!BASE || !SHOTS || !PNG) console.log('   （缺 BASE／SHOTS 或 pixelmatch，跳過）');
  else {
    const ALLOWED = { s02b: '成員列與支付方式列（34-1）、封面區消失（34-6）',
                      s04: '「要排除誰？」的成員列（34-2）、「N 人均分」那一格（34-3）',
                      s02: '兩個日期欄位（34-4）' };
    const rows = [];
    for (const f of fs.readdirSync(BASE).filter(x => x.endsWith('.png'))) {
      const a = PNG.sync.read(fs.readFileSync(path.join(BASE, f)));
      const bPath = path.join(SHOTS, f);
      if (!fs.existsSync(bPath)) { rows.push({ f, note: '（改後沒有這一張）' }); continue; }
      const b = PNG.sync.read(fs.readFileSync(bPath));
      const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
      const diff = new PNG({ width: w, height: h });
      const crop = (img) => {
        if (img.width === w && img.height === h) return img;
        const out = new PNG({ width: w, height: h });
        PNG.bitblt(img, out, 0, 0, w, h, 0, 0);
        return out;
      };
      const n = pixelmatch(crop(a).data, crop(b).data, diff.data, w, h, { threshold: 0.12 });
      fs.writeFileSync(path.join(SHOTS, 'diff_' + f), PNG.sync.write(diff));
      /* 差異的垂直分布，用來說明「改變的區域在哪」 */
      const bands = [0, 0, 0, 0];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (diff.data[i] > 200 && diff.data[i + 1] < 100) bands[Math.min(3, Math.floor(y / h * 4))]++;
      }
      rows.push({ f: f.replace('.png', ''), pct: (n / (w * h) * 100).toFixed(2),
                  size: `${a.width}×${a.height}→${b.width}×${b.height}`, bands });
    }
    rows.forEach(r => console.log(`   ${r.f.padEnd(5)} 差異 ${r.pct ?? '—'}%　尺寸 ${r.size ?? ''}　四分帶 ${r.bands ? r.bands.join('/') : ''}${r.note || ''}`));
    const unexpected = rows.filter(r => !ALLOWED[r.f] && +r.pct > 2 && r.size && r.size.split('→')[0] === r.size.split('→')[1]);
    console.log('   允許有差異的畫面:', Object.keys(ALLOWED).join('、'));
    console.log('   範圍外的差異:', unexpected.length ? unexpected.map(r => `${r.f} ${r.pct}%`).join('、') : '（無）');
    ok(unexpected.length === 0, `改 A 壞 B：${unexpected.map(r => r.f).join('、')}`);
  }

  /* 8　貼邊與橫向捲動 */
  console.log('\n=== 8　貼邊與橫向捲動 ===');
  for (const w of [320, 375, 414]) {
    await pg.setViewport({ width: w, height: 900 });
    const r = await pg.evaluate(setup => {
      document.documentElement.classList.remove('anno');
      eval('(' + setup + ')()');
      setDev(false);
      const bad = [];
      document.querySelectorAll('.ui').forEach(ui => {
        const box = ui.getBoundingClientRect();
        const walk = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          if (!n.textContent.trim()) continue;
          const el = n.parentElement;
          if (!el || el.classList.contains('bdg')) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const rect = rg.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (rect.left - box.left < 13.5 || box.right - rect.right < 13.5)
            bad.push(`${ui.id}「${n.textContent.trim().slice(0, 8)}」`);
        }
      });
      return { bad: [...new Set(bad)], sw: document.documentElement.scrollWidth,
               cw: document.documentElement.clientWidth };
    }, SETUP.toString());
    console.log(`   ${w}px：${r.sw}/${r.cw}`, r.bad.length ? '貼邊 ' + r.bad.slice(0, 3).join('、') : '');
    ok(r.sw <= r.cw && r.bad.length === 0, `${w}px 有溢出或貼邊`);
  }

  /* 9　編號對帳 */
  console.log('\n=== 9　編號對帳 ===');
  await pg.setViewport({ width: 1280, height: 900 });
  await pg.goto('file://' + FILE, { waitUntil: 'load' });
  const ids = await pg.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('.idx table tr td:first-child').forEach(td => {
      const t = td.textContent.trim(); if (/^S-\d/.test(t)) s.add(t); });
    return [...s];
  });
  const rd = f => [...fs.readFileSync(f, 'utf8')
    .matchAll(/^\|\s*~*(S-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)~*(?:\s*\[[^\]]*\])?\s*\|/gm)].map(m => m[1]);
  const inv = new Set(rd('_盤點_畫面功能.md')), gap = new Set(rd('_盤點_實作缺口.md'));
  const orphan = ids.filter(x => !inv.has(x));
  const missing = [...inv].filter(x => !ids.includes(x) && !/^S-(0[89]|1[01])-/.test(x));
  console.log(`   原型 ${ids.length}｜盤點表 ${inv.size}｜盤點檔 ${gap.size}`);
  console.log('   孤兒：', orphan.join(' ') || '（無）', '｜缺：', missing.join(' ') || '（無）');
  ok(orphan.length === 0 && missing.length === 0, '編號對不起來');
  const hid = await pg.evaluate(() => INDEX.s02b.filter(r => r[2] === 'hid').map(r => r[0]));
  console.log('   標為「暫時隱藏」的:', hid.join(' '));
  ok(JSON.stringify(hid) === JSON.stringify(['S-02b-2', 'S-02b-3', 'S-02b-4', 'S-02b-5', 'S-02b-10']),
    `五個封面編號都要標為暫時隱藏，實際 ${hid.join(' ')}`);

  await pg.close();
  await browser.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
