# 의료 AI 해커톤 — 프로젝트 지침 (CLAUDE.md)

## 무엇을 만드는가
**지역사회 보건의료 문제 해결 AI 앱 (해커톤 본선 과제).**
**SDOH**(사회적 건강결정요인) 기반 · evidence-based. 데모 우선 — **실제 가동되는 앱**이 핵심.

> 📋 **과제 브리핑 전문 → [`challenge/README.md`](./challenge/README.md)**
> (주최측 배포 슬라이드 4장 정리: 주제·SDOH 프레임·일정·평가·PPT 요건. 원본 이미지는 `challenge/images/`)
> ⚠️ **해결할 구체 문제·대상은 팀이 정의 예정 (TBD).** 정해지면 먼저 [`spec/00-overview.md`](./spec/00-overview.md) 에 기록.
> (예선 주제/대상과 중복 금지 — 점수 반영. **14:30 코드 동결 하드 마감.**)

## ⭐ 스펙 우선 (Spec-first) — 반드시 준수
구현보다 **스펙이 먼저**다. 모든 진실 원천은 [`spec/`](./spec/README.md) 폴더에 있다.
1. **구현 전** — 관련 스펙 문서를 먼저 작성/갱신한다. (없으면 `spec/_TEMPLATE.md` 복사)
2. **변경 시** — 코드·데이터·UI 무엇이든 바꾸기 전에 **스펙 문서를 먼저 수정**하고, 그다음 코드를 바꾼다.
3. 카테고리: `spec/design/`(화면·토큰·접근성) · `spec/logic/`(로직·AI 프롬프트) · `spec/data-model/`(스키마·RLS).
4. 가능하면 **스펙 변경 + 코드 변경을 같은 커밋**에 담아 추적성 유지.
> 코드 파일(app/lib/components) 편집 시 spec/ 미수정이면 hook이 리마인더를 준다(비차단). 이미 반영했거나 순수 버그픽스면 무시하고 진행.

## 기술 스택 (권장 기본값 — 컨셉 확정 후 조정 가능)
- 프론트: **Next.js 15** (App Router, RSC + Server Actions) + **React 19** + TypeScript
- 스타일: Tailwind CSS (모바일 우선, 접근성 고려해 큰 폰트/고대비)
- 백엔드/DB: **Supabase** (Postgres + Auth + Storage + Realtime), RLS 기본 ON
- AI: **Claude API** (분석·요약·RAG)
- 배포: Vercel

## 명령어
- 개발: `npm run dev`
- 빌드: `npm run build`
- 린트: `npm run lint`
- 테스트: `npm test`

## ⚠️ 의료 데이터 규칙 (컨셉과 무관하게 반드시 준수)
- **실제 환자/개인 의료정보 절대 사용 금지.** 합성 데이터만 (`/seed-data`).
- 개인정보(이름·주민번호·연락처·주소·생년월일 등 18개 HIPAA 식별자)를 코드/로그/커밋에 남기지 말 것.
- API 키·시크릿은 `.env.local` 에만. 커밋 금지.
- AI 진단성 응답에 디스클레이머 필수: "본 정보는 참고용이며 의학적 진단이 아닙니다."
- 응급 증상(흉통·호흡곤란·의식저하 등)을 다루는 기능이라면 → 119/응급실 안내를 최우선 노출.

## 서브에이전트 (`.claude/agents/`)
- `fullstack-developer` — Next.js/React/Supabase 화면·API·데이터
- `ui-designer` — UI/UX·디자인 토큰·접근성(WCAG AA)
- `ai-engineer` — Claude API·RAG·프롬프트
- `medical-domain` — 의료 도메인 로직·용어·응급도·안전성·한국 의료 맥락 (컨셉 확정 후 구체화)
- `privacy-auditor` — PHI/PII·시크릿·RLS 점검 (커밋/데모 전 필수)

## 커맨드 (`.claude/commands/`)
- `/ship` — 린트+빌드+테스트+커밋
- `/demo-check` — 데모 직전 점검
- `/seed-data` — 합성 데이터 생성

## 🌿 브랜치 규칙 (반드시 준수)
- **모든 작업은 특정 목적 브랜치에서 한다.** (예: `feat/…`, `fix/…`, `chore/…`)
- **main 으로의 merge/push 는 유저가 명시적으로 지시할 때만** 실시한다. 그 전엔 main 을 건드리지 않는다.
- 기본 흐름: 목적 브랜치에서 작업·커밋 → PR 생성 → 유저 승인·지시 시에만 main 반영.

## 코드 규칙
- 컴포넌트 `app/components/`, API 라우트 `app/api/`, 공용 로직 `lib/`
- 항상 loading/error 상태 포함 (데모는 예외처리 안 하면 깨짐)
- 커밋: `feat:`/`fix:`/`chore:` 접두사 (한글 OK)

## 하지 말 것
- 과도한 추상화·조기 리팩터링 (해커톤임)
- 확정 진단/처방 주장 (법적 리스크) — 항상 "전문의 상담 권고"

## 추천 설치 (README 참고)
- 공식 `anthropics/healthcare` 플러그인 (FHIR 스킬 + ICD-10/PubMed/ClinicalTrials MCP 데이터)
- `wshobson/agents` 마켓플레이스 (필요 시 추가 전문 에이전트)
