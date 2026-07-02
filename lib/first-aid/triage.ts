// 트리아지 결정트리 (진입 = 홈캠이 "쓰러진 사람" 감지) — spec/logic/first-aid-protocol.md §4
// 위험도 분기는 이 결정적 데이터로 수행. LLM은 안내 문구 자연화·보조 질의응답에만 사용.
import type { TriageNode } from "./schema";

export const TRIAGE_ROOT = "T0";

export const TRIAGE: Record<string, TriageNode> = {
  T0: {
    id: "T0",
    prompt: "현장이 안전한가요? (차량·전기·화재·추락 위험 확인)",
    hint: "위험하면 안전한 곳으로 옮긴 뒤 진행하세요.",
    options: [
      { label: "안전함 — 다가가겠습니다", next: "T1" },
      { label: "위험함", next: "T0-danger" },
    ],
  },
  "T0-danger": {
    id: "T0-danger",
    prompt: "먼저 119에 신고하고, 안전이 확보되면 접근하세요.",
    hint: "본인 안전이 최우선입니다. 무리하게 진입하지 마세요.",
    options: [{ label: "안전 확보됨", next: "T1" }],
  },
  T1: {
    id: "T1",
    prompt:
      "양쪽 어깨를 두드리며 크게 불러보세요. 반응(눈뜸·움직임·대답)이 있나요?",
    options: [
      { label: "무반응", next: "T2" },
      { label: "반응 있음", next: "T5" },
    ],
  },
  T2: {
    id: "T2",
    prompt:
      "119에 신고하고 자동심장충격기(AED)를 요청하세요. (주변 사람을 특정해 지목)",
    hint: "혼자면 스피커폰으로 119와 통화하며 진행합니다.",
    options: [{ label: "신고했습니다", next: "T3" }],
  },
  T3: {
    id: "T3",
    prompt:
      "10초 안에 호흡을 확인하세요. 가슴·배가 정상적으로 오르내리나요? (헐떡임은 비정상)",
    hint: "헐떡이듯 이상하게 쉬면 '없음'으로 판단하세요.",
    options: [
      { label: "무호흡 또는 비정상(헐떡임)", protocolId: "P-CPR" },
      { label: "정상 호흡", next: "T4" },
    ],
  },
  // 무반응이지만 호흡이 있는 상태 — 회복자세로 보내기 전에 눈에 보이는 위중 징후를 먼저 분기
  // (경련·대량출혈 환자가 회복자세로 흡수되어 해당 프로토콜에 못 가던 결함 보정)
  T4: {
    id: "T4",
    prompt: "숨은 쉽니다. 눈에 보이는 다음 징후가 있나요?",
    hint: "119는 이미 신고된 상태입니다. 해당 징후가 있으면 그 처치를 먼저 하세요.",
    options: [
      { label: "전신이 떨리거나 뻣뻣한 경련", protocolId: "P-SEIZURE" },
      { label: "멈추지 않는 심한 출혈", protocolId: "P-BLEED" },
      { label: "특별한 징후 없음", protocolId: "P-RECOVERY" },
    ],
  },
  T5: {
    id: "T5",
    prompt: "가장 두드러진 증상은 무엇인가요?",
    hint: "여러 개면 가장 위급해 보이는 것을 고르세요. 확실치 않으면 119에 물어보며 진행하세요.",
    options: [
      { label: "목을 움켜쥠 · 숨/기침/말을 못 함 (질식)", protocolId: "P-CHOKING" },
      { label: "한쪽 얼굴 처짐 · 팔 마비 · 말 어눌 (뇌졸중)", protocolId: "P-STROKE" },
      { label: "멈추지 않는 심한 출혈", protocolId: "P-BLEED" },
      { label: "전신 경련 · 발작", protocolId: "P-SEIZURE" },
      { label: "잠깐 정신을 잃음 · 어지러움 (실신)", protocolId: "P-SYNCOPE" },
    ],
  },
};
