// 맥북 브로커 서버 — 등록부·WebSocket 허브·mock 이벤트·(추후) Claude 프록시
// spec/03-logic/01-messaging-protocol.md  ·  spec/01-architecture/README.md (데모 아키텍처)
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import {
  ALERT_TIMEOUT_SEC,
  WS_PATH,
  envelope,
  type RegisterReq,
  type FallEventReq,
  type PatientCard,
  type UpMessage,
  type DownMessage,
  type GeoPoint,
  type RegisteredUser,
} from "../lib/protocol/messages";
import {
  users,
  sockets,
  events,
  nextUserId,
  nextEventId,
  type EmergencyEvent,
} from "./registry";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true }); // 데모: 네이티브(capacitor://)·터널 등 모든 오리진 허용
await app.register(websocket);

/** 특정 사용자의 살아있는 소켓으로만 push (타깃 전송) */
function send(id: string, msg: DownMessage) {
  const s = sockets.get(id);
  if (s && s.readyState === 1) s.send(JSON.stringify(envelope(msg)));
}

/** 두 좌표 거리(km) — 이웃 근접 정렬용 */
function distKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 같은 마을 + 접속중 이웃, 거리순 상위 N (spec 03-logic §3.3) */
function selectNeighbors(patient: RegisteredUser, max = 4): string[] {
  return [...users.values()]
    .filter(
      (u) =>
        u.role === "neighbor" &&
        u.village === patient.village &&
        sockets.has(u.id),
    )
    .map((u) => ({ id: u.id, d: distKm(u.home, patient.home) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.id);
}

/** 15초 무반응 → 119 모의신고 + 이웃 호출 */
function escalate(eventId: string) {
  const ev = events.get(eventId);
  if (!ev || ev.state === "resolved") return;
  ev.state = "notifying_neighbors";
  const patient = users.get(ev.patientId);
  if (!patient) return;

  app.log.warn(`[MOCK 119] 자동 신고 — event=${eventId} patient=${patient.name}`);

  const card: PatientCard = {
    name: patient.name,
    addressText: `${patient.village} (합성 주소)`,
    accessNote: "현관 확인 후 진입",
    historySummary: (patient.history ?? []).join(", ") || "특이사항 없음",
  };
  const neighbors = selectNeighbors(patient);
  app.log.info(`이웃 호출 ${neighbors.length}명: ${neighbors.join(", ")}`);
  for (const nid of neighbors) {
    send(nid, { type: "NEIGHBOR_ALERT", eventId, patient: card });
  }
}

// ───────── HTTP (/api 프리픽스 — 웹은 Vite 프록시, 네이티브는 절대 URL로 호출) ─────────
app.get("/api/health", async () => ({ ok: true, users: users.size, online: sockets.size }));

app.post("/api/register", async (req) => {
  const b = req.body as RegisterReq;
  const id = nextUserId();
  users.set(id, { id, ...b });
  app.log.info(`register ${id} (${b.role}) ${b.name}@${b.village}`);
  return { id };
});

app.get<{ Params: { id: string } }>("/api/patient/:id", async (req, reply) => {
  const p = users.get(req.params.id);
  if (!p) return reply.code(404).send({ error: "not found" });
  const card: PatientCard = {
    name: p.name,
    addressText: `${p.village} (합성 주소)`,
    accessNote: "현관 확인 후 진입",
    historySummary: (p.history ?? []).join(", ") || "특이사항 없음",
  };
  return card;
});

// mock 이벤트 진입점 (지금은 이게 이벤트 소스. 추후 실제 영상인식으로 스왑)
app.post("/api/fall-event", async (req, reply) => {
  const b = req.body as FallEventReq;
  const patient = users.get(b.patientId);
  if (!patient) return reply.code(404).send({ error: "patient not found" });
  const eventId = nextEventId();
  const ev: EmergencyEvent = { eventId, patientId: b.patientId, state: "alerting_self" };
  events.set(eventId, ev);
  send(patient.id, { type: "ALERT_SELF", eventId, timeoutSec: ALERT_TIMEOUT_SEC });
  ev.timer = setTimeout(() => escalate(eventId), ALERT_TIMEOUT_SEC * 1000);
  app.log.info(`fall-event ${eventId} → ALERT_SELF to ${patient.id}`);
  return { eventId };
});

// TODO(Phase 1): POST /voice — 온디바이스 STT 텍스트 → Claude 요약

// ───────── WebSocket ─────────
app.get(WS_PATH, { websocket: true }, (socket) => {
  let myId: string | null = null;
  socket.on("message", (raw: Buffer) => {
    let msg: UpMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "HELLO":
        myId = msg.id;
        sockets.set(msg.id, socket);
        app.log.info(`ws HELLO ${msg.id} (online=${sockets.size})`);
        break;
      case "SELF_CANCEL": {
        const ev = events.get(msg.eventId);
        if (ev && ev.state !== "resolved") {
          if (ev.timer) clearTimeout(ev.timer);
          ev.state = "resolved";
          send(ev.patientId, { type: "EVENT_RESOLVED", eventId: ev.eventId, reason: "self_cancel" });
          app.log.info(`SELF_CANCEL ${ev.eventId}`);
        }
        break;
      }
      default:
        // NEIGHBOR_ACCEPT / NEIGHBOR_ARRIVED / PROTOCOL_ANSWER → 추후 소방 relay·로깅
        app.log.info({ up: msg }, "ws up");
    }
  });
  socket.on("close", () => {
    if (myId) sockets.delete(myId);
  });
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`broker listening on :${PORT}`);
});
