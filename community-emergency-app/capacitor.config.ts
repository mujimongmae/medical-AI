import type { CapacitorConfig } from "@capacitor/cli";

// 데모 앱을 다운로드 가능한 네이티브 앱으로 패키징 (iOS 우선).
// webDir = Vite 빌드 산출물(app/dist). 네이티브 앱은 이 정적 번들을 담고,
// 브로커(맥북)에는 빌드 시 VITE_BROKER_URL(터널 https/wss)로 직결한다.
const config: CapacitorConfig = {
  appId: "kr.gangwon.villageaid",
  appName: "마을 응급대응",
  webDir: "app/dist",
  // 실폰/제출용: 번들 웹(app/dist) + 빌드 시 VITE_BROKER_URL(터널 https/wss)로 브로커 직결.
  ios: {
    contentInset: "always",
  },
};

export default config;
