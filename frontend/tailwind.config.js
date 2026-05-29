/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
          card: 'var(--color-glass-bg)',
        },
        accent: {
          green: '#00FF88',
          red: '#FF3366',
          blue: '#00C2FF',
          purple: '#A855F7',
          yellow: '#FFD700',
          cyan: '#00FFE0',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        border: {
          primary: 'var(--color-border-primary)',
          hover: 'var(--color-border-hover)',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
    },
  },
  plugins: [],
};
