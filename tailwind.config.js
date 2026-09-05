/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette: monochromatic shades of #800080 (purple).
        // Both `teal` and `cyan` map to this ramp so every existing
        // accent class becomes a shade of purple, and teal→cyan
        // gradients render as light-to-dark purple.
        teal: {
          50: '#faf5fc',
          100: '#f4e6f7',
          200: '#e8cdf0',
          300: '#d6a8e3',
          400: '#be7acc',
          500: '#a34db3',
          600: '#800080',
          700: '#6e006e',
          800: '#580058',
          900: '#3f003f',
          950: '#2a002a',
        },
        cyan: {
          50: '#faf5fc',
          100: '#f4e6f7',
          200: '#e8cdf0',
          300: '#d6a8e3',
          400: '#be7acc',
          500: '#a34db3',
          600: '#800080',
          700: '#6e006e',
          800: '#580058',
          900: '#3f003f',
          950: '#2a002a',
        },
      },
    },
  },
  plugins: [],
};
