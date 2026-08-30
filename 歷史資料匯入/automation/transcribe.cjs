/**
 * Stage 1–2：讀謄入計畫，逐筆走真實 UI 記帳。
 *
 * 用法：node transcribe.cjs <fukuoka|tokyo|hokkaido|jeju> [--first-day] [--headed]
 * 進度寫 ../checkpoint.json，中斷可續跑；已謄過的 seq 一律跳過（嚴禁重複謄）。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'https://tzyutw.github.io/tripay/';
const STATE = path.resolve(__dirname, '../../.auth/state.json');
const CKPT = path.resolve(__dirname, '../checkpoint.json');
const FIX = path.resolve(__dirname, '../fixtures');

// 成員 emoji：TripFormSheet 只提供前 12 個預設，🌷 不在其中 → 用替代並記入問題清單
const UI_MEMBER_EMOJIS = ['🍋','🐟','🐵','🐱','🐶','🐻','🦊','🐸','🦁','🐯','🐼','🐨'];
const EMOJI_SUB = { '🌷': '🐻' };

const loadCkpt = () => fs.existsSync(CKPT) ? JSON.parse(fs.readFileSync(CKPT, 'utf8')) : {};
const saveCkpt = (c) => fs.writeFileSync(CKPT, JSON.stringify(c, null, 2));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── 定位工具 ────────────────────────────────────────────────────────────────
const amountInput = (p, label) => p.locator(`xpath=//span[text()="${label}"]/../following-sibling::input`);
const amountToggle = (p, label) => p.locator(`xpath=//span[text()="${label}"]/../label/div[1]`);
const fieldByLabel = (p, label) => p.locator(`xpath=//label[normalize-space(text())="${label}"]/parent::div`);
const payerField = (p) => p.locator('xpath=//label[starts-with(normalize-space(text()),"誰")]/parent::div');

async function setAmount(p, label, value, pending) {
  const inp = amountInput(p, label);
  const disabled = await inp.isDisabled();
  if (pending) { if (!disabled) await amountToggle(p, label).click(); return; }
  if (disabled) await amountToggle(p, label).click();
  if (value == null) { await inp.fill(''); return; }
  await inp.fill(String(value));
}

// ── 建立行程 ────────────────────────────────────────────────────────────────
async function createTrip(page, plan) {
  log(`建立行程「${plan.trip.name}」…`);
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByRole('button', { name: '＋ 新增行程' }).click();
  await page.getByText('這趟去哪？').waitFor({ timeout: 15000 });

  await page.locator('input[placeholder="例如：沖繩四人行 ☀️"]').fill(plan.trip.name);

  // 幣別
  await fieldByLabel(page, '當地幣別').locator('button').first().click();
  await page.locator('input[placeholder="搜尋幣別名稱或代碼"]').fill(plan.trip.currency);
  await page.locator(`button:has-text("${plan.trip.currency} ·")`).first().click();

  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill(plan.trip.start);
  await dates.nth(1).fill(plan.trip.end);

  // 成員
  const subs = [];
  for (const m of plan.trip.members) {
    const emoji = UI_MEMBER_EMOJIS.includes(m.emoji) ? m.emoji : (EMOJI_SUB[m.emoji] || '🐶');
    if (emoji !== m.emoji) subs.push(`${m.name} ${m.emoji}→${emoji}`);
    await page.getByRole('button', { name: '＋ 新增成員' }).click();
    await page.locator('input[placeholder="叫什麼名字？"]').waitFor({ timeout: 10000 });
    await page.locator(`button:text-is("${emoji}")`).first().click();
    await page.locator('input[placeholder="叫什麼名字？"]').fill(m.name);
    await page.getByRole('button', { name: '加進來' }).click();
    await page.waitForTimeout(150);
  }
  if (subs.length) log(`  ⚠️ 成員 emoji 替代（UI 只提供 12 個預設）：${subs.join('、')}`);

  // 標記「這是我」＝ owner
  const ownerIdx = plan.trip.members.findIndex(m => m.key === plan.trip.owner);
  await fieldByLabel(page, '誰一起去？').locator('div.cursor-pointer').nth(ownerIdx).click();

  await page.getByRole('button', { name: '出發！' }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}/, { timeout: 30000 });
  const id = page.url().match(/\/trips\/([0-9a-f-]{36})/)[1];
  log(`  ✅ 行程建立完成 id=${id}`);
  return id;
}

// ── 記一筆 ──────────────────────────────────────────────────────────────────
async function addExpense(page, e, members) {
  await page.getByRole('button', { name: '＋ 記一筆' }).click();
  await page.getByText('記一筆', { exact: true }).waitFor({ timeout: 15000 });

  await page.locator('input[placeholder="例如：午餐 🍜"]').fill(e.title.slice(0, 60));
  await setAmount(page, '外幣金額', e.foreign, e.foreignPending);
  await setAmount(page, '台幣金額', e.twd, e.twdPending);

  const pmLabel = { cash: '現金', credit_card: '信用卡', stored_value: '儲值卡' }[e.paymentMethod];
  await fieldByLabel(page, '怎麼付的？').locator(`button:text-is("${pmLabel}")`).click();
  await fieldByLabel(page, '日期').locator('input[type="date"]').fill(e.date);

  const typeLabel = { shared: '一起分', individual: '各付各的', personal: '只算我' }[e.type];
  const typeField = fieldByLabel(page, '分帳方式');
  await typeField.locator(`button:text-is("${typeLabel}")`).click();

  if (e.type === 'shared') {
    const want = new Set(e.participants);
    for (let i = 0; i < members.length; i++) {
      const btn = typeField.locator('div.flex.flex-col.gap-2 > button').nth(i);
      const on = (await btn.innerText()).includes('✓');
      if (on !== want.has(members[i].key)) await btn.click();
    }
    const sos = page.locator('button:has-text("大家當場各付各的，不用結算")');
    const isOn = (await sos.innerText()).includes('✓');
    if (isOn !== !!e.settledOnSpot) await sos.click();
  } else if (e.type === 'individual') {
    for (let i = 0; i < members.length; i++) {
      const v = (e.individualAmts || {})[members[i].key];
      await typeField.locator('input[type="number"]').nth(i).fill(v == null ? '' : String(v));
    }
  }

  const payerIdx = members.findIndex(m => m.key === e.payer);
  await payerField(page).locator('button').nth(payerIdx).click();

  await page.getByRole('button', { name: '記下來' }).click();
  await page.getByText('記一筆', { exact: true }).waitFor({ state: 'detached', timeout: 20000 });
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
(async () => {
  const tripId = process.argv[2];
  const firstDayOnly = process.argv.includes('--first-day');
  const headed = process.argv.includes('--headed');
  if (!tripId) { console.log('用法：node transcribe.cjs <fukuoka|tokyo|hokkaido|jeju> [--first-day]'); process.exit(1); }

  const plan = JSON.parse(fs.readFileSync(path.join(FIX, `plan-${tripId}.json`), 'utf8'));
  const ckpt = loadCkpt();
  ckpt[tripId] = ckpt[tripId] || { tripUuid: null, done: [], failed: [] };
  const st = ckpt[tripId];

  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({ storageState: STATE, locale: 'zh-TW', viewport: { width: 480, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));

  try {
    if (!st.tripUuid) { st.tripUuid = await createTrip(page, plan); saveCkpt(ckpt); }
    else { log(`續跑既有行程 ${st.tripUuid}（已謄 ${st.done.length} 筆）`); }

    await page.goto(`${APP}trips/${st.tripUuid}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.getByRole('button', { name: '＋ 記一筆' }).waitFor({ timeout: 20000 });

    const firstDay = plan.expenses.reduce((min, e) => (!min || e.date < min ? e.date : min), null);
    let todo = plan.expenses.filter(e => !st.done.includes(e.seq));
    if (firstDayOnly) todo = todo.filter(e => e.date === firstDay);

    log(`待謄 ${todo.length} 筆${firstDayOnly ? `（僅第一天 ${firstDay}）` : ''}`);
    let n = 0;
    for (const e of todo) {
      let ok = false, lastErr = null;
      for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
        try { await addExpense(page, e, plan.trip.members); ok = true; }
        catch (err) {
          lastErr = err;
          log(`  ⚠️ seq${e.seq} r${e.srcRow} ${e.title} 第 ${attempt} 次失敗：${err.message.split('\n')[0].slice(0, 110)}`);
          await page.keyboard.press('Escape').catch(() => {});
          await page.goto(`${APP}trips/${st.tripUuid}`, { waitUntil: 'networkidle' }).catch(() => {});
          await page.waitForTimeout(800);
        }
      }
      if (ok) { st.done.push(e.seq); n++; if (n % 10 === 0) log(`  …已謄 ${st.done.length}/${plan.expenses.length}`); }
      else { st.failed.push({ seq: e.seq, srcRow: e.srcRow, title: e.title, error: String(lastErr && lastErr.message).slice(0, 200) }); }
      saveCkpt(ckpt);
    }
    log(`✅ ${plan.trip.name}：本輪謄入 ${n} 筆，累計 ${st.done.length}/${plan.expenses.length}，失敗 ${st.failed.length}`);
  } catch (err) {
    log('❌ 中斷：', err.message);
    saveCkpt(ckpt);
    await browser.close();
    process.exit(1);
  }
  await browser.close();
  process.exit(0);
})();
