// 맥북 브로커 서버 — 등록부·WebSocket 허브·mock 이벤트·(추후) 로컬 EXAONE 프록시
// spec/03-logic/01-messaging-protocol.md  ·  spec/01-architecture/README.md (데모 아키텍처)
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" }); // OLLAMA_URL·EXAONE_MODEL 등 로컬 설정 로드 (커밋 안 됨)
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
  restoreUserSeq,
  type EmergencyEvent,
} from "./registry";
import { seedRegistry, SEED_PATIENT_ID } from "./seed";
import { recommendVoice } from "./exaone";
import type { VoiceReq, VoiceRes, PushTokenReq } from "../lib/protocol/messages";
import { initPush, sendPush } from "./push";
import { loadStore, saveStore } from "./store";

// ───────── 가상 심평원(HIRA) 병력 DB — 데모용 하드코딩 100명(전부 합성·실개인정보 아님) ─────────
// 노인 흔한 이름 + {고혈압·당뇨병·심부전·협심증·뇌졸중·골다공증·부정맥} 중 인당 2~4개.
// 앱 첫 화면 "병력 불러오기"가 입력한 이름으로 조회해 채운다.
const HIRA_DB: { name: string; conditions: string[] }[] = [
  { name: "김순자", conditions: ["고혈압", "당뇨병"] },
  { name: "김복순", conditions: ["고혈압", "협심증", "부정맥"] },
  { name: "이영자", conditions: ["고혈압", "골다공증"] },
  { name: "박정숙", conditions: ["당뇨병", "골다공증", "고혈압"] },
  { name: "최말순", conditions: ["고혈압", "뇌졸중"] },
  { name: "정영수", conditions: ["당뇨병", "심부전"] },
  { name: "강옥순", conditions: ["고혈압", "당뇨병", "골다공증"] },
  { name: "조순남", conditions: ["협심증", "부정맥"] },
  { name: "윤명자", conditions: ["고혈압", "골다공증", "당뇨병"] },
  { name: "장금자", conditions: ["당뇨병", "뇌졸중", "고혈압"] },
  { name: "임춘자", conditions: ["고혈압", "부정맥"] },
  { name: "한영순", conditions: ["골다공증", "고혈압"] },
  { name: "오정자", conditions: ["당뇨병", "협심증"] },
  { name: "서말자", conditions: ["고혈압", "당뇨병", "심부전"] },
  { name: "신복자", conditions: ["뇌졸중", "고혈압"] },
  { name: "권순옥", conditions: ["고혈압", "골다공증", "부정맥"] },
  { name: "황미자", conditions: ["당뇨병", "골다공증"] },
  { name: "안영숙", conditions: ["고혈압", "협심증"] },
  { name: "송정순", conditions: ["당뇨병", "고혈압", "뇌졸중"] },
  { name: "류필순", conditions: ["골다공증", "부정맥"] },
  { name: "홍순덕", conditions: ["고혈압", "심부전", "당뇨병"] },
  { name: "전영희", conditions: ["고혈압", "당뇨병"] },
  { name: "고말임", conditions: ["골다공증", "고혈압", "협심증"] },
  { name: "문순례", conditions: ["당뇨병", "부정맥"] },
  { name: "손정례", conditions: ["고혈압", "뇌졸중", "골다공증"] },
  { name: "배옥자", conditions: ["당뇨병", "협심증", "고혈압"] },
  { name: "조말녀", conditions: ["고혈압", "골다공증"] },
  { name: "백순임", conditions: ["당뇨병", "심부전"] },
  { name: "허영자", conditions: ["고혈압", "당뇨병", "부정맥"] },
  { name: "유정임", conditions: ["골다공증", "뇌졸중"] },
  { name: "남복순", conditions: ["고혈압", "협심증", "당뇨병"] },
  { name: "심말순", conditions: ["당뇨병", "골다공증"] },
  { name: "노영수", conditions: ["고혈압", "심부전", "부정맥"] },
  { name: "하정자", conditions: ["당뇨병", "고혈압"] },
  { name: "곽순자", conditions: ["골다공증", "협심증"] },
  { name: "성영자", conditions: ["고혈압", "당뇨병", "뇌졸중"] },
  { name: "차정숙", conditions: ["부정맥", "고혈압"] },
  { name: "주말순", conditions: ["당뇨병", "골다공증", "심부전"] },
  { name: "우영순", conditions: ["고혈압", "협심증"] },
  { name: "구옥순", conditions: ["당뇨병", "뇌졸중"] },
  { name: "김철수", conditions: ["고혈압", "당뇨병", "협심증"] },
  { name: "이병철", conditions: ["심부전", "부정맥"] },
  { name: "박종수", conditions: ["고혈압", "뇌졸중"] },
  { name: "최상철", conditions: ["당뇨병", "고혈압", "협심증"] },
  { name: "정기석", conditions: ["부정맥", "고혈압"] },
  { name: "강정호", conditions: ["당뇨병", "심부전"] },
  { name: "조영근", conditions: ["고혈압", "협심증", "뇌졸중"] },
  { name: "윤성태", conditions: ["당뇨병", "고혈압"] },
  { name: "장병수", conditions: ["협심증", "부정맥", "고혈압"] },
  { name: "임재복", conditions: ["뇌졸중", "당뇨병"] },
  { name: "한덕수", conditions: ["고혈압", "심부전"] },
  { name: "오만식", conditions: ["당뇨병", "협심증", "고혈압"] },
  { name: "서광수", conditions: ["부정맥", "뇌졸중"] },
  { name: "신경식", conditions: ["고혈압", "당뇨병"] },
  { name: "권태호", conditions: ["협심증", "심부전", "고혈압"] },
  { name: "황보석", conditions: ["당뇨병", "부정맥"] },
  { name: "안창수", conditions: ["고혈압", "뇌졸중", "당뇨병"] },
  { name: "송기남", conditions: ["협심증", "고혈압"] },
  { name: "류형수", conditions: ["당뇨병", "심부전", "부정맥"] },
  { name: "홍판식", conditions: ["고혈압", "협심증"] },
  { name: "전용길", conditions: ["뇌졸중", "고혈압", "당뇨병"] },
  { name: "고재구", conditions: ["부정맥", "협심증"] },
  { name: "문상길", conditions: ["고혈압", "당뇨병"] },
  { name: "손종철", conditions: ["심부전", "뇌졸중", "고혈압"] },
  { name: "배정근", conditions: ["당뇨병", "협심증"] },
  { name: "백남수", conditions: ["고혈압", "부정맥", "당뇨병"] },
  { name: "허경수", conditions: ["협심증", "뇌졸중"] },
  { name: "유창식", conditions: ["고혈압", "당뇨병", "심부전"] },
  { name: "남기철", conditions: ["부정맥", "고혈압"] },
  { name: "심재영", conditions: ["당뇨병", "협심증"] },
  { name: "노판돌", conditions: ["고혈압", "뇌졸중", "부정맥"] },
  { name: "하동식", conditions: ["당뇨병", "심부전"] },
  { name: "곽병주", conditions: ["고혈압", "협심증"] },
  { name: "성만수", conditions: ["부정맥", "당뇨병", "고혈압"] },
  { name: "차용대", conditions: ["뇌졸중", "협심증"] },
  { name: "주광호", conditions: ["고혈압", "당뇨병"] },
  { name: "우점례", conditions: ["골다공증", "고혈압", "부정맥"] },
  { name: "구말녀", conditions: ["당뇨병", "골다공증"] },
  { name: "김옥분", conditions: ["고혈압", "협심증", "골다공증"] },
  { name: "이순덕", conditions: ["당뇨병", "뇌졸중"] },
  { name: "박영달", conditions: ["고혈압", "부정맥"] },
  { name: "최봉순", conditions: ["골다공증", "당뇨병", "고혈압"] },
  { name: "정귀남", conditions: ["협심증", "골다공증"] },
  { name: "강막례", conditions: ["고혈압", "당뇨병", "뇌졸중"] },
  { name: "조필녀", conditions: ["골다공증", "부정맥"] },
  { name: "윤삼순", conditions: ["고혈압", "협심증"] },
  { name: "장분옥", conditions: ["당뇨병", "골다공증", "심부전"] },
  { name: "임끝순", conditions: ["고혈압", "뇌졸중"] },
  { name: "한월자", conditions: ["골다공증", "당뇨병"] },
  { name: "오간난", conditions: ["고혈압", "부정맥", "협심증"] },
  { name: "서봉자", conditions: ["당뇨병", "골다공증"] },
  { name: "신덕순", conditions: ["고혈압", "심부전"] },
  { name: "권말선", conditions: ["골다공증", "협심증", "고혈압"] },
  { name: "황춘식", conditions: ["당뇨병", "부정맥"] },
  { name: "안점순", conditions: ["고혈압", "골다공증", "뇌졸중"] },
  { name: "송병규", conditions: ["당뇨병", "협심증"] },
  { name: "류옥례", conditions: ["골다공증", "고혈압"] },
  { name: "홍기택", conditions: ["부정맥", "심부전", "고혈압"] },
  { name: "전순화", conditions: ["당뇨병", "골다공증"] },
  { name: "고영달", conditions: ["고혈압", "협심증", "뇌졸중"] },
];

