/* 查不到行程的畫面。**S-03 與 S-06 共用同一份文案**，一字不改。
 *
 * 為什麼不寫「已刪除」（Rozi 2026-09-06 定案，寫在這裡免得日後有人「改精確一點」）：
 * 前端查不到有三種可能——真的被刪、是別人的行程沒權限、網址打錯，
 * 資料庫的回應長得一模一樣。寫死「已刪除」在「別人傳錯連結」時是**假訊息**；
 * 而能區分「存在但你不能看」等於向陌生人洩漏「這個編號有東西」。統一講「找不到」。
 *
 * 版型沿用 S-03「還沒記帳」那個空狀態（`.empty`），全站一致。
 * **不套紙飛機動畫**——那是「開始記帳吧」的邀請感，用在錯誤畫面上語氣不對。
 */
export const NOT_FOUND_TITLE = '找不到這趟行程';
export const NOT_FOUND_SUB   = '可能已經被刪掉了，或這個連結已經失效。';

export default function NotFound({ onBack }: { onBack?: () => void }) {
  return (
    <div className="empty">
      <p>{NOT_FOUND_TITLE}</p>
      <p>{NOT_FOUND_SUB}</p>
      {/* 分享頁**不傳** onBack：訪客沒有帳號，「回到我的行程」是假出口。
          也不要放「開一趟自己的」——Rozi 裁示延到共編階段，
          理由在 `_延後與不做清單.md`（旅伴撲空時另開一趟會變成兩本帳）。 */}
      {onBack && (
        <button className="btn notfoundbtn" onClick={onBack}>回到我的行程</button>
      )}
    </div>
  );
}
