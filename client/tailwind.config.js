/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        foreground: '#ffffff',
        card: '#121212',
        primary: '#1db954', // Spotify/Feishin green
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