/** 이름 정규화: 괄호주석·공백 제거 후 비교 (예: "김순자 (합성)" → "김순자"). */
function normalizeName(s: string): string {
  return s.replace(/\(.*?\)/g, "").replace(/\s/g, "").trim();
}
/** 이름으로 심평원 병력 조회. 없으면 null. */
function lookupHira(name: string): string[] | null {
  const q = normalizeName(name);
  if (!q) return null;
  const hit = HIRA_DB.find((p) => normalizeName(p.name) === q);
  return hit ? hit.conditions : null;
}

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

/** 호출 대상 이웃: 같은 마을 이웃 **전원**(거리순 정렬만, 상한 없음).
 *  ws 접속중이거나 푸시 토큰 보유(=화면 꺼도 푸시 가능)면 대상.
 *  (푸시의 목적이 '꺼진 폰 깨우기'이므로 접속중만 고르면 안 됨) — spec 03-logic §3.3
 *  데모: 확실성 위해 상위 N 컷을 제거하고 마을 이웃 전원 호출. 발표 멘트('가까운 4~5명')는
 *  실제 방림리 이웃 규모와 일치. 프로덕션에선 max 컷·반경 제한 재도입. */
function selectNeighbors(patient: RegisteredUser): string[] {
  return [...users.values()]
    .filter(
      (u) =>
        u.role === "neighbor" &&
        u.id !== patient.id &&
        u.village === patient.village &&
        (sockets.has(u.id) || !!u.pushToken),
    )
    .map((u) => ({ id: u.id, d: distKm(u.home, patient.home) }))
    .sort((a, b) => a.d - b.d)
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

/** 환자 → 이웃에게 보여줄 카드(합성 주소·병력요약). escalate·재접속 복원·/patient 공용. */
function patientCard(p: RegisteredUser): PatientCard {
  return {
    name: p.name,
    addressText: `${p.village} (합성 주소)`,
    accessNote: "현관 옆 화분 및 열쇠 있음",
    historySummary: (p.history ?? []).join(", ") || "특이사항 없음",
  };
}

/** 재접속 복원이 유효한 최대 이벤트 나이(ms) — 이보다 오래된 미해결 이벤트는 잔재로 보고 복원 안 함 */
const RESTORE_TTL_MS = 10 * 60 * 1000;

/** 진행 중(notifying_neighbors) 이벤트를 재접속한 이웃에게 재전송.
 *  푸시 탭으로 앱을 열면(콜드스타트/재접속) WS로 이미 보낸 NEIGHBOR_ALERT를 놓쳤으므로,
 *  HELLO 시점에 진행 중 호출을 복원해 '대기 중'이 아니라 호출 화면으로 진입시킨다.
 *  복원 4조건(AND) — spec/logic/03-alert-restore-rules.md */
function resendActiveAlerts(userId: string) {
  const u = users.get(userId);
  if (!u || u.role !== "neighbor") return;
  const now = Date.now();
  // 가장 최근 진행 중 호출 1건만 복원 (테스트 반복으로 이벤트가 쌓여도 최신만).
  let latest: EmergencyEvent | undefined;
  for (const ev of events.values()) {
    if (ev.state !== "notifying_neighbors") continue;
    // 이 이웃이 "실제로 호출된" 이벤트만 복원. 등록 이후 처음 접속한 이웃은
    // 과거 진행 중 이벤트를 받지 않는다(자기 등록 시점 이후 새 호출만).
    if (!ev.notified?.includes(userId)) continue;
    // 가입 이전 이벤트 차단 — id 재사용/충돌로 notified에 남아 있어도 복원하지 않는다.
    // registeredAt 없는 구버전 사용자 기록은 안전하게 복원 대상에서 제외.
    if (!u.registeredAt || ev.createdAt < u.registeredAt) continue;
    // 오래된 미해결 이벤트(테스트 잔재) 차단.
    if (now - ev.createdAt > RESTORE_TTL_MS) continue;
    const patient = users.get(ev.patientId);
    if (!patient || patient.id === u.id || patient.village !== u.village) continue;
    latest = ev; // Map은 삽입순 → 마지막 매칭이 최신
  }
  if (!latest) return;
  const patient = users.get(latest.patientId)!;
  send(userId, {
    type: "NEIGHBOR_ALERT",
    eventId: latest.eventId,
    patient: patientCard(patient),
    priorityHint: priorityHintFromHistory(patient.history),
  });
  app.log.info(`재접속 복원: NEIGHBOR_ALERT ${latest.eventId} → ${userId}`);
}

/** 15초 무반응 → 119 모의신고 + 이웃 호출 */
function escalate(eventId: string) {
  const ev = events.get(eventId);
  if (!ev || ev.state === "resolved") return;
  ev.state = "notifying_neighbors";
  const patient = users.get(ev.patientId);
  if (!patient) return;

  app.log.warn(`[MOCK 119] 자동 신고 — event=${eventId} patient=${patient.name}`);

  const card = patientCard(patient);
  const neighbors = selectNeighbors(patient);
  ev.notified = neighbors; // 이 이벤트에 호출된 이웃 — 재접속 복원은 이 목록에만.
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

// 가상 심평원 병력 조회 — 앱 첫화면 "병력 불러오기"(이름으로 조회)
app.get<{ Querystring: { name?: string } }>("/api/hira", async (req) => {
  const name = req.query.name ?? "";
  const conditions = lookupHira(name);
  return { found: !!conditions, name, history: conditions ?? [] };
});

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
  // 동명(同名) 기존 사용자 제거 — 재등록이 계속 쌓이지 않게 최신 하나만 유지.
  //  (시드 사용자 seed-*는 보호: 홈캠이 seed-patient-1로 이벤트를 보내므로 유지)
  const nm = (b.name ?? "").trim();
  for (const [oldId, u] of [...users]) {
    if (oldId.startsWith("seed-")) continue;
    if ((u.name ?? "").trim() !== nm) continue;
    sockets.get(oldId)?.close?.();
    sockets.delete(oldId);
    users.delete(oldId);
    app.log.info(`register: 동명 기존 사용자 제거 ${oldId} (${u.name})`);
  }
  const id = nextUserId();
  users.set(id, { id, ...b, registeredAt: Date.now() });
  saveStore();
  app.log.info(`register ${id} (${b.role}) ${b.name}@${b.village} 병력:${(b.history ?? []).join("/") || "-"}`);
  return { id };
});

