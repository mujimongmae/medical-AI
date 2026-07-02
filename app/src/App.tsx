import { useEffect, useState } from "react";
import type { Role } from "@lib/protocol/messages";
import { GLOBAL_DISCLAIMER } from "@lib/first-aid/schema";
import { register } from "./lib/api";
import { initPush } from "./lib/push";
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

  // 로그인(역할 확정)되면 FCM 토큰 등록 (네이티브에서만 동작)
  useEffect(() => {
    if (me) void initPush(me.id);
  }, [me]);

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
        className="m-4 self-center rounded-lg px-4 py-2 text-base text-gray-500 underline"
        onClick={() => {
          // 한 폰 이중 테스트: 환자↔이웃 전환 시 실수 방지 확인
          if (!window.confirm("역할을 바꾸고 다시 등록할까요? (환자 ↔ 이웃 전환)")) return;
          localStorage.removeItem(ME_KEY);
          setMe(null);
        }}
      >
        역할 변경 (환자 ↔ 이웃)
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
  const [error, setError] = useState("");

  async function pick(role: Role) {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
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
    } catch {
      setError(
        "등록에 실패했어요. 브로커 서버(npm run server)가 켜져 있는지 확인한 뒤 다시 시도해 주세요.",
      );
      setBusy(false);
    }
  }

  const disabled = !name.trim() || busy;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">마을 응급대응</h1>
      <label className="flex flex-col gap-2 text-lg font-semibold">
        이름
        <input
          className="rounded-lg border-2 border-gray-300 px-4 py-4 text-xl font-normal"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 김순자 (합성)"
          autoComplete="off"
        />
      </label>
      <p className="text-base text-gray-500">
        직접 입력이 어려우시면 보호자나 마을 담당자가 대신 입력해 주세요.
      </p>

      <p className="mt-2 text-lg font-bold">역할을 선택하세요</p>
      <div className="flex flex-col gap-4">
        <button
          className="rounded-xl bg-blue-600 px-6 py-6 text-left text-xl font-bold text-white disabled:opacity-40"
          disabled={disabled}
          onClick={() => pick("patient")}
        >
          어르신 (환자)
          <span className="mt-1 block text-base font-normal text-blue-100">
            평소 폰을 켜두면 이상 시 자동으로 도움을 요청해요.
          </span>
        </button>
        <button
          className="rounded-xl bg-safe px-6 py-6 text-left text-xl font-bold text-white disabled:opacity-40"
          disabled={disabled}
          onClick={() => pick("neighbor")}
        >
          이웃 (도움 주는 사람)
          <span className="mt-1 block text-base font-normal text-green-100">
            마을에 응급상황이 생기면 이 폰으로 호출을 받아요.
          </span>
        </button>
      </div>

      {busy && <p className="text-base text-gray-500">등록 중…</p>}
      {error && <p className="text-base font-semibold text-danger">{error}</p>}
    </div>
  );
}
