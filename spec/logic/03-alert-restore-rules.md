# 응급 알림 전달·복원 규칙

> 상태: 확정 · 2026-07-03 · 담당: `community-emergency-app/server/index.ts`, `server/registry.ts`

## 원칙

**이웃은 자신이 가입(등록)한 이후에 발생한 응급 이벤트만 받는다.** 과거 이벤트는 어떤 경로로도 재전송되지 않는다.

## 전달 경로 2가지

| 경로 | 시점 | 대상 |
|---|---|---|
| 실시간 호출 (`escalate`) | 환자 15초 무반응 직후 | 같은 마을 이웃 전원 (WS + FCM 푸시) |
| 재접속 복원 (`resendActiveAlerts`) | 이웃 WS `HELLO` 시 | 진행 중 이벤트 중 **아래 4조건 전부 충족** 시 1건만 |

## 재접속 복원 조건 (전부 AND)

1. 이벤트 상태가 `notifying_neighbors` (진행 중)
2. `ev.notified`에 이 이웃 id 포함 (실제로 호출됐던 이웃)
3. `ev.createdAt >= user.registeredAt` — **가입 이전 이벤트 차단** (id 재사용·충돌 방어)
4. `now - ev.createdAt <= 10분` — **오래된 미해결 이벤트 차단** (테스트 잔재 방어)

## 지원 필드

- `RegisteredUser.registeredAt` (ms) — 등록/재등록 시점. 없으면(구버전 데이터) `Infinity` 취급 → 복원 대상 제외.
- `EmergencyEvent.createdAt` (ms) — 이벤트 생성 시점.

## ID 충돌 방어

서버 부팅 시 `userSeq`를 저장된 사용자 중 `dev-NNN` 최대값으로 복원한다.
(기존 버그: 재시작 시 0으로 리셋 → 신규 가입자가 과거 사용자 id를 재사용 → 과거 이벤트가 엉뚱한 사람에게 연결됨)
