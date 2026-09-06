/* 實作-K-3　harness 的三個資料形狀參數。
 * 這幾條驗的是「參數真的有生效」——參數沒接上的話，
 * 版面回歸跑那三種組合等於跑了三次一模一樣的預設值，全綠但什麼都沒驗到。 */
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist-harness');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
               '.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json' };
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

(async () => {
  const { srv, port } = await serve(DIST);
  const BASE = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  console.log('\n=== 實作-K　harness 的資料形狀參數 ===\n');

  const probe = async q => {
    await p.goto(`${BASE}/harness.html?screen=s03${q}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 300));
    return p.evaluate(() => {
      const t = document.body.textContent || '';
      return {
        rows: document.querySelectorAll('.exprow').length,
        empty: t.includes('第一筆從哪裡開始？'),
        listhd: (t.match(/消費紀錄 · (\d+) 筆/) || [])[1] ?? null,
        rate: t.includes('設現金匯率'),
      };
    });
  };

  /* 預設：對照組 */
  const base = await probe('');
  console.log(`   預設　　　　　消費列 ${base.rows}｜清單標題「${base.listhd} 筆」｜空狀態 ${base.empty}`);
  ok(base.rows > 0, '預設模式就沒有消費列，後面每一條都會假通過');

  /* ?expenses=none */
  const none = await probe('&expenses=none');
  console.log(`   expenses=none 消費列 ${none.rows}｜清單標題「${none.listhd} 筆」｜空狀態 ${none.empty}`);
  ok(none.rows === 0, `?expenses=none 還有 ${none.rows} 列消費`);
  ok(none.listhd === '0', `?expenses=none 的清單標題是「${none.listhd} 筆」`);
  ok(none.empty, '?expenses=none 沒有顯示空狀態');

  /* ?rate=half：外幣有值、台幣為 null */
  const half = await p.evaluate(async base => {
    const r = await fetch(base + '/harness.html?screen=s03&rate=half');
    return r.ok;
  }, BASE);
  await p.goto(`${BASE}/harness.html?screen=s03&rate=half`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const rate = await p.evaluate(() => {
    const t = window.__TRIP__ || null;
    return t ? { twd: t.cash_rate_twd, for: t.cash_rate_foreign } : null;
  });
  console.log(`   rate=half　　 cash_rate_twd=${rate && rate.twd}｜cash_rate_foreign=${rate && rate.for}`);
  ok(rate !== null, '量測靶沒有把 trip 掛出來（window.__TRIP__），這條等於沒驗');
  ok(rate && rate.for !== null && rate.twd === null,
    `?rate=half 應為外幣有值、台幣 null，實際 for=${rate && rate.for} twd=${rate && rate.twd}`);
  void half;

  /* ?pays=none */
  await p.goto(`${BASE}/harness.html?screen=s04&pays=none`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const pays = await p.evaluate(() => {
    const t = window.__TRIP__ || null;
    const zone = [...document.querySelectorAll('.fld')].find(x => x.textContent.includes('怎麼付的？'));
    return {
      methods: t ? t.payment_methods : undefined,
      chips: zone ? [...zone.querySelectorAll('.chip')].map(c => c.textContent.trim()) : null,
    };
  });
  console.log(`   pays=none　　 payment_methods=${JSON.stringify(pays.methods)}｜chips ${JSON.stringify(pays.chips)}`);
  ok(pays.methods === null, `?pays=none 的 payment_methods 應為 null，實際 ${JSON.stringify(pays.methods)}`);
  ok(Array.isArray(pays.chips) && pays.chips.length === 1 && pays.chips[0] === '現金',
    `沒設支付方式時應退回單一「現金」，實際 ${JSON.stringify(pays.chips)}`);

  /* 對照：預設有三種（含自訂的 Linepay） */
  await p.goto(`${BASE}/harness.html?screen=s04`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const dflt = await p.evaluate(() => {
    const zone = [...document.querySelectorAll('.fld')].find(x => x.textContent.includes('怎麼付的？'));
    return zone ? [...zone.querySelectorAll('.chip')].map(c => c.textContent.trim()) : null;
  });
  console.log(`   預設支付方式　${JSON.stringify(dflt)}`);
  ok(dflt && dflt.length === 3, `預設應有三種支付方式（含自訂的 Linepay），實際 ${JSON.stringify(dflt)}`);

  await b.close(); srv.close();
  console.log('\n============================');
  console.log(`通過 ${pass}　失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
