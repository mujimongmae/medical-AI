---
description: 린트 + 빌드 + 테스트 후 의미 단위로 커밋
---

다음을 순서대로 실행하고, 실패하면 즉시 멈춰서 원인과 함께 보고해줘:

1. `npm run lint`
2. `npm run build`
3. `npm test` (테스트가 있으면)
4. 모두 통과하면 변경사항을 의미 있는 단위로 커밋 — 커밋 메시지는 `feat:` / `fix:` / `chore:` 접두사 사용 (한글 OK)

커밋 전 `privacy-auditor` 에이전트로 PHI/시크릿 유출 여부를 빠르게 점검할 것.
