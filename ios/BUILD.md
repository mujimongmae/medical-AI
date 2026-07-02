# iOS 실기기 빌드 런북 (다운로드 앱)

Capacitor iOS 프로젝트는 이미 스캐폴딩·권한 설정·웹 번들 주입까지 되어 있다.
아래는 **전체 Xcode가 필요한 사용자 단계**(헤드리스 불가)만 정리한 것.

## 사전 준비 (1회)
1. **App Store에서 Xcode 설치** (수 GB, 시간 걸림) → 실행해 라이선스 동의.
2. Xcode를 기본 개발자 디렉터리로 지정:
   ```
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
3. CocoaPods는 이미 설치됨(`pod --version`). 없으면 `brew install cocoapods`.

## 브로커 주소 정하기 (둘 중 하나)
네이티브 앱은 Vite 프록시가 없으므로 **브로커 절대 주소**를 빌드에 주입해야 한다.
- **(A) 터널** — 맥북에서 `npm run dev:all` + `cloudflared tunnel --url http://localhost:5173` 실행 → 나온 `https://....trycloudflare.com`.
  - ⚠️ quick 터널 URL은 **재시작하면 바뀜** → 바뀔 때마다 아래 빌드 재실행.
- **(B) 같은 와이파이 LAN** — 맥북 IP 확인(`ipconfig getifaddr en0`) → `http://<맥북IP>:5173`. (Info.plist ATS 예외 이미 설정됨)

## 빌드 → 실행
```bash
# 1) 브로커 주소를 주입해 웹 빌드 + iOS로 복사
VITE_BROKER_URL="https://<위에서 정한 주소>" npm run sync:ios

# 2) CocoaPods 의존성 설치 (최초 1회, 이후 플러그인 바뀔 때)
cd ios/App && pod install && cd ../..

# 3) Xcode 열기
npx cap open ios
```
Xcode에서:
1. 좌측 **App 타깃 → Signing & Capabilities** → **Team**에 본인 Apple ID 추가(무료 계정 가능, 7일 유효).
2. Bundle Identifier가 중복이면 살짝 변경(예: `kr.gangwon.villageaid.hong`).
3. 아이폰을 USB 연결 → 상단 기기 목록에서 선택 → **▶ Run**.
4. 아이폰: **설정 → 일반 → VPN 및 기기 관리**에서 개발자 앱 **신뢰** → 앱 실행.
5. 앱에서 마이크 권한 "허용".

## 브로커 주소가 바뀌면
`VITE_BROKER_URL=... npm run sync:ios` 재실행 → Xcode에서 다시 ▶ Run. (pod install 반복 불필요)

## 참고
- 맥북에서 `npm run dev:all`(브로커+앱)이 켜져 있어야 네이티브 앱이 동작한다.
- 안드로이드는 이후 `npx cap add android` → Android Studio에서 동일 흐름.
