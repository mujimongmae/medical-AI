// 메시지 프로토콜 — 앱·서버 공유 계약(contract)
// 진실 원천: spec/03-logic/01-messaging-protocol.md. 필드 변경은 스펙 먼저 → 여기 → 코드.

export type Role = "patient" | "neighbor";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** 등록부 사용자 (합성 데이터만) */
export interface RegisteredUser {
  id: string;
  role: Role;
  name: string;
  village: string;
  home: GeoPoint;
  history?: string[]; // 병력 (합성)
}

// ───────── HTTP ─────────
export interface RegisterReq {
  role: Role;
  name: string;
  village: string;
  home: GeoPoint;
  history?: string[];
}
export interface RegisterRes {
  id: string;
}

/** ⚠️ 잠정 규격 — 영상인식 미확정. 지금은 mock 생성기가 호출. */
export interface FallEventReq {
  patientId: string;
  confidence?: number;
  snapshotRef?: string;
}
export interface FallEventRes {
  eventId: string;
}

/** 온디바이스 STT 결과 텍스트 전송 (Claude는 오디오 직접입력 불가) */
export interface VoiceReq {
  eventId: string;
  transcript: string;
}
export interface VoiceRes {
  summary: string;
}

/** 이웃앱에 보여줄 환자 카드 */
export interface PatientCard {
  name: string;
  addressText: string;
  accessNote: string;
  historySummary: string;
}

// ───────── WebSocket ─────────
export const WS_PATH = "/ws";
export const ALERT_TIMEOUT_SEC = 15;

/** 앱 → 서버 */
export type UpMessage =
  | { type: "HELLO"; id: string }
  | { type: "SELF_CANCEL"; eventId: string }
  | { type: "NEIGHBOR_ACCEPT"; eventId: string }
  | { type: "NEIGHBOR_ARRIVED"; eventId: string }
  | { type: "PROTOCOL_ANSWER"; eventId: string; step: string; value: string };

/** 서버 → 앱 */
export type DownMessage =
  | { type: "ALERT_SELF"; eventId: string; timeoutSec: number }
  // priorityHint: 환자 병력 기반 우선 프로토콜 id 순서(힌트). 트리아지 분기 자체는 클라 triage.ts가 결정.
  | { type: "NEIGHBOR_ALERT"; eventId: string; patient: PatientCard; protocolId?: string; priorityHint?: string[] }
  | { type: "PROTOCOL_STEP"; eventId: string; step: string; prompt: string; inputType: string; options?: string[] }
  | { type: "EVENT_RESOLVED"; eventId: string; reason: string };

/** ws 공통 봉투: 실제 전송은 { ...msg, ts } 형태 */
export type Envelope<T> = T & { ts: number };

export function envelope<T extends { type: string }>(msg: T): Envelope<T> {
  return { ...msg, ts: Date.now() };
}
