# 🏥 의료 AI 해커톤 — 팀 스타터

**의료/헬스케어 AI 앱**을 만드는 해커톤 팀용 스타터.
팀원 모두가 **동일한 Claude Code 환경**(에이전트·권한·가드레일·의료 안전 규칙·스펙 폴더)을 공유하기 위한 설정을 담습니다.

> ⚠️ **구체 앱 컨셉/주제는 아직 미정 (TBD).** 도메인은 의료 AI로 확정, 이 레포는 아이디어가 정해지기 전에도 바로 협업할 수 있도록 **공용 환경·안전 규칙만** 제공합니다.
> 컨셉이 정해지면 먼저 `spec/00-overview.md` 에 기록한 뒤, 이 문서 상단과 `CLAUDE.md` 의 "무엇을 만드는가"를 채우세요. (예: "지역 주민용 증상 문진 → 근처 병원/약국 추천")

## ⚡ 팀원 세팅 (3분)

```bash
git clone <이-레포-URL> medical-ai-hackathon
cd medical-ai-hackathon
npm install                 # 앱 코드 추가 후
cp .env.example .env.local  # 키 채우기 (팀 채널 참고)
claude                      # 실행 시 팀 설정 자동 로드
```

### 개인별로 한 번 설치할 것 (레포에 안 담김)
```bash
# 공식 헬스케어 플러그인 (FHIR 스킬 + ICD-10/PubMed/ClinicalTrials MCP 데이터, 세팅 불필요)
/plugin marketplace add anthropics/healthcare
/plugin install healthcare@healthcare

# (선택) 추가 전문 에이전트가 필요하면
/plugin marketplace add wshobson/agents
```

## 🧩 이 레포에 담긴 것

```
.claude/
├── settings.json        # 팀 공용 권한·훅 (의료데이터·시크릿 deny)
├── agents/              # fullstack-developer, ui-designer, ai-engineer,
│                        #   medical-domain, privacy-auditor
├── commands/            # /ship, /demo-check, /seed-data
└── skills/medical-app/  # 합성데이터·디스클레이머·FHIR 모델·PHI 비식별화
CLAUDE.md                # 프로젝트 헌법 (스택·의료 안전 규칙)
.mcp.json                # chrome-devtools + github MCP
```

## 🤖 Claude 커맨드
| 커맨드 | 용도 |
|--------|------|
| `/ship` | 린트+빌드+테스트+커밋 |
| `/demo-check` | 데모 직전 점검 |
| `/seed-data` | 합성 의료 데이터 생성 |

## 🔒 의료 데이터 규칙 (필독 — 컨셉과 무관하게 항상 적용)
- 실제 환자 데이터·개인정보 **절대 금지** → 합성 데이터만
- 시크릿은 `.env.local` 에만, 커밋 금지
- AI 진단성 응답엔 "참고용, 전문의 상담 권고" 디스클레이머 필수
- 응급 상황(예: 흉통·호흡곤란·의식저하) → 119/응급실 안내 우선

## 🛠 기술 스택 (권장 기본값 — 컨셉 확정 후 조정 가능)
Next.js 15 · React 19 · TypeScript · Tailwind · Supabase · Claude API · Vercel
