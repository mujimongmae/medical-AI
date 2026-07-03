import type {
  RegisterReq,
  RegisterRes,
  FallEventRes,
  PatientCard,
  VoiceRes,
} from "@lib/protocol/messages";
import { HTTP_BASE } from "../config";

const API = HTTP_BASE; // 웹=/api(프록시), 네이티브=절대 브로커 URL

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

/** 데모/테스트: 시드 환자로 응급을 즉시 발생 (이웃 화면에서 혼자 테스트용) */
export const triggerDemoFall = () =>
  post<FallEventRes>("/demo/trigger", {});

export async function getPatient(id: string): Promise<PatientCard> {
  const r = await fetch(`${API}/patient/${id}`);
  if (!r.ok) throw new Error(`patient ${r.status}`);
  return r.json();
}

/** 온디바이스 STT 텍스트 → 서버(로컬 EXAONE) 프로토콜 분류. Ollama 미가동 시 서버가 폴백. */
export const sendVoice = (eventId: string, transcript: string) =>
  post<VoiceRes>("/voice", { eventId, transcript });

/** FCM 토큰 등록 (화면 꺼짐 알림). */
export const sendPushToken = (id: string, token: string, platform?: string) =>
  post<{ ok: boolean }>("/push-token", { id, token, platform });

/** 가상 심평원(HIRA) 병력 조회 — 이름으로 조회. 없으면 found:false. */
export async function lookupHistory(
  name: string,
): Promise<{ found: boolean; name: string; history: string[] }> {
  const r = await fetch(`${API}/hira?name=${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(`hira ${r.status}`);
  return r.json();
}
