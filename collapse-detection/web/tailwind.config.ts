import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Status banner semantics (large font / high contrast for elderly users).
        status: {
          normal: "#16a34a",
          suspected: "#f59e0b",
          down: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;
