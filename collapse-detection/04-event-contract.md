# 04 — 이벤트 계약 (감지 ↔ 앱 경계)

- **Status:** Draft
- **Owner:** 김준휘 (감지 파트)
- **Last updated:** 2026-07-02
- **관련 코드:** `lib/events/emergency.ts`, `supabase/migrations/*_emergency_events.sql`
- **선행:** [02-detection-logic](./02-detection-logic.md) · **경계:** 감지 파트는 **발행까지**, 이후(알람/119/주변인)는 팀원 파트.

## 1. 목적 / 사용자 가치
감지 파트와 앱 파트를 잇는 **단일 계약**. 감지는 "쓰러짐 후보"를 발행(publish)하고, 앱은 구독(subscribe)해 알람을 띄운다. 이 스키마가 **양쪽의 유일한 진실 원천** — 필드는 100% 일치해야 한다.

## 2. EmergencyEvent 스키마 (TS ↔ DB 1:1)
```ts
// lib/events/emergency.ts — DB 컬럼과 100% 일치
export type EmergencyEventType = 'collapse';
export type EmergencyStatus =
  | 'candidate'   // 감지가 발행 (초기)
  | 'confirmed'   // 앱: 본인 무반응 → 에스컬레이션 진입
  | 'cancelled'   // 앱: 본인 취소 (오탐 회수)
  | 'resolved';   // 종료

export interface EmergencyEvent {
  id: string;                 // uuid (client 생성 or DB default)
  type: EmergencyEventType;   // 'collapse'
  status: EmergencyStatus;    // 발행 시 'candidate'
  confidence: number;         // 0..1, 감지 신뢰도
  detected_at: string;        // ISO8601, 감지 시각
  source: 'homecam';          // 발행 주체
  session_id: string;         // 홈캠 세션 식별 (기기별)
  // 근거 스냅샷 (비영속 영상 대신 수치만) — PHI 금지
  evidence: {
    drop_velocity: number;    // §02.4.A
    body_angle: number;       // deg
    still_seconds: number;    // 무동작 지속
    zone: 'floor' | 'bed' | 'couch' | 'none';
  };
  disclaimer: string;         // "본 정보는 참고용이며 의학적 진단이 아닙니다."
  created_at?: string;        // DB default now()
}
```
> **불변식:** 감지가 만드는 이벤트는 항상 `status='candidate'`, `source='homecam'`, `type='collapse'`. 상태 변경(candidate→confirmed/cancelled)은 **앱**만 수행.

## 3. 전송 채널 (2-tier)
동일 페이로드를 두 채널로. **로컬 데모는 BroadcastChannel 필수, Supabase는 원격/영속용.**

| 채널 | 용도 | 특성 |
|---|---|---|
| **BroadcastChannel** `'emergency'` | 같은 브라우저 내 홈캠 창 ↔ 앱 창 | 무설정·초저지연, 데모 1순위 |
| **Supabase Realtime** (table `emergency_events`) | 기기 간·영속·감사 로그 | RLS 적용, 네트워크 필요 |

- 두 채널 동시 발행 시 앱은 **`id` 로 dedupe**(먼저 온 것 채택).
- BroadcastChannel 메시지 형태: `{ kind: 'emergency_event', payload: EmergencyEvent }`.

## 4. 발행 / 구독 API (경계 시그니처)
```ts
// 감지 파트 (발행) — CANDIDATE 진입 시 1회
export function publishEmergency(e: EmergencyEvent): Promise<void>;
//  → BroadcastChannel.postMessage + supabase.insert (best-effort, 병렬)
//  → 실패해도 로컬 채널 성공하면 데모 지속 (§02.5 페일세이프)

// 앱 파트 (구독) — 참고용 계약, 실제 구현은 팀원
export function subscribeEmergency(
  cb: (e: EmergencyEvent) => void
): () => void; // unsubscribe

// 앱 → 감지 (역방향, 취소 반영): 같은 채널로 status 갱신 브로드캐스트
//  { kind: 'emergency_status', id, status: 'cancelled' | 'confirmed' }
//  감지 UI는 이를 받아 CANCELLED/ESCALATED 표시 (§03.3)
```

## 5. DB: `emergency_events` SQL + RLS
```sql
create table public.emergency_events (
  id           uuid primary key default gen_random_uuid(),
  type         text not null default 'collapse' check (type in ('collapse')),
  status       text not null default 'candidate'
                 check (status in ('candidate','confirmed','cancelled','resolved')),
  confidence   real not null check (confidence >= 0 and confidence <= 1),
  detected_at  timestamptz not null,
  source       text not null default 'homecam' check (source in ('homecam')),
  session_id   text not null,
  evidence     jsonb not null default '{}'::jsonb,   -- 수치 스냅샷만, PHI 금지
  disclaimer   text not null,
  created_at   timestamptz not null default now()
);

alter table public.emergency_events enable row level security;

-- 데모 정책: 인증 사용자(홈캠/앱)만 접근. 세션 범위로 좁힘 권장.
create policy "insert_by_authenticated"
  on public.emergency_events for insert
  to authenticated with check (source = 'homecam');

create policy "read_by_authenticated"
  on public.emergency_events for select
  to authenticated using (true);

create policy "update_status_by_authenticated"
  on public.emergency_events for update
  to authenticated using (true) with check (true);

-- Realtime 발행
alter publication supabase_realtime add table public.emergency_events;
```
> RLS 기본 ON(CLAUDE.md). 데모는 `authenticated` 범위. 운영화 시 `session_id`/보호자 관계로 정책 강화 — TODO.

## 6. 감지 ↔ 앱 경계 (책임 분리)
| 항목 | 감지(내 파트) | 앱(팀원) |
|---|---|---|
| candidate 발행 | ✅ | — |
| 알람 UI·본인 확인/취소 | — | ✅ |
| status 변경(confirmed/cancelled/resolved) | 표시만 반영 | ✅ 소유 |
| 119/주변인 연락 | — | ✅ |
- **감지는 최종 판단 안 함.** 발행 후 결정권은 전적으로 앱(취소 게이트).

## 7. 의료 안전성 체크
- [x] payload에 필수 `disclaimer` 필드("본 정보는 참고용이며 의학적 진단이 아닙니다.")
- [x] `evidence`는 수치 스냅샷만 — 이름·영상 등 PHI/18개 식별자 금지
- [x] 확정 진단 아님 — `status='candidate'` 로만 발행, 확진 표현 없음
- [x] RLS ON, 키는 `.env.local`(커밋 금지)

## 8. 미해결 / TODO
- `session_id` ↔ 보호자/대상자 매핑 테이블(운영화 시 RLS 강화).
- 이벤트 만료/자동 resolved 타임아웃 소유 주체(앱 협의).
- 오프라인(네트워크 끊김) 시 Supabase 재전송 큐 필요 여부.
