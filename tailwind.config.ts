import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf7',
          100: '#d1faec',
          200: '#a7f3da',
          300: '#6ee7c2',
          400: '#34d3a6',
          500: '#10b98d',
          600: '#059673',
          700: '#047860',
          800: '#065f4d',
          900: '#064e41',
          950: '#022c25',
        },
        ink: {
          900: '#0b1220',
          800: '#111a2e',
          700: '#1c2740',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Tahoma', 'system-ui', '-apple-system', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
