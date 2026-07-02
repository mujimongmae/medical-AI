# logic/ — 판단 로직·규칙·AI

- **Status:** Draft
- **Owner:** medical-domain / ai-engineer
- **Last updated:** 2026-07-02

이 폴더는 앱의 판단 로직과 AI 동작의 진실 원천이다. 로직을 바꾸기 전에 여기부터 수정한다.

## 무엇을 담나
- **핵심 판단 규칙:** 입력 → 처리 → 출력의 분기·엣지 케이스
- **AI 프롬프트:** Claude API 시스템/유저 프롬프트, RAG 소스, 출력 스키마
- **평가/검증:** 로직 정확성·안전성 확인 방법

## 문서 목록
<!-- 로직마다 _TEMPLATE.md 복사해서 추가 -->
- [`01-messaging-protocol.md`](./01-messaging-protocol.md) — 메인컴퓨터↔환자앱/이웃앱 통신 규격(WebSocket·HTTP 메시지 타입, 응급 시퀀스, 이웃 선별·프로토콜 규칙)
- [`02-first-aid-protocol.md`](./02-first-aid-protocol.md) — 응급처치 프로토콜·트리아지 스키마(일반인용, KACPR 2020 기반 8종 + 결정트리). 코드: `lib/first-aid/`

## 안전성 불변식 (도메인 공통 — 반드시)
- 응급 상황(예: 흉통·호흡곤란·의식저하) 감지 시 → **119/응급실 안내를 다른 무엇보다 먼저.**
- 확정 진단/처방 절대 금지 → 항상 "전문의 상담 권고".
- 모든 AI 진단성 출력에 디스클레이머 포함.
