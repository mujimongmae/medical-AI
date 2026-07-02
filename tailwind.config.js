/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/index.html", "./app/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // 접근성: 고령 사용자용 큰 기본 폰트·고대비 (spec/02-design)
      fontSize: {
        base: ["1.125rem", { lineHeight: "1.7" }],
        lg: ["1.375rem", { lineHeight: "1.6" }],
        xl: ["1.75rem", { lineHeight: "1.5" }],
        "2xl": ["2.25rem", { lineHeight: "1.3" }],
      },
      colors: {
        danger: "#d81e06", // 응급 강조(고대비)
        safe: "#0a7d2c",
      },
    },
  },
  plugins: [],
};
