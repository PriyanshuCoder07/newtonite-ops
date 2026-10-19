/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"]
      },
      colors: {
        ink: {
          50: "#f4f6f8",
          100: "#e8ecef",
          200: "#cfd7de",
          300: "#a7b4c0",
          400: "#748494",
          500: "#556575",
          600: "#3e4c59",
          700: "#2c3843",
          800: "#1c252d",
          900: "#12181e"
        },
        accent: {
          DEFAULT: "#1f6feb",
          50: "#eff5ff",
          100: "#dae7ff",
          600: "#1f6feb",
          700: "#1858bc"
        }
      }
    }
  },
  plugins: []
};
