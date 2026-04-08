/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        blun: {
          bg: '#0a0a0a',
          card: '#141414',
          border: '#1e1e1e',
          fg: '#fafafa',
          fg2: '#a1a1aa',
          fg3: '#52525b',
          blue: '#3b82f6',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#eab308',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        blun: '8px',
        'blun-lg': '12px',
      }
    },
  },
  plugins: [],
};
