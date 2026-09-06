/* 從 public/pwa-icon.svg 產出 PNG——**與 SVG 逐像素同一個來源**，不手繪、不用線上工具。
   用專案已經有的無頭 Chrome 截圖。 */
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svg = fs.readFileSync('public/pwa-icon.svg', 'utf8');
const OUT = [['apple-touch-icon-v2.png', 180], ['pwa-icon-192-v2.png', 192], ['pwa-icon-512-v2.png', 512]];
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  for (const [name, size] of OUT) {
    await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await p.goto('data:text/html,' + encodeURIComponent(
      `<body style="margin:0;width:${size}px;height:${size}px">` +
      `<img width="${size}" height="${size}" style="display:block" ` +
      `src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body>`),
      { waitUntil: 'networkidle0' });
    const buf = await p.screenshot({ type: 'png', omitBackground: false });
    fs.writeFileSync(path.join('public', name), buf);
    console.log(`  ${name}  ${size}×${size}  ${buf.length} bytes`);
  }
  await b.close();
})();
