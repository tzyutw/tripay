/* 🔴 實作-讀-1／AF-2／AF-3／AF-4　「**讀不到 ≠ 沒有**」的整頁錯誤區塊。
 * 四個畫面共用這一份：行程列表、行程詳情、結算、分享頁。
 *
 * 由來：同一個毛病在四個地方各犯一次，而且每次都變成「說了錯的話」——
 *   行程列表 → 「還沒有行程。第一趟要去哪？」（以為帳不見了）
 *   行程詳情 → 「找不到這趟行程／可能已經被刪掉了」（以為被刪了）
 *   結算頁　 → 「**大家剛好打平**」（以為不用付錢，本節最嚴重的一項）
 *   分享頁　 → 同行程詳情（旅伴以為連結被收回）
 *
 * ⚠️ 四處抄四份遲早走鐘（與 statCard／transferView／SettleBreakdown 同一個理由），
 *    所以抽成元件。內文與按鈕全站同一句，只有標題按畫面換。
 * ⚠️ 分享頁**不傳** `onRetry` 以外的任何入口——訪客沒有帳號，
 *    理由見 `NotFound.tsx` 第 17–19 行。
 */
import { MSG_READ_FAIL_BODY, MSG_READ_FAIL_RETRY } from '@/lib/messages';

export default function ReadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="py-10 px-6 text-center">
      <p className="text-strong font-semibold">{title}</p>
      <p className="text-sub text-gr mt-[5px]">{MSG_READ_FAIL_BODY}</p>
      <button
        onClick={onRetry}
        className="mt-[14px] inline-flex items-center gap-1 px-[18px] py-[11px] bg-w text-white rounded-base text-body font-semibold active:scale-95 transition-transform duration-100"
        style={{ minHeight: 44 }}
      >
        {MSG_READ_FAIL_RETRY}
      </button>
    </div>
  );
}
