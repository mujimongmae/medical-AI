import { useEffect, useRef, useState } from "react";
import type { DownMessage } from "@lib/protocol/messages";
import { connectWs, type WsHandle } from "../lib/wsClient";
import { getPrimedCtx } from "../lib/audio";

type State =
  | { kind: "idle" }
  | { kind: "alerting"; eventId: string; timeoutSec: number };

export default function PatientView({ id, name }: { id: string; name: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [connected, setConnected] = useState(false);
  const ws = useRef<WsHandle | null>(null);

  useEffect(() => {
    ws.current = connectWs(
      id,
      (m: DownMessage) => {
        if (m.type === "ALERT_SELF")
          setState({ kind: "alerting", eventId: m.eventId, timeoutSec: m.timeoutSec });
        else if (m.type === "EVENT_RESOLVED") setState({ kind: "idle" });
      },
      setConnected,
    );
    return () => ws.current?.close();
  }, [id]);

  if (state.kind === "alerting") {
    return (
      <AlertScreen
        seconds={state.timeoutSec}
        onDismiss={() => {
          ws.current?.send({ type: "SELF_CANCEL", eventId: state.eventId });
          setState({ kind: "idle" });
        }}
      />
    );
  }

  return <IdleScreen name={name} connected={connected} />;
}

// ─────────────────────────────────────────────────────────────
// 평상시 화면 — 감시 상태 표시. 쓰러짐은 홈캠(영상인식)이 자동 감지 → ALERT_SELF.
// ─────────────────────────────────────────────────────────────
function IdleScreen({
  name,
  connected,
}: {
  name: string;
  connected: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h2 className="text-2xl font-bold">{name} 님, 안녕하세요</h2>

      {connected ? (
        <div className="pill-ok flex items-center gap-3 rounded-2xl p-5 text-xl font-bold">
          <span className="text-2xl leading-none">●</span> 정상 상태입니다
        </div>
      ) : (
        <div className="pill-wait flex items-center gap-3 rounded-2xl p-5 text-xl font-bold">
          <span className="text-2xl leading-none">●</span> 연결 대기 중…
        </div>
      )}
      {!connected && (
        <p className="text-base text-gray-500">
          서버에 연결되면 자동으로 감시가 시작됩니다. 잠시만 기다려 주세요.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 15초 알림 — 초대형 카운트다운 + 큰 알림음/진동 + 초대형 해제 버튼
// ─────────────────────────────────────────────────────────────
function AlertScreen({
  seconds,
  onDismiss,
}: {
  seconds: number;
  onDismiss: () => void;
}) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    // 사이렌 소리(두 음 왕복) + 진동. 오디오 미지원/차단이어도 앱은 계속 동작.
    // iOS 대비: 역할 선택 때 무장해 둔 AudioContext를 재사용(없으면 새로 생성).
    const primed = getPrimedCtx();
    let ctx: AudioContext | null = primed;
    let ownsCtx = false;
    let osc: OscillatorNode | null = null;
    try {
      if (!ctx) {
        ctx = new AudioContext();
        ownsCtx = true;
      }
      void ctx.resume?.();
      osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 700;
      g.gain.value = 0.5;
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
    } catch {
      ctx = null;
      osc = null;
    }

    let high = false;
    const sweep = () => {
      if (!ctx || !osc) return;
      const t = ctx.currentTime;
      try {
        osc.frequency.cancelScheduledValues(t);
        osc.frequency.setValueAtTime(high ? 1100 : 650, t);
        osc.frequency.linearRampToValueAtTime(high ? 650 : 1100, t + 0.6);
      } catch {
        /* noop */
      }
      high = !high;
    };
    sweep();
    const sirenTimer = window.setInterval(sweep, 600);
    const vib = window.setInterval(() => navigator.vibrate?.([500, 150]), 700);
    navigator.vibrate?.([500, 150]);
    const tick = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);

    return () => {
      clearInterval(sirenTimer);
      clearInterval(vib);
      clearInterval(tick);
      navigator.vibrate?.(0);
      try {
        osc?.stop();
      } catch {
        /* noop */
      }
      if (ownsCtx) ctx?.close().catch(() => {}); // 무장된 공유 ctx는 닫지 않음
    };
  }, []);

  const requested = left === 0;

  return (
    <div
      className={`flex min-h-full flex-col items-center justify-center gap-8 p-6 text-white ${
        requested ? "bg-safe" : "bg-danger"
      }`}
    >
      {!requested ? (
        <>
          <p className="text-3xl font-extrabold">괜찮으신가요?</p>
          <div className="flex h-48 w-48 items-center justify-center rounded-full border-8 border-white/70">
            <span className="text-7xl font-extrabold tabular-nums">{left}</span>
          </div>
          <p className="text-center text-xl leading-relaxed">
            이 시간 안에 아래 버튼을 누르지 않으면
            <br />
            119와 이웃에게 자동으로 도움을 요청합니다.
          </p>
        </>
      ) : (
        <>
          <p className="text-3xl font-extrabold">도움을 요청했습니다</p>
          <p className="text-center text-xl leading-relaxed">
            119와 가까운 이웃에게 알렸습니다.
            <br />
            곧 도움이 도착합니다. 조금만 기다려 주세요.
          </p>
        </>
      )}

      <button
        className="w-full max-w-sm rounded-2xl bg-white px-10 py-8 text-3xl font-extrabold text-gray-900 shadow-lg active:scale-95"
        onClick={onDismiss}
      >
        {requested ? "괜찮아졌어요 (해제)" : "괜찮아요 (해제)"}
      </button>
    </div>
  );
}
