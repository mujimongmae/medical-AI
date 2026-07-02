// ============================================================================
// Claude 2차 확인 레이어 — 클라이언트 헬퍼.
//
// 상태머신이 쓰러짐 후보를 올릴 때, 키프레임 몇 장을 /api/confirm 으로 보내
// Claude 판정 결과를 받아온다. 네트워크가 죽거나 서버가 이상해도 앱이 계속
// 돌아가도록 항상 skipped 폴백을 준다(절대 throw 하지 않음).
// ============================================================================

import type { EmergencyEvent } from "@/lib/types";

/** 확인 결과 shape (types.ts의 EmergencyEvent["confirmation"]와 동일). */
type Confirmation = NonNullable<EmergencyEvent["confirmation"]>;

/** 상태머신이 넘겨주는 신호 (EmergencyEvent["signals"]와 동일). */
type ConfirmSignals = EmergencyEvent["signals"];

/** 네트워크/서버 실패 시 표준 폴백. */
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

/**
 * 키프레임 + 신호를 /api/confirm 으로 보내 Claude 판정을 받는다.
 * @param keyframes JPEG data URL 배열 ("data:image/jpeg;base64,..").
 * @param signals   상태머신 신호(전환 방식/구역/부동 초/자세).
 * @returns Claude 판정 또는 skipped 폴백. 실패해도 throw 하지 않는다.
 */
export async function confirmCollapse(
  keyframes: string[],
  signals: ConfirmSignals,
): Promise<Confirmation> {
  try {
    const res = await fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyframes, signals }),
    });

    if (!res.ok) {
      return skipped("확인 서버 오류(확인 생략)");
    }

    const data = (await res.json()) as Partial<Confirmation> | null;
    if (!data || typeof data.source !== "string") {
      return skipped("확인 응답 형식 오류(확인 생략)");
    }

    return data as Confirmation;
  } catch {
    return skipped("확인 네트워크 실패(확인 생략)");
  }
}
