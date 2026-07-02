#!/bin/bash
# 실폰/데모용 APK: 번들 웹(app/dist) + 터널 브로커(VITE_BROKER_URL). Capacitor7 → JDK21.
set -e
export JAVA_HOME="$(echo "$HOME"/android-tools/jdk21/*/Contents/Home)"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export VITE_BROKER_URL="https://revealed-ensuring-supporting-administrator.trycloudflare.com"
echo "JAVA_HOME=$JAVA_HOME  BROKER=$VITE_BROKER_URL"
cd "$HOME/claude-workspace/medical-AI-hackathon/community-emergency-app"

echo "[1/3] web build (번들, 브로커=$VITE_BROKER_URL)..."
VITE_BROKER_URL="$VITE_BROKER_URL" npm run build

echo "[2/3] cap sync android..."
npx cap sync android

echo "[3/3] gradle assembleDebug..."
cd android
./gradlew assembleDebug

cp app/build/outputs/apk/debug/app-debug.apk ../village-aid-realphone.apk
echo "APK -> $HOME/claude-workspace/medical-AI-hackathon/community-emergency-app/village-aid-realphone.apk"
ls -la ../village-aid-realphone.apk
echo "BUILD DONE"
