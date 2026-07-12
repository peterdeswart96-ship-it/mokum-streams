/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Semantische merk-tokens, gelijk aan de mokum-bot huisstijl (donker + rood,
      // Arial Black). Componenten verwijzen naar brand/canvas/surface/ink/line i.p.v.
      // naar emerald/slate — één plek om de stijl te sturen.
      colors: {
        brand: { DEFAULT: '#cc0000', dark: '#a30000', light: '#ff6b6b' },
        canvas: '#0a0a0a',
        surface: { DEFAULT: '#1a1a1a', raised: '#2a2a2a' },
        ink: { DEFAULT: '#ffffff', muted: '#cccccc' },
        line: '#2a2a2a',
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
        display: ['"Arial Black"', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
