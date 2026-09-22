import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1b3d',
        paper: '#f3f5fa',
        brand: {
          50: '#eef3ff',
          100: '#dce6ff',
          200: '#b9ccff',
          300: '#8aa8ff',
          400: '#5b80f5',
          500: '#3a5fe6',
          600: '#2748d6',
          700: '#1f3aae',
          800: '#1d3389',
          900: '#1b2d6b',
        },
      },
      fontFamily: {
        sans: ['"Avenir Next"', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.7)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: { pop: 'pop 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) both' },
    },
  },
  plugins: [],
};

export default config;
