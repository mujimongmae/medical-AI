// 맥북 브로커 서버 — 등록부·WebSocket 허브·mock 이벤트·(추후) Claude 프록시
// spec/03-logic/01-messaging-protocol.md  ·  spec/01-architecture/README.md (데모 아키텍처)
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" }); // ANTHROPIC_API_KEY 등 로컬 시크릿 로드 (커밋 안 됨)
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
import { seedRegistry, SEED_PATIENT_ID } from "./seed";
import { recommendVoice } from "./claude";
import type { VoiceReq, VoiceRes, PushTokenReq } from "../lib/protocol/messages";
import { initPush, sendPush } from "./push";

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

/**
 * 환자 병력(합성) → 우선 노출할 프로토콜 id 순서(힌트).
 * ⚠️ 힌트일 뿐 — 실제 위험도 분기는 클라 lib/first-aid/triage.ts(결정트리)가 담당. LLM 위임 없음.
 */
function priorityHintFromHistory(history?: string[]): string[] | undefined {
  if (!history?.length) return undefined;
  const h = history.join(" ");
  const hints: string[] = [];
  const add = (id: string) => {
    if (!hints.includes(id)) hints.push(id);
  };
  if (/심장|협심증|심근|부정맥|심정지/.test(h)) {
    add("P-CPR");
    add("P-AED");
  }
  if (/뇌졸중|뇌경색|뇌출혈|고혈압/.test(h)) add("P-STROKE");
  if (/뇌전증|간질|경련/.test(h)) add("P-SEIZURE");
  if (/당뇨|저혈당/.test(h)) add("P-SYNCOPE");
  return hints.length ? hints : undefined;
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
  const priorityHint = priorityHintFromHistory(patient.history);
  app.log.info(
    `이웃 호출 ${neighbors.length}명: ${neighbors.join(", ")}${priorityHint ? ` (우선힌트 ${priorityHint.join(">")})` : ""}`,
  );
  for (const nid of neighbors) {
    send(nid, { type: "NEIGHBOR_ALERT", eventId, patient: card, priorityHint });
    // 화면 꺼짐 대비 푸시 (이웃)
    const n = users.get(nid);
    void sendPush(n?.pushToken, {
      title: "🚨 응급 호출",
      body: `${card.name} 님에게 지금 가주세요 (${card.addressText})`,
      data: { kind: "NEIGHBOR_ALERT", eventId },
    });
  }
}

// ───────── HTTP (/api 프리픽스 — 웹은 Vite 프록시, 네이티브는 절대 URL로 호출) ─────────
app.get("/api/health", async () => ({ ok: true, users: users.size, online: sockets.size }));

// 관제/테스트: 등록 사용자 목록
app.get("/api/users", async () =>
  [...users.values()].map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    village: u.village,
    online: sockets.has(u.id),
    hasToken: !!u.pushToken,
  })),
);

