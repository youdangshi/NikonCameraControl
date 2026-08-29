/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nikon: { yellow: '#FFDE00', black: '#212121' },
      },
    },
  },
  plugins: [],
};
