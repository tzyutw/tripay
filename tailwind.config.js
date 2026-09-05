/** @type {import('tailwindcss').Config} */

/* 實作-A-3　token 全部指向 src/index.css 的 CSS 變數。
   這一層存在的理由：src/ 是 Tailwind class，不是手寫 CSS，
   所以「不准出現寫死的字級／圓角／色碼」這條規則要靠
   「只准用下面這些名字」來執行——名字之外的寫法（text-[15px]、
   rounded-lg、border-[#E4DFD9]）由 原型_實作token掃描.cjs 擋掉。
   數值一律不寫在這裡，改值要改 index.css，兩邊不得各存一份。 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: 'var(--sans)',
      },
      /* 九階字級。fontSize 給成 [size, lineHeight] 會把行高也鎖死，
         這裡只給 size，行高沿用 body 的 1.5 或各處的 leading-* */
      fontSize: {
        tag: 'var(--fs-tag)',
        sub: 'var(--fs-sub)',
        body: 'var(--fs-body)',
        input: 'var(--fs-input)',
        strong: 'var(--fs-strong)',
        title: 'var(--fs-title)',
        money: 'var(--fs-money)',
        'money-lg': 'var(--fs-money-lg)',
        logo: 'var(--fs-logo)',
      },
      borderRadius: {
        base: 'var(--r-base)',
        panel: 'var(--r-panel)',
        icon: 'var(--r-icon)',
        chip: 'var(--r-chip)',
      },
      colors: {
        w: 'var(--w)',
        wi: 'var(--wi)',
        in: 'var(--in)',
        out: 'var(--out)',
        dg: 'var(--dg)',
        ln: 'var(--ln)',
        gr: 'var(--gr)',
        md: 'var(--md)',
        ink: 'var(--ink)',
        bg: 'var(--bg)',
      },
    },
  },
  plugins: [],
};
