# 메시지 프로토콜 (메인컴퓨터 ↔ 환자앱/이웃앱)

- **Status:** Draft
- **Owner:** fullstack-developer / ai-engineer
- **Last updated:** 2026-07-02
- **관련 코드:** `server/` (맥북 브로커), `lib/` (ws 클라이언트), `app/patient/`·`app/neighbor/`
- **상위 문서:** [`../01-architecture/`](../01-architecture/README.md) (데모 아키텍처)

## 1. 목적 / 사용자 가치
맥북(브로커)과 두 역할 앱(환자/이웃)이 **같은 규격으로 통신**하게 해, 영상인식(팀원)·서버·프론트를 **병렬로 독립 개발**하기 위한 계약(contract). 이 문서가 진실 원천이며, 필드명·타입을 여기서 먼저 바꾼 뒤 코드를 바꾼다.

## 2. 동작 명세 (What)

### 2.1 채널
| 채널 | 방향 | 용도 |
|------|------|------|
| **WebSocket (`wss://`)** | 양방향, 서버가 먼저 push | 실시간 알림·프로토콜 진행 (제어 메시지) |
| **HTTP (REST)** | 앱/영상인식 → 서버 | 등록·병력 저장·음성 등 대용량/일회성 |

- 모든 접속은 **HTTPS 터널** 경유(`wss`/`https`). 마이크(getUserMedia)·보안 컨텍스트 요구사항 때문.
- 메시지 공통 봉투(envelope): `{ "type": string, "ts": number, ...payload }`. `type`은 아래 표의 상수.
- 식별자: 사람=`id`(예 `dev-001`), 응급 건=`eventId`(예 `evt-20260702-01`).

### 2.2 HTTP 엔드포인트
| 메서드·경로 | 호출자 | body | 응답 |
|------|--------|------|------|
| `POST /register` | 앱 | `{role, name, village, home:{lat,lng}, 병력?}` | `{id}` |
| `POST /fall-event` | **영상인식(미확정) 또는 mock 생성기** | `{patientId, confidence?, snapshotRef?}` ⚠️ **잠정** | `{eventId}` |
| `POST /voice` | 이웃앱 | `{eventId, transcript}` (온디바이스 STT 텍스트) | `{summary, likelyCondition, recommendation, protocolId?}` — Claude가 **병력+증상 종합 → 가장 가능성 높은 상태 1개 + 추천 응급처치**. ⚠️ 확정진단 금지("가능성" 표현)·119 우선. Claude 오디오 직접입력 불가 → 기기 STT 후 텍스트 전송 |
| `GET /patient/:id` | 이웃앱 | — | `{name, addressText, accessNote, 병력요약}` |
| `POST /api/push-token` | 앱 | `{id, token, platform?}` | `{ok}` — FCM 토큰 등록(화면 꺼짐 알림) |
| `POST /api/demo/trigger` | 테스트 | — | 시드 환자로 응급 즉시 발생(이웃 즉시 호출) |
| `GET /api/users` | **테스트/관제** | — | 등록 사용자 목록 `[{id,name,role,village,online,hasToken}]` |
| `GET /admin` | **테스트/관제** | — | 브로커가 서빙하는 간이 관제 HTML — 사용자별 **"응급 발생" 버튼**으로 특정 폰(환자/이웃) 푸시 테스트 |

> 🧪 **푸시 테스트**: 환자·이웃 폰을 각각 등록(토큰 발급)해 화면을 끈 뒤, PC 브라우저에서 `/admin`을 열어 해당 사용자의 "응급 발생"을 누르면 그 폰으로 푸시가 간다. (환자=본인 `ALERT_SELF`, 이웃=같은 마을 `NEIGHBOR_ALERT`)

> 🔌 **영상인식 = 교체 가능한 이벤트 소스.** 영상인식 프로그램·이벤트 출력 형식은 **미확정**. 지금은 "영상인식이 있다고 가정"하고 **mock 이벤트 생성기**(예: 데모용 버튼 / 타이머 / CLI)가 `POST /fall-event`로 이벤트를 **가상 생성**한다. 서버는 이 엔드포인트 뒤로 로직이 동일하므로, 나중에 실제 영상인식으로 **갈아끼우기만** 하면 된다. → `/fall-event` payload는 잠정(위)이며 실제 프로그램 확정 시 합의·갱신.

