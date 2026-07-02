# collapse-detection/ — 홈캠 쓰러짐 감지 파트

담당 파트 전용 폴더. **물리 핸드폰 카메라 → 노트북 홈캠 창 → 실시간 객체 탐지·라벨링 → 쓰러짐 인지 → 앱에 이벤트 발행**까지.

## 담당 경계 (한 줄)
> 카메라 영상에서 "쓰러짐 후보"를 감지해 **`emergency_events` insert 까지**. 이후 앱 알람·119·주변인 연락은 팀원 파트.

## 문서 인덱스
| # | 문서 | 내용 |
|---|---|---|
| 01 | [01-system-overview.md](./01-system-overview.md) | 제품 전체 + 내 파트 경계 + 플로우 + MVP 스코프 |
| 02 | [02-detection-logic.md](./02-detection-logic.md) | 탐지 파이프라인·상태머신·판정 규칙·임계치 (로직) |
| 03 | [03-homecam-ui.md](./03-homecam-ui.md) | 홈캠 창 UI·오버레이·상태 배너 (디자인) |
| 04 | [04-event-contract.md](./04-event-contract.md) | `emergency_events` 스키마·RLS·발행/구독 (인터페이스) |

## 근거 (리서치)
- [screening/06](../screening/06-auto-alert-efficacy.md) — 시간=생존율, 자동신고 시간단축 효용
- [screening/07](../screening/07-fall-vs-lying-datasets.md) — 낙상 vs 눕기 구별 기법·데이터셋

## 스택
Next.js 15 + React 19 + TF.js(COCO-SSD + MoveNet, Web Worker) + Canvas 오버레이 + Supabase Realtime.

## 상태
Draft — 설계 확정, 스펙 리뷰 대기. (구현 전 스펙 우선)
