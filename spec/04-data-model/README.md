# data-model/ — 데이터 모델·Supabase·RLS

- **Status:** Draft
- **Owner:** fullstack-developer / privacy-auditor
- **Last updated:** 2026-07-02

이 폴더는 데이터 구조의 진실 원천이다. 스키마/테이블/RLS를 바꾸기 전에 여기부터 수정한다.

> ✅ **아이디어 확정** ([`../00-overview/`](../00-overview/README.md)). 스키마 미작성 — 첫 설계 대기. 데모는 맥북 로컬(SQLite/JSON), 프로덕션은 Supabase+RLS ([`../01-architecture/`](../01-architecture/README.md)).

## 무엇을 담나
- **데이터 모델:** FHIR 스타일 단순 모델(엔티티·필드·관계)
- **Supabase 테이블:** 스키마 정의, 인덱스, 마이그레이션 대응(`supabase/`)
- **RLS 정책:** 테이블별 접근 규칙 (기본 ON)
- **시드 데이터:** 합성 데이터 규격 (`/seed-data`, `medical-app`/`seed-data` 스킬)

## 문서 목록
- [`01-entities-and-persistence.md`](./01-entities-and-persistence.md) — user/event 엔티티, JSON 영속(데모)→Supabase, 병력 입력, 매칭 규칙

## 데이터 불변식 (반드시)
- **실제 환자/개인 의료정보 금지.** 합성 데이터만.
- HIPAA 18개 식별자를 스키마·로그·커밋에 남기지 않는다.
- 모든 테이블 RLS 기본 ON. 새 테이블 추가 시 정책을 이 폴더에 먼저 정의.
