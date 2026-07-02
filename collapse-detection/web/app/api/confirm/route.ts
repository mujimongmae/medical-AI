// ============================================================================
// Claude Vision 2차 확인 레이어 (server route handler).
//
// 1차 탐지(포즈/상태머신)가 쓰러짐 후보를 올리면, 이 라우트가 키프레임 몇 장을
// Claude에 보내 "실제로 쓰러져 움직이지 않는 응급 상황인지"를 판정한다.
// 진단이 아니라 119 신고 판단 보조다.
//
// 안전 규칙:
//  - ANTHROPIC_API_KEY 없으면 앱이 죽지 않게 즉시 skipped 반환.
//  - 어떤 예외가 나도 절대 500을 던지지 않고 항상 200 JSON을 준다.
//  - 실제 환자 정보 저장/로깅 금지 (키프레임은 클라이언트에서만 다룬다).
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { EmergencyEvent } from "@/lib/types";

export const runtime = "nodejs";

/** confirmation 페이로드 (types.ts의 EmergencyEvent["confirmation"]와 동일 shape). */
type Confirmation = NonNullable<EmergencyEvent["confirmation"]>;

interface Signals {
  transition: unknown;
  zone: unknown;
  immobileSeconds: unknown;
  posture: unknown;
}

interface ConfirmRequest {
  keyframes: string[];
  signals: Signals;
}

/** API 키가 없을 때 / 확인을 건너뛸 때의 표준 응답. */
function skipped(reason: string): Confirmation {
  return {
    source: "skipped",
    fallen: false,
    motionless: false,
    needsHelp: false,
    confidence: 0,
    reason,
  };
}

/** Claude tool_use 입력을 확인 페이로드로 정규화한다. */
function normalize(input: Record<string, unknown>): Confirmation {
  return {
    source: "claude",
    fallen: Boolean(input.fallen),
    motionless: Boolean(input.motionless),
    needsHelp: Boolean(input.needsHelp),
    confidence:
      typeof input.confidence === "number" && Number.isFinite(input.confidence)
        ? input.confidence
        : 0,
    reason: typeof input.reason === "string" ? input.reason : "",
  };
}

export async function POST(req: Request): Promise<Response> {
  // API 키 없으면 아무것도 하지 않고 앱이 계속 돌게 한다.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(skipped("API 키 미설정(확인 생략)"));
  }

  try {
    const body = (await req.json()) as Partial<ConfirmRequest>;
    const keyframes = Array.isArray(body?.keyframes) ? body.keyframes : [];
    const signals = body?.signals ?? {};

    if (keyframes.length === 0) {
      return NextResponse.json(skipped("키프레임 없음(확인 생략)"));
    }

    const client = new Anthropic();

    const images = keyframes.slice(0, 6).map((u) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: u.replace(/^data:image\/\w+;base64,/, ""),
      },
    }));

    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      tools: [
        {
          name: "report_collapse",
          description:
            "홈캠 키프레임을 보고 사람이 실제로 쓰러져 움직이지 않는 응급 상황인지 판정",
          input_schema: {
            type: "object",
            properties: {
              fallen: { type: "boolean" },
              motionless: { type: "boolean" },
              needsHelp: { type: "boolean" },
              confidence: { type: "number" },
              reason: { type: "string" },
            },
            required: ["fallen", "motionless", "needsHelp", "confidence", "reason"],
            additionalProperties: false,
          },
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: "report_collapse" },
      messages: [
        {
          role: "user",
          content: [
            ...images,
            {
              type: "text",
              text:
                "홈캠 순차 키프레임이다. 사람이 갑자기 쓰러져(무너지듯/실신하듯) 움직이지 않는 응급 상황인지 판정하라. 진단이 아니라 119 신고 판단 보조다.\n" +
                "- fallen: 사람이 통제 불능으로 무너져 내렸으면 true. **바닥뿐 아니라 소파·침대·의자 위로 쓰러진 경우도 포함**한다. 스스로 편하게 앉거나 눕는 '의도적·안정적' 자세는 false.\n" +
                "- 구분 단서: 급격/부자연스러운 하강, 어색하게 늘어진(slumped) 끝자세, 이후 무반응. 아래 신호가 급격(abrupt)이고 무동작이 지속됐다면, 가구 위여도 fallen=true 쪽으로 판단하라(명백히 편안한 자세가 아니면).\n" +
                "- motionless: 움직임이 없으면 true. needsHelp: 쓰러져 무반응으로 도움이 필요해 보이면 true.\n" +
                "report_collapse로만 답하라. 신호(전이/구역/무동작초/자세): " +
                JSON.stringify(signals),
            },
          ],
        },
      ],
    });

    const toolUse = msg.content.find(
      (block): block is Extract<typeof block, { type: "tool_use" }> =>
        block.type === "tool_use" && block.name === "report_collapse",
    );

    if (!toolUse) {
      return NextResponse.json(skipped("확인 실패"));
    }

    return NextResponse.json(
      normalize(toolUse.input as Record<string, unknown>),
    );
  } catch {
    // 타임아웃/네트워크/파싱 등 어떤 실패도 앱을 죽이지 않는다.
    return NextResponse.json(skipped("확인 실패"));
  }
}
