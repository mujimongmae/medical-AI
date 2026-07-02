import { useState } from "react";
import type { Role } from "@lib/protocol/messages";
import { GLOBAL_DISCLAIMER } from "@lib/first-aid/schema";
import { register } from "./lib/api";
import PatientView from "./roles/PatientView";
import NeighborView from "./roles/NeighborView";

interface Me {
  id: string;
  role: Role;
  name: string;
}

const ME_KEY = "ce.me";
const VILLAGE = "방림리"; // 데모: 단일 마을 (합성)

function loadMe(): Me | null {
  const raw = localStorage.getItem(ME_KEY);
  return raw ? (JSON.parse(raw) as Me) : null;
}

export default function App() {
  const [me, setMe] = useState<Me | null>(loadMe);

  if (!me) return <RolePicker onDone={setMe} />;

  return (
    <div className="flex min-h-full flex-col">
      <Disclaimer />
      <div className="flex-1">
        {me.role === "patient" ? (
          <PatientView id={me.id} name={me.name} />
        ) : (
          <NeighborView id={me.id} name={me.name} />
        )}
      </div>
      <button
        className="m-4 self-center text-sm text-gray-400 underline"
        onClick={() => {
          localStorage.removeItem(ME_KEY);
          setMe(null);
        }}
      >
        역할 변경
      </button>
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="bg-gray-100 px-4 py-2 text-sm leading-snug text-gray-600">
      {GLOBAL_DISCLAIMER}
    </p>
  );
}

function RolePicker({ onDone }: { onDone: (m: Me) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(role: Role) {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      // 데모: 합성 좌표 (마을 기준 + 소량 지터)
      const home = {
        lat: 37.55 + (Math.random() - 0.5) * 0.02,
        lng: 128.4 + (Math.random() - 0.5) * 0.02,
      };
      const { id } = await register({ role, name: name.trim(), village: VILLAGE, home });
      const me: Me = { id, role, name: name.trim() };
      localStorage.setItem(ME_KEY, JSON.stringify(me));
      onDone(me);
    } catch (e) {
      alert(`등록 실패: ${(e as Error).message}\n브로커 서버(npm run server)가 켜져 있나요?`);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">마을 응급대응</h1>
      <label className="flex flex-col gap-2 text-lg">
        이름
        <input
          className="rounded-lg border-2 border-gray-300 px-4 py-3 text-lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 김순자"
        />
      </label>
      <p className="text-base text-gray-500">역할을 선택하세요.</p>
      <div className="flex flex-col gap-4">
        <button
          className="rounded-xl bg-blue-600 px-6 py-5 text-xl font-bold text-white disabled:opacity-40"
          disabled={!name.trim() || busy}
          onClick={() => pick("patient")}
        >
          어르신 (환자)
        </button>
        <button
          className="rounded-xl bg-safe px-6 py-5 text-xl font-bold text-white disabled:opacity-40"
          disabled={!name.trim() || busy}
          onClick={() => pick("neighbor")}
        >
          이웃 (도움 주는 사람)
        </button>
      </div>
    </div>
  );
}
