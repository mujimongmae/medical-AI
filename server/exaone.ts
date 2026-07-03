// 로컬 EXAONE 프록시 — 온디바이스 STT 텍스트 + 환자 병력 → 프로토콜 ID "분류만" (+ 클래스별 확률).
// (spec/logic/02-voice-protocol-classification.md, POST /api/voice 용)
// ⚠️ LLM은 처치 내용을 생성하지 않는다. 처치 문구는 전부 코드가 공인 가이드라인 KB
//    (lib/first-aid/protocols.ts — KACPR 2020·AHA 2020·대한적십자사)에서 조립한다.
// 안전: 확정 진단 금지("~가능성이 높아요"), 화이트리스트 검증, Ollama 실패 시 graceful fallback → 항상 응답.
// 생명 직결(CPR/AED)은 규칙(lib/first-aid/triage.ts)이 담당 — LLM 경로에서 제외.
import { PROTOCOLS } from "../lib/first-aid/protocols";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.EXAONE_MODEL ?? "exaone3.5:2.4b";
const TIMEOUT_MS = 15000;

export interface VoiceRecommendation {
  summary: string;
  likelyCondition: string;
  recommendation: string;
  protocolId?: string;
  /** 클래스별 확률 (모델 자기보고값, 0~1). UI에서 "분류 근거" 표시용 */
  probs?: Record<string, number>;
  source: "exaone" | "fallback";
}

// LLM이 분류할 수 있는 화이트리스트 (CPR/AED는 규칙 경로라 제외)
const ALLOWED = ["P-CHOKING", "P-STROKE", "P-BLEED", "P-SEIZURE", "P-SYNCOPE", "P-RECOVERY"];
const CLASSES = [...ALLOWED, "NONE"];

// ID → 어르신용 상태명 ("~가능성이 높아요" 앞에 붙는 말)
const CONDITION_LABEL: Record<string, string> = {
  "P-CHOKING": "기도폐쇄(질식)",
  "P-STROKE": "뇌졸중",
  "P-BLEED": "심한 출혈",
  "P-SEIZURE": "발작·경련",
  "P-SYNCOPE": "실신·기절",
  "P-RECOVERY": "의식이 흐려진 상태(호흡 있음)",
};

// 분류 전용 시스템 프롬프트 — temperature 0 + Ollama JSON 모드로 실측 검증 완료본(7케이스). 수정 시 재검증할 것.
const SYSTEM = [
  "당신은 응급 상황 분류기입니다. 목격자의 설명을 읽고 반드시 아래 JSON 형식만 출력하세요. 다른 말은 절대 하지 마세요.",
  '{"id": "가장 가능성 높은 ID", "probs": {"P-CHOKING": 0.0, "P-STROKE": 0.0, "P-BLEED": 0.0, "P-SEIZURE": 0.0, "P-SYNCOPE": 0.0, "P-RECOVERY": 0.0, "NONE": 0.0}}',
  "probs는 각 클래스일 확률(0~1, 합=1).",
  "분류 기준:",
  "P-CHOKING: 음식/이물질로 기도가 막힘, 목을 움켜쥠, 숨/말/기침을 못 함",
  "P-STROKE: 얼굴 처짐, 팔 마비, 발음 어눌함(뇌졸중 의심)",
  "P-BLEED: 심한 출혈, 피가 멈추지 않음",
  "P-SEIZURE: 발작·경련 — 몸을 떨거나 뻣뻣해짐, 입에 거품, 눈 돌아감 (쓰러졌더라도 떨림/경련이 있으면 무조건 P-SEIZURE)",
  "P-SYNCOPE: 실신·기절 — 떨림 없이 잠깐 의식을 잃고 쓰러짐, 곧 깨어남",
  "P-RECOVERY: 의식이 흐리지만 호흡은 있음 (떨림·경련 없음)",
  "NONE: 위 어디에도 해당 없음",
].join("\n");

function summarize(transcript: string, context?: string): string {
  const t = transcript.trim().replace(/\s+/g, " ");
  const head = t ? `현장 전언: ${t.length > 120 ? t.slice(0, 120) + "…" : t}` : "음성 내용이 비어 있습니다.";
  return context ? `${head} / 병력(합성): ${context}` : head;
}

function fallback(transcript: string, context?: string): VoiceRecommendation {
  return {
    summary: summarize(transcript, context),
    likelyCondition: "상태 확인이 더 필요합니다",
    recommendation: "환자 곁에서 상태를 지켜보며 119(구급상황실) 안내를 따라 주세요.",
    source: "fallback",
  };
}

/** 검증된 프로토콜 KB에서 응답 문구 조립 — LLM 미개입 구간 */
function fromProtocol(
  id: string,
  probs: Record<string, number>,
  transcript: string,
  context?: string,
): VoiceRecommendation {
  const p = PROTOCOLS.find((x) => x.id === id);
  if (!p) return fallback(transcript, context);
  const firstStep = p.steps[0]?.title ?? "";
  const prefix = p.callEmergencyFirst ? "먼저 119에 신고하세요. " : "";
  return {
    summary: summarize(transcript, context),
    likelyCondition: `${CONDITION_LABEL[id] ?? p.name} 가능성이 높아요`,
    recommendation: `${prefix}'${p.name}'을 시작하세요. 첫 단계: ${firstStep}`,
    protocolId: id,
    probs,
    source: "exaone",
  };
}

interface ClassifyResult {
  id: string | null; // 화이트리스트 통과 ID (NONE/불명이면 null)
  probs: Record<string, number>;
}

/** Ollama /api/chat (JSON 모드, temperature 0) → {id, probs} 수신 + 검증 */
async function classify(transcript: string, context?: string): Promise<ClassifyResult> {
  const userText = context
    ? `환자 병력(합성, 참고): ${context}\n현장 음성(STT): ${transcript}`
    : `현장 음성(STT): ${transcript}`;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: "json", // Ollama JSON 모드 — 유효한 JSON 출력 강제
      options: { temperature: 0, num_predict: 200 },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userText },
      ],
    }),
  });
  if (!res.ok) return { id: null, probs: {} };

  const data = (await res.json()) as { message?: { content?: string } };
  const parsed = JSON.parse(data.message?.content ?? "{}") as {
    id?: string;
    probs?: Record<string, unknown>;
  };

  // probs 정제: 알려진 클래스만, 숫자만, 0~1 클램프
  const probs: Record<string, number> = {};
  for (const c of CLASSES) {
    const v = parsed.probs?.[c];
    if (typeof v === "number" && Number.isFinite(v)) probs[c] = Math.min(1, Math.max(0, v));
  }

  // id 화이트리스트 검증 — 불일치 시 probs 최댓값으로 보정, 그래도 없으면 null
  let id = parsed.id && ALLOWED.includes(parsed.id) ? parsed.id : null;
  if (!id) {
    const top = ALLOWED.filter((c) => (probs[c] ?? 0) > 0).sort(
      (a, b) => (probs[b] ?? 0) - (probs[a] ?? 0),
    )[0];
    if (top && (probs[top] ?? 0) >= 0.5) id = top;
  }
  return { id, probs };
}

export async function recommendVoice(
  transcript: string,
  context?: string,
): Promise<VoiceRecommendation> {
  try {
    const { id, probs } = await classify(transcript, context);
    if (!id) return { ...fallback(transcript, context), probs };
    return fromProtocol(id, probs, transcript, context);
  } catch {
    return fallback(transcript, context);
  }
}
