# 데이터 모델 · 영속 · 매칭

- **Status:** In Progress
- **Owner:** fullstack-developer / privacy-auditor
- **Last updated:** 2026-07-03
- **관련 코드:** `lib/protocol/messages.ts`, `server/registry.ts`, `server/store.ts`, `server/seed.ts`, `app/src/App.tsx`

## 1. 목적
등록·병력이 **서버에 남고**(영속), 보호자가 입력한 병력이 AI 추천에 반영되게 한다. 데모는 맥북 로컬 **JSON 파일**, 프로덕션은 **Supabase**.

## 2. 엔티티

### user (등록 사용자) — 코드 `RegisteredUser`
| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | `seed-*`(시드) / `dev-NNN`(앱 등록) |
| role | "patient" \| "neighbor" | 역할 |
| name | string | 이름(합성) |
| village | string | 마을(매칭 키) |
| home | {lat,lng} | 좌표(합성, 이웃 근접 정렬) |
| history | string[] | **병력**(보호자 입력, AI 추천 컨텍스트) |
| pushToken | string? | FCM 토큰(화면 꺼짐 알림) |

### event (응급 건) — 코드 `EmergencyEvent` (휘발, 영속 안 함)
| 필드 | 설명 |
|------|------|
| eventId | `evt-NNN` |
| patientId | 대상 환자 |
| state | alerting_self / notifying_neighbors / resolved |

## 3. 영속 (데모 = JSON 파일)
- 파일: **`server/data.json`** (gitignore — 합성이지만 런타임 산출물).
- **시작 시**: `seedRegistry()`(시드 주입) → `loadStore()`가 `data.json`을 읽어 **덮어쓰기/추가**(같은 id는 저장본 우선).
- **쓰기 시점**: `/api/register`, `/api/push-token`(토큰) → 변경 후 `saveStore()`.
- event는 저장 안 함(응급 순간 상태라 in-memory로 충분).
- ⚠️ 합성 데이터만. 실제 PHI/PII 금지(불변식 유지).

## 4. 병력 입력 (보호자)
- 환자 등록 화면에서 **병력 입력**(칩/콤마) → `RegisterReq.history`에 포함 → 저장.
- AI 음성 추천(`/api/voice`)이 이벤트 환자의 `history`를 Claude 컨텍스트로 사용 → **병력+증상 종합**.

## 5. 매칭 (환자 ↔ 이웃)
- 응급 발생 시: 같은 `village` + `role:"neighbor"` + **ws 접속중** + 거리순 상위 3~4명에게 알림/푸시. (`server/index.ts` `selectNeighbors`)
- 데모 편의: 환자 앱에서 **"시드 환자로 시작"** → 타이핑 없이 `seed-patient-1`(병력 有)로 접속(자동 매칭 실용 버전).

## 6. 프로덕션 이관 (후순위)
- `data.json` → **Supabase `users` 테이블**(RLS ON). event → `events` 테이블(선택).
- `loadStore`/`saveStore` → Supabase 쿼리. 매칭은 SQL(마을·거리)로.
- RLS: 본인/같은 마을 이웃만 접근 등 정책은 확정 시 이 폴더에 추가.

## 7. 미해결 / TODO
- [ ] 병력 표준화(자유텍스트 vs 코드셋) — 데모는 자유텍스트 태그.
- [ ] Supabase 스키마·RLS 확정.
- [ ] 개인정보 동의/보관기간(프로덕션).
