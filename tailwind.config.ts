import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sunhub: {
          primary: "#16A34A",
          accent: "#FACC15",
          info: "#0EA5E9",
          danger: "#DC2626",
          warning: "#F59E0B",
          violet: "#8B5CF6",
          bg: "#F8FAFC",
        },
        // Material 3 "Radiant Horizon" — usado en el PWA del cliente.
        // Se exponen con prefijo m3- para no chocar con el resto del SaaS.
        "m3-primary": "#006b2c",
        "m3-primary-container": "#00873a",
        "m3-on-primary": "#ffffff",
        "m3-on-primary-container": "#f7fff2",
        "m3-primary-fixed": "#7ffc97",
        "m3-primary-fixed-dim": "#62df7d",
        "m3-secondary": "#735c00",
        "m3-secondary-container": "#fed01b",
        "m3-on-secondary-container": "#6f5900",
        "m3-tertiary": "#00628d",
        "m3-tertiary-container": "#007cb1",
        "m3-surface": "#f4fcf0",
        "m3-surface-bright": "#f4fcf0",
        "m3-surface-container-lowest": "#ffffff",
        "m3-surface-container-low": "#eff6ea",
        "m3-surface-container": "#e9f0e5",
        "m3-surface-container-high": "#e3eadf",
        "m3-surface-container-highest": "#dde5d9",
        "m3-surface-variant": "#dde5d9",
        "m3-on-surface": "#171d16",
        "m3-on-surface-variant": "#3e4a3d",
        "m3-outline": "#6e7b6c",
        "m3-outline-variant": "#bdcaba",
        "m3-error": "#ba1a1a",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        heading: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
