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
      boxShadow: {
        "layer-segment": "var(--effect-shadow-segment)",
        "layer-overlay": "var(--effect-shadow-overlay)",
        "layer-fab": "var(--effect-shadow-fab)",
      },
      padding: {
        "dock-content": "calc(env(safe-area-inset-bottom) + 7rem)",
      },
      colors: {
        // Unified Apple HIG + UNSA semantic tokens
        canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
        "surface-sheet": "rgb(var(--surface-sheet) / <alpha-value>)",
        "surface-card": "rgb(var(--surface-card) / <alpha-value>)",
        "surface-elevated": "rgb(var(--surface-elevated) / <alpha-value>)",
        "surface-inset": "rgb(var(--surface-inset) / <alpha-value>)",
        "surface-hero": "rgb(var(--surface-hero) / <alpha-value>)",
        "surface-urgent": "rgb(var(--surface-urgent) / <alpha-value>)",

        subtle: "rgb(var(--border-subtle) / <alpha-value>)",
        control: "rgb(var(--border-control) / <alpha-value>)",
        "urgent-edge": "rgb(var(--border-urgent) / <alpha-value>)",

        "ink-primary": "rgb(var(--ink-primary) / <alpha-value>)",
        "ink-secondary": "rgb(var(--ink-secondary) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        "ink-disabled": "rgb(var(--ink-disabled) / <alpha-value>)",

        "brand-cta": "rgb(var(--brand-cta) / <alpha-value>)",
        "brand-cta-hover": "rgb(var(--brand-cta-hover) / <alpha-value>)",
        "brand-action": "rgb(var(--brand-action) / <alpha-value>)",
        "brand-tint": "rgb(var(--brand-tint) / <alpha-value>)",
        "brand-primary-tint": "rgb(var(--brand-primary-tint) / <alpha-value>)",

        "status-urgent": "rgb(var(--status-urgent) / <alpha-value>)",
        "status-soon": "rgb(var(--status-soon) / <alpha-value>)",
        "status-success": "rgb(var(--status-success) / <alpha-value>)",

        // Legacy compatibility aliases
        primary: "#8B0000",
        "primary-dark": "#E5575B",
        urgent: "#FF3B30",
        "urgent-dark": "#FF453A",
        "deadline-soon": "#FFCC00",
        "deadline-soon-dark": "#FFD60A",
        "deadline-later": "#34C759",
        "deadline-later-dark": "#30D158",
        unsa: {
          blue: "#1B365D",
          red: "#8B0000",
          gold: "#D4AF37",
          dark: "#0F172A",
          light: "#F8FAFC",
        },
      },
      fontSize: {
        "ios-large-title": ["34px", { lineHeight: "41px", letterSpacing: "-0.02em" }],
        "ios-title-1": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }],
        "ios-title-2": ["22px", { lineHeight: "28px", letterSpacing: "-0.015em" }],
        "ios-title-3": ["20px", { lineHeight: "25px", letterSpacing: "-0.015em" }],
        "ios-headline": ["17px", { lineHeight: "22px", letterSpacing: "-0.015em" }],
        "ios-body": ["17px", { lineHeight: "22px", letterSpacing: "-0.015em" }],
        "ios-callout": ["16px", { lineHeight: "21px", letterSpacing: "-0.01em" }],
        "ios-subhead": ["15px", { lineHeight: "20px", letterSpacing: "-0.01em" }],
        "ios-footnote": ["13px", { lineHeight: "18px", letterSpacing: "-0.005em" }],
        "ios-caption-1": ["12px", { lineHeight: "16px" }],
        "ios-caption-2": ["11px", { lineHeight: "13px" }],
      },
    },
  },
});
