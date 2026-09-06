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
  { id: 's05',  expand: ['查看計算依據'], min: 4, what: '人話淨額', zone: '.gap', extra: '&state=settled' },
  { id: 's05',  expand: ['查看計算依據'], min: 4, what: '對帳表逐人列', zone: '.detailtable',
    extra: '&state=settled', tag: 'table' },
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
      const letters = [...root.querySelectorAll('.avatar.letter')];
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
  ok(inline && inline.w !== null && inline.w >= 30 && inline.w <= 34,
    `就地編輯框寬 ${inline && inline.w !== null ? inline.w.toFixed(1) : '(沒開)'}px，`
    + '應在 30–34（撐滿整列＝全域 input 規則壓過 w-8）');
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
