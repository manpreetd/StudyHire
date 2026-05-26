import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg:     "#0a0a0f",
        panel:  "#111114",
        line:   "#1f1f23",
        ink:    "#e7e7ea",
        mute:   "#8a8a93",
        accent: "#7c5cff",
        cyan:   "#4cc9ff",
        pink:   "#ff5cd4",
        ok:     "#33d17a",
        warn:   "#f4b400",
        err:    "#ff5a5a",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      animation: {
        "fade-in":  "fadeIn 0.5s ease-out both",
        "slide-up": "slideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "glow":     "glow 4s ease-in-out infinite",
        "float":    "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glow: {
          "0%, 100%": { opacity: "0.4" },
          "50%":      { opacity: "0.8" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
