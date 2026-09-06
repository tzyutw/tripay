/* 實作-R-3　把 T 調到「高度佔 52%、垂直置中」。
 *
 * ⚠️ **不用字體度量推算**——`system-ui` 在不同機器上是不同的字，推算出來的數字會跑掉。
 * 也**不用 `getBBox()`**——它回的是排版用的 em 盒（font-size 260 會回 306），
 * 不是墨水的實際範圍。這裡把 SVG 畫進 canvas，**找出米白色 `#FEF9EE` 那些像素**
 * 的邊界框，這才是 Rozi 眼睛看到的 T。量 → 調 → 再量，迭代到收斂。
 */
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const P = 'public/pwa-icon.svg';
const N = 512, TARGET_H = N * 0.52, TARGET_C = N / 2;

async function inkBox(p, svg) {
  await p.goto('data:text/html,' + encodeURIComponent(
    `<body style="margin:0"><img id="i" width="${N}" height="${N}" ` +
    `src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body>`),
    { waitUntil: 'load' });
  return p.evaluate(async (n) => {
    const img = document.getElementById('i');
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data;
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      /* 米白的字（#FEF9EE）：三個通道都很亮。底是藍漸層，不會誤判 */
      if (d[i + 3] > 200 && d[i] > 235 && d[i + 1] > 230 && d[i + 2] >= 220 && d[i + 2] <= 250) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }, N);
}

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: N, height: N });
  let svg = fs.readFileSync(P, 'utf8');
  for (let i = 1; i <= 10; i++) {
    const fsz = +(svg.match(/font-size="([\d.]+)"/) || [])[1];
    const y = +(svg.match(/<text[^>]*\by="([\d.]+)"/) || [])[1];
    const bb = await inkBox(p, svg);
    if (!bb) { console.log('  量不到墨水，停'); break; }
    const cy = bb.y0 + bb.h / 2, cx = bb.x0 + bb.w / 2;
    console.log(`  #${i} font-size=${fsz} y=${y} → 墨水高 ${bb.h}（${(bb.h / N * 100).toFixed(1)}%）` +
                ` 垂直中心 ${cy.toFixed(1)}（偏 ${(cy - TARGET_C).toFixed(1)}） 水平中心 ${cx.toFixed(1)}`);
    if (Math.abs(bb.h - TARGET_H) <= 2 && Math.abs(cy - TARGET_C) <= 1) { console.log('  ✅ 收斂'); break; }
    const nf = +(fsz * TARGET_H / bb.h).toFixed(1);
    /* y 是**基線**不是中心——所以位移量要跟著字級一起縮放 */
    const ny = +(y + (TARGET_C - cy) * (nf / fsz)).toFixed(1);
    svg = svg.replace(/font-size="[\d.]+"/, `font-size="${nf}"`)
             .replace(/(<text[^>]*\by=")[\d.]+(")/, `$1${ny}$2`);
  }
  fs.writeFileSync(P, svg);
  console.log('  → public/pwa-icon.svg');
  await b.close();
})();
