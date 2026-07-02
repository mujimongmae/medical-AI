// Claude 프록시 — 온디바이스 STT 텍스트 + 환자 병력 → 가장 가능성 높은 상태 + 추천 응급처치.
// (spec/03-logic/02-first-aid-protocol.md §4.2, POST /api/voice 용)
// ⚠️ 키는 서버 env(ANTHROPIC_API_KEY)만. 키 없거나 실패 시 graceful fallback → 항상 응답.
// 안전: 확정 진단 금지("~가능성이 높아요"), 119/구급대 지시 우선. 생명 직결(CPR 여부)은 규칙(triage.ts)이 담당.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

export interface VoiceRecommendation {
  summary: string;
  likelyCondition: string;
  recommendation: string;
  protocolId?: string;
  source: "claude" | "fallback";
}

// AI가 추천으로 매핑할 수 있는 지식베이스 (CPR/AED는 규칙 경로라 제외)
const ALLOWED = ["P-CHOKING", "P-STROKE", "P-BLEED", "P-SEIZURE", "P-SYNCOPE", "P-RECOVERY"];

function fallback(transcript: string): VoiceRecommendation {
  const t = transcript.trim().replace(/\s+/g, " ");
  return {
    summary: t ? `현장 전언: ${t.length > 120 ? t.slice(0, 120) + "…" : t}` : "음성 내용이 비어 있습니다.",
    likelyCondition: "상태 확인이 더 필요합니다",
    recommendation: "환자 곁에서 상태를 지켜보며 119(구급상황실) 안내를 따라 주세요.",
    source: "fallback",
  };
}

const SYSTEM = [
  "당신은 마을 응급 상황에서 비전문가(주로 어르신)를 돕는 응급처치 보조자입니다.",
  "목격자의 음성 설명(STT)과 환자 병력을 종합해, 가장 가능성 높은 상태 하나와 그에 맞는 응급처치를 추천합니다.",
  "반드시 아래 JSON만 출력합니다(다른 말 없이):",
  '{"summary": string, "likelyCondition": string, "recommendation": string, "protocolId": string|null}',
  "규칙:",
  "- 한국어. 어르신이 읽기 쉽게 아주 짧고 명확하게(각 필드 1~2문장, 큰 글씨용).",
  "- 확정 진단 금지: '…입니다'가 아니라 '…가능성이 높아요'.",
  "- recommendation은 지금 당장 할 수 있는 행동 중심. 위험하거나 불확실하면 '119(구급상황실)에 물어보세요'.",
  "- protocolId는 다음 중 해당하면 하나, 없으면 null: " + ALLOWED.join(", "),
  "- summary는 구급대 전달용 객관적 상황 정리(증상·의식·호흡·출혈·위치 등).",
].join("\n");

export async function recommendVoice(
  transcript: string,
  context?: string,
): Promise<VoiceRecommendation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback(transcript);

  try {
    const client = new Anthropic({ apiKey });
    const userText = context
      ? `환자 병력(합성, 참고): ${context}\n\n현장 음성(STT): ${transcript}`
      : `현장 음성(STT): ${transcript}`;
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      thinking: { type: "disabled" },
      system: SYSTEM,
      messages: [{ role: "user", content: userText }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as Partial<VoiceRecommendation>;
    const pid =
      parsed.protocolId && ALLOWED.includes(parsed.protocolId)
        ? parsed.protocolId
        : undefined;
    if (!parsed.recommendation || !parsed.likelyCondition) return fallback(transcript);
    return {
      summary: parsed.summary ?? fallback(transcript).summary,
      likelyCondition: parsed.likelyCondition,
      recommendation: parsed.recommendation,
      protocolId: pid,
      source: "claude",
    };
  } catch {
    return fallback(transcript);
  }
}
