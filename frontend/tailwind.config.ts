import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        unsa: {
          blue: "#1B365D",
          red: "#8B0000",
          gold: "#D4AF37",
          dark: "#0F172A",
          light: "#F8FAFC",
        },
      },
    },
  },
  plugins: [],
};

export default config;
