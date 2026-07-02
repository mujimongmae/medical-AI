import type {
  RegisterReq,
  RegisterRes,
  FallEventRes,
  PatientCard,
} from "@lib/protocol/messages";

const API = "/api"; // Vite 프록시 → 브로커(:8787). 네이티브/터널은 빌드시 교체.

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}

export const register = (body: RegisterReq) =>
  post<RegisterRes>("/register", body);

/** mock: 쓰러짐 이벤트 가상 생성 (추후 실제 영상인식으로 스왑) */
export const triggerFall = (patientId: string) =>
  post<FallEventRes>("/fall-event", { patientId });

export async function getPatient(id: string): Promise<PatientCard> {
  const r = await fetch(`${API}/patient/${id}`);
  if (!r.ok) throw new Error(`patient ${r.status}`);
  return r.json();
}
