// 등록부 + 실시간 연결 매핑 (데모: 인메모리. 추후 SQLite 스왑) — spec/03-logic/01-messaging-protocol.md
import type { RegisteredUser } from "../lib/protocol/messages";

/** id → 등록 사용자 (합성 데이터만) */
export const users = new Map<string, RegisteredUser>();

/** id → 살아있는 WebSocket (ws 인스턴스) */
export const sockets = new Map<string, any>();

export interface EmergencyEvent {
  eventId: string;
  patientId: string;
  state: "alerting_self" | "notifying_neighbors" | "resolved";
  timer?: ReturnType<typeof setTimeout>;
  ts?: number; // 생성 시각(ms) — 재접속 복원 시 만료 판단용
  notified?: Set<string>; // 실제로 호출(NEIGHBOR_ALERT)을 보낸 이웃 id들 — 복원 대상 한정
}
export const events = new Map<string, EmergencyEvent>();

let userSeq = 0;
let eventSeq = 0;
export const nextUserId = () => `dev-${(++userSeq).toString().padStart(3, "0")}`;
export const nextEventId = () => `evt-${(++eventSeq).toString().padStart(3, "0")}`;
