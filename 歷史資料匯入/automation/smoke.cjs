const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ storageState: path.resolve(__dirname, '../../.auth/state.json'), locale: 'zh-TW' });
  const p = await ctx.newPage();
  await p.goto('https://tzyutw.github.io/tripay/', { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(4000);
  console.log('URL:', p.url());
  const isLogin = p.url().includes('/login');
  console.log(isLogin ? '❌ 被導回登入頁 → session 無效' : '✅ 已登入，未被導回登入頁');
  const txt = (await p.locator('body').innerText().catch(() => '')).slice(0, 260).replace(/\n+/g, ' | ');
  console.log('畫面內容：', txt);
  await b.close();
  process.exit(isLogin ? 1 : 0);
})();
