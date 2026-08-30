/**
 * 目的地視覺對應（路線 2：首頁／國家照片卡）
 *
 * 卡片背景先用「對應目的地色調」的 gradient 佔位，
 * 並保留 `data-photo` 屬性標示該換上哪張實體照片——
 * 真實照片由 Rozi 提供後替換，屆時只要把 photo 欄改成圖片 URL 即可。
 *
 * gradient 取自 wireframe v3 的 S-01 四張卡片（Aria 已審過的目的地色調）。
 */

export interface Destination {
  /** 比對行程名稱用的關鍵字 */
  keywords: string[];
  /** 佔位 gradient（目的地色調） */
  gradient: string;
  /** 該換上的實體照片主題，輸出成 data-photo 屬性 */
  photo: string;
}

const DESTINATIONS: Destination[] = [
  { keywords: ['北海道', '小樽', '札幌', '富良野'],
    gradient: 'linear-gradient(160deg,#5B8FA8 0%,#3A6E8C 35%,#8B5E52 75%,#6B4A3E 100%)',
    photo: '小樽運河' },
  { keywords: ['濟州', '济州'],
    gradient: 'linear-gradient(160deg,#1E4C6B 0%,#2D6A8A 35%,#3D7A6A 65%,#2A5050 100%)',
    photo: '濟州島玄武岩' },
  { keywords: ['首爾', '首尔', '韓國', '韩国'],
    gradient: 'linear-gradient(160deg,#8B6914 0%,#6B4E2E 40%,#3A5A6B 70%,#2D4A5E 100%)',
    photo: '景福宮' },
  { keywords: ['東京', '富士山', '東京都'],
    gradient: 'linear-gradient(160deg,#6BAED6 0%,#4A90B8 30%,#2E6A9B 60%,#5B8FA8 100%)',
    photo: '富士山港口' },
  { keywords: ['福岡', '博多', '由布院', '別府'],
    gradient: 'linear-gradient(160deg,#7A4B3A 0%,#A8663F 35%,#C98A4B 70%,#5E3A2E 100%)',
    photo: '博多屋台夜景' },
  { keywords: ['沖繩', '冲绳', '那霸'],
    gradient: 'linear-gradient(160deg,#1B7A8C 0%,#2FA3A8 35%,#7FD1C1 70%,#2E6B6B 100%)',
    photo: '沖繩海岸' },
  { keywords: ['京都', '大阪', '關西'],
    gradient: 'linear-gradient(160deg,#6B2B3A 0%,#9A4A4A 40%,#C08552 75%,#4A2A2E 100%)',
    photo: '京都鳥居' },
  { keywords: ['台東', '花蓮', '墾丁', '台南', '台灣'],
    gradient: 'linear-gradient(160deg,#2E6B4A 0%,#4A9A6B 40%,#9AC98A 75%,#2A4A38 100%)',
    photo: '東海岸' },
];

/** 沒對到目的地時的預設色調（維持既有的暖色系） */
const FALLBACKS = [
  { gradient: 'linear-gradient(148deg, #1A3558 0%, #2B5590 42%, #684533 100%)', photo: '未指定' },
  { gradient: 'linear-gradient(148deg, #0A6060 0%, #19999A 42%, #D96040 100%)', photo: '未指定' },
  { gradient: 'linear-gradient(148deg, #264C10 0%, #457A28 50%, #88AA58 100%)', photo: '未指定' },
  { gradient: 'linear-gradient(148deg, #38266A 0%, #644A96 50%, #B09050 100%)', photo: '未指定' },
];

/**
 * 依行程名稱挑目的地視覺；對不到時用 id 雜湊挑一個穩定的預設色調
 * （同一趟每次進來顏色一致）。
 */
export function destinationOf(tripName: string, tripId: string): { gradient: string; photo: string } {
  const name = tripName ?? '';
  for (const d of DESTINATIONS) {
    if (d.keywords.some(k => name.includes(k))) return { gradient: d.gradient, photo: d.photo };
  }
  let h = 0;
  for (let i = 0; i < tripId.length; i++) h = (h * 31 + tripId.charCodeAt(i)) >>> 0;
  return FALLBACKS[h % FALLBACKS.length];
}
