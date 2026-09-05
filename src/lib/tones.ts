/* 實作-B　行程色調：八組目的地色票，逐字搬自 Tripay_原型.html。
 *
 * 自動規則是**兩段式，順序不能顛倒**：
 * ① 先比對關鍵字——卡片要能一眼看出是哪一國，這也是當初否決「色票自由挑色器」的理由；
 *    使用者改名成「濟州島四寶團」顏色會立刻跟著對。
 * ② 比不到才用建立當下存下來的 `tone_seq` 循環色。
 *
 * ⚠️ `tone_seq` **在建立行程時就要決定並存進資料庫**，不可以用「清單第幾筆」算——
 * 否則刪掉一趟，後面所有行程的顏色會集體位移。
 * ⚠️ **沒有單一 fallback 色**：比不到關鍵字就走循環，不是全部落到同一個顏色。
 */

export interface Tone { k: string; kw: string[]; g: string }

export const TONES: Tone[] = [
  { k:'北海道', kw:['北海道','小樽','札幌','富良野'], g:'linear-gradient(160deg,#5B8FA8,#3A6E8C 35%,#8B5E52 75%,#6B4A3E)' },
  { k:'濟州',   kw:['濟州','济州'],                    g:'linear-gradient(160deg,#1E4C6B,#2D6A8A 35%,#3D7A6A 65%,#2A5050)' },
  { k:'首爾',   kw:['首爾','韓國','首尔'],             g:'linear-gradient(160deg,#8B6914,#6B4E2E 40%,#3A5A6B 70%,#2D4A5E)' },
  { k:'東京',   kw:['東京','富士山'],                  g:'linear-gradient(160deg,#6BAED6,#4A90B8 30%,#2E6A9B 60%,#5B8FA8)' },
  { k:'福岡',   kw:['福岡','博多','由布院','別府'],     g:'linear-gradient(160deg,#7A4B3A,#A8663F 35%,#C98A4B 70%,#5E3A2E)' },
  { k:'沖繩',   kw:['沖繩','冲绳','那霸'],             g:'linear-gradient(160deg,#1B7A8C,#2FA3A8 35%,#7FD1C1 70%,#2E6B6B)' },
  { k:'京都',   kw:['京都','大阪','關西'],             g:'linear-gradient(160deg,#6B2B3A,#9A4A4A 40%,#C08552 75%,#4A2A2E)' },
  { k:'台灣',   kw:['台東','花蓮','墾丁','台南','台灣'],g:'linear-gradient(160deg,#2E6B4A,#4A9A6B 40%,#9AC98A 75%,#2A4A38)' },
];

/** 這一趟該用哪個漸層 */
export function toneFor(name: string, toneSeq: number | null | undefined): string {
  for (const t of TONES) if (t.kw.some(k => (name || '').includes(k))) return t.g;
  return TONES[(toneSeq ?? 0) % TONES.length].g;
}

/** 建立行程時算一次，存進 trips.tone_seq */
export function nextToneSeq(existingCount: number): number {
  return existingCount % TONES.length;
}