### 2.3 WebSocket 메시지 타입
**앱 → 서버 (up)**
| type | 보내는 쪽 | payload | 의미 |
|------|-----------|---------|------|
| `HELLO` | 환자·이웃 | `{id}` | ws 연결 직후 신원 등록 → 서버가 소켓↔사람 매핑 |
| `SELF_CANCEL` | 환자 | `{eventId}` | 15초 알림을 본인이 해제 (이상 없음) |
| `NEIGHBOR_ACCEPT` | 이웃 | `{eventId}` | 호출 수락, 출동 시작 |
| `NEIGHBOR_ARRIVED` | 이웃 | `{eventId}` | 환자에게 도착 |
| `PROTOCOL_ANSWER` | 이웃 | `{eventId, step, value}` | 트리아지/프로토콜 응답 (예 `step:"Q2", value:"없음"`) |

**서버 → 앱 (down)**
| type | 받는 쪽 | payload | 의미 |
|------|---------|---------|------|
| `ALERT_SELF` | 환자 | `{eventId, timeoutSec:15}` | 15초 큰 알림음 재생 시작 |
| `NEIGHBOR_ALERT` | 이웃(대상만) | `{eventId, patient:{name,addressText,accessNote}, protocolId?, priorityHint?}` | 응급 호출 (소리 알림). `priorityHint`=병력 기반 우선 프로토콜 id 순서(힌트, 분기는 클라 triage.ts) |
| `PROTOCOL_STEP` | 이웃 | `{eventId, step, prompt, inputType, options?}` | 다음 프로토콜 단계 제시 |
| `EVENT_RESOLVED` | 환자·이웃 | `{eventId, reason}` | 종료(해제/구급대 인계 등) |

## 3. 로직 / 규칙 (How)

### 3.1 연결 수립
```
앱 실행 → POST /register → {id} 수신, localStorage 저장
       → wss 연결 → 즉시 {type:"HELLO", id}
       → 서버: socket ↔ id 매핑 저장 (온라인 상태 관리)
```
재접속 시 저장된 `id`로 `HELLO` → 동일인 인식.

### 3.2 응급 발생 → 종료 (핵심 시퀀스)
```
[영상인식] POST /fall-event {patientId} → 서버가 eventId 생성
서버 → 환자소켓:  ALERT_SELF {eventId, timeoutSec:15}
   ├─ 15초 내 환자가 SELF_CANCEL → EVENT_RESOLVED{reason:"self_cancel"} → 종료
   └─ 15초 무반응:
        서버: 119 자동신고 (데모=모의 로그)
        서버: 등록부에서 patient의 village/위치로 이웃 3~4명 선별
        서버 → 선별된 이웃소켓에만: NEIGHBOR_ALERT {…, protocolId}   ← 타깃 전송
             (환자 본인·무관자·미접속자 제외)
        이웃 → NEIGHBOR_ACCEPT / NEIGHBOR_ARRIVED
        서버 → 이웃: PROTOCOL_STEP (트리아지 Q1=반응 확인. 119는 이미 자동신고됨)
        이웃 → PROTOCOL_ANSWER {step:"Q1", value:"무반응"} → 서버 PROTOCOL_STEP(Q2=호흡)
        이웃 → PROTOCOL_ANSWER {step:"Q2", value:"없음"|"있음"}
             ├─ "없음" → PROTOCOL_STEP: P-CPR 지시 흐름 (최단 경로, 질문 2개)
             └─ "있음"/반응 있음 → 증상 분기(Q3/S1). 필요 시 이웃앱 POST /voice(STT 텍스트)→Claude→다음 STEP
        … 반복 …
        (추후) 프로토콜 결과를 출동 소방대에 실시간 전달
```

### 3.3 "가까운 이웃" 선별 규칙
- 1차: `village` 동일 + `role:"neighbor"` + **(ws 접속중 OR `pushToken` 보유)**.
  - ⚠️ **접속중만 고르면 안 됨** — 화면 꺼진(=ws 끊긴) 이웃은 푸시로 깨워야 하므로 **토큰 보유자도 대상**.
- 2차: 환자 `home` 기준 거리 오름차순 상위 **3~4명**.
- 전송: 각 대상에 ws `NEIGHBOR_ALERT`(접속중이면) + FCM 푸시(토큰 있으면). 둘 다 그래이스풀.

