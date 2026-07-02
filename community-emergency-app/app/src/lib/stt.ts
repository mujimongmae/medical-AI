import { Capacitor } from "@capacitor/core";

export interface SttHandle {
  stop: () => void;
}
export type SttError = "unsupported" | "denied" | "failed";

// 통합 음성인식: 네이티브=Capacitor 플러그인(권한 요청 포함), 웹=Web Speech API, 둘 다 없으면 unsupported.
// onText는 인식 중간/최종 텍스트를 계속 갱신. 실패/미지원은 onError.
export async function startStt(
  onText: (t: string) => void,
  onError: (e: SttError) => void,
): Promise<SttHandle | null> {
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
      return {
        stop: () => {
          void SpeechRecognition.stop();
          void SpeechRecognition.removeAllListeners();
        },
      };
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
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      onText(t);
    };
    rec.onerror = (ev) => {
      onError(ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "denied" : "failed");
    };
    rec.start();
    return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
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
}
