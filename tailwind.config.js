/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['Noto Sans TC', 'PingFang TC', 'PingFang SC', 'Heiti TC', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
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
