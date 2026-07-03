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
  /** 이벤트 생성 시각(ms) — 가입 이전/오래된 이벤트 복원 차단용 (spec/logic/03-alert-restore-rules.md) */
  createdAt: number;
  timer?: ReturnType<typeof setTimeout>;
  /** escalate 시점에 실제로 호출된 이웃 id 목록. 재접속 복원은 이 목록에 든 이웃에게만.
   *  (그 이후 새로 등록한 이웃은 과거 이벤트를 받지 않는다.) */
  notified?: string[];
}
export const events = new Map<string, EmergencyEvent>();

let userSeq = 0;
let eventSeq = 0;
export const nextUserId = () => `dev-${(++userSeq).toString().padStart(3, "0")}`;
export const nextEventId = () => `evt-${(++eventSeq).toString().padStart(3, "0")}`;

/** 부팅 시 저장된 사용자 id(dev-NNN)의 최대값으로 시퀀스 복원.
 *  (재시작 시 0 리셋 → 신규 가입자가 과거 id를 재사용해 과거 이벤트가 엉뚱한 사람에게 연결되는 버그 방지) */
export function restoreUserSeq() {
  for (const id of users.keys()) {
    const m = /^dev-(\d+)$/.exec(id);
    if (m) userSeq = Math.max(userSeq, Number(m[1]));
  }
}
