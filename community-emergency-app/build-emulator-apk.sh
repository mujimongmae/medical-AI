#!/bin/bash
# 로컬 데모 전용: 에뮬레이터용 디버그 APK 빌드 (server.url=10.0.2.2:5173 라이브 웹)
# Capacitor 7 은 Java 21 필요 → JDK21 사용(유저 공간, sudo 불필요)
set -e

if [ ! -d "$HOME"/android-tools/jdk21 ]; then
  echo "[0/3] JDK21 다운로드 (Capacitor 7 요구)..."
  cd "$HOME/android-tools"
  curl -fL -o jdk21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse"
  rm -rf jdk21 && mkdir jdk21 && tar -xzf jdk21.tar.gz -C jdk21
fi

export JAVA_HOME="$(echo "$HOME"/android-tools/jdk21/*/Contents/Home)"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
echo "JAVA_HOME=$JAVA_HOME"
cd "$HOME/claude-workspace/medical-AI-hackathon/community-emergency-app"

echo "[1/3] web build (app/dist)..."
npm run build

echo "[2/3] cap sync android..."
npx cap sync android

echo "[3/3] gradle assembleDebug..."
cd android
./gradlew assembleDebug

echo "APK ->"
ls -la app/build/outputs/apk/debug/app-debug.apk
echo "BUILD DONE"
