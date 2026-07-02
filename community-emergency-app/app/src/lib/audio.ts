// iOS/Safari 오디오 자동재생 제약 대응.
// iOS는 "사용자 제스처 없이 소리 재생"을 막는다. 역할 선택 등 사용자 탭 시점에 AudioContext를
// 미리 만들고 resume해 두면, 이후(예: 응급 알림 사이렌)에 재생이 허용된다.
let ctx: AudioContext | null = null;

/** 사용자 제스처(탭) 안에서 호출 — 오디오를 "무장"한다. */
export function primeAudio(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** 미리 무장된 AudioContext 반환(없으면 null). 공유 인스턴스이므로 close 하지 말 것. */
export function getPrimedCtx(): AudioContext | null {
  if (ctx && ctx.state === "suspended") void ctx.resume();
  return ctx;
}
