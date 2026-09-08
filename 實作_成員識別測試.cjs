/* 實作-J　成員識別 S-02c-10 全站貫徹（真實 Chrome，`?members=noemoji`）。
 *
 * 為什麼要獨立一支：既有的版面回歸跑的是**有 emoji** 的假資料，
 * 三層 fallback 的第二層從來沒被走到過——Rozi 反覆回報「沒有填色圓底」，
 * 而 263 條斷言全綠。**假資料只走 happy path 等於那條路沒人守。**
 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

/* 每個畫面要展開哪些面板，以及**分區**量 .avatar.letter 的下限。
   ⚠️ 不要只量整頁總數——一頁有好幾區都有識別圖，把其中一區改回純文字，
   整頁總數仍然過門檻，斷言就假通過了（第一版就是這樣，兩條反向驗證沒紅）。
   `zone` 是那一區的容器選擇器，`by` 是用文字找 .fld 區塊。 */
const CASES = [
  { id: 's02b', expand: [], min: 4, what: '成員列（對照組）', zone: 'body' },
  { id: 's03',  expand: ['總花費'], min: 4, what: '統計卡每人一列', zone: '.perlist' },
  { id: 's04',  expand: [], min: 4, what: '誰付的 chip', by: '誰付的？' },
  { id: 's04',  expand: ['要排除誰？'], min: 4, what: '要排除誰逐人列', by: '分帳方式', tag: 'exclude' },
  { id: 's04',  expand: ['只算一個人'], min: 4, what: '只算一個人 chip', by: '算誰的？', tag: 'single' },
  { id: 's04',  expand: ['各付各的'], min: 4, what: '各自金額逐人列', by: '各自多少？', tag: 'each' },
  /* 實作-AC 之後「人話淨額」與原本的「對帳表逐人列」**合併成同一張卡**，
     所以這一列就涵蓋了兩者；原本另外那一列（`zone: '.detailtable'`）
     指的容器已經不存在，整列移除而不是改選擇器——改選擇器會變成同一件事驗兩次。 */
  { id: 's05',  expand: ['查看計算依據'], min: 4, what: '計算依據每人卡片（含人話淨額）',
    zone: '.gap', extra: '&state=settled' },

  /* ── 實作-J 第一輪退回：Rozi 最常看的三個畫面，先前還是裸字母 ── */
  { id: 's03',  expand: [], min: 5, what: '消費列的付款人（預設狀態）', zone: 'body',
    tag: 'payer', not: '.perlist' },
  { id: 's05',  expand: [], min: 6, what: '誰付給誰（預設狀態，3 條轉帳 × 2 人）', zone: 'body',
    tag: 'tx' },
  { id: 's06',  expand: [], min: 6, what: '分享頁轉帳列', zone: 'body', tag: 'tx' },
];

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await b.newPage();

  console.log('\n=== 實作-J　成員識別（?members=noemoji，真實 Chrome）===\n');

  for (const c of CASES) {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/harness.html?screen=${c.id}&members=noemoji${c.extra || ''}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 250));

    const expanded = await page.evaluate(labels => {
      const done = [];
      for (const t of labels) {
        const el = [...document.querySelectorAll('button,[role=tab]')]
          .find(x => (x.textContent || '').replace(/\s+/g, '').includes(t.replace(/\s+/g, '')));
        if (el) { el.click(); done.push(t); }
      }
      return done;
    }, c.expand);
    await new Promise(r => setTimeout(r, 200));

    const m = await page.evaluate(c => {
      /* 只量指定的那一區——量整頁會讓「改壞其中一區」照樣通過 */
      let root = document.body;
      if (c.by) {
        root = [...document.querySelectorAll('.fld')]
          .find(x => (x.textContent || '').includes(c.by)) || document.createElement('div');
      } else if (c.zone && c.zone !== 'body') {
        root = document.querySelector(c.zone) || document.createElement('div');
      }
      let letters = [...root.querySelectorAll('.avatar.letter')];
      if (c.not) {
        const skip = [...document.querySelectorAll(c.not)];
        letters = letters.filter(e => !skip.some(z => z.contains(e)));
      }
      return {
        count: letters.length,
        colors: [...new Set(letters.map(e => getComputedStyle(e).backgroundColor))],
        bad: letters
          .map(e => getComputedStyle(e).backgroundColor)
          .filter(c => c === 'rgb(255, 255, 255)' || c === 'rgba(0, 0, 0, 0)'),
        text: (document.body.textContent || ''),
        /* 第一個字有沒有真的畫出來 */
        glyphs: [...new Set(letters.map(e => (e.textContent || '').trim()))].slice(0, 6),
        found: root !== document.body || c.zone === 'body',
      };
    }, c);

    const label = `${c.id}${c.tag ? '/' + c.tag : ''}`;
    console.log(`   ${label.padEnd(11)} .avatar.letter ${String(m.count).padStart(2)} 顆｜` +
                `字 ${m.glyphs.join('')}｜色 ${m.colors.join(' ')}` +
                (expanded.length ? `｜展開 ${expanded.join('、')}` : ''));
    ok(m.found, `${label}（${c.what}）找不到那一區（${c.by || c.zone}），這條等於沒驗`);
    ok(m.count >= c.min, `${label}（${c.what}）只有 ${m.count} 顆填色圓底，下限 ${c.min}`);
    ok(m.bad.length === 0, `${label} 有 ${m.bad.length} 顆圓底是白色或透明：${m.bad.join('、')}`);
    ok(!m.text.includes('🙂'), `${label} 出現了 🙂——第三層只該在「沒 emoji 也沒名字」時出現`);
  }

  /* 停止條件 4：三處**句子**裡不准長出圓底 */
  await page.goto(`${BASE}/harness.html?screen=s05&members=noemoji&state=settled`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('查看計算依據'));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 250));
  const sentences = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.netwho div, .note.calm')) {
      const t = (el.textContent || '').trim();
      if (!/給你|^給 |先付的/.test(t)) continue;
      out.push({ t: t.slice(0, 22), avatars: el.querySelectorAll('.avatar').length });
    }
    return out;
  });
  console.log(`\n   句子 ${sentences.length} 句：` +
              sentences.map(x => `「${x.t}」圓底 ${x.avatars}`).join('；'));
  ok(sentences.length >= 2, `只掃到 ${sentences.length} 句，這條等於沒驗`);
  ok(sentences.every(x => x.avatars === 0),
    `句子裡長出圓底：${sentences.filter(x => x.avatars).map(x => x.t).join('、')}`);

  /* 停止條件 6：s06 在「沒有任何消費」時不得橫向溢出 */
  await page.goto(`${BASE}/harness.html?screen=s06&members=noemoji&expenses=none`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const empty = await page.evaluate(() => {
    const de = document.documentElement;
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || el.clientWidth === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.right > de.clientWidth + 1)
        over.push(`${el.tagName}.${(typeof el.className === 'string' ? el.className : '').slice(0, 20)} right=${Math.round(r.right)}`);
    }
    return {
      hasMsg: (document.body.textContent || '').includes('這趟旅程還沒結算。'),
      bodyOver: document.body.scrollWidth - document.body.clientWidth,
      over: over.slice(0, 3), n: over.length,
    };
  });
  console.log(`   s06（沒有消費）：訊息 ${empty.hasMsg ? '有' : '沒有'}｜` +
              `body 溢出 ${empty.bodyOver}px｜超出右緣 ${empty.n} 個 ${empty.over.join('；')}`);
  ok(empty.hasMsg, '「這趟旅程還沒結算。」沒出現，這條等於沒驗');
  ok(empty.bodyOver <= 0, `s06 沒有消費時 body 溢出 ${empty.bodyOver}px`);
  ok(empty.n === 0, `s06 沒有消費時有 ${empty.n} 個元素超出右緣：${empty.over.join('；')}`);

  /* 停止條件 5：三個畫面在三個寬度下，會捲的容器都不得橫向溢出 */
  for (const id of ['s03', 's05', 's06']) {
    for (const w of [320, 390, 414]) {
      await page.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true });
      await page.goto(`${BASE}/harness.html?screen=${id}&members=noemoji`, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 220));
      const o = await page.evaluate(() => {
        const bad = [];
        let n = 0;
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.overflowX === 'visible' || el.clientWidth === 0) continue;
          n++;
          if (el.scrollWidth > el.clientWidth + 1)
            bad.push(`${el.tagName}.${(typeof el.className === 'string' ? el.className : '').slice(0, 20)} ${el.scrollWidth}>${el.clientWidth}`);
        }
        return { n, bad: bad.slice(0, 3), total: bad.length };
      });
      ok(o.n >= 1, `${id} @${w} 一個捲動容器都沒掃到，這條等於沒驗`);
      ok(o.total === 0, `${id} @${w} 容器橫向溢出 ${o.total} 處：${o.bad.join('；')}`);
    }
  }
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  /* 停止條件 3：誰付的 chip 不得撐高，且該區塊自己不橫向捲 */
  await page.goto(`${BASE}/harness.html?screen=s04&members=noemoji`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const chip = await page.evaluate(() => {
    const zone = [...document.querySelectorAll('.fld')].find(x => x.textContent.includes('誰付的？'));
    if (!zone) return null;
    const chips = [...zone.querySelectorAll('.chip')];
    const box = zone.querySelector('.chips');
    /* 圓底與名字的垂直中心要對齊——沒有 flex 對齊時 20px 的方塊會偏上 */
    let maxCenterDiff = 0;
    for (const c of chips) {
      const av = c.querySelector('.avatar');
      if (!av) continue;
      const ar = av.getBoundingClientRect(), cr = c.getBoundingClientRect();
      maxCenterDiff = Math.max(maxCenterDiff,
        Math.abs((ar.top + ar.bottom) / 2 - (cr.top + cr.bottom) / 2));
    }
    return {
      n: chips.length,
      maxH: Math.max(...chips.map(c => c.getBoundingClientRect().height)),
      scrollW: box.scrollWidth, clientW: box.clientWidth, maxCenterDiff,
    };
  });
  console.log(`\n   s04 誰付的：${chip.n} 顆 chip｜最高 ${chip.maxH.toFixed(1)}px｜` +
              `chips 容器 ${chip.scrollW}/${chip.clientW}｜圓底/文字中心差 ${chip.maxCenterDiff.toFixed(1)}px`);
  ok(chip && chip.n >= 4, '誰付的 chip 掃不到，這條等於沒驗');
  ok(chip.maxCenterDiff <= 2,
    `chip 裡圓底與名字的垂直中心差 ${chip.maxCenterDiff.toFixed(1)}px，上限 2`);
  ok(chip.maxH <= 36, `誰付的 chip 高 ${chip.maxH.toFixed(1)}px，上限 36`);
  ok(chip.scrollW <= chip.clientW + 1, `誰付的那一排橫向溢出 ${chip.scrollW - chip.clientW}px`);

  /* 停止條件 4：emoji 就地編輯框不得撐滿整列 */
  await page.goto(`${BASE}/harness.html?screen=s02b&members=noemoji`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  /* click 之後**要等 React 重繪**——同步讀取的話輸入框還沒進 DOM，
     會誤判成「點不開」。 */
  const opened = await page.evaluate(() => {
    const av = document.querySelector('.rowb .avatar');
    if (!av) return false;
    av.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 250));
  const inline = await page.evaluate(() => {
    const inp = document.querySelector('.rowb input[type=text]');
    if (!inp) return { w: null, nameRight: null, rowRight: null };
    const row = inp.closest('.rowb');
    const name = [...row.querySelectorAll('span')].find(s => s.textContent.trim().length > 1);
    return {
      w: inp.getBoundingClientRect().width,
      nameRight: name ? name.getBoundingClientRect().right : null,
      rowRight: row ? row.getBoundingClientRect().right : null,
    };
  });
  console.log(`   s02b 就地編輯框寬 ${inline && inline.w ? inline.w.toFixed(1) : '(沒開)'}px｜` +
              `名字 right=${inline && inline.nameRight ? inline.nameRight.toFixed(0) : '-'}｜` +
              `列 right=${inline && inline.rowRight ? inline.rowRight.toFixed(0) : '-'}`);
  ok(opened, '找不到成員列的頭像，點不下去');
  ok(inline && inline.w !== null, '點了但輸入框沒出現，這條等於沒驗');
  /* 🔴 實作-AE-3 之後就地編輯框固定 **28px**（與旁邊的 Avatar 一致，
     進出編輯那一列才不會跳動）。原本的 30–34 是 `w-8`（32px）時代的範圍。
     ⚠️ 這條真正要守的是「**沒有被全域 input 規則撐滿整列**」——
     所以除了等於 28，也一併確認它遠小於列寬。 */
  ok(inline && inline.w !== null && Math.abs(inline.w - 28) <= 0.5,
    `就地編輯框寬 ${inline && inline.w !== null ? inline.w.toFixed(1) : '(沒開)'}px，應為 28`);
  ok(!inline || inline.w === null || inline.rowRight === null || inline.w < inline.rowRight / 2,
    '就地編輯框被撐滿整列了（全域 input 規則壓過元件的寬度）');
  ok(!inline || inline.nameRight === null || inline.rowRight === null
     || inline.nameRight <= inline.rowRight + 1,
    `成員名字被擠出框外：${inline.nameRight} > ${inline.rowRight}`);

  /* 停止條件 5：「加一個人」裡不得有頭像 */
  await page.goto(`${BASE}/harness.html?screen=s02&members=noemoji`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const addClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('新增成員'));
    if (!btn) return false;
    btn.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 250));   // 等 React 重繪
  const add = await page.evaluate(() => {
    const box = [...document.querySelectorAll('div')]
      .find(d => d.textContent.includes('加一個人') && d.querySelector('input[placeholder="叫什麼名字？"]'));
    return box ? { avatars: box.querySelectorAll('.avatar').length, text: box.textContent } : null;
  });
  console.log(`   s02「加一個人」內的 .avatar：${add ? add.avatars : '(找不到區塊)'} 個`);
  ok(addClicked, '找不到「新增成員」按鈕');
  ok(add !== null, '點了但「加一個人」區塊沒出現，這條等於沒驗');
  ok(add !== null && add.avatars === 0,
    `「加一個人」裡還有 ${add ? add.avatars : '?'} 個頭像，原型 S-02-15 沒有頭像`);
  ok(add !== null && !add.text.includes('🙂'), '「加一個人」裡還有 🙂');

  await b.close(); srv.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
