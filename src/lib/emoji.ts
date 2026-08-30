/**
 * Emoji 共用工具與清單。
 *
 * 重點：使用者可自訂／貼上任意 emoji，包含 ZWJ 組合序列（👨‍👩‍👧）、
 * 膚色修飾（👍🏽）、國旗（🇹🇼）。這些都是「多個 code point 組成一個字」，
 * 用 Array.from / slice 會把它們切斷，必須以 grapheme cluster 為單位處理。
 */

export const TRAVEL_EMOJIS = [
  '✈️','🗾','🏝️','🗻','🏔️','🎡','🌸','🗼','🌅','🏖️','🧳',
  '🏯','🚂','🚢','🌺','🌻','🏕️','🎢','🌄','🎑','🪂','🚁',
];

export const MEMBER_EMOJIS = [
  '🍋','🐟','🐵','🐱','🐶','🐻','🦊','🐸','🦁','🐯','🐼','🐨',
  '🦄','🧸','🌸','🌻','🍑','🍊','🥝','🫐','🍇','🐧',
];

/** S-02MEM：「大家常用」＝前 12 個；「旅遊風格」＝其餘 */
export const MEMBER_EMOJIS_COMMON = MEMBER_EMOJIS.slice(0, 12);
export const MEMBER_EMOJIS_MORE   = MEMBER_EMOJIS.slice(12);

/** 取第一個 grapheme cluster（ZWJ 序列／膚色修飾／國旗都算一個） */
export function firstGrapheme(input: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) {
    for (const g of new Seg(undefined, { granularity: 'grapheme' }).segment(s)) return g.segment;
    return '';
  }
  // 後備：Array.from 至少不會切斷 surrogate pair（但無法保留 ZWJ 組合）
  return Array.from(s)[0] ?? '';
}

/** 是否含得上「圖像字元」——用來擋掉純文字輸入 */
export function looksLikeEmoji(s: string): boolean {
  if (!s) return false;
  try {
    return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);
  } catch {
    // 舊 runtime 不支援 Unicode property escape
    return /[‼-㊙\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/u.test(s);
  }
}

/**
 * 把使用者輸入正規化成一個可用的 emoji。
 * 回傳 null 代表不是有效的 emoji（呼叫端給提示）。
 */
export function normalizeEmojiInput(input: string): string | null {
  const g = firstGrapheme(input);
  if (!g) return null;
  return looksLikeEmoji(g) ? g : null;
}
