/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#000000',
        foreground: '#ffffff',
        card: '#121212',
        primary: 'rgba(var(--color-primary-rgb), <alpha-value>)',
        secondary: '#b3b3b3', // light gray text
        accent: '#282828', // hover background
        muted: '#181818',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },

    },
  },
  plugins: [],
}
