// 트리아지 결정트리 — 진입 = 이웃 도착 (spec/03-logic/02-first-aid-protocol.md §4)
// 새 흐름: 생명 직결(CPR 여부)만 규칙으로 판단(의식→호흡). 그 외는 AI 음성 추천.
// - 의식 없음 AND 호흡 없음 → P-CPR (즉시 가슴압박)
// - 그 외(의식/호흡 있음) → AI_VOICE (음성 설명 → 병력+증상 종합 추천)
// 위험도 분기는 이 결정적 데이터로. LLM은 (B) 경로의 추천 보조에만.
import type { TriageNode } from "./schema";

export const TRIAGE_ROOT = "Q1";
/** AI 음성 추천 경로 진입 마커 (트리아지 종착). NeighborView가 인식. */
export const AI_VOICE = "AI_VOICE";

// 단일 질문: 무의식 OR 무호흡 → CPR / 둘 다 정상 → AI 음성 추천 (두 단계로 나누지 않음)
export const TRIAGE: Record<string, TriageNode> = {
  Q1: {
    id: "Q1",
    prompt: "환자가 반응이 있고, 숨도 정상적으로 쉬나요?",
    options: [
      { label: "아니요. 반응이 없거나 숨을 안 쉬어요", protocolId: "P-CPR" },
      { label: "네. 반응도 있고 숨도 쉬어요", next: AI_VOICE },
    ],
  },
};
