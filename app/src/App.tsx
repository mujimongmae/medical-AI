import { useEffect, useState } from "react";
import type { Role } from "@lib/protocol/messages";
import { GLOBAL_DISCLAIMER } from "@lib/first-aid/schema";
import { register, lookupHistory } from "./lib/api";
import { initPush } from "./lib/push";
import { primeAudio } from "./lib/audio";
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
    <p className="disclaimer px-4 py-2 text-sm leading-snug">
      {GLOBAL_DISCLAIMER}
    </p>
  );
}

function RolePicker({ onDone }: { onDone: (m: Me) => void }) {
  const [name, setName] = useState("");
  const [history, setHistory] = useState(""); // 병력(콤마 구분) — 보호자 입력
  const [busy, setBusy] = useState(false);
  const [loadingHx, setLoadingHx] = useState(false); // 병력 불러오기 조회 중
  const [error, setError] = useState("");

  function save(me: Me) {
    localStorage.setItem(ME_KEY, JSON.stringify(me));
    onDone(me);
  }

  // 심평원 병력 조회: 입력한 이름으로 조회 · 최소 1초 로딩(스피너) 유지 후 채우기.
  // 등록된 이름이면 그 병력을, 없는 이름이면 "당뇨, 고혈압"으로 채운다.
  async function loadHx() {
    if (loadingHx) return;
    const q = name.trim();
    if (!q) {
      setError("이름을 먼저 입력해 주세요.");
      return;
    }
    setLoadingHx(true);
    setHistory("");
    setError("");
    try {
      const [res] = await Promise.all([
        lookupHistory(q),
        new Promise((r) => setTimeout(r, 1000)), // 최소 1초 로딩 유지
      ]);
      setHistory(res.found && res.history.length ? res.history.join(", ") : "당뇨, 고혈압");
    } catch {
      setError("병력 조회에 실패했어요. 서버 연결을 확인해 주세요.");
    } finally {
      setLoadingHx(false);
    }
  }

  async function pick(role: Role) {
    if (!name.trim() || busy) return;
    primeAudio(); // 사용자 탭 시점에 오디오 무장(iOS 사이렌 대비)
    setBusy(true);
    setError("");
    try {
      const home = {
        lat: 37.55 + (Math.random() - 0.5) * 0.02,
        lng: 128.4 + (Math.random() - 0.5) * 0.02,
      };
      const hx = history
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { id } = await register({ role, name: name.trim(), village: VILLAGE, home, history: hx });
      save({ id, role, name: name.trim() });
    } catch {
      setError(
        "등록에 실패했어요. 브로커 서버(npm run server)가 켜져 있는지 확인한 뒤 다시 시도해 주세요.",
      );
      setBusy(false);
    }
  }

  // 환자 폰을 홈캠이 감시하는 대상(seed-patient-1, 병력 有)에 바인딩 → 실제 감지 시 ALERT_SELF 수신
  function startAsSeed() {
    primeAudio(); // 사용자 탭 시점에 오디오 무장
    save({ id: "seed-patient-1", role: "patient", name: "김복순(합성)" });
  }

  const disabled = !name.trim() || busy;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">골든 이웃</h1>
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

      <label className="flex flex-col gap-2 text-lg font-semibold">
        <span className="flex items-center justify-between gap-2">
          병력
          <button
            type="button"
            disabled={loadingHx}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ai-100 px-3 py-2 text-sm font-bold text-ai-900 active:opacity-80 disabled:opacity-60"
            onClick={loadHx}
          >
            {loadingHx && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ai-900/30 border-t-ai-900" />
            )}
            {loadingHx ? "불러오는 중…" : "병력 불러오기"}
          </button>
        </span>
        <span className="font-normal text-gray-500">(환자만, 콤마로 구분 — 선택)</span>
        <div className="relative">
          <input
            className="w-full rounded-lg border-2 border-gray-300 px-4 py-4 text-lg font-normal disabled:bg-gray-50"
            value={history}
            onChange={(e) => setHistory(e.target.value)}
            placeholder={loadingHx ? "심평원에서 병력을 조회합니다…" : "예: 고혈압, 당뇨"}
            autoComplete="off"
            disabled={loadingHx}
          />
          {loadingHx && (
            <span className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-gray-300 border-t-ai" />
          )}
        </div>
      </label>

      <p className="mt-2 text-lg font-bold">역할을 선택하세요</p>
      <div className="flex flex-col gap-4">
        <button
          className="cta-emph rounded-2xl bg-ai-100 px-6 py-6 text-left text-xl font-bold text-ai-900 disabled:opacity-40"
          disabled={disabled}
          onClick={() => pick("patient")}
        >
          어르신 (환자)
          <span className="mt-1 block text-base font-normal text-ai-700">
            평소 폰을 켜두면 이상 시 자동으로 도움을 요청해요.
          </span>
        </button>
        <button
          className="cta-emph rounded-2xl bg-safe-100 px-6 py-6 text-left text-xl font-bold text-safe-700 disabled:opacity-40"
          disabled={disabled}
          onClick={() => pick("neighbor")}
        >
          이웃 (도움 주는 사람)
          <span className="mt-1 block text-base font-normal text-safe-700">
            마을에 응급상황이 생기면 이 폰으로 호출을 받아요.
          </span>
        </button>
      </div>

      <button
        className="cta-emph mt-2 rounded-2xl bg-white px-6 py-4 text-base font-bold text-gray-700 disabled:opacity-40"
        disabled={busy}
        onClick={startAsSeed}
      >
        김복순 어르신(병력 有)으로 바로 시작
      </button>

      {busy && <p className="text-base text-gray-500">등록 중…</p>}
      {error && <p className="text-base font-semibold text-danger">{error}</p>}
    </div>
  );
}
