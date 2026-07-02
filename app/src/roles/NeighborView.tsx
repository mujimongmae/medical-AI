import { useEffect, useRef, useState } from "react";
import type { DownMessage, PatientCard } from "@lib/protocol/messages";
import { TRIAGE, TRIAGE_ROOT } from "@lib/first-aid/triage";
import { PROTOCOL_BY_ID } from "@lib/first-aid/protocols";
import { GLOBAL_DISCLAIMER } from "@lib/first-aid/schema";
import type { FirstAidProtocol, ProtocolStep, Urgency } from "@lib/first-aid/schema";
import { connectWs, type WsHandle } from "../lib/wsClient";
import { sendVoice, triggerDemoFall } from "../lib/api";

interface ActiveAlert {
  eventId: string;
  patient: PatientCard;
}

export default function NeighborView({ id, name }: { id: string; name: string }) {
  const [alert, setAlert] = useState<ActiveAlert | null>(null);
  const ws = useRef<WsHandle | null>(null);

  useEffect(() => {
    ws.current = connectWs(id, (m: DownMessage) => {
      if (m.type === "NEIGHBOR_ALERT")
        setAlert({ eventId: m.eventId, patient: m.patient });
      else if (m.type === "EVENT_RESOLVED") setAlert(null);
    });
    return () => ws.current?.close();
  }, [id]);

  if (!alert) {
    return <NeighborIdle name={name} />;
  }

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

// 이웃 대기 화면 + 혼자 테스트용 데모 트리거
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

      {/* 혼자 테스트용: 시드 환자(김복순)로 응급을 즉시 발생 → 이 화면에 호출이 옴 */}
      <button
        className="mt-6 rounded-xl border-2 border-dashed border-danger px-6 py-5 text-lg font-bold text-danger disabled:opacity-40"
        onClick={fire}
        disabled={busy}
      >
        {busy ? "발생시키는 중…" : "[테스트] 응급 상황 발생시키기"}
      </button>
      <p className="text-sm text-gray-400">
        누르면 시드 환자(김복순)의 응급이 즉시 발생해 이 화면으로 호출이 옵니다.
      </p>
      {error && <p className="text-base font-semibold text-danger">{error}</p>}
    </div>
  );
}

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
  // "출발" 전 환자 카드 → 트리아지 시작
  const [started, setStarted] = useState(false);
  // 트리아지 경로(뒤로가기용 스택). 현재 노드 = path[마지막].
  const [path, setPath] = useState<string[]>([TRIAGE_ROOT]);
  const [protocolId, setProtocolId] = useState<string | null>(null);

  useEffect(() => onAccept(), []); // 호출 수신 = 수락(데모)

  const restart = () => {
    setPath([TRIAGE_ROOT]);
    setProtocolId(null);
  };

  if (!started) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <div className="rounded-lg bg-danger px-4 py-3 text-lg font-bold text-white">
          🚨 응급 호출 — 지금 가주세요
        </div>
        <Card label="환자" value={patient.name} />
        <Card label="위치" value={patient.addressText} />
        <Card label="진입" value={patient.accessNote} />
        <Card label="병력" value={patient.historySummary} />
        <button
          className="mt-4 rounded-xl bg-danger px-6 py-5 text-xl font-bold text-white"
          onClick={() => {
            onArrived();
            setStarted(true);
          }}
        >
          도착했습니다 — 응급처치 시작
        </button>
      </div>
    );
  }

  // ── 프로토콜 화면 ──
  if (protocolId) {
    const p = PROTOCOL_BY_ID[protocolId];
    if (!p)
      return (
        <div className="mx-auto max-w-md p-6">
          <p className="text-lg">알 수 없는 프로토콜: {protocolId}</p>
          <NavBar onBack={() => setProtocolId(null)} onRestart={restart} />
        </div>
      );
    return (
      <ProtocolScreen
        eventId={eventId}
        protocol={p}
        onBack={() => setProtocolId(null)}
        onRestart={restart}
      />
    );
  }

  // ── 트리아지 질문 화면 ──
  const nodeId = path[path.length - 1];
  const node = TRIAGE[nodeId];
  if (!node)
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="text-lg">알 수 없는 단계: {nodeId}</p>
        <NavBar onRestart={restart} />
      </div>
    );

  const goBack =
    path.length > 1 ? () => setPath((ps) => ps.slice(0, -1)) : () => setStarted(false);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <p className="text-xl font-bold">{node.prompt}</p>
      {node.hint && <p className="text-base text-gray-500">{node.hint}</p>}
      <div className="mt-2 flex flex-col gap-3">
        {node.options?.map((o) => (
          <button
            key={o.label}
            className="rounded-xl border-2 border-gray-300 px-5 py-4 text-left text-lg font-semibold active:bg-gray-100"
            onClick={() => {
              onAnswer(node.id, o.label);
              if (o.protocolId) setProtocolId(o.protocolId);
              else if (o.next) setPath((ps) => [...ps, o.next as string]);
            }}
          >
            {o.label}
          </button>
        ))}
        {!node.options?.length && (
          <p className="rounded-lg bg-gray-100 p-4 text-gray-600">
            안내에 따라 환자 곁에서 상태를 지켜봐 주세요.
          </p>
        )}
      </div>
      <NavBar onBack={goBack} onRestart={restart} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 프로토콜 화면 — 단계 + 메트로놈 + 금기/인계/디스클레이머 + 음성 상황설명
