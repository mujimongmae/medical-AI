import { useEffect, useRef, useState } from "react";
import type { DownMessage } from "@lib/protocol/messages";
import { connectWs, type WsHandle } from "../lib/wsClient";
import { triggerFall } from "../lib/api";

type State =
  | { kind: "idle" }
  | { kind: "alerting"; eventId: string; timeoutSec: number };

export default function PatientView({ id, name }: { id: string; name: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const ws = useRef<WsHandle | null>(null);

  useEffect(() => {
    ws.current = connectWs(id, (m: DownMessage) => {
      if (m.type === "ALERT_SELF")
        setState({ kind: "alerting", eventId: m.eventId, timeoutSec: m.timeoutSec });
      else if (m.type === "EVENT_RESOLVED") setState({ kind: "idle" });
    });
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

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h2 className="text-xl font-bold">{name} 님, 안녕하세요</h2>
      <p className="text-lg text-gray-600">
        평소에는 이 화면만 켜두시면 됩니다. 이상이 감지되면 큰 알림이 울립니다.
      </p>
      <div className="mt-4 rounded-lg bg-safe/10 p-4 text-safe">● 정상 감시 중</div>

      {/* 데모용 mock 트리거 (추후 실제 영상인식으로 대체) */}
      <button
        className="mt-8 rounded-xl border-2 border-dashed border-danger px-6 py-4 text-lg font-bold text-danger"
        onClick={() => triggerFall(id)}
      >
        [데모] 쓰러짐 발생 시뮬레이션
      </button>
    </div>
  );
}

function AlertScreen({
  seconds,
  onDismiss,
}: {
  seconds: number;
  onDismiss: () => void;
}) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    // 큰 알림음 (반복 비프) + 진동
    const ctx = new AudioContext();
    const beep = () => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.25);
    };
    beep();
    const beepTimer = setInterval(beep, 700);
    navigator.vibrate?.([400, 200, 400, 200, 400]);

    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => {
      clearInterval(beepTimer);
      clearInterval(tick);
      ctx.close();
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 bg-danger p-6 text-white">
      <p className="text-2xl font-bold">괜찮으신가요?</p>
      <p className="text-center text-xl">
        {left}초 안에 아래 버튼을 누르지 않으면
        <br />
        119와 이웃에게 자동으로 도움을 요청합니다.
      </p>
      <button
        className="rounded-2xl bg-white px-10 py-8 text-3xl font-extrabold text-danger"
        onClick={onDismiss}
      >
        괜찮아요 (해제)
      </button>
    </div>
  );
}