app.get<{ Params: { id: string } }>("/api/patient/:id", async (req, reply) => {
  const p = users.get(req.params.id);
  if (!p) return reply.code(404).send({ error: "not found" });
  return patientCard(p);
});

// mock 이벤트 진입점 (지금은 이게 이벤트 소스. 추후 실제 영상인식으로 스왑)
app.post("/api/fall-event", async (req, reply) => {
  const b = req.body as FallEventReq;
  const isOpen = (id: string) => {
    const s = sockets.get(id);
    return !!s && s.readyState === 1;
  };
  // 1) 요청된 대상 환자가 접속(WS open) 중이면 그 환자에게.
  // 2) 아니면 현재 접속 중인 환자에게 라우팅 — 홈캠은 seed-patient-1로 보내지만,
  //    임의 이름(예: 이영자)으로 접속해도 알람이 가도록. (데모: 보통 환자 1명)
  let patient = users.get(b.patientId);
  if (!patient || !isOpen(patient.id)) {
    const online = [...users.values()].filter((u) => u.role === "patient" && isOpen(u.id));
    patient = online[online.length - 1]; // 가장 최근 접속 환자
    if (patient)
      app.log.info(`fall-event 라우팅: 요청 ${b.patientId} 미접속 → 접속 환자 ${patient.id}(${patient.name})`);
  }
  // 접속 중인 환자가 아무도 없으면 무시(이벤트/푸시/에스컬레이션 없음).
  if (!patient || !isOpen(patient.id)) {
    app.log.info(`fall-event 무시 — 접속 중인 환자 없음 (요청 ${b.patientId})`);
    return reply.code(200).send({ ignored: true, reason: "no patient online" });
  }
  const eventId = nextEventId();
  const ev: EmergencyEvent = {
    eventId,
    patientId: patient.id,
    state: "alerting_self",
    createdAt: Date.now(),
  };
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
  // 1기기=1수신자: 같은 토큰을 물고 있는 다른 사용자에서 회수(역할 전환/재등록 시 중복 푸시 방지).
  // (FCM 토큰은 기기+앱 단위 → 여러 user에 남아 있으면 한 폰에 알림이 중복 도착) — spec 03-logic §push-token
  let reclaimed = 0;
  for (const other of users.values()) {
    if (other.id !== b.id && other.pushToken === b.token) {
      other.pushToken = undefined;
      reclaimed++;
    }
  }
  u.pushToken = b.token;
  saveStore();
  app.log.info(
    `push-token 등록 ${b.id} (${b.platform ?? "?"})${reclaimed ? ` — 다른 ${reclaimed}명에서 토큰 회수` : ""}`,
  );
  return { ok: true };
});

