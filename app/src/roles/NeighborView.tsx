import { useEffect, useRef, useState } from "react";
import type { DownMessage, PatientCard, VoiceRes } from "@lib/protocol/messages";
import { TRIAGE, TRIAGE_ROOT, AI_VOICE } from "@lib/first-aid/triage";
import { PROTOCOL_BY_ID } from "@lib/first-aid/protocols";
import { GLOBAL_DISCLAIMER } from "@lib/first-aid/schema";
import type { FirstAidProtocol, ProtocolStep } from "@lib/first-aid/schema";
import { connectWs, type WsHandle } from "../lib/wsClient";
import { sendVoice, triggerDemoFall } from "../lib/api";
import { startStt, type SttHandle } from "../lib/stt";
import { getPrimedCtx } from "../lib/audio";

/** 인앱 경보 사이렌(두 음 왕복) + 진동. 정지 함수 반환. 앱을 보고 있을 때 놓치지 않도록. */
function startSiren(): () => void {
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
  return () => {
    clearInterval(sirenTimer);
    clearInterval(vib);
    navigator.vibrate?.(0);
    try {
      osc?.stop();
    } catch {
      /* noop */
    }
    if (ownsCtx) ctx?.close().catch(() => {}); // 무장된 공유 ctx는 닫지 않음
  };
}

/** 가벼운 두 음 알림음. "start"=듣기 시작(오름), "heard"=인식 완료(밝게). */
function chime(kind: "start" | "heard") {
  let ctx = getPrimedCtx();
  let owns = false;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      owns = true;
    }
    void ctx.resume?.();
    const now = ctx.currentTime;
    const notes = kind === "start" ? [660, 880] : [880, 1175];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx!.destination);
      const t = now + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.start(t);
      o.stop(t + 0.15);
    });
    navigator.vibrate?.(kind === "start" ? 40 : [40, 60, 40]);
    if (owns) window.setTimeout(() => ctx?.close().catch(() => {}), 500);
  } catch {
    /* noop */
  }
}

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
      {/* 개발용 트리거 — 릴리스(데모) 빌드에선 숨김. */}
      {import.meta.env.DEV && (
        <>
          <button
            className="mt-6 rounded-xl border-2 border-dashed border-danger px-6 py-5 text-lg font-bold text-danger disabled:opacity-40"
            onClick={fire}
            disabled={busy}
          >
            {busy ? "발생시키는 중…" : "[테스트] 응급 상황 발생시키기"}
          </button>
          {error && <p className="text-base font-semibold text-danger">{error}</p>}
        </>
      )}
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
  // 호출 도착 화면 동안 인앱 사이렌 — "도착했습니다" 누르면(=started) 정지.
  useEffect(() => {
    if (started) return;
    const stop = startSiren();
    return stop;
  }, [started]);
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
// (A) CPR — 5초 카운트다운 → 30압박(딸깍)/인공호흡(1·2번) 자동 반복
//  좌: 압박부위 사진(/cpr/site.jpg) / 우: 전문가 시범 영상(/cpr/compressions.mp4).
//  파일 없으면 그림/애니메이션으로 폴백. app/public/cpr/ 에 넣고 재빌드하면 실제 미디어 사용.
// ─────────────────────────────────────────────────────────────
const CPR_VIDEO = "/cpr/compressions.mp4"; // 전문가 흉부압박 반복 영상 (직접 넣기)
const CPR_SITE = "/cpr/site.jpg"; // 압박부위(가슴 정중앙 O표시) 사진 (직접 넣기)

type CprPhase = "countdown" | "compress" | "breath";

