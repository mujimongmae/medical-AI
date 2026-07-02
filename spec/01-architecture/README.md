# 01 — 아키텍처 / 스택 결정

- **Status:** In Progress
- **Last updated:** 2026-07-02
- **결정:** **모바일 웹앱(Next.js on Vercel) + Supabase** 를 베이스로 하고, iOS/Android 앱은 이 웹을 **래핑(Capacitor)** 만 한다.
- **변경 이력:** ~~Expo(React Native) 네이티브~~ → **Next.js 모바일 웹 + 얇은 네이티브 래퍼**로 전환 (2026-07-02). 이유는 아래 참고.

## 왜 "웹 베이스 + 래핑"
- **단일 코드베이스(웹) 하나만** 잘 만들면 데모·심사·배포가 모두 해결된다. 네이티브 코드는 거의 안 짠다.
- **Vercel 배포 = 즉시 접속 URL.** 심사위원이 QR/링크로 **어떤 폰이든 브라우저에서 바로** 실행 → 설치 마찰 0.
- iOS/Android "**실제 앱**" 요건은 **Capacitor로 같은 웹을 감싸 .apk/.ipa** 산출해 충족. (WebView 셸 + 네이티브 기능 브리지)
- Next.js **서버(Route Handler)** 에서 Claude를 호출 → 별도 Edge Function 없이 **키를 서버에 안전 보관** (Vercel 환경변수).
- Tailwind 그대로, `@supabase/supabase-js` 그대로. 러닝커브 최소.

> 대안 비교: PWA(가장 빠르나 스토어 앱 아님) / Expo·RN(순수 네이티브지만 코드베이스 이원화·러닝커브) / **Capacitor 래핑(웹 1벌로 웹+앱 동시 충족 → 채택)**.

## 구성 요소
| 레이어 | 기술 | 비고 |
|--------|------|------|
| 웹앱(클라이언트) | **Next.js (App Router) · React 19 · TypeScript** | 모바일 우선 반응형, `app/` 라우팅 |
| 스타일 | **Tailwind CSS** | 큰 폰트·고대비(접근성 WCAG AA) |
| 서버 로직 | **Next.js Route Handlers (`app/api/**`)** | Claude 프록시·민감 로직, Vercel 서버에서 실행 |
| 배포(웹) | **Vercel** | Preview/Production URL, 환경변수로 시크릿 관리 |
| 데이터/인증 | **Supabase** (Postgres·Auth·Storage·Realtime) | RLS 기본 ON |
| AI | **Claude API** | **서버(Route Handler) 경유** 호출 |
| 네이티브 래퍼 | **Capacitor** (Android 우선, iOS 옵션) | 웹을 감싼 .apk/.ipa, 필요 시 네이티브 플러그인 |

## 데이터 흐름 (기본)
```
[모바일 브라우저  또는  Capacitor 래퍼(WebView)]
   │  ① 인증·CRUD (Supabase anon key + RLS)
   ▼
[Supabase Postgres] ──RLS──> 행 수준 접근 제어
   ▲
   │  ② AI 요청 (사용자 세션/JWT 첨부)
   ▼
[Next.js Route Handler on Vercel]  ── ANTHROPIC_API_KEY (서버 시크릿) ──> [Claude API]
   └─ 응답 가공·디스클레이머 부착 후 클라이언트로 반환
```
> 같은 웹 코드가 브라우저에서도, Capacitor WebView 안에서도 동일하게 동작한다. 래퍼는 화면을 "감싸기만" 한다.

## 🔒 보안 불변식 (반드시)
- **Claude/서드파티 시크릿 키를 클라이언트 번들에 넣지 않는다.** JS 번들·APK는 뜯어보면 다 보인다.
  → Claude 호출은 **서버(Next.js Route Handler)** 에서만. 클라이언트엔 Supabase `anon key`만 (RLS로 보호).
- 서버 Route Handler는 사용자 **세션/JWT 검증** 후 처리. 익명 남용 방지.
- 시크릿은 **Vercel 환경변수**(`ANTHROPIC_API_KEY` 등) 또는 로컬 `.env.local`(커밋 금지)에만.
  - `NEXT_PUBLIC_` 접두사는 **클라이언트로 노출**되므로 Supabase URL·anon key 등 공개 가능 값에만 사용. 시크릿엔 절대 금지.
- 실제 환자 데이터 금지, 합성 데이터만. RLS 정책은 [`04-data-model/`](../04-data-model/README.md)에 정의.

## 폴더 구조 (예정)
```
app/                 # Next.js App Router (화면 라우트)
├── api/             # Route Handlers (Claude 프록시 등 서버 로직)
components/          # 재사용 UI
lib/                 # supabase 클라이언트, 공용 로직, 타입
supabase/
└── migrations/      # DB 스키마·RLS
capacitor.config.ts  # 네이티브 래퍼 설정 (Android 우선)
android/  ios/       # Capacitor 생성 네이티브 프로젝트 (빌드 산출용)
```

## 명령어 (예정 — 확정 시 CLAUDE.md 반영)
- 웹 개발: `npm run dev` (로컬) / Vercel Preview 배포는 push 시 자동
- 네이티브 래퍼: `npx cap sync` → `npx cap open android` → Android Studio에서 .apk 빌드
- Supabase 로컬: `supabase start` / 마이그레이션 `supabase db push`

## 미해결 / TODO
- [ ] 인증 방식 확정 (익명 세션 vs 이메일/소셜) — 데모 편의상 익명 우선 검토
- [ ] Vercel 프로젝트 연결 + 환경변수(`ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_*`) 세팅
- [ ] Capacitor 초기화 및 Android .apk 빌드 파이프라인 확인
- [ ] Claude 프록시 Route Handler 스켈레톤(`app/api/ai/route.ts`) + 디스클레이머 부착 로직
- [ ] Tailwind 접근성 토큰(큰 폰트·고대비) 설정 → [`02-design/`](../02-design/README.md)와 연동
