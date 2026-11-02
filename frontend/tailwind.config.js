const konstaConfig = require("konsta/config");

module.exports = konstaConfig({
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        primary: "#8B0000",
        "primary-dark": "#E5575B",
        urgent: "#FF3B30",
        "urgent-dark": "#FF453A",
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
});
