import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0B0F14",
        surface: "#131922",
        raised: "#1B2330",
        hairline: "#232C3A",
        signal: "#6EF2A6",
        transfer: "#5B8CFF",
        danger: "#FF6B6B",
        warn: "#F5C463",
        ink: "#EAF0F5",
        muted: "#8A94A6",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      keyframes: {
        sweep: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.8" },
          "80%": { transform: "scale(1.8)", opacity: "0" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
        rise: {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        sweep: "sweep 3.2s linear infinite",
        pulseRing: "pulseRing 2.4s cubic-bezier(0.2,0.6,0.4,1) infinite",
        rise: "rise 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
