/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 브로커 절대 URL (네이티브/터널 빌드 시 주입). 웹 dev는 미설정 → 상대경로+프록시. */
  readonly VITE_BROKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
