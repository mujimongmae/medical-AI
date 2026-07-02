import { useEffect, useRef, useState } from "react";
import type { DownMessage, PatientCard } from "@lib/protocol/messages";
import { TRIAGE, TRIAGE_ROOT } from "@lib/first-aid/triage";
import { PROTOCOL_BY_ID } from "@lib/first-aid/protocols";
import { connectWs, type WsHandle } from "../lib/wsClient";

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
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <h2 className="text-xl font-bold">{name} 님 (이웃)</h2>
        <p className="text-lg text-gray-600">
          대기 중입니다. 마을에 응급상황이 생기면 이 폰으로 호출이 옵니다.
        </p>
        <div className="mt-4 rounded-lg bg-safe/10 p-4 text-safe">● 대기 중</div>
      </div>
    );
  }

  return (
    <TriageRunner
      patient={alert.patient}
      onAccept={() => ws.current?.send({ type: "NEIGHBOR_ACCEPT", eventId: alert.eventId })}
      onArrived={() => ws.current?.send({ type: "NEIGHBOR_ARRIVED", eventId: alert.eventId })}
      onAnswer={(step, value) =>
        ws.current?.send({ type: "PROTOCOL_ANSWER", eventId: alert.eventId, step, value })
      }
    />
  );
}

function TriageRunner({
  patient,
  onAccept,
  onArrived,
  onAnswer,
}: {
  patient: PatientCard;
  onAccept: () => void;
  onArrived: () => void;
  onAnswer: (step: string, value: string) => void;
}) {
  // "출발" 전 환자 카드 → 트리아지 시작
  const [started, setStarted] = useState(false);
  const [nodeId, setNodeId] = useState<string>(TRIAGE_ROOT);
  const [protocolId, setProtocolId] = useState<string | null>(null);

  useEffect(() => onAccept(), []); // 호출 수신 = 수락(데모)

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

  if (protocolId) {
    const p = PROTOCOL_BY_ID[protocolId];
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <h2 className="text-2xl font-bold text-danger">{p?.name ?? protocolId}</h2>
        <ol className="flex flex-col gap-3">
          {p?.steps.map((s) => (
            <li key={s.id} className="rounded-lg border-2 border-gray-200 p-4">
              <p className="text-lg font-bold">{s.title}</p>
              <p className="text-base text-gray-600">{s.detail}</p>
            </li>
          ))}
        </ol>
        {p?.doNot?.length ? (
          <div className="rounded-lg bg-red-50 p-4 text-danger">
            <p className="font-bold">하지 마세요</p>
            <ul className="list-disc pl-5">
              {p.doNot.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const node = TRIAGE[nodeId];
  if (!node) return <p className="p-6">알 수 없는 단계: {nodeId}</p>;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <p className="text-xl font-bold">{node.prompt}</p>
      {node.hint && <p className="text-base text-gray-500">{node.hint}</p>}
      <div className="mt-2 flex flex-col gap-3">
        {node.options?.map((o) => (
          <button
            key={o.label}
            className="rounded-xl border-2 border-gray-300 px-5 py-4 text-left text-lg font-semibold"
            onClick={() => {
              onAnswer(node.id, o.label);
              if (o.protocolId) setProtocolId(o.protocolId);
              else if (o.next) setNodeId(o.next);
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
