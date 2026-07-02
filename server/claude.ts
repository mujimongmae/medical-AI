// Claude 프록시 — 온디바이스 STT 텍스트 → 짧은 상황 요약 (POST /api/voice 용).
// ⚠️ 키는 서버 환경변수(ANTHROPIC_API_KEY)에서만. 클라이언트 노출 금지.
// 키가 없거나 호출 실패 시 graceful fallback(에코 요약)으로 항상 응답 → 빌드·실행·데모가 깨지지 않음.
// 안전: 진단·처방 금지. 이 요약은 '전달용 상황 정리'일 뿐, 위험도 분기는 lib/first-aid triage.ts가 담당.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

/** 문장 정리 없이도 항상 뭔가 돌려주는 폴백 요약 (키 없음/실패 시). */
function fallbackSummary(transcript: string): string {
  const t = transcript.trim().replace(/\s+/g, " ");
  if (!t) return "현장 음성 내용이 비어 있습니다. 도착 후 직접 상태를 확인하세요.";
  const clipped = t.length > 140 ? `${t.slice(0, 140)}…` : t;
  return `현장 전언: ${clipped}`;
}

const SYSTEM = [
  "당신은 마을 응급 상황에서 현장 목격자의 음성(STT 텍스트)을 응급대응 이웃·구급대에게 전달하기 위해 정리하는 보조자입니다.",
  "규칙:",
  "- 한국어로, 큰따옴표·머리말 없이 1~2문장으로 핵심만 요약합니다.",
  "- 의학적 진단·병명 추정·처방을 하지 마세요. 들은 사실(증상·의식·호흡·출혈·위치 등)만 객관적으로 정리합니다.",
  "- 정보가 부족하면 추측하지 말고 '추가 확인 필요'라고 적습니다.",
  "- 응급처치 판단은 별도 결정트리가 담당하므로, 지시나 조치를 만들어내지 마세요.",
].join("\n");

/**
 * transcript를 Claude로 짧게 요약. 키 없으면 fallback.
 * @param transcript 온디바이스 STT 결과 텍스트
 * @param context 선택: 환자 병력 요약 등(합성) — 요약 맥락용
 */
export async function summarizeVoice(
  transcript: string,
  context?: string,
): Promise<{ summary: string; source: "claude" | "fallback" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { summary: fallbackSummary(transcript), source: "fallback" };

  try {
    const client = new Anthropic({ apiKey });
    const userText = context
      ? `환자 병력(합성, 참고용): ${context}\n\n현장 음성(STT): ${transcript}`
      : `현장 음성(STT): ${transcript}`;
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      thinking: { type: "disabled" }, // 짧은 요약 — 지연 최소화, 결정적 출력
      system: SYSTEM,
      messages: [{ role: "user", content: userText }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text
      ? { summary: text, source: "claude" }
      : { summary: fallbackSummary(transcript), source: "fallback" };
  } catch {
    // 네트워크/키/한도 등 어떤 실패든 데모가 멈추지 않게 폴백
    return { summary: fallbackSummary(transcript), source: "fallback" };
  }
}
