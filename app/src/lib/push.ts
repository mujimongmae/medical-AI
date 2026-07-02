import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { sendPushToken } from "./api";

// FCM 등록 → 토큰을 브로커에 전달 (화면 꺼짐 알림용).
// 웹 브라우저에서는 미지원이라 조용히 no-op.
export async function initPush(userId: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    // 고importance '응급' 채널 (헤드업 + 소리). Android 전용.
    if (Capacitor.getPlatform() === "android") {
      try {
        await PushNotifications.createChannel({
          id: "emergency",
          name: "응급 알림",
          description: "응급 상황 호출",
          importance: 5, // MAX
          sound: "default",
          visibility: 1, // public (잠금화면 표시)
          vibration: true,
        });
      } catch {
        /* noop */
      }
    }

    PushNotifications.addListener("registration", (t) => {
      void sendPushToken(userId, t.value, Capacitor.getPlatform());
    });
    PushNotifications.addListener("registrationError", () => {
      /* 무시 (데모) */
    });

    await PushNotifications.register();
  } catch {
    /* 미지원 환경 무시 */
  }
}