// ─────────────────────────────────────────────────────────────
const URGENCY_STYLE: Record<Urgency, { label: string; cls: string }> = {
  critical: { label: "매우 위급", cls: "bg-danger text-white" },
  urgent: { label: "위급", cls: "bg-orange-500 text-white" },
  caution: { label: "주의", cls: "bg-yellow-400 text-gray-900" },
};

function ProtocolScreen({
  eventId,
  protocol: p,
  onBack,
  onRestart,
}: {
  eventId: string;
  protocol: FirstAidProtocol;
  onBack: () => void;
  onRestart: () => void;
}) {
  const u = URGENCY_STYLE[p.urgency];
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${u.cls}`}>
          {u.label}
        </span>
        <h2 className="text-2xl font-bold text-danger">{p.name}</h2>
      </div>
      <p className="text-base text-gray-600">{p.appliesTo}</p>

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

      <VoicePanel eventId={eventId} />

      <p className="rounded-lg bg-gray-100 p-3 text-sm leading-snug text-gray-500">
        {p.disclaimer}
      </p>
      <p className="text-sm leading-snug text-gray-400">{GLOBAL_DISCLAIMER}</p>

      <NavBar onBack={onBack} onRestart={onRestart} />
    </div>
  );
}

function StepCard({ step: s }: { step: ProtocolStep }) {
  const hasMetronome = !!s.repeat?.ratePerMin;
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
        <p className="mt-2 rounded bg-yellow-50 px-3 py-2 text-base text-yellow-900">
          ⚠️ {s.caution}
        </p>
      )}

      {s.durationSec && (
        <p className="mt-1 text-sm text-gray-500">권장 {s.durationSec}초</p>
      )}

      {hasMetronome && s.repeat?.ratePerMin && (
        <CprMetronome rate={s.repeat.ratePerMin} cycle={s.repeat.cycle} />
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────
// CPR 메트로놈 — Web Audio 박자음(100~120bpm) + 세트 카운트 시각화
// ─────────────────────────────────────────────────────────────
function CprMetronome({
  rate,
  cycle,
}: {
  rate: [number, number];
  cycle?: { compressions: number; breaths: number };
}) {
  const bpm = Math.round((rate[0] + rate[1]) / 2); // 중간값(예: 110)
  const intervalMs = 60000 / bpm;
  const perCycle = cycle?.compressions ?? 30;

  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  const click = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1000;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.start(t);
    o.stop(t + 0.06);
    navigator.vibrate?.(25);
  };

  const stop = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setRunning(false);
  };

  const start = () => {
    if (running) return;
    try {
      ctxRef.current = new AudioContext();
    } catch {
      return; // 오디오 미지원이어도 앱은 계속 동작
    }
    setRunning(true);
    setCount(1);
    click();
    timerRef.current = window.setInterval(() => {
      click();
      setCount((n) => n + 1);
    }, intervalMs);
  };

  // 언마운트 정리
  useEffect(() => () => stop(), []);

  const inCycle = count === 0 ? 0 : ((count - 1) % perCycle) + 1;
  const cycleNo = count === 0 ? 0 : Math.floor((count - 1) / perCycle) + 1;
  const breathTime = !!cycle && inCycle === perCycle;

  return (
    <div className="mt-3 rounded-xl bg-gray-900 p-4 text-center text-white">
      <p className="text-sm text-gray-300">가슴압박 박자 (분당 {bpm}회)</p>
      <div className="my-2 flex items-baseline justify-center gap-2">
        <span
          className={`text-5xl font-extrabold tabular-nums transition-colors ${
            running ? "text-danger" : "text-gray-500"
          }`}
        >
          {inCycle}
        </span>
        <span className="text-2xl text-gray-400">/ {perCycle}</span>
      </div>
      <p className="text-sm text-gray-300">
        누적 {count}회{cycle ? ` · ${cycleNo}세트` : ""}
      </p>
      {breathTime && (
        <p className="mt-1 text-base font-bold text-yellow-300">
          인공호흡 2회 시점 (선택) — 자신 없으면 압박만 계속!
        </p>
      )}
      {!running ? (
        <button
          className="mt-3 w-full rounded-xl bg-danger px-6 py-4 text-xl font-bold text-white"
          onClick={start}
        >
          ▶ 박자 시작
        </button>
      ) : (
        <button
          className="mt-3 w-full rounded-xl bg-white px-6 py-4 text-xl font-bold text-gray-900"
          onClick={stop}
        >
          ■ 중지
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 음성 상황설명 — 온디바이스 STT → POST /voice → 요약. 미지원 시 텍스트 입력.
// ─────────────────────────────────────────────────────────────
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
type SRCtor = new () => SpeechRecognitionLike;

function getSRCtor(): SRCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function VoicePanel({ eventId }: { eventId: string }) {
  const srCtorRef = useRef<SRCtor | null>(getSRCtor());
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = !!srCtorRef.current;

  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
    },
    [],
  );

  const startListening = () => {
    const Ctor = srCtorRef.current;
    if (!Ctor) return;
    setError("");
    try {
      const rec = new Ctor();
      rec.lang = "ko-KR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let t = "";
        for (let i = 0; i < e.results.length; i++) {
          t += e.results[i][0].transcript;
        }
        setText(t);
      };
      rec.onerror = (e) => {
        setError(
          e.error === "not-allowed" || e.error === "service-not-allowed"
            ? "마이크 권한이 없습니다. 아래에 직접 입력해 주세요."
            : "음성 인식에 실패했습니다. 아래에 직접 입력해 주세요.",
        );
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setError("음성 인식을 시작할 수 없습니다. 아래에 직접 입력해 주세요.");
      setListening(false);
    }
  };

  const stopListening = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  };

  const submit = async () => {
    const transcript = text.trim();
    if (!transcript || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await sendVoice(eventId, transcript);
      setSummary(res.summary);
    } catch {
      setError("요약 전송에 실패했습니다. 네트워크를 확인하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border-2 border-gray-200 p-4">
      <p className="text-lg font-bold">🎤 상황 설명 (음성/텍스트)</p>
      <p className="mt-1 text-sm text-gray-500">
        환자 상태를 말하거나 입력하면 요약해 드립니다. (구급대 전달에 활용)
      </p>

      {supported && (
        <button
          className={`mt-3 w-full rounded-xl px-6 py-4 text-lg font-bold ${
            listening ? "bg-white text-danger ring-2 ring-danger" : "bg-safe text-white"
          }`}
          onClick={listening ? stopListening : startListening}
        >
          {listening ? "● 듣는 중 — 눌러서 중지" : "🎤 말하기 시작"}
        </button>
      )}
      {!supported && (
        <p className="mt-2 text-sm text-gray-500">
          이 기기는 음성 인식을 지원하지 않아요. 아래에 직접 입력하세요.
        </p>
      )}

      <textarea
        className="mt-3 w-full rounded-lg border-2 border-gray-300 p-3 text-base"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="예: 60대 남성, 가슴을 붙잡고 쓰러졌고 지금은 숨을 헐떡입니다."
      />

      <button
        className="mt-2 w-full rounded-xl bg-blue-600 px-6 py-3 text-lg font-bold text-white disabled:opacity-40"
        disabled={!text.trim() || busy}
        onClick={submit}
      >
        {busy ? "요약 중…" : "요약 보내기"}
      </button>

      {error && <p className="mt-2 text-base text-danger">{error}</p>}
      {summary && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <p className="text-sm font-bold text-gray-500">요약</p>
          <p className="text-base text-gray-800">{summary}</p>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
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
