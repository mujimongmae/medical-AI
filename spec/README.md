# 스펙 문서 (Spec) — 인덱스

이 폴더는 앱의 **단일 진실 원천(Single Source of Truth)** 입니다.
코드보다 **스펙이 먼저**입니다. 구현·변경 전에 여기부터 읽고, 여기부터 고칩니다.

> ⚠️ **제품 주제 미정 (TBD).** 도메인은 "의료 AI"로 확정, 구체 제품은 미정.
> 주제가 정해지면 [`00-overview/`](./00-overview/README.md) 를 가장 먼저 채운다.

## ⭐ 작업 규칙 (Spec-first)
1. **구현 전** — 관련 스펙 문서를 먼저 작성/갱신한다.
2. **변경 시** — 코드/데이터/UI 무엇이든 바꾸기 전에 **스펙 문서를 먼저 수정**하고, 그다음 코드를 바꾼다.
3. 새 기능/화면/로직 → `_TEMPLATE.md` 를 복사해 해당 카테고리 폴더에 문서를 만든다.
4. 커밋은 가능하면 **스펙 변경 + 코드 변경을 같은 커밋**에 담아 추적성을 유지한다.

## 폴더 지도
| 폴더 | 담당 | 무엇을 담나 |
|------|------|------------|
| [`../challenge/`](../challenge/README.md) | 전체 | 📋 **주최측 과제 브리핑** (주제·SDOH·일정·평가·PPT 요건 + 원본 이미지). ⚠️ spec 밖(루트)에 위치 |
| [`00-overview/`](./00-overview/README.md) | 전체 | 제품 개요·목표·사용자·핵심 플로우·스코프 |
| [`01-architecture/`](./01-architecture/README.md) | 전체 | 🏗 스택·아키텍처 (Next.js 모바일 웹 on Vercel + Supabase, iOS/Android는 Capacitor 래핑, Claude는 서버 Route Handler 경유) |
| [`02-design/`](./02-design/README.md) | ui-designer | 화면 설계, 디자인 토큰, 접근성(WCAG AA), 컴포넌트 |
| [`03-logic/`](./03-logic/README.md) | medical-domain / ai-engineer | 판단 로직, 규칙, AI 프롬프트/출력 스키마 |
| [`04-data-model/`](./04-data-model/README.md) | fullstack-developer / privacy-auditor | 데이터 모델(FHIR 스타일), Supabase 테이블, RLS |

## 📐 명명 규칙 (일관성 — 반드시 준수)
- **모든 스펙 항목은 `NN-이름/` 폴더 + 그 안의 `README.md`** 로 만든다. (예외: 루트 `README.md`(이 인덱스), `_TEMPLATE.md`)
  - `NN` = 두 자리 순번(읽는 순서). 개요·아키텍처 같은 공통 문서부터, 이어서 카테고리 폴더.
  - 폴더의 `README.md` = 그 주제의 본문 겸 인덱스(+공통 원칙).
- **한 주제가 여러 문서로 자라면** 같은 폴더 안에 `_TEMPLATE.md` 를 복사해 파일을 추가하고, 폴더 `README.md` 의 "문서 목록"에 링크한다.
- 새 최상위 카테고리가 필요하면 다음 순번(`05-…/`)으로 폴더를 만든다.

## 문서 상태 규약
각 스펙 문서 상단 `Status:` 는 `Draft` → `In Progress` → `Implemented` → `Deprecated` 로 관리한다.
