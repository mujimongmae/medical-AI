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
  pushToken?: string; // FCM 토큰 (화면 꺼짐 알림용)
  registeredAt?: number; // 등록 시각(ms) — 가입 이전 이벤트는 복원하지 않음 (spec/logic/03)
}

/** FCM 토큰 등록 (앱이 토큰 받은 뒤 브로커에 전달) */
export interface PushTokenReq {
  id: string;
  token: string;
  platform?: string;
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

/** 온디바이스 STT 결과 텍스트 전송 (로컬 EXAONE이 프로토콜 분류) */
export interface VoiceReq {
  eventId: string;
  transcript: string;
}
/** 병력+증상 분류 결과: 프로토콜 매칭 + 처치는 검증된 KB에서 코드가 조립 (확정진단 아님) */
export interface VoiceRes {
  summary: string; // 상황 요약(구급대 전달용)
  likelyCondition: string; // 가장 가능성 높은 상태 ("~가능성이 높아요")
  recommendation: string; // 추천 응급처치 (짧게, 큰 글씨용)
  protocolId?: string; // 매칭 지식베이스 프로토콜(있으면 상세 연결)
  probs?: Record<string, number>; // 클래스별 확률(모델 자기보고값) — 분류 근거 표시용
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
