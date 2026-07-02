"use client";

// OWNER: Integrate part. Receiver (app-side demo, phone form factor).
//
// Subscribes to collapse candidates from the event-bus (BroadcastChannel by
// default; Supabase Realtime when configured) and runs the human-in-the-loop
// cancel gate: a big alarm + "정말 쓰러지셨나요? [취소]" + countdown. If no one
// cancels before the countdown ends, it escalates to a simulated 119 + guardian
// contact. Cancel closes the alert.
//
// NOTE(app team): the real 119 dispatch / guardian SMS / location handoff is a
// teammate's part. Everything below the "escalated" divider is a SIMULATION.

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeEmergencyEvents } from "@/lib/event-bus";
import type { EmergencyEvent, Zone } from "@/lib/types";

/** Seconds the resident has to cancel before auto-escalation. */
const COUNTDOWN_SECONDS = 15;

type Phase = "idle" | "confirming" | "escalated" | "cancelled";

export default function ReceiverPage() {
  const [alert, setAlert] = useState<EmergencyEvent | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  // Latest phase for the subscription callback (registered once).
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Subscribe once on mount.
  useEffect(() => {
    const unsub = subscribeEmergencyEvents((event) => {
      // Ignore new candidates while an alert is already being handled.
      if (phaseRef.current === "confirming" || phaseRef.current === "escalated") {
        return;
      }
      setAlert(event);
      setCountdown(COUNTDOWN_SECONDS);
      setPhase("confirming");
    });
    return unsub;
  }, []);

  // Countdown while confirming; escalate at zero.
  useEffect(() => {
    if (phase !== "confirming") return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          setPhase("escalated");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const cancel = useCallback(() => setPhase("cancelled"), []);
  const dismiss = useCallback(() => {
    setPhase("idle");
    setAlert(null);
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      {/* Phone frame */}
      <div className="flex min-h-[640px] w-full max-w-sm flex-col overflow-hidden rounded-[2.5rem] border-4 border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-3 text-xs text-neutral-500">
          <span>쓰러짐 알림</span>
          <span>{phase === "idle" ? "대기 중" : "알림"}</span>
        </div>

        <div className="flex flex-1 flex-col">
          {phase === "idle" && <IdleScreen />}
          {phase === "confirming" && alert && (
            <ConfirmScreen alert={alert} countdown={countdown} onCancel={cancel} />
          )}
          {phase === "escalated" && alert && (
            <EscalatedScreen alert={alert} onDismiss={dismiss} />
          )}
          {phase === "cancelled" && (
            <CancelledScreen onDismiss={dismiss} />
          )}
        </div>

        <p className="px-6 py-3 text-center text-[11px] leading-tight text-neutral-600">
          본 정보는 참고용이며 의학적 진단이 아닙니다. 실제 신고·연락 기능은
          시뮬레이션입니다.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Screens.
// ---------------------------------------------------------------------------

function IdleScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-950 text-4xl">
        🟢
      </div>
      <h2 className="text-xl font-bold text-green-300">정상 감시 중</h2>
      <p className="text-sm text-neutral-400">
        홈캠에서 쓰러짐이 감지되면 이 화면에 즉시 알림이 표시됩니다.
      </p>
    </div>
  );
}

function ConfirmScreen({
  alert,
  countdown,
  onCancel,
}: {
  alert: EmergencyEvent;
  countdown: number;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-4 bg-red-950/40 px-6 py-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="animate-pulse text-5xl">🚨</span>
        <h2 className="text-2xl font-extrabold text-red-300">쓰러짐 감지!</h2>
        <p className="text-lg font-semibold text-red-100">정말 쓰러지셨나요?</p>
      </div>

      {alert.keyframeDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={alert.keyframeDataUrl}
          alt="감지 시점 스냅샷"
          className="max-h-40 w-full rounded-lg border border-red-900 object-cover"
        />
      )}

      <EventFacts alert={alert} />

      <div className="mt-auto flex w-full flex-col items-center gap-3">
        <div className="text-sm text-red-200">
          <span className="text-3xl font-black tabular-nums">{countdown}</span>초
          후 자동으로 119에 신고합니다
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-2xl bg-white py-5 text-xl font-extrabold text-red-700 active:scale-[0.98]"
        >
          저는 괜찮아요 · 취소
        </button>
      </div>
    </div>
  );
}

function EscalatedScreen({
  alert,
  onDismiss,
}: {
  alert: EmergencyEvent;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-5xl">📞</span>
        <h2 className="text-xl font-extrabold text-red-300">
          응급 대응을 시작했습니다
        </h2>
        <p className="text-xs text-neutral-500">(데모 시뮬레이션)</p>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        <SimStep icon="🚑" title="119 신고" desc="위치·상황 정보를 전달했습니다." />
        <SimStep
          icon="👨‍👩‍👧"
          title="보호자 연락"
          desc="등록된 보호자에게 알림을 보냈습니다."
        />
        <SimStep
          icon="📍"
          title="위치 공유"
          desc={`카메라 ${alert.cameraId} · ${zoneKo(alert.signals.zone)} 구역`}
        />
      </ul>

      <EventFacts alert={alert} />

      <button
        type="button"
        onClick={onDismiss}
        className="mt-auto w-full rounded-2xl border border-neutral-700 py-4 text-lg font-semibold hover:bg-neutral-800"
      >
        상황 종료
      </button>
    </div>
  );
}

function CancelledScreen({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-5xl">✅</span>
      <h2 className="text-xl font-bold text-green-300">알림이 취소되었습니다</h2>
      <p className="text-sm text-neutral-400">
        신고가 진행되지 않았습니다. 감시를 계속합니다.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 rounded-2xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-500"
      >
        대기 화면으로
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits.
// ---------------------------------------------------------------------------

function EventFacts({ alert }: { alert: EmergencyEvent }) {
  const time = new Date(alert.timestamp).toLocaleTimeString("ko-KR");
  return (
    <dl className="grid w-full grid-cols-2 gap-2 rounded-lg bg-black/30 p-3 text-left text-xs">
      <Fact k="심각도" v={alert.severity === "critical" ? "위급" : "의심"} />
      <Fact k="구역" v={zoneKo(alert.signals.zone)} />
      <Fact
        k="전이"
        v={alert.signals.transition === "abrupt" ? "급격" : "점진"}
      />
      <Fact k="무동작" v={`${alert.signals.immobileSeconds}초`} />
      <Fact
        k="자세"
        v={postureKo(alert.signals.posture)}
      />
      <Fact k="감지 시각" v={time} />
    </dl>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="font-semibold text-neutral-200">{v}</dd>
    </div>
  );
}

function SimStep({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="font-semibold text-neutral-100">{title}</p>
        <p className="text-xs text-neutral-400">{desc}</p>
      </div>
    </li>
  );
}

function zoneKo(zone: Zone): string {
  switch (zone) {
    case "floor":
      return "바닥";
    case "bed":
      return "침대";
    case "couch":
      return "소파";
    default:
      return "미상";
  }
}

function postureKo(posture: EmergencyEvent["signals"]["posture"]): string {
  switch (posture) {
    case "horizontal":
      return "누움";
    case "upright":
      return "서있음";
    default:
      return "미상";
  }
}
