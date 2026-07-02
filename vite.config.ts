import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// 데모: 단일 웹앱(역할 모드). root=app, 공유 lib은 @lib 별칭.
export default defineConfig({
  root: "app",
  plugins: [react()],
  resolve: {
    alias: {
      "@lib": fileURLToPath(new URL("./lib", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true, // 실기기(폰)에서 접속 가능하게 LAN 노출
    allowedHosts: true, // 데모: cloudflared/ngrok 터널 호스트 허용 (dev 전용)
    // ⚠️ vite 자체 CORS 비활성 → /api 프리플라이트(OPTIONS)를 vite가 가로채지 않고
    // 브로커로 프록시. 브로커(@fastify/cors)가 capacitor://localhost 오리진을 올바로 허용.
    // (켜두면 vite가 OPTIONS를 자기 방식으로 응답해 ACAO 누락 → iOS WKWebView 등록 실패)
    cors: false,
    fs: { allow: [".."] }, // app 밖의 lib import 허용
    proxy: {
      // 웹 dev: 앱 → 브로커(:8787) same-origin 프록시 (CORS 회피). 브로커 라우트가 이미 /api.
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