// 데모/테스트용: 시드 환자로 응급을 즉시 발생(15초 대기 생략) → 이웃 화면 바로 호출.
// 이웃만 켜고 혼자 테스트할 때 사용. 시드 환자는 병력(고혈압·협심증) → priorityHint도 함께 노출.
app.post("/api/demo/trigger", async (req, reply) => {
  const patient = users.get(SEED_PATIENT_ID);
  if (!patient) return reply.code(404).send({ error: "seed patient missing" });
  const eventId = nextEventId();
  events.set(eventId, {
    eventId,
    patientId: SEED_PATIENT_ID,
    state: "alerting_self",
    createdAt: Date.now(),
  });
  escalate(eventId); // 즉시 이웃 호출 (테스트 편의)
  app.log.info(`demo trigger ${eventId} (patient=${SEED_PATIENT_ID}) → 이웃 즉시 호출`);
  return { eventId };
});

// 온디바이스 STT 텍스트 → 로컬 EXAONE 프로토콜 분류 (Ollama 미가동 시 fallback). spec/logic/02-voice-protocol-classification.md
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
    probs: rec.probs,
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
        resendActiveAlerts(msg.id); // 푸시 탭/재접속 시 진행 중 호출 복원
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
loadStore((m) => app.log.info(`[store] ${m}`)); // 저장본으로 시드 위에 덮어쓰기
restoreUserSeq(); // 재시작 후 신규 가입자가 과거 dev-NNN id를 재사용하지 않도록 시퀀스 복원

// 시작 시 동명(同名) 중복 정리 — 누적 방지. 시드(seed-*) 우선 보호, 그 외 동명은 최신 1개만.
{
  const keeper = new Map<string, string>(); // name → 유지할 id
  for (const [id, u] of users) {
    const nm = (u.name ?? "").trim();
    const cur = keeper.get(nm);
    if (!cur) keeper.set(nm, id);
    else if (!cur.startsWith("seed-")) keeper.set(nm, id); // 시드가 아니면 최신(또는 시드)로 교체
  }
  let removed = 0;
  for (const [id, u] of [...users]) {
    if (keeper.get((u.name ?? "").trim()) === id) continue;
    users.delete(id);
    sockets.get(id)?.close?.();
    sockets.delete(id);
    removed++;
  }
  if (removed) {
    app.log.info(`[dedup] 시작 시 동명 중복 ${removed}명 정리`);
    saveStore();
  }
}

app.log.info(
  `registry ready: ${users.size} users (demo patient=${SEED_PATIENT_ID})`,
);
initPush((m) => app.log.info(`[push] ${m}`));

const PORT = Number(process.env.PORT ?? 8787);
app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`broker listening on :${PORT}`);
});
