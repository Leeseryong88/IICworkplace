import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#b9d9ff',
          300: '#8ec1ff',
          400: '#5da3ff',
          500: '#327fff',
          600: '#2260ea',
          700: '#1b4bc2',
          800: '#1a409b',
          900: '#193a7d',
        },
      },
    },
  },
  plugins: [],
} satisfies Config


