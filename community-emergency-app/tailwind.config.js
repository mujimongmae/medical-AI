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
      // ── 시맨틱 컬러 시스템 (의미 = 색) ─────────────────────────
      // 응급 화면에서 색은 "의미"다. 아래 4색만 상태·액션 의미에 쓰고,
      // 회색은 중립(정보/보조)에만. 각 톤은 흰/틴트 배경 대비 WCAG AA↑ 검증됨.
      colors: {
        // 위급·파괴적 액션 = 적  (긴급 배너/버튼 — 강조 유지)
        danger: { DEFAULT: "#dc2626", 700: "#b1160c", 50: "#fdecec" },
        // 안전·수락·정상 = 청록(teal)  · 100=파스텔 버튼용 / DEFAULT=배너용
        safe: { DEFAULT: "#0f766e", 700: "#115e56", 100: "#cfeee8", 50: "#e6f5f3" },
        // 경고·대기 = 골드
        caution: { DEFAULT: "#9a5b00", 500: "#b45309", 900: "#5c3800", 50: "#fdf3e2" },
        // AI·정보·주액션 = 블루  · 100=파스텔 버튼용 / 900=파스텔 위 텍스트
        ai: { DEFAULT: "#1557c0", 700: "#124aa3", 900: "#0c2f66", 200: "#bcd3f7", 100: "#dbe6fb", 50: "#eef4fd" },
      },
      // 곡률: 레퍼런스 카드(≈20px) + 3px → 카드/버튼 기본 ~23px
      borderRadius: {
        lg: "16px",
        xl: "22px",
        "2xl": "24px",
        "3xl": "28px",
      },
      // 흰 배경 위에서 카드가 뜨는 소프트 디퓨즈 쉐도우(레퍼런스 알림 화면 톤)
      boxShadow: {
        soft: "0 1px 3px rgba(2,6,23,0.05), 0 10px 24px rgba(2,6,23,0.08)",
        "soft-lg": "0 2px 6px rgba(2,6,23,0.06), 0 18px 40px rgba(2,6,23,0.12)",
      },
    },
  },
  plugins: [],
};
