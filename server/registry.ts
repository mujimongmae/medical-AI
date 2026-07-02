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
}
export const events = new Map<string, EmergencyEvent>();

let userSeq = 0;
let eventSeq = 0;
export const nextUserId = () => `dev-${(++userSeq).toString().padStart(3, "0")}`;
export const nextEventId = () => `evt-${(++eventSeq).toString().padStart(3, "0")}`;
