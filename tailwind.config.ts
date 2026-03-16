import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9ebff",
          200: "#badbff",
          300: "#8ec4ff",
          400: "#5fa6ff",
          500: "#377fff",
          600: "#1f5fff",
          700: "#1845e6",
          800: "#1c38ba",
          900: "#1e368f"
        }
      }
    }
  },
  plugins: []
};

export default config;