// 관제/테스트: 브라우저에서 특정 폰(환자/이웃) 푸시 테스트용 간이 페이지
app.get("/admin", async (_req, reply) => {
  reply.type("text/html").send(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>관제(테스트)</title>
<style>body{font-family:sans-serif;max-width:640px;margin:20px auto;padding:0 12px}
h1{font-size:20px}.u{border:1px solid #ddd;border-radius:10px;padding:12px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;gap:8px}
.tag{font-size:12px;color:#666}button{padding:10px 14px;border-radius:8px;border:0;color:#fff;font-weight:700}
.p{background:#d81e06}.n{background:#0a7d2c}.seed{background:#333;width:100%;padding:14px;margin:8px 0}small{color:#888}</style></head>
<body><h1>🧪 응급 발생 (푸시 테스트)</h1>
<button class="seed" onclick="trig()">시드 환자로 즉시 이웃 호출 (demo/trigger)</button>
<div id="list">불러오는 중…</div>
<small>환자=본인 15초 알림(ALERT_SELF) 푸시 · 이웃=같은 마을 호출(NEIGHBOR_ALERT) 푸시. 폰 화면 끄고 눌러보세요.</small>
<script>
async function load(){const r=await fetch('/api/users');const us=await r.json();
document.getElementById('list').innerHTML=us.map(u=>'<div class="u"><div>'+u.name+' <span class="tag">('+u.role+(u.online?' · 온라인':'')+(u.hasToken?' · 📱토큰':'')+')</span></div>'+
(u.role==='patient'?'<button class="p" onclick="fall(\\''+u.id+'\\')">이 환자 응급</button>':'<span class="tag">이웃</span>')+'</div>').join('')||'등록된 사용자 없음';}
async function fall(id){await fetch('/api/fall-event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({patientId:id})});alert('발생! 환자 폰에 15초 알림, 15초 뒤 이웃 호출');}
async function trig(){await fetch('/api/demo/trigger',{method:'POST'});alert('시드 환자 응급 발생 → 이웃 즉시 호출');}
load();setInterval(load,3000);
</script></body></html>`);
});

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
  // 화면 꺼짐 대비 푸시 (환자 본인 깨우기)
  void sendPush(patient.pushToken, {
    title: "괜찮으신가요?",
    body: `${ALERT_TIMEOUT_SEC}초 안에 응답하지 않으면 119와 이웃에게 도움을 요청합니다.`,
    data: { kind: "ALERT_SELF", eventId },
  });
  ev.timer = setTimeout(() => escalate(eventId), ALERT_TIMEOUT_SEC * 1000);
  app.log.info(`fall-event ${eventId} → ALERT_SELF to ${patient.id}`);
  return { eventId };
});

// FCM 토큰 등록 (앱이 토큰 받은 뒤 호출)
app.post("/api/push-token", async (req, reply) => {
  const b = req.body as PushTokenReq;
  const u = users.get(b.id);
  if (!u) return reply.code(404).send({ error: "user not found" });
  u.pushToken = b.token;
  app.log.info(`push-token 등록 ${b.id} (${b.platform ?? "?"})`);
  return { ok: true };
});

// 데모/테스트용: 시드 환자로 응급을 즉시 발생(15초 대기 생략) → 이웃 화면 바로 호출.
// 이웃만 켜고 혼자 테스트할 때 사용. 시드 환자는 병력(고혈압·협심증) → priorityHint도 함께 노출.
app.post("/api/demo/trigger", async (req, reply) => {
  const patient = users.get(SEED_PATIENT_ID);
  if (!patient) return reply.code(404).send({ error: "seed patient missing" });
  const eventId = nextEventId();
  events.set(eventId, { eventId, patientId: SEED_PATIENT_ID, state: "alerting_self" });
  escalate(eventId); // 즉시 이웃 호출 (테스트 편의)
  app.log.info(`demo trigger ${eventId} (patient=${SEED_PATIENT_ID}) → 이웃 즉시 호출`);
  return { eventId };
});

// 온디바이스 STT 텍스트 → Claude 짧은 상황 요약 (키 없으면 fallback 에코). spec/03-logic/01 §2.2
app.post("/api/voice", async (req, reply) => {
  const b = req.body as VoiceReq;
  if (!b || typeof b.transcript !== "string") {
    return reply.code(400).send({ error: "transcript required" });
  }
  // 진행 중 이벤트의 환자 병력을 요약 맥락으로 참고(있으면). 합성 데이터만.
  const ev = b.eventId ? events.get(b.eventId) : undefined;
  const patient = ev ? users.get(ev.patientId) : undefined;
  const context = patient?.history?.length ? patient.history.join(", ") : undefined;

  const rec = await recommendVoice(b.transcript, context);
  app.log.info(
    `voice recommend (${rec.source}) event=${b.eventId ?? "-"} → ${rec.likelyCondition}`,
  );
  const res: VoiceRes = {
    summary: rec.summary,
    likelyCondition: rec.likelyCondition,
    recommendation: rec.recommendation,
    protocolId: rec.protocolId,
  };
  return res;
});

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

// 데모 페르소나 시드 (환자1 + 이웃4, 마을 "방림리"). mock fall-event 대상: SEED_PATIENT_ID.
seedRegistry();
app.log.info(
  `seeded registry: ${users.size} users (demo patient=${SEED_PATIENT_ID})`,
);
initPush((m) => app.log.info(`[push] ${m}`));

const PORT = Number(process.env.PORT ?? 8787);
app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`broker listening on :${PORT}`);
});