### 3.4 프로토콜 규칙 (요지 — 상세: [`02-first-aid-protocol.md`](./02-first-aid-protocol.md))
- **트리아지·프로토콜 콘텐츠는 [`02-first-aid-protocol.md`](./02-first-aid-protocol.md) + `lib/first-aid/`가 진실 원천.** `step`은 트리아지 노드(`Q1`,`Q2`,`Q3`,`S1`, 루트 `TRIAGE_ROOT="Q1"`), `protocolId`는 프로토콜 id(`P-CPR` 등)와 매핑.
- **CPR 여부(생명 직결)는 규칙 기반**: `Q1`(의식)→`Q2`(호흡). 둘 다 없음 → **CPR 화면**(GIF+압박위치+메트로놈, 로컬). LLM 위임 없음.
- **그 외(의식/호흡 있음) → AI 음성 추천**: 음성→STT→`/voice`→Claude가 **병력+증상 종합 → 가장 가능성 높은 상태 + 추천 처치**. 확정진단 금지·119 우선.
- 상세 흐름은 [`02-first-aid-protocol.md`](./02-first-aid-protocol.md) §3~§6.

### 3.5 엣지 케이스
- 접속한 이웃 0명 → 119 모의신고만 유지 + 서버 로그 경고 (데모용 폴백).
- 오탐(영상인식) → 환자 `SELF_CANCEL`로 종료. `confidence` 낮으면 알림음만·이웃 호출 보류(옵션).
- ws 끊김 → 앱 자동 재연결 후 `HELLO` 재전송. 진행중 `eventId` 상태는 서버가 보유.

## 4. 데이터
- 서버 저장(현재: in-memory Map. 추후 SQLite): `users(id,role,name,village,home,병력)`, `events(eventId,patientId,state,ts)`, 알림 로그.
- **데모 시드**: 서버 시작 시 `server/seed.ts`가 등록부에 데모 페르소나(환자1 + 이웃4, 마을 "방림리", 합성 좌표/병력)를 자동 주입. 시드 id는 `seed-*` 접두사 → `/api/register`의 `dev-NNN` 시퀀스와 충돌 없음. mock fall-event 대상 = `SEED_PATIENT_ID`(`seed-patient-1`).
- **합성 데이터만.** 이름·주소·병력·좌표 전부 가짜. 실제 PHI/PII 금지.
- 상세 스키마 → [`../04-data-model/`](../04-data-model/README.md) (예정).

## 5. 의료 안전성 체크
- [x] **응급(호흡 없음/심정지) → 119를 최우선.** (`fall-event` 무반응 시 119 모의신고가 이웃 호출보다 먼저)
- [x] 디스클레이머 노출: 앱 상단 `GLOBAL_DISCLAIMER` 상시 + 이웃앱 프로토콜 화면에 프로토콜별 `disclaimer` 재노출.
- [x] 확정 진단/처방 없음 — 프로토콜은 사전 정의된 응급 조치 안내만, "전문의/구급대 지시 우선".
- [x] **시크릿·PHI 감사 통과(2026-07-02):** `ANTHROPIC_API_KEY`는 `server/claude.ts`의 `process.env`에서만 사용(VITE_ 프리픽스 아님 → 클라 번들 미노출, `app/dist` 스캔 clean, `.gitignore`가 `.env*` 제외). 등록·시드·환자카드·주소 전부 합성("(합성)"/"(합성 주소)") — 실제 PHI/PII/좌표 하드코딩 없음. 상세 → [`../02-design/01-demo-scenario.md`](../02-design/01-demo-scenario.md) §7.
- [ ] 프로토콜 조치 리스트의 의료적 타당성 검토 (medical-domain 에이전트).

## 6. 미해결 / TODO
- [x] `POST /fall-event`를 **교체 가능한 이벤트 소스**로 설계 — 지금은 mock 생성기, 나중에 실제 영상인식 스왑. (payload 실제 필드는 프로그램 확정 시 합의·갱신)
- [x] `POST /voice` 구현 — 온디바이스 STT 텍스트 → Claude(`server/claude.ts`, model `claude-opus-4-8`) 짧은 요약. `ANTHROPIC_API_KEY` 게이트, 키 없으면 에코 폴백(빌드·실행 유지). 진단·처방 금지(요약만).
- [x] 데모 시드(`server/seed.ts`) — §4.
- [x] 병력 기반 우선순위 힌트 — `NEIGHBOR_ALERT.priorityHint`(서버가 병력→프로토콜 id 순서 생성). 분기 자체는 클라 `triage.ts` 유지.
- [ ] 이웃 선별 파라미터(거리 임계·명수) 확정 → 3.3.
- [ ] 프로토콜 전체 분기(호흡 이후 단계) 별도 문서로 정의 + Claude 우선순위 프롬프트 설계.
- [ ] ws 재연결·상태 복구 정책 세부.
- [ ] 프로덕션 매핑: ws→Supabase Realtime, HTTP→Route Handler, 저장→Postgres+RLS.
