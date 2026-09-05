/* 分段控制：**S-03 的分頁與 S-04 的分帳方式共用這一個**。
   停用的選項用 .dis——看得見但點不動，比整個藏起來好：
   使用者要知道那個選項存在、只是現在不能選。 */
export interface SegOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange?: (v: T) => void;
  className?: string;
}

export default function Seg<T extends string>({ options, value, onChange, className }: SegProps<T>) {
  return (
    <div className={`seg${className ? ' ' + className : ''}`} role="tablist">
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          className={o.disabled ? 'dis' : (o.value === value ? 'on' : '')}
          onClick={() => !o.disabled && onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
