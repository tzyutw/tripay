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
  className?: string;
  onClick?: () => void;
  'aria-label'?: string;
}

export default function Avatar({
  emoji, name, index = 0, className, onClick, 'aria-label': label,
}: AvatarProps) {
  const Tag = onClick ? 'button' : 'span';
  const common = { onClick, 'aria-label': label, type: onClick ? ('button' as const) : undefined };

  if (emoji) {
    return <Tag className={`avatar${className ? ' ' + className : ''}`} {...common}>{emoji}</Tag>;
  }

  const g = firstGrapheme(name ?? '');
  if (g) {
    return (
      <Tag
        className={`avatar letter${className ? ' ' + className : ''}`}
        style={{ background: LETTER_COLORS[index % LETTER_COLORS.length] }}
        {...common}
      >
        {g}
      </Tag>
    );
  }

  return <Tag className={`avatar${className ? ' ' + className : ''}`} {...common}>🙂</Tag>;
}
