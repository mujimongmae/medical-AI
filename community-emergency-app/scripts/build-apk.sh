#!/usr/bin/env bash
# 갤럭시용 디버그 APK 빌드 (브로커 주소 주입)
# 사용: VITE_BROKER_URL="https://xxx.trycloudflare.com" ./scripts/build-apk.sh
set -e
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$PATH"

: "${VITE_BROKER_URL:?브로커 URL이 필요합니다. 예: VITE_BROKER_URL=https://xxx.trycloudflare.com ./scripts/build-apk.sh}"

cd "$(dirname "$0")/.."
echo "▶ 웹 빌드 (브로커=$VITE_BROKER_URL)"
VITE_BROKER_URL="$VITE_BROKER_URL" npm run build
echo "▶ 안드로이드로 복사"
npx cap copy android
echo "▶ Gradle assembleDebug"
( cd android && ./gradlew assembleDebug --no-daemon )
cp android/app/build/outputs/apk/debug/app-debug.apk ./village-aid-debug.apk
echo "✅ APK: $(pwd)/village-aid-debug.apk"
