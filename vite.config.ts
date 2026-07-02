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
    fs: { allow: [".."] }, // app 밖의 lib import 허용
    proxy: {
      // 앱 → 브로커(:8787)로 same-origin 프록시 (CORS 회피, 터널/네이티브도 단일 오리진)
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
