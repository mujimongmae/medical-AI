import { Capacitor } from "@capacitor/core";

export interface SttHandle {
  stop: () => void;
}
export type SttError = "unsupported" | "denied" | "failed";

// 모듈 싱글턴 — 브라우저는 동시 음성인식 세션을 허용하지 않으므로,
// 새 세션 시작 전 기존 세션을 반드시 종료 (React StrictMode 이중 mount 대응).
let currentStop: (() => void) | null = null;

// 통합 음성인식: 네이티브=Capacitor 플러그인(권한 요청 포함), 웹=Web Speech API, 둘 다 없으면 unsupported.
// onText는 인식 중간/최종 텍스트를 계속 갱신. 실패/미지원은 onError.
// 견고화: 자체 stop으로 인한 aborted·일시적 no-speech는 실패로 치지 않고,
// 세션이 저절로 끝나면(onend) 자동 재시작한다. 연속 3회 실패 시에만 failed.
export async function startStt(
  onText: (t: string) => void,
  onError: (e: SttError) => void,
): Promise<SttHandle | null> {
  currentStop?.();
  currentStop = null;

  // ── 네이티브 (Android/iOS) ──
  if (Capacitor.isNativePlatform()) {
    try {
      const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        onError("denied");
        return null;
      }
      await SpeechRecognition.removeAllListeners();
      await SpeechRecognition.addListener("partialResults", (data: { matches?: string[] }) => {
        if (data?.matches?.length) onText(data.matches[0]);
      });
      await SpeechRecognition.start({
        language: "ko-KR",
        partialResults: true,
        popup: false,
      });
      const stop = () => {
        if (currentStop === stop) currentStop = null;
        void SpeechRecognition.stop();
        void SpeechRecognition.removeAllListeners();
      };
      currentStop = stop;
      return { stop };
    } catch {
      onError("failed");
      return null;
    }
  }

  // ── 웹 브라우저 (Web Speech API) ──
  const w = window as unknown as {
    SpeechRecognition?: new () => WebSR;
    webkitSpeechRecognition?: new () => WebSR;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    onError("unsupported");
    return null;
  }
  try {
    const rec = new Ctor();
    let stopped = false; // 우리가 의도적으로 멈췄는가 (자동 재시작 차단)
    let failCount = 0;
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      failCount = 0; // 실제로 들리고 있으면 실패 카운트 리셋
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      onText(t);
    };
    rec.onerror = (ev) => {
      const err = ev.error ?? "";
      // aborted: 자체 stop/세션 교체로 발생 — 실패 아님. no-speech: 침묵 — onend가 재시작.
      if (err === "aborted" || err === "no-speech") return;
      if (err === "not-allowed" || err === "service-not-allowed") {
        stopped = true;
        onError("denied");
        return;
      }
      // network 등 일시 오류: 연속 3회까지는 onend 자동 재시작에 맡긴다
      failCount += 1;
      if (failCount >= 3) {
        stopped = true;
        onError("failed");
      }
    };
    // 브라우저가 인식을 저절로 끝내면(침묵·일시 오류 등) 조용히 재시작 — 사용자가 멈추기 전까지 계속 듣는다
    rec.onend = () => {
      if (stopped) return;
      window.setTimeout(() => {
        if (stopped) return;
        try {
          rec.start();
        } catch {
          /* 이미 시작된 상태 등 — 다음 onend에서 재시도 */
        }
      }, 300);
    };
    rec.start();
    const stop = () => {
      if (currentStop === stop) currentStop = null;
      stopped = true;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
    currentStop = stop;
    return { stop };
  } catch {
    onError("failed");
    return null;
  }
}

interface WebSR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
