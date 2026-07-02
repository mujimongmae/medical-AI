# 02 — 탐지 로직 (파이프라인·상태머신·판정)

- **Status:** Draft
- **Owner:** 김준휘 (감지 파트)
- **Last updated:** 2026-07-02
- **관련 코드:** `lib/detection/*`, `app/(homecam)/*` (Web Worker + rAF 루프)
- **선행:** [01-system-overview](./01-system-overview.md) · **후행:** [04-event-contract](./04-event-contract.md)

## 1. 목적 / 사용자 가치
홈캠 영상에서 **급격한 쓰러짐(급락)** 을 1차 신호로 잡아 `emergency_events` 후보를 발행한다. Zone·무동작은 보조 확인용. 목표는 진단이 아니라 **신고 시간 단축을 위한 "후보" 트리거**.

## 2. 파이프라인 (입력 → 처리 → 출력)
```
video frame (iPhone 연속성 카메라)
  → [Worker] COCO-SSD  → 객체 박스 + 라벨 (person/bed/couch/chair …)
  → [Worker] MoveNet   → 17 keypoint 스켈레톤 (주 대상 1인)
  → [Main]  Feature 추출 (아래 §4) — EMA 평활, 프레임간 Δ
  → [Main]  상태머신 tick (§3)
  → 상태 배너 갱신(UI) + CANDIDATE 진입 시 이벤트 발행(§04)
```
- **주기:** 감지 tick 8–12 fps 목표(모델 추론은 Worker, UI는 rAF). 프레임 드랍 시 tick 스킵 허용.
- **대상 선택:** person 박스 중 **면적 최대 1인** 을 추적(주 대상). 다인 검출은 로그만.
- **좌표 정규화:** 모든 좌표는 프레임 높이 `H` 로 정규화(0–1). 카메라 거리 편차 흡수.

## 3. 상태머신 (1차: 급격 전이 기반)
상태: `NORMAL → SUSPECT → CANDIDATE → (CANCELLED | ESCALATED)`

| 전이 | 조건 (요약) |
|---|---|
| NORMAL → SUSPECT | 급락 신호 발생 (§4.A `drop_velocity > V_DROP`) **또는** 서있던 사람이 짧은 시간 내 수평화 |
| SUSPECT → CANDIDATE | 낙하 후 **`T_CONFIRM` 동안 바닥 자세 유지 + 무동작**(§4.B/4.C) → 후보 확정 → **이벤트 발행** |
| SUSPECT → NORMAL | `T_CONFIRM` 내 재기립/정상 이동(오탐 회수, 예: 앉기·눕기) |
| CANDIDATE → CANCELLED | **앱**에서 본인 취소 수신(§04 구독) 또는 대상 재기립 |
| CANDIDATE → ESCALATED | 앱 무반응 → 팀원 파트가 처리(감지 경계 밖, 상태 표시만 반영) |

- **디바운스:** 발행은 CANDIDATE **진입 1회만**(`emitted` 플래그). 동일 에피소드 중복 발행 금지.
- **쿨다운:** CANCELLED/ESCALATED 후 `T_COOLDOWN` 동안 재발행 억제(플리커 방지).

## 4. 판정 규칙 (Feature & 임계)
급격 움직임 **우선**, Zone/무동작 **보조**. 셋 중 급락은 필수 트리거, 나머지는 확정 가중.

### A. 급락(주 신호)
- `head_y`, `hip_y`(엉덩이 중심), `torso_center_y` 의 **하강 속도** = Δy/Δt (정규화 좌표/초).
- `drop_velocity ≥ V_DROP` 이고 낙폭 `Δy_total ≥ DROP_MIN` → 급락 감지.
- **자세 각:** 어깨–엉덩이 축과 수직선이 이루는 각 `body_angle`. 낙하 후 `body_angle ≥ ANGLE_LYING` → 수평(바닥) 자세.

### B. 무동작(보조)
- keypoint 이동량 합 `motion = Σ|Δkp|` 의 이동평균. `motion ≤ MOTION_STILL` 이 `T_CONFIRM` 지속 → 무동작.
- 정상 수면/휴식 오탐 방지: **급락 전이가 선행할 때만** 무동작을 위험 신호로 채택.

### C. Zone(보조, 수동 지정)
- 사용자가 홈캠 창에서 사각형 Zone 지정(`floor`=위험, `bed`/`couch`=안전).
- 대상 발 위치가 `floor` Zone이면 위험 가중↑, `bed`/`couch` Zone이면 급락 임계 상향(눕기 관대).
- COCO의 bed/couch 박스 자동 매핑은 보너스(수동이 기본).

### THRESHOLDS (초기값 — 데모 튜닝 대상, 단일 상수 모듈)
```ts
V_DROP        = 0.9   // 정규화 y/초, 급락 하강 속도
DROP_MIN      = 0.25  // 최소 낙폭 (프레임 높이 비)
ANGLE_LYING   = 60    // deg, 수직 대비 이 이상이면 수평 자세
MOTION_STILL  = 0.02  // 정규화 keypoint 이동량/프레임
T_CONFIRM     = 3.0   // s, 낙하 후 바닥+무동작 유지 → CANDIDATE
T_COOLDOWN    = 10.0  // s, 재발행 억제
KP_MIN_SCORE  = 0.3   // MoveNet keypoint 신뢰도 하한
EMA_ALPHA     = 0.4   // 좌표 평활 계수
```
> 값은 `lib/detection/thresholds.ts` 한 곳에서만 관리(스펙과 동기화). 변경 시 본 문서 먼저 수정.

## 5. 페일세이프 / 엣지 케이스
- **저신뢰 keypoint:** `score < KP_MIN_SCORE` 프레임은 Δ 계산에서 제외(튐 방지). 연속 결측 시 SUSPECT 홀드(자동 NORMAL 강등 금지).
- **대상 소실(프레임 이탈):** SUSPECT/CANDIDATE 중 person 소실 → 상태 유지 + "추적 끊김" 경고. NORMAL로 임의 복귀하지 않음.
- **모델 로드 실패/추론 지연:** UI에 명시(§03). 감지 불가 시 침묵 대신 "감지 중단" 노출.
- **오탐 우선 정책:** 놓침 < 오탐. 애매하면 CANDIDATE 발행하고 **앱 취소 게이트**로 회수(감지는 최종 판단 안 함).
- **다인/반려동물:** 주 대상 1인만 판정. 그 외는 로그. (오작동 시 Zone으로 좁힘.)

## 6. 의료 안전성 체크
- [x] 디스클레이머: "본 정보는 참고용이며 의학적 진단이 아닙니다." (배너·이벤트 payload 주석)
- [x] 응급 판정은 "쓰러짐 **후보**"일 뿐 — 확진/처방 없음, 최종 조치는 앱→119
- [x] 진단명 표기 금지("심정지" 등 단정 X) → "쓰러짐 의심" 문구만
- [x] 실제 인물 영상 미저장(온디바이스 추론, 프레임 비영속)

## 7. 미해결 / TODO
- V_DROP/DROP_MIN 실측 튜닝(iPhone 화각·설치 높이별).
- MoveNet Lightning vs Thunder 선택(속도 vs 정확도) — 데모 기기서 벤치.
- Zone 자동화(COCO bed/couch) 보너스 여부.
