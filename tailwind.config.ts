import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        panel: "#111114",
        line: "#1f1f23",
        ink: "#e7e7ea",
        mute: "#8a8a93",
        accent: "#7c5cff",
        ok: "#33d17a",
        warn: "#f4b400",
        err: "#ff5a5a",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
