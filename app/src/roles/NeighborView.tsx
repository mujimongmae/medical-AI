import { useEffect, useRef, useState } from "react";
import type { DownMessage, PatientCard, VoiceRes } from "@lib/protocol/messages";
import { TRIAGE, TRIAGE_ROOT, AI_VOICE } from "@lib/first-aid/triage";
import { PROTOCOL_BY_ID } from "@lib/first-aid/protocols";
import { GLOBAL_DISCLAIMER } from "@lib/first-aid/schema";
import type { FirstAidProtocol, ProtocolStep } from "@lib/first-aid/schema";
import { connectWs, type WsHandle } from "../lib/wsClient";
import { sendVoice, triggerDemoFall } from "../lib/api";
import { startStt, type SttHandle } from "../lib/stt";

interface ActiveAlert {
  eventId: string;
  patient: PatientCard;
}

export default function NeighborView({ id, name }: { id: string; name: string }) {
  const [alert, setAlert] = useState<ActiveAlert | null>(null);
  const ws = useRef<WsHandle | null>(null);

  useEffect(() => {
    ws.current = connectWs(id, (m: DownMessage) => {
      if (m.type === "NEIGHBOR_ALERT") setAlert({ eventId: m.eventId, patient: m.patient });
      else if (m.type === "EVENT_RESOLVED") setAlert(null);
    });
    return () => ws.current?.close();
  }, [id]);

  if (!alert) return <NeighborIdle name={name} />;

  return (
    <TriageRunner
      eventId={alert.eventId}
      patient={alert.patient}
      onAccept={() => ws.current?.send({ type: "NEIGHBOR_ACCEPT", eventId: alert.eventId })}
      onArrived={() => ws.current?.send({ type: "NEIGHBOR_ARRIVED", eventId: alert.eventId })}
      onAnswer={(step, value) =>
        ws.current?.send({ type: "PROTOCOL_ANSWER", eventId: alert.eventId, step, value })
      }
    />
  );
}

