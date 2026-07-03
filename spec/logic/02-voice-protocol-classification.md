# 음성 증상 → 프로토콜 분류 (로컬 LLM)

> 상태: 확정 · 2026-07-03 · 담당: 서버(`community-emergency-app/server/exaone.ts`)

## 목적 (심사 방어 논리)

AI 응급처치 답변의 신뢰성 공격을 막기 위해 **역할을 분리**한다:

- **LLM(로컬 EXAONE 3.5 2.4B)** — 증상 설명을 듣고 "어떤 프로토콜에 해당하는가"를 **분류만** 한다. 처치 내용은 절대 생성하지 않는다.
- **코드(프로토콜 KB)** — 분류된 ID로 `lib/first-aid/protocols.ts`의 **공인 가이드라인 기반 사전 검증 프로토콜**(대한심폐소생협회 2020, AHA 2020, 대한적십자사)을 찾아 처치 내용을 전달한다.

→ 사용자에게 보이는 모든 처치 문구는 AI 생성이 아니라 검증된 KB 원문이다.

## 왜 로컬 모델인가

- 외부 API 의존 제거 (네트워크 단절 시에도 동작 — 농촌 마을 환경 가정)
- 개인 음성·병력 데이터가 외부로 나가지 않음 (프라이버시)
- 기술평가 심층 항목(AI Agent 구현·아키텍처) 어필 포인트

## 흐름

```
앱 STT 텍스트 ──POST /api/voice──▶ server/index.ts
                                     │
                                     ▼
                          server/exaone.ts
                          Ollama(localhost:11434) exaone3.5:2.4b
                          temperature 0 · JSON 모드(format:"json")
                          입력: 증상 전언 + 병력(합성)
                          출력: {"id": 프로토콜ID|NONE, "probs": 클래스별 확률}  ← LLM 역할 끝
                                     │
                                     ▼
                          코드가 PROTOCOLS[ID]에서 조회
                          likelyCondition / recommendation / summary 조립
                                     │
                                     ▼
                          VoiceRes → 앱이 프로토콜 상세 화면 연결
```

## 분류 대상 (화이트리스트)

`P-CHOKING, P-STROKE, P-BLEED, P-SEIZURE, P-SYNCOPE, P-RECOVERY` 6종.
CPR/AED는 생명 직결이라 LLM을 거치지 않고 규칙(`lib/first-aid/triage.ts`)이 담당 — 변경 없음.

## 규칙

1. LLM 출력은 화이트리스트 검증을 통과한 ID만 채택. 그 외(NONE 포함)는 fallback.
2. fallback: "상태 확인이 더 필요합니다" + 119 안내 (항상 응답 보장).
3. Ollama 미실행·타임아웃(6초)에도 fallback. 서버가 죽지 않는다.
4. 확정 진단 금지 표현 유지: "~가능성이 높아요".
5. 환경변수: `OLLAMA_URL`(기본 `http://127.0.0.1:11434`), `EXAONE_MODEL`(기본 `exaone3.5:2.4b`).

## 응답 필드 조립 (전부 코드 생성)

| 필드 | 소스 |
|---|---|
| `likelyCondition` | ID→상태명 매핑 테이블 + "가능성이 높아요" |
| `recommendation` | `protocol.callEmergencyFirst` 여부 + `protocol.name` + 첫 단계 `steps[0].title` |
| `summary` | 코드 템플릿: 현장 전언(STT 원문) + 병력 |
| `protocolId` | 검증 통과한 ID |
| `probs` | 모델이 출력한 클래스별 확률(0~1로 클램프, 알려진 클래스만 통과). **모델 자기보고값**(로짓 아님) — UI/발표에서 "분류 근거" 표시용 |

## 확률(probs) 처리 규칙

1. `temperature: 0` + Ollama JSON 모드로 출력 형식 강제.
2. `id`가 화이트리스트에 없으면 probs 최댓값 클래스로 보정하되, 최댓값 확률 < 0.5면 fallback.
3. probs는 신뢰도 "표시"용이지 의사결정 임계값이 아니다 (결정은 id + 화이트리스트).
