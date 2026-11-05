/* 常設 C12　錯誤路徑也要有人驗：「讀不到 ≠ 不存在」
 *
 * Rozi：「斷網說被刪掉了」。使用者會撞到的失敗，畫面必須講「發生什麼＋下一步」，
 * 不得說成「不存在／已刪除／打平」——讀不到卻端出關於錢的結論，會讓人以為不用付錢。
 *
 * 掃哪些畫面 × 哪些失敗（量測靶的樁 `?fail=`）：
 *   讀取：S-01 行程列表、S-03 消費列表、S-05 結算、S-06 分享頁 × `fail=read`／`fail=offline`
 *   寫入：S-04 記一筆，填好之後按「記下來」× `fail=write`／`fail=offline`（App 開著才斷網）
 * 什麼時間點：讀取類載入後 600ms；寫入類按下後 600ms
 * 判定：a. 畫面不含「不存在／已刪除／被刪除／刪掉了／打平／沒有任何行程／還沒有消費」這類結論
 *       b. 畫面含「讀不到／連不上／存不起來」其中之一（真的有講發生什麼）
 *       c. 寫入失敗時 `window.__WRITES__` 有送出（證明真的走到寫入那一步，不是按鈕沒反應）
 */
const H = require('./lib/harness.cjs');

const WRONG = /不存在|已刪除|被刪除|刪掉了|打平|沒有任何行程|還沒有消費|還沒記過/;
const RIGHT = /讀不到|連不上|存不起來/;

module.exports = {
  id: 'C12', title: '錯誤路徑：讀不到不能說成不存在',
  async run({ page, base }) {
    const rows = [];
    for (const [scr, name] of [['s01', 'S-01 行程列表'], ['s03', 'S-03 消費列表'], ['s05', 'S-05 結算'], ['s06', 'S-06 分享頁']]) {
      for (const f of ['read', 'offline']) {
        await H.open(page, base, `screen=${scr}&fail=${f}`, { wait: 600 });
        const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
        const wrong = (t.match(WRONG) || [])[0], right = (t.match(RIGHT) || [])[0];
        rows.push({ where: `${name}（${f === 'read' ? '讀取失敗' : '離線'}）`, element: '畫面文案',
          measured: [wrong ? `說成「${wrong}」` : '', right ? `有講「${right}」` : '沒有講發生什麼', `「${t.slice(0, 40)}…」`].filter(Boolean).join('｜'),
          limit: '不得說成不存在；要講讀不到／連不上', ok: !wrong && !!right });
      }
    }
    for (const f of ['write', 'offline']) {
      await H.open(page, base, 'screen=s04', { wait: 300 });
      await page.evaluate(() => {
        const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
        const t = document.querySelector('input#e-title') || document.querySelector('input[type=text]');
        if (t) set(t, 'ZZ 常設C12');
        const twd = document.querySelector('input#e-twd');
        if (twd) set(twd, '100');
      });
      await H.sleep(200);
      /* ⚠️ 要先選付款人，不然表單擋在「先選這筆是誰付的」，寫入根本不會送出 */
      await page.evaluate(() => {
        const lbl = [...document.querySelectorAll('*')].find(n => n.textContent.trim() === '誰付的？');
        const b = lbl && lbl.parentElement && lbl.parentElement.querySelector('button'); if (b) b.click();
      });
      await H.sleep(250);
      /* App 開著、按下去那一刻才斷網——真實世界唯一會發生的離線情境 */
      await page.evaluate(f => { window.__FAIL__ = f; }, f);
      const clicked = (await H.clickByText(page, ['記下來'], 600)).length;
      const r = await page.evaluate(() => ({ t: document.body.innerText.replace(/\s+/g, ' '), w: (window.__WRITES__ || []).length }));
      const wrong = (r.t.match(WRONG) || [])[0], right = (r.t.match(RIGHT) || [])[0];
      rows.push({ where: `S-04 記一筆（${f === 'write' ? '寫入失敗' : '按下時斷網'}）`, element: '按「記下來」之後的文案',
        measured: !clicked ? '找不到「記下來」，這條等於沒驗' : [`送出寫入 ${r.w} 次`, wrong ? `說成「${wrong}」` : '', right ? `有講「${right}」` : '沒有講發生什麼'].filter(Boolean).join('｜'),
        limit: '有送出、要講存不起來／連不上', ok: !!clicked && r.w > 0 && !wrong && !!right });
    }
    return { rows };
  },
};
