// 브로커 접속 설정.
// - 웹 dev: VITE_BROKER_URL 없음 → 상대경로(/api, /ws) → Vite 프록시가 브로커로 전달.
// - 네이티브(Capacitor)/터널: VITE_BROKER_URL=https://<tunnel> 로 빌드 → 절대 URL 직결.
const BROKER: string = import.meta.env.VITE_BROKER_URL ?? "";

/** HTTP 베이스 (브로커 라우트는 /api 프리픽스) */
export const HTTP_BASE = `${BROKER}/api`;

/** WebSocket 베이스 (http→ws 변환; 상대일 땐 현재 origin) */
export const WS_BASE = BROKER
  ? BROKER.replace(/^http/, "ws")
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