function NeighborIdle({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fire = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await triggerDemoFall();
    } catch {
      setError("서버에 연결하지 못했어요. 브로커 서버가 켜져 있는지 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h2 className="text-xl font-bold">{name} 님 (이웃)</h2>
      <p className="text-lg text-gray-600">
        대기 중입니다. 마을에 응급상황이 생기면 이 폰으로 호출이 옵니다.
      </p>
      <div className="mt-4 rounded-lg bg-safe/10 p-4 text-safe">● 대기 중</div>
      <button
        className="mt-6 rounded-xl border-2 border-dashed border-danger px-6 py-5 text-lg font-bold text-danger disabled:opacity-40"
        onClick={fire}
        disabled={busy}
      >
        {busy ? "발생시키는 중…" : "[테스트] 응급 상황 발생시키기"}
      </button>
      {error && <p className="text-base font-semibold text-danger">{error}</p>}
    </div>
  );
}

type Mode =
  | { kind: "triage" }
  | { kind: "cpr" }
  | { kind: "voice" }
  | { kind: "protocol"; id: string };

function TriageRunner({
  eventId,
  patient,
  onAccept,
  onArrived,
  onAnswer,
}: {
  eventId: string;
  patient: PatientCard;
  onAccept: () => void;
  onArrived: () => void;
  onAnswer: (step: string, value: string) => void;
}) {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "triage" });

  useEffect(() => onAccept(), []);
  const restart = () => setMode({ kind: "triage" });

  if (!started) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <div className="rounded-lg bg-danger px-4 py-3 text-xl font-bold text-white">
          🚨 응급 호출 — 지금 가주세요
        </div>
        <Card label="환자" value={patient.name} />
        <Card label="위치" value={patient.addressText} />
        <Card label="진입" value={patient.accessNote} />
        <Card label="병력" value={patient.historySummary} />
        <button
          className="mt-4 rounded-xl bg-danger px-6 py-6 text-2xl font-bold text-white"
          onClick={() => {
            onArrived();
            setStarted(true);
          }}
        >
          도착했습니다 — 시작
        </button>
      </div>
    );
  }

  if (mode.kind === "cpr") return <CprScreen onBack={restart} />;
  if (mode.kind === "voice")
    return (
      <AiRecommendScreen
        eventId={eventId}
        onOpenProtocol={(id) => setMode({ kind: "protocol", id })}
        onBack={restart}
      />
    );
  if (mode.kind === "protocol") {
    const p = PROTOCOL_BY_ID[mode.id];
    if (!p) return <div className="p-6">알 수 없는 프로토콜: {mode.id}</div>;
    return <ProtocolScreen protocol={p} onBack={() => setMode({ kind: "voice" })} onRestart={restart} />;
  }

  // 단일 질문 트리아지
  const node = TRIAGE[TRIAGE_ROOT];
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-6">
      <p className="text-3xl font-extrabold leading-snug">{node.prompt}</p>
      {node.hint && <p className="text-lg text-gray-500">{node.hint}</p>}
      <div className="mt-2 flex flex-col gap-4">
        {node.options?.map((o) => (
          <button
            key={o.label}
            className={`rounded-2xl border-2 px-6 py-6 text-left text-2xl font-bold active:opacity-80 ${
              o.protocolId === "P-CPR"
                ? "border-danger bg-danger text-white"
                : "border-gray-300"
            }`}
            onClick={() => {
              onAnswer(node.id, o.label);
              if (o.protocolId === "P-CPR") setMode({ kind: "cpr" });
              else if (o.next === AI_VOICE) setMode({ kind: "voice" });
              else if (o.protocolId) setMode({ kind: "protocol", id: o.protocolId });
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <NavBar onBack={() => setStarted(false)} onRestart={restart} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// (A) CPR — 5초 카운트다운 후 자동 시작, 30압박→인공호흡→반복 (자동)
// ─────────────────────────────────────────────────────────────
function CprScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <div className="rounded-xl bg-danger px-4 py-3 text-center text-2xl font-extrabold text-white">
        가슴을 세게, 빠르게 누르세요
      </div>
      <CprVisual />
      <CprGuide />
      <p className="text-center text-base text-gray-500">
        분당 100~120회 · 약 5cm · 구급대 도착까지 멈추지 마세요
      </p>
      <p className="rounded-lg bg-gray-100 p-3 text-center text-sm text-gray-500">{GLOBAL_DISCLAIMER}</p>
      <NavBar onBack={onBack} onRestart={onBack} />
    </div>
  );
}

function CprVisual() {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <svg viewBox="0 0 200 150" className="mx-auto w-full max-w-xs" role="img" aria-label="가슴 정중앙을 누르는 그림">
        <circle cx="40" cy="60" r="18" fill="#e5c9b0" stroke="#333" strokeWidth="2" />
        <rect x="58" y="42" width="110" height="60" rx="20" fill="#cfe3f5" stroke="#333" strokeWidth="2" />
        <circle cx="110" cy="72" r="16" fill="none" stroke="#d81e06" strokeWidth="3" strokeDasharray="4 3" />
        <g className="cpr-press">
          <ellipse cx="110" cy="50" rx="15" ry="9" fill="#f0d0b8" stroke="#333" strokeWidth="2" />
          <ellipse cx="110" cy="44" rx="13" ry="8" fill="#f7ddc8" stroke="#333" strokeWidth="2" />
          <path d="M110 20 L110 34 M104 29 L110 35 L116 29" stroke="#d81e06" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      </svg>
      <p className="mt-1 text-center text-lg font-bold text-danger">
        가슴 한가운데 (양 젖꼭지 사이)를 누르세요
      </p>
    </div>
  );
}

function CprGuide() {
  const [gen, setGen] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [phase, setPhase] = useState<"countdown" | "compress" | "breath">("countdown");
  const [num, setNum] = useState(5);
  const ctxRef = useRef<AudioContext | null>(null);
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    if (stopped) return;
    try {
      ctxRef.current = new AudioContext();
      void ctxRef.current.resume?.();
    } catch {
      ctxRef.current = null;
    }
    const clear = () => {
      if (idRef.current !== null) {
        clearInterval(idRef.current);
        clearTimeout(idRef.current);
        idRef.current = null;
      }
    };
    const beat = (freq: number, vib = 25) => {
      navigator.vibrate?.(vib);
      const ctx = ctxRef.current;
      if (!ctx) return;
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.start(t);
        o.stop(t + 0.07);
      } catch {
        /* noop */
      }
    };
    const BPM = 110;
    const PER = 30;
    const BREATH_MS = 5000;
    const interval = 60000 / BPM;

    const compress = () => {
      setPhase("compress");
      let c = 0;
      idRef.current = window.setInterval(() => {
        c += 1;
        setNum(c);
        beat(1000, 25);
        if (c >= PER) {
          clear();
          breath();
        }
      }, interval);
    };
    const breath = () => {
      setPhase("breath");
      setNum(2);
      beat(500, 200);
      idRef.current = window.setTimeout(() => {
        clear();
        compress();
      }, BREATH_MS) as unknown as number;
    };
    const countdown = () => {
      setPhase("countdown");
      let c = 5;
      setNum(c);
      beat(700, 100);
      idRef.current = window.setInterval(() => {
        c -= 1;
        if (c <= 0) {
          clear();
          compress();
        } else {
          setNum(c);
          beat(700, 100);
        }
      }, 1000);
    };
    countdown();
    return () => {
      clear();
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [gen, stopped]);

  const label =
    phase === "countdown" ? "곧 시작합니다" : phase === "compress" ? "누르세요" : "인공호흡 2회 하세요";
  const big = phase === "breath" ? "🫁 2회" : String(num);

  return (
    <div className="rounded-xl bg-gray-900 p-5 text-center text-white">
      <p className="text-lg text-gray-300">{label}</p>
      <p
        className={`my-1 text-7xl font-extrabold tabular-nums ${
          phase === "breath" ? "text-yellow-300" : phase === "compress" ? "text-danger" : "text-gray-200"
        }`}
      >
        {big}
        {phase === "compress" && <span className="text-3xl text-gray-400"> / 30</span>}
      </p>
      {!stopped ? (
        <button
          className="mt-2 w-full rounded-xl bg-white px-6 py-4 text-xl font-bold text-gray-900"
          onClick={() => setStopped(true)}
        >
          ■ 중지
        </button>
      ) : (
        <button
          className="mt-2 w-full rounded-xl bg-danger px-6 py-4 text-xl font-bold text-white"
          onClick={() => {
            setStopped(false);
            setGen((g) => g + 1);
          }}
        >
          ▶ 다시 시작
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// (B) AI 음성 추천 — 진입 즉시 자동 녹음(권한 요청). 완료 누르면 추천.
// ─────────────────────────────────────────────────────────────
function AiRecommendScreen({
  eventId,
  onOpenProtocol,
  onBack,
}: {
  eventId: string;
  onOpenProtocol: (id: string) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<VoiceRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"starting" | "listening" | "typed" | "denied" | "unsupported">("starting");
  const [error, setError] = useState("");
  const handleRef = useRef<SttHandle | null>(null);

  // 진입 즉시 자동 녹음 시작 (마이크 권한 요청 포함)
  useEffect(() => {
    let mounted = true;
    startStt(
      (t) => mounted && setText(t),
      (e) => {
        if (!mounted) return;
        setStatus(e === "unsupported" ? "unsupported" : e === "denied" ? "denied" : "typed");
      },
    ).then((h) => {
      if (!mounted) {
        h?.stop();
        return;
      }
      handleRef.current = h;
      if (h) setStatus("listening");
    });
    return () => {
      mounted = false;
      handleRef.current?.stop();
    };
  }, []);

  const submit = async () => {
    handleRef.current?.stop();
    const transcript = text.trim();
    if (!transcript || busy) return;
    setBusy(true);
    setError("");
    try {
      setResult(await sendVoice(eventId, transcript));
    } catch {
      setError("전송에 실패했어요. 네트워크를 확인하세요.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-5">
        <div className="rounded-xl bg-blue-600 px-4 py-3 text-center text-xl font-bold text-white">
          AI 응급처치 추천
        </div>
        <div className="rounded-2xl bg-blue-50 p-5">
          <p className="text-base text-blue-700">가능성이 높은 상태</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-900">{result.likelyCondition}</p>
        </div>
        <div className="rounded-2xl border-2 border-danger p-5">
          <p className="text-base text-danger">지금 이렇게 하세요</p>
          <p className="mt-1 text-2xl font-extrabold leading-snug">{result.recommendation}</p>
        </div>
        {result.protocolId && PROTOCOL_BY_ID[result.protocolId] && (
          <button
            className="rounded-xl bg-gray-900 px-6 py-4 text-lg font-bold text-white"
            onClick={() => onOpenProtocol(result.protocolId as string)}
          >
            자세한 방법 보기 →
          </button>
        )}
        <button
          className="rounded-xl border-2 border-gray-300 px-6 py-4 text-lg font-semibold text-gray-700"
          onClick={() => {
            setResult(null);
            setText("");
            setStatus("typed");
          }}
        >
          다시 설명하기
        </button>
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-500">
          참고용 안내입니다. 119(구급상황실) 지시를 우선하세요. {GLOBAL_DISCLAIMER}
        </p>
        <NavBar onRestart={onBack} />
      </div>
    );
  }

  const statusText =
    status === "starting"
      ? "마이크를 준비하고 있어요…"
      : status === "listening"
        ? "● 듣는 중 — 환자 상태를 말해 주세요"
        : status === "denied"
          ? "마이크 권한이 없어요. 아래에 직접 입력해 주세요."
          : status === "unsupported"
            ? "이 기기는 음성인식을 지원하지 않아요. 아래에 직접 입력해 주세요."
            : "직접 입력해 주세요.";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <p className="text-2xl font-extrabold leading-snug">환자 상태를 말해 주세요</p>
      <p className="text-lg text-gray-500">예: “피가 많이 나요”, “얼굴이 파래졌어요”, “팔을 못 움직여요”</p>

      <div
        className={`rounded-2xl p-5 text-center text-xl font-bold ${
          status === "listening" ? "bg-safe text-white" : "bg-gray-100 text-gray-600"
        }`}
      >
        {statusText}
      </div>

      <textarea
        className="w-full rounded-lg border-2 border-gray-300 p-3 text-lg"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="말한 내용이 여기 표시돼요 (직접 입력도 가능)"
      />

      <button
        className="rounded-xl bg-blue-600 px-6 py-6 text-2xl font-bold text-white disabled:opacity-40"
        disabled={!text.trim() || busy}
        onClick={submit}
      >
        {busy ? "분석 중…" : "완료 — AI 추천 받기"}
      </button>

      {error && <p className="text-base font-semibold text-danger">{error}</p>}
      <NavBar onBack={onBack} onRestart={onBack} />
    </div>
  );
}

// ── 프로토콜 상세 (AI 추천 "자세히 보기") ──
function ProtocolScreen({
  protocol: p,
  onBack,
  onRestart,
}: {
  protocol: FirstAidProtocol;
  onBack: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <h2 className="text-2xl font-bold text-danger">{p.name}</h2>
      <ol className="flex flex-col gap-3">
        {p.steps.map((s) => (
          <StepCard key={s.id} step={s} />
        ))}
      </ol>
      {p.doNot.length > 0 && (
        <section className="rounded-lg bg-red-50 p-4 text-danger">
          <p className="text-lg font-bold">⛔ 하지 마세요</p>
          <ul className="mt-1 list-disc pl-5 text-base">
            {p.doNot.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-lg bg-blue-50 p-4">
        <p className="text-lg font-bold text-blue-900">🚑 구급대 도착 시 전달</p>
        <p className="mt-1 text-base text-blue-900">{p.handoff}</p>
      </section>
      <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-500">{p.disclaimer}</p>
      <NavBar onBack={onBack} onRestart={onRestart} />
    </div>
  );
}

function StepCard({ step: s }: { step: ProtocolStep }) {
  return (
    <li className="rounded-lg border-2 border-gray-200 p-4">
      <p className="text-lg font-bold">
        {s.order}. {s.title}
      </p>
      <p className="mt-1 text-base text-gray-700">{s.detail}</p>
      {s.byPatient && (
        <ul className="mt-2 space-y-0.5 text-base text-gray-600">
          {s.byPatient.adult && <li>• 성인: {s.byPatient.adult}</li>}
          {s.byPatient.child && <li>• 소아: {s.byPatient.child}</li>}
          {s.byPatient.infant && <li>• 영아: {s.byPatient.infant}</li>}
        </ul>
      )}
      {s.caution && (
        <p className="mt-2 rounded bg-yellow-50 px-3 py-2 text-base text-yellow-900">⚠️ {s.caution}</p>
      )}
    </li>
  );
}

function NavBar({ onBack, onRestart }: { onBack?: () => void; onRestart: () => void }) {
  return (
    <div className="mt-2 flex gap-3">
      {onBack && (
        <button
          className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-3 text-lg font-semibold text-gray-700"
          onClick={onBack}
        >
          ← 뒤로
        </button>
      )}
      <button
        className="flex-1 rounded-xl border-2 border-gray-300 px-4 py-3 text-lg font-semibold text-gray-700"
        onClick={onRestart}
      >
        ↻ 처음부터
      </button>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <span className="text-sm text-gray-500">{label}</span>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
