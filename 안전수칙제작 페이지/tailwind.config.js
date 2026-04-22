/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Helvetica Neue", "Arial", "system-ui", "sans-serif"],
      },
      aspectRatio: {
        'poster': '3 / 4.2',
      },
    },
  },
  plugins: [],
}
