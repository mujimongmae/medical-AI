// FCM 푸시 전송 (화면 꺼짐 알림). 서비스 계정 없으면 graceful 비활성.
// 서비스 계정 경로: env FIREBASE_SERVICE_ACCOUNT, 없으면 리포 루트의 *firebase-adminsdk*.json 자동 탐색.
import { readFileSync, existsSync, readdirSync } from "fs";
import { initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function findServiceAccount(): string | null {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (env && existsSync(env)) return env;
  // 리포 루트에서 *firebase-adminsdk*.json 탐색
  try {
    const hit = readdirSync(".").find(
      (f) => /firebase-adminsdk.*\.json$/.test(f),
    );
    if (hit && existsSync(hit)) return hit;
  } catch {
    /* noop */
  }
  return null;
}

let app: App | null = null;
let enabled = false;

export function initPush(log: (m: string) => void) {
  const path = findServiceAccount();
  if (!path) {
    log("FCM 비활성 — 서비스 계정 파일 없음 (화면 꺼짐 알림 미동작)");
    return;
  }
  try {
    const sa = JSON.parse(readFileSync(path, "utf8"));
    app = initializeApp({ credential: cert(sa) });
    enabled = true;
    log(`FCM 활성 (project=${sa.project_id})`);
  } catch (e) {
    log(`FCM 초기화 실패: ${(e as Error).message}`);
  }
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** 특정 토큰으로 고우선순위 푸시. 실패해도 throw 안 함(데모 안정성). */
export async function sendPush(
  token: string | undefined,
  payload: PushPayload,
): Promise<boolean> {
  if (!enabled || !app || !token) return false;
  try {
    await getMessaging(app).send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: {
        priority: "high",
        notification: {
          channelId: "emergency",
          sound: "default",
          priority: "max",
          visibility: "public",
        },
      },
      apns: {
        payload: { aps: { sound: "default", "interruption-level": "time-sensitive" } },
      },
    });
    return true;
  } catch {
    return false;
  }
}

export const pushEnabled = () => enabled;