function CprScreen({ onBack }: { onBack: () => void }) {
  const [gen, setGen] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [phase, setPhase] = useState<CprPhase>("countdown");
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
    // 압박 1회 = 짧은 '딸깍'(square, ~30ms)
    const tick = () => {
      navigator.vibrate?.(20);
      const ctx = ctxRef.current;
      if (!ctx) return;
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = 1800;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.55, t + 0.001);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        o.start(t);
        o.stop(t + 0.04);
      } catch {
        /* noop */
      }
    };
    // 카운트다운/인공호흡 신호음(부드러운 톤)
    const cue = (freq: number, vib: number | number[] = 100) => {
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
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.start(t);
        o.stop(t + 0.24);
      } catch {
        /* noop */
      }
    };
    const BPM = 110;
    const PER = 30;
    const BREATH_EACH_MS = 2500; // 인공호흡 1회당
    const interval = 60000 / BPM;

    const compress = () => {
      setPhase("compress");
      let c = 1;
      setNum(1); // 즉시 1 표시 → 인공호흡 잔상('2')이 남아 2-1-2로 튀던 버그 방지
      tick();
      idRef.current = window.setInterval(() => {
        c += 1;
        if (c > PER) {
          clear();
          breath();
          return;
        }
        setNum(c);
        tick();
      }, interval);
    };
    const breath = () => {
      setPhase("breath");
      let b = 1;
      setNum(1); // "1번 부세요"
      cue(520, [80, 80, 80]);
      idRef.current = window.setInterval(() => {
        b += 1;
        if (b > 2) {
          clear();
          compress();
          return;
        }
        setNum(b); // "2번 부세요"
        cue(520, [80, 80, 80]);
      }, BREATH_EACH_MS) as unknown as number;
    };
    const countdown = () => {
      setPhase("countdown");
      let c = 5;
      setNum(5);
      cue(700, 100);
      idRef.current = window.setInterval(() => {
        c -= 1;
        if (c <= 0) {
          clear();
          compress();
          return;
        }
        setNum(c);
        cue(700, 100);
      }, 1000);
    };
    countdown();
    return () => {
      clear();
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [gen, stopped]);

  const banner =
    phase === "breath" ? "인공호흡 — 숨을 불어넣으세요" : "가슴을 세게, 빠르게 누르세요";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <div
        className={`rounded-xl px-4 py-3 text-center text-2xl font-extrabold text-white ${
          phase === "breath" ? "bg-blue-600" : "bg-danger"
        }`}
      >
        {banner}
      </div>

      {phase === "breath" ? <BreathVisual /> : <CompressSplit />}

      <CprCounter
        phase={phase}
        num={num}
        stopped={stopped}
        onStop={() => setStopped(true)}
        onResume={() => {
          setStopped(false);
          setGen((g) => g + 1);
        }}
      />

      <p className="text-center text-base text-gray-500">
        분당 100~120회 · 약 5cm · 구급대 도착까지 멈추지 마세요
      </p>
      <p className="rounded-lg bg-gray-100 p-3 text-center text-sm text-gray-500">{GLOBAL_DISCLAIMER}</p>
      <NavBar onBack={onBack} onRestart={onBack} />
    </div>
  );
}

// 압박 화면 좌우 2분할: [압박부위 사진/그림] | [전문가 시범 영상/애니메이션]
function CompressSplit() {
  const [imgOk, setImgOk] = useState(true);
  const [vidOk, setVidOk] = useState(true);
  return (
    <div className="grid grid-cols-2 gap-2">
      <figure className="flex flex-col rounded-xl bg-gray-50 p-2">
        <div className="aspect-square overflow-hidden rounded-lg">
          {imgOk ? (
            <img
              src={CPR_SITE}
              alt="압박 부위 — 가슴 정중앙"
              className="h-full w-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : (
            <SiteIllustration />
          )}
        </div>
        <figcaption className="mt-1 text-center text-sm font-bold leading-tight text-danger">
          여기를 누르세요
          <br />
          가슴 정중앙(젖꼭지 사이)
        </figcaption>
      </figure>
      <figure className="flex flex-col rounded-xl bg-black p-1">
        <div className="aspect-square overflow-hidden rounded-lg">
          {vidOk ? (
            <video
              src={CPR_VIDEO}
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
              onError={() => setVidOk(false)}
            />
          ) : (
            <CompressAnim />
          )}
        </div>
        <figcaption className="mt-1 text-center text-sm font-bold text-white">전문가 시범 (반복)</figcaption>
      </figure>
    </div>
  );
}

// 숫자/상태 표시 + 중지/재시작
function CprCounter({
  phase,
  num,
  stopped,
  onStop,
  onResume,
}: {
  phase: CprPhase;
  num: number;
  stopped: boolean;
  onStop: () => void;
  onResume: () => void;
}) {
  const label =
    phase === "countdown" ? "곧 시작합니다" : phase === "compress" ? "누르세요" : `${num}번 부세요`;
  const big = phase === "breath" ? `🫁 ${num}번` : String(num);
  return (
    <div className="rounded-xl bg-gray-900 p-4 text-center text-white">
      <p className="text-lg text-gray-300">{label}</p>
      <p
        className={`my-1 text-6xl font-extrabold tabular-nums ${
          phase === "breath" ? "text-blue-300" : phase === "compress" ? "text-danger" : "text-gray-200"
        }`}
      >
        {big}
        {phase === "compress" && <span className="text-3xl text-gray-400"> / 30</span>}
      </p>
      {!stopped ? (
        <button
          className="mt-1 w-full rounded-xl bg-white px-6 py-3 text-xl font-bold text-gray-900"
          onClick={onStop}
        >
          ■ 중지
        </button>
      ) : (
        <button
          className="mt-1 w-full rounded-xl bg-danger px-6 py-3 text-xl font-bold text-white"
          onClick={onResume}
        >
          ▶ 다시 시작
        </button>
      )}
    </div>
  );
}

