import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#07111f",
        surface: "#0d1728",
        panel: "#101c31",
        line: "rgba(148, 163, 184, 0.14)",
        accent: {
          DEFAULT: "#60a5fa",
          soft: "rgba(96, 165, 250, 0.14)"
        }
      },
      boxShadow: {
        panel: "0 20px 60px rgba(15, 23, 42, 0.45)"
      }
    }
  },
  plugins: []
};

export default config;
