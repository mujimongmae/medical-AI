# iOS 실기기 빌드 런북 (다운로드 앱)

Capacitor iOS 프로젝트는 이미 스캐폴딩·권한 설정·웹 번들 주입까지 되어 있다.
아래는 **전체 Xcode가 필요한 사용자 단계**(헤드리스 불가)만 정리한 것.

> 📱 **iOS = 환자(어르신) 모드용.** 푸시 불필요(유료 APNs 우회) — **앱을 켜두면** 쓰러짐 감지 시
> WebSocket으로 **15초 "괜찮으세요?" 사이렌**이 온다. 그래서 iOS는 알림 권한도 안 물어봄.
> (이웃 모드=화면 꺼짐 알림이 필요해 Android/FCM 담당. iOS로 이웃도 되지만 앱이 켜져 있을 때만.)

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
5. 앱에서 **이름·병력 입력 → "어르신(환자)" 탭**(이 탭이 iOS 오디오 무장 = 사이렌 재생 허용).
   - 화면에 "● 정상 감시 중" 뜨면 연결 성공. **앱을 포그라운드로 켜둔 채** 데모.
   - 알림 권한 팝업은 안 뜬다(iOS 푸시 미사용). 마이크는 이웃 모드(음성설명) 때만 물어봄.

## 환자 15초 알림 테스트
- 아이폰 환자 화면의 **`[데모] 쓰러짐 발생`** 버튼, 또는 PC `localhost:8787/admin`에서 그 환자 "응급 발생".
- → 전체화면 빨강 + 초대형 카운트다운 + **사이렌(두 음 왕복)·진동**. 15초 무반응 시 "도움을 요청했습니다".
- ⚠️ 무음스위치/방해금지 해제, 볼륨 최대. 앱을 **잠그지 말 것**(포그라운드 유지).

## 브로커 주소가 바뀌면
`VITE_BROKER_URL=... npm run sync:ios` 재실행 → Xcode에서 다시 ▶ Run. (pod install 반복 불필요)

## 참고
- 맥북에서 `npm run dev:all`(브로커+앱)이 켜져 있어야 네이티브 앱이 동작한다.
- 안드로이드는 이후 `npx cap add android` → Android Studio에서 동일 흐름.