// 압박부위 그림(사진 없을 때) — 가슴 정중앙에 O (⚠️ 명치 아님)
function SiteIllustration() {
  return (
    <svg viewBox="0 0 150 150" className="h-full w-full" role="img" aria-label="압박 부위 — 가슴 정중앙">
      <circle cx="30" cy="45" r="16" fill="#e5c9b0" stroke="#333" strokeWidth="2" />
      <rect x="46" y="30" width="88" height="95" rx="18" fill="#cfe3f5" stroke="#333" strokeWidth="2" />
      <circle cx="70" cy="60" r="2.5" fill="#8aa" />
      <circle cx="106" cy="60" r="2.5" fill="#8aa" />
      <circle cx="88" cy="72" r="18" fill="none" stroke="#d81e06" strokeWidth="4" />
      <text x="88" y="108" textAnchor="middle" fill="#d81e06" fontSize="13" fontWeight="bold">
        여기!
      </text>
    </svg>
  );
}

// 압박 동작 애니메이션(영상 없을 때)
function CompressAnim() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full bg-gray-800" role="img" aria-label="흉부압박 동작">
      <circle cx="45" cy="95" r="20" fill="#e5c9b0" stroke="#eee" strokeWidth="2" />
      <rect x="66" y="72" width="118" height="72" rx="22" fill="#cfe3f5" stroke="#eee" strokeWidth="2" />
      <circle cx="122" cy="108" r="17" fill="none" stroke="#ff5a3c" strokeWidth="3" strokeDasharray="4 3" />
      <g className="cpr-press">
        <ellipse cx="122" cy="80" rx="17" ry="10" fill="#f0d0b8" stroke="#eee" strokeWidth="2" />
        <ellipse cx="122" cy="72" rx="14" ry="9" fill="#f7ddc8" stroke="#eee" strokeWidth="2" />
        <path d="M122 42 L122 60 M114 53 L122 61 L130 53" stroke="#ff5a3c" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// 인공호흡 그림 — 머리 젖히고 숨 불어넣기
function BreathVisual() {
  return (
    <div className="rounded-2xl bg-blue-50 p-4">
      <svg viewBox="0 0 220 120" className="mx-auto w-full max-w-xs" role="img" aria-label="인공호흡 — 머리를 젖히고 숨 불어넣기">
        <circle cx="70" cy="65" r="34" fill="#f0d0b8" stroke="#333" strokeWidth="2" />
        <circle cx="60" cy="58" r="3" fill="#333" />
        <path d="M58 80 q12 9 24 0" fill="none" stroke="#333" strokeWidth="2" />
        <g className="breath-puff">
          <path d="M120 62 h48" stroke="#2563eb" strokeWidth="5" strokeLinecap="round" />
          <path d="M158 52 l14 10 l-14 10" fill="none" stroke="#2563eb" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
      <p className="mt-1 text-center text-lg font-bold text-blue-700">
        코를 막고 · 머리를 젖힌 뒤 · 숨을 천천히 불어넣으세요
      </p>
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
  const [status, setStatus] = useState<
    "starting" | "listening" | "heard" | "typed" | "denied" | "unsupported"
  >("starting");
  const [error, setError] = useState("");
  const handleRef = useRef<SttHandle | null>(null);
  const silenceTimer = useRef<number | null>(null);
  const lastText = useRef("");
  const heard = useRef(false);

  // 진입 즉시 자동 녹음 시작 (마이크 권한 요청 포함)
  useEffect(() => {
    let mounted = true;

    // 말이 멈추고 2.5초 지나면 "충분히 들었다"고 판단 → 완료음 + '잘 들었어요'.
    const armSilence = () => {
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = window.setTimeout(() => {
        if (!mounted || heard.current || !lastText.current.trim()) return;
        heard.current = true;
        handleRef.current?.stop();
        chime("heard");
        setStatus("heard");
      }, 2500);
    };

    startStt(
      (t) => {
        if (!mounted) return;
        setText(t);
        lastText.current = t;
        if (!heard.current) armSilence(); // 새 말 들릴 때마다 침묵 타이머 리셋
      },
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
      if (h) {
        setStatus("listening");
        chime("start"); // 듣기 시작 신호음
        armSilence();
      }
    });
    return () => {
      mounted = false;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
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
        ? "🎤 듣고 있어요. 말씀하세요"
        : status === "heard"
          ? "✅ 잘 들었어요 — ‘완료’를 누르세요"
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
        className={`flex items-center justify-center gap-3 rounded-2xl p-5 text-center text-xl font-bold ${
          status === "listening"
            ? "bg-safe text-white"
            : status === "heard"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600"
        }`}
      >
        {status === "listening" && (
          <span className="inline-block h-3 w-3 animate-ping rounded-full bg-white" />
        )}
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
