/**
 * 四份 Excel 的欄位配置宣告（各檔格式不同，各寫各的 parser 用得到的常數）。
 */

const MEMBERS = {
  ning: { key: 'ning', name: 'Ning', emoji: '🍋' },
  ziyu: { key: 'ziyu', name: 'Ziyu', emoji: '🐟' },
  xiu:  { key: 'xiu',  name: 'Xiu',  emoji: '🐵' },
  mei:  { key: 'mei',  name: 'Mei',  emoji: '🐱' },
  nien: { key: 'nien', name: 'Nien', emoji: '🌷' },
};

const EMOJI_TO_KEY = { '🍋': 'ning', '🐟': 'ziyu', '🐵': 'xiu', '🐱': 'mei', '🌷': 'nien' };

/** 備註裡的付款方式 emoji → Tripay payment_method */
function paymentMethodFromNote(note) {
  const n = note || '';
  if (/💰/.test(n))                       return { pm: 'cash',         src: '💰' };
  if (/WOWPASS|Linepay|LINEPAY/i.test(n)) return { pm: 'stored_value', src: 'WOWPASS/Linepay' };
  if (/🍉/.test(n))                       return { pm: 'stored_value', src: '🍉(西瓜卡/Suica)' };
  if (/💳|🍎/.test(n))                    return { pm: 'credit_card',  src: '💳' };
  return { pm: 'credit_card', src: '空白→預設' };
}

/** 備註開頭的成員 emoji＝實際付款人 */
function payerFromNote(note) {
  const m = (note || '').match(/[🍋🐟🐵🐱🌷]/u);
  return m ? EMOJI_TO_KEY[m[0]] : null;
}

const TRIPS = {
  fukuoka: {
    id: 'fukuoka',
    file: '2023福岡.xlsx',
    name: '2023 福岡',
    currency: 'JPY',
    members: ['ziyu', 'ning', 'mei'],
    start: '2023-11-17', end: '2023-11-21',
    firstRow: 4, totalRow: 98,
    cols: { item: 'A', cashShared: 'B', cardShared: 'C', cardPayer: 'D', note: 'H', rate: 'J' },
    // E/F/G＝各人日幣分擔；K/L/M＝各人「刷自己卡自付」台幣
    shareCols: { ziyu: 'E', ning: 'F', mei: 'G' },
    selfCardCols: { ziyu: 'K', ning: 'L', mei: 'M' },
    subtotalRows: [20, 45, 63, 80, 96],
    twdRateCell: { col: 'B', row: 99 },
  },

  tokyo: {
    id: 'tokyo',
    file: '2024東京富士山五寶團.xlsx',
    name: '2024 東京富士山五寶團',
    currency: 'JPY',
    members: ['ning', 'nien', 'ziyu', 'xiu', 'mei'],
    start: '2024-02-07', end: '2024-02-13',
    firstRow: 4, totalRow: 159,
    cols: { item: 'A', foreign: 'B', foreignPayer: 'C', twd: 'D', twdPayer: 'E', note: 'F' },
    debtCurrency: 'foreign',            // 給X 欄位以日幣記
    debtGroups: [
      { creditor: 'ning', label: '給🍋', debtors: { ziyu: 'H', mei: 'I' } },
      { creditor: 'ziyu', label: '給🐟', debtors: { ning: 'K', mei: 'L' } },
    ],
    subtotalRows: [12, 33, 54, 75, 103, 126, 151],
    twdRateCell: { col: 'B', row: 167 },
    // 總計後的台幣消費列（機場接送/住宿），Excel 併入每人平均
    postTotalTwdRows: [160, 161, 162],
  },

  hokkaido: {
    id: 'hokkaido',
    file: '202506北海道四寶團.xlsx',
    name: '2025 北海道四寶團',
    currency: 'JPY',
    members: ['ning', 'ziyu', 'xiu', 'mei'],
    start: '2025-05-29', end: '2025-06-03',
    firstRow: 4, totalRow: 137,
    cols: { cat: 'A', item: 'B', foreign: 'C', foreignPayer: 'D', twd: 'E', twdPayer: 'F', note: 'G' },
    debtCurrency: 'foreign',            // 給X 欄位以日幣記
    debtGroups: [
      { creditor: 'ning', label: '給🍋', debtors: { ziyu: 'I', mei: 'J', xiu: 'K' } },
      { creditor: 'ziyu', label: '給🐟', debtors: { ning: 'M', mei: 'N', xiu: 'O' } },
      { creditor: 'mei',  label: '給🐱', debtors: { ziyu: 'Q', ning: 'R', xiu: 'S' } },
    ],
    subtotalRows: [10, 17, 30, 48, 53, 79, 107, 132],
    twdRateCell: { col: 'C', row: 140 },
  },

  jeju: {
    id: 'jeju',
    file: '202602濟州島四寶團.xlsx',
    name: '2026 濟州島四寶團',
    currency: 'KRW',
    members: ['ning', 'ziyu', 'xiu', 'mei'],
    start: '2026-02-13', end: '2026-02-21',
    firstRow: 4, totalRow: 194,
    cols: { cat: 'A', item: 'B', foreign: 'C', foreignPayer: 'D', twd: 'E', twdPayer: 'F', note: 'G' },
    debtCurrency: 'twd',                // 給X 欄位以台幣記
    debtGroups: [
      { creditor: 'ning', label: '給🍋', debtors: { ziyu: 'I', mei: 'J', xiu: 'K' } },
      { creditor: 'ziyu', label: '給🐟', debtors: { ning: 'M', mei: 'N', xiu: 'O' } },
      { creditor: 'mei',  label: '給🐱', debtors: { ziyu: 'Q', ning: 'R', xiu: 'S' } },
      { creditor: 'xiu',  label: '給🐵', debtors: { ziyu: 'U', ning: 'V', mei: 'W' } },
    ],
    subtotalRows: [9, 21, 47, 62, 83, 100, 126, 150, 174, 188],
    sponsorRow: 195,
  },
};

module.exports = { MEMBERS, EMOJI_TO_KEY, TRIPS, paymentMethodFromNote, payerFromNote };
