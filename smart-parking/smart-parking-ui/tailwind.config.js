/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Вот эта строка важна
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}