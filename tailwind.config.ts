import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#1a5c2e',
          dark: '#0d3b1a',
          light: '#23703a',
        },
        wood: {
          DEFAULT: '#5c3a1e',
          light: '#8B4513',
          dark: '#3a2410',
        },
        gold: {
          DEFAULT: '#d4af37',
          light: '#f5e6c8',
          dark: '#b8960c',
        },
        ivory: '#f5f0e1',
        burgundy: {
          DEFAULT: '#8b1a2d',
          light: '#a52a3e',
        },
        card: {
          bg: '#f5f0e1',
          border: '#d4c9a8',
          red: '#c41e3a',
          black: '#1a1a2e',
        },
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'serif'],
      },
    },
  },
  plugins: [],
};
export default config;
