/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // 不載任何中文 webfont：標題與內文一律系統字，層級靠字重與字階建立
        sans: ['PingFang TC', 'PingFang SC', 'Heiti TC', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: 'var(--color-primary)',
        accent: 'var(--color-accent)',
        surface: 'var(--color-surface)',
        ink: 'var(--color-ink)',
        mid: 'var(--color-mid)',
        muted: 'var(--color-muted)',
        bg: 'var(--color-bg)',
        ok: 'var(--color-ok)',
        warn: 'var(--color-warn)',
      },
    },
  },
  plugins: [],
};
