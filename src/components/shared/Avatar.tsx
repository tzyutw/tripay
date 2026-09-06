/* 成員頭像的**三層 fallback**（S-02c-10）。
 * 逐條移植自 `Tripay_原型.html` 的 `avatar()`（第 993–1002 行）。
 *
 *   ① 有 emoji            → 直接顯示 emoji
 *   ② 沒 emoji、名字非空  → 名字的**第一個 grapheme**，放在填色圓底上
 *   ③ 兩者皆無            → 🙂（純防禦，正常情況看不到）
 *
 * ⚠️ 第二層要取 grapheme 不是 `name[0]`——ZWJ 組合、膚色修飾、國旗都不能切斷。
 * ⚠️ **S-02 建立與 S-02b 編輯走同一個元件**，不要在兩個地方各寫一份。
 */
import { firstGrapheme } from '@/lib/format';

/** 第二層的底色。逐字搬自原型第 947 行，順位取模。 */
export const LETTER_COLORS = ['#2D6A8A', '#A8663F', '#4A9A6B', '#6B4E2E', '#9A4A4A', '#3A6E8C'];

export interface AvatarProps {
  emoji?: string | null;
  name?: string | null;
  /** 成員在清單中的順位——決定第二層取哪一個底色 */
  index?: number;
  /**
   * 28＝獨立的識別圖位（成員列、統計卡、逐人列）。
   * 20＝chip／列內「識別 ＋ 名字」並排時用，避免把 chip 撐高。
   * 尺寸只由這個 prop 決定，**不要在元件外另寫 style 覆蓋**。
   */
  size?: 28 | 20;
  className?: string;
  onClick?: () => void;
  'aria-label'?: string;
}

export default function Avatar({
  emoji, name, index = 0, size = 28, className, onClick, 'aria-label': label,
}: AvatarProps) {
  const Tag = onClick ? 'button' : 'span';
  const common = { onClick, 'aria-label': label, type: onClick ? ('button' as const) : undefined };
  /* 20px 時字級降一階，否則字會頂到圓底邊緣 */
  /* 實作-R-1c　**當按鈕用的時候**才擴可點區到 44×44（透明 ::after，看得見的圖形不變）。
     s03／s05 那些 20px 的純顯示 avatar 不掛——它們不是按鈕，擴了會蓋住鄰居。 */
  const cls = (extra = '') =>
    `avatar${size === 20 ? ' sm' : ''}${extra}${onClick ? ' tap44' : ''}${className ? ' ' + className : ''}`;

  if (emoji) return <Tag className={cls()} {...common}>{emoji}</Tag>;

  const g = firstGrapheme(name ?? '');
  if (g) {
    return (
      <Tag
        className={cls(' letter')}
        style={{ background: LETTER_COLORS[index % LETTER_COLORS.length] }}
        {...common}
      >
        {g}
      </Tag>
    );
  }

  return <Tag className={cls()} {...common}>🙂</Tag>;
}


/**
 * 識別位：**圓底 ＋ 名字**並排。
 *
 * 與 `memberLabel()` 的分野是「這是不是一句話」：
 *   識別位（消費列付款人、轉帳列的兩端、chip）→ 用這個，圓底看得見
 *   句子（「給 ○○○ $1,234」「這趟有 87% 是 ○○○ 先付的」）→ 用 `memberLabel()` 純文字
 * 句子裡長出圓底會把整句拆散，讀起來像兩個東西。
 *
 * `inline-flex` 不能省——圓底與名字在窄螢幕上不可以被拆到兩行。
 */
export function MemberTag({ m, index = 0 }: {
  m: { id?: string; name: string; emoji?: string | null } | undefined;
  index?: number;
}) {
  if (!m) return null;
  return (
    <span className="mtag">
      <Avatar emoji={m.emoji} name={m.name} index={index} size={20} />
      <span className="trunc">{m.name}</span>
    </span>
  );
}
