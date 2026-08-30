/**
 * 刪除護欄（2026-08-30 制度化，起因：QA 腳本誤刪正式的濟州島行程）
 *
 * 事故根因：測試腳本用 `waitForURL(/\/trips\/<uuid>/)` 等待導頁，但當時
 * 已經在 /trips/<正式行程> 上，regex 立即匹配 → 取到正式行程的 id →
 * 清理步驟把它刪了。**刪除目標是從 UI 狀態推導出來的，這是禁止的。**
 *
 * 三條規則（協作規則_精簡版_v2.md 已納入）：
 *   1. 刪除目標只能是「同一次執行中自己建立、且明列 id」的測試資料
 *   2. 測試資料名稱一律 ZZ 前綴
 *   3. 刪除前必查正式行程保護清單，命中即中止
 */
const fs = require('fs');
const path = require('path');

/** checkpoint 裡的四趟正式行程——永遠不得刪除 */
function protectedTripIds() {
  const p = path.resolve(__dirname, '../checkpoint.json');
  if (!fs.existsSync(p)) return new Set();
  const ck = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Set(Object.values(ck).map(v => v && v.tripUuid).filter(Boolean));
}

/**
 * 建立一個「登記制」刪除器：只有經 register() 登記過的 id 才刪得掉。
 * 用法：
 *   const g = makeGuard();
 *   g.register(trip.id, 'ZZ 測試行程');     // 自己建立時登記
 *   await g.deleteTrip(URL, AH, trip.id);   // 只刪登記過的
 */
function makeGuard() {
  const owned = new Map();               // id → name
  const banned = protectedTripIds();

  return {
    register(id, name) {
      if (banned.has(id)) throw new Error(`⛔ 拒絕登記：${id} 是 checkpoint 保護的正式行程`);
      if (!/^ZZ/.test(name || '')) throw new Error(`⛔ 拒絕登記：測試資料名稱必須 ZZ 前綴（收到「${name}」）`);
      owned.set(id, name);
      return id;
    },
    assertDeletable(id) {
      if (banned.has(id)) throw new Error(`⛔ 中止：${id} 是 checkpoint 保護的正式行程，不得刪除`);
      if (!owned.has(id)) throw new Error(`⛔ 中止：${id} 不是本次執行建立並登記的測試資料，不得刪除`);
    },
    /** 刪一筆自己建立的測試行程（先 settlements 再 trip），回傳影響列數 */
    async deleteTrip(URL, AH, id) {
      this.assertDeletable(id);
      await fetch(`${URL}/rest/v1/settlements?trip_id=eq.${id}`, { method: 'DELETE', headers: AH });
      const r = await fetch(`${URL}/rest/v1/trips?id=eq.${id}`, { method: 'DELETE', headers: AH });
      const b = await r.text();
      const rows = r.ok ? JSON.parse(b || '[]').length : -1;
      if (rows !== 1) console.log(`   ⚠️ 刪除 ${id} 影響列數 = ${rows}（預期 1）`);
      owned.delete(id);
      return rows;
    },
    /** 收尾檢查：登記過的都清乾淨了嗎 */
    remaining() { return [...owned.entries()]; },
  };
}

module.exports = { protectedTripIds, makeGuard };
