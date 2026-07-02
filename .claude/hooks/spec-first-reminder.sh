#!/usr/bin/env bash
# Spec-first soft 리마인더 (PreToolUse: Edit|Write)
# app/lib/components 의 코드 파일을 편집하려는데 spec/ 문서가 이번 작업에서
# 아직 수정되지 않았으면 "스펙 먼저 갱신" 리마인더를 주입한다. 편집을 막지는 않는다.
set -euo pipefail

FILE="${1:-}"

# 코드 경로가 아니면 조용히 통과
case "$FILE" in
  *app/*|*lib/*|*components/*) ;;
  *) exit 0 ;;
esac
# 코드 파일 확장자만 대상
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

# spec/ 워킹트리에 변경이 있으면(=이번 작업에서 스펙을 건드림) 통과
if git status --porcelain spec/ 2>/dev/null | grep -q .; then
  exit 0
fi

# 스펙 미수정 → 비차단 리마인더 주입
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"⚠️ Spec-first 리마인더: spec/ 워킹트리에 변경이 감지되지 않았습니다. 이 코드 파일을 바꾸기 전에 관련 스펙 문서(spec/design·spec/logic·spec/data-model)를 먼저 수정하세요. 이미 스펙에 반영했거나 순수 버그픽스/포맷팅이면 무시하고 진행하세요."}}
JSON
exit 0
