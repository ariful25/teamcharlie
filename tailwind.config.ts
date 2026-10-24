import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        accent: "hsl(var(--accent))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        info: "hsl(var(--info))",
      },
      fontFamily: {
        sans: ["var(--font-plex)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-archivo)", "var(--font-plex)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Golden-ratio type scale: 14px base, steps of φ^¼ (×1.128) — sm 14,
      // xl 20 (φ^¾), 2xl 23 (φ), 3xl 29 (φ^1.5), 4xl 37 (φ²). Body line
      // height ≈ φ for running text; headings tighten toward 1.2.
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.125rem" }],
        sm: ["0.875rem", { lineHeight: "1.4rem" }],
        base: ["1rem", { lineHeight: "1.618rem" }],
        lg: ["1.125rem", { lineHeight: "1.7rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.4375rem", { lineHeight: "1.875rem" }],
        "3xl": ["1.8125rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.3125rem", { lineHeight: "2.75rem" }],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        glow: "0 0 24px -4px hsl(var(--primary) / 0.45)",
        "glow-sm": "0 0 12px -2px hsl(var(--primary) / 0.35)",
        card: "0 8px 30px rgba(0,0,0,0.35)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "150% 0" },
          "100%": { backgroundPosition: "-50% 0" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-up": "fade-up 0.4s ease-out",
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
