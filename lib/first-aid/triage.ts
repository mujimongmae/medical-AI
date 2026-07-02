// 트리아지 결정트리 — 진입 = 홈캠이 "쓰러짐" 감지 (spec/logic/first-aid-protocol.md §4)
// 전제: 119 신고는 자동. 트리아지는 신고 단계를 두지 않고 CPR 판단까지 최소 질문(반응→호흡)으로 도달.
// 위험도 분기는 이 결정적 데이터로 수행. LLM은 안내 문구 자연화·보조 질의응답에만 사용.
import type { TriageNode } from "./schema";

export const TRIAGE_ROOT = "Q1";

export const TRIAGE: Record<string, TriageNode> = {
  // ── 최단 CPR 경로: Q1(반응) → Q2(호흡) → P-CPR (질문 2개) ──
  Q1: {
    id: "Q1",
    prompt: "어깨를 두드리며 크게 불러보세요. 반응(눈뜸·움직임·대답)이 있나요?",
    hint: "119는 자동으로 신고됩니다. 현장이 위험하면 안전부터 확보하세요.",
    options: [
      { label: "무반응", next: "Q2" },
      { label: "반응이 있음", next: "S1" },
    ],
  },
  Q2: {
    id: "Q2",
    prompt:
      "숨을 정상적으로 쉬나요? 가슴·배가 오르내리는지 10초 안에 확인하세요.",
    hint: "헐떡이듯 이상하게 쉬거나 확실하지 않으면 '아니오'로 판단하세요. 늦는 것보다 낫습니다.",
    options: [
      { label: "아니오 — 숨을 안 쉬거나 헐떡임", protocolId: "P-CPR" },
      { label: "예 — 정상적으로 숨을 쉼", next: "Q3" },
    ],
  },
  // ── 무반응 + 정상호흡: 회복자세 전에 눈에 보이는 위중 징후를 먼저 걸러냄 ──
  Q3: {
    id: "Q3",
    prompt: "숨은 쉽니다. 눈에 보이는 다음 상태가 있나요?",
    hint: "해당 징후가 있으면 그 처치를 먼저 하세요.",
    options: [
      { label: "전신이 떨리거나 뻣뻣한 경련", protocolId: "P-SEIZURE" },
      { label: "멈추지 않는 심한 출혈", protocolId: "P-BLEED" },
      { label: "특별한 징후 없음", protocolId: "P-RECOVERY" },
    ],
  },
  // ── 반응 있음: 환자에게 물어 증상 파악 → 해당 프로토콜 ──
  S1: {
    id: "S1",
    prompt: "환자에게 물어보며 가장 두드러진 증상을 확인하세요. 무엇인가요?",
    hint: "여러 개면 가장 위급해 보이는 것부터. 잘 모르겠으면 '해당 없음'을 고르세요.",
    options: [
      { label: "목을 움켜쥠 · 숨/기침/말을 못 함 (질식)", protocolId: "P-CHOKING" },
      { label: "한쪽 얼굴 처짐 · 팔 마비 · 말 어눌 (뇌졸중 의심)", protocolId: "P-STROKE" },
      { label: "멈추지 않는 심한 출혈", protocolId: "P-BLEED" },
      { label: "잠깐 정신을 잃었다 깸 · 어지러움 (실신)", protocolId: "P-SYNCOPE" },
      { label: "위 증상 없음 / 잘 모르겠음", next: "S1-observe" },
    ],
  },
  "S1-observe": {
    id: "S1-observe",
    prompt:
      "환자를 편한 자세로 안정시키고 곁에서 상태 변화를 지켜보세요. 119 구급상황실 안내에 따르세요.",
    hint: "새 증상이 나타나거나 반응이 없어지면, 처음(반응 확인)부터 다시 확인하세요.",
    // 종착 안내 노드 — 별도 프로토콜 없음
  },
};
