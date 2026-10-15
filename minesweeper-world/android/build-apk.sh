#!/usr/bin/env bash
# Builds dist/world-minesweeper.apk without Gradle or a full Android SDK.
# Needs: Java 17+, curl, zip. Build tools are downloaded once into android/.tools:
#   android.jar (API 34)  - compile classpath + framework resources
#   aapt2                 - taken from the Apktool release jar
#   dalvik-dx             - .class -> classes.dex
#   uber-apk-signer       - zipalign + v1/v2/v3 signing (bundled debug key)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TOOLS="$HERE/.tools"
BUILD="$HERE/build"
DIST="$ROOT/dist"
VERSION_NAME="${VERSION_NAME:-0.1.0}"
VERSION_CODE="${VERSION_CODE:-1}"
MIN_SDK=24
TARGET_SDK=34

fetch() { # url dest
  [ -s "$2" ] && return
  echo "  downloading $(basename "$2")"
  curl -fsSL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}

mkdir -p "$TOOLS"
echo "[1/6] tools"
fetch https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar "$TOOLS/android.jar"
fetch https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar "$TOOLS/apktool.jar"
fetch https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/14.0.0_r21/dalvik-dx-14.0.0_r21.jar "$TOOLS/dx.jar"
fetch https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar "$TOOLS/uber-apk-signer.jar"
if [ ! -x "$TOOLS/aapt2" ]; then
  unzip -p "$TOOLS/apktool.jar" prebuilt/linux/aapt2_64 > "$TOOLS/aapt2"
  chmod +x "$TOOLS/aapt2"
fi
AAPT2="$TOOLS/aapt2"
ANDROID_JAR="$TOOLS/android.jar"

rm -rf "$BUILD" && mkdir -p "$BUILD/classes" "$BUILD/assets" "$BUILD/dex" "$DIST"

echo "[2/6] game assets"
cp -r "$ROOT/game" "$BUILD/assets/game"

echo "[3/6] resources + manifest"
"$AAPT2" compile --dir "$HERE/res" -o "$BUILD/res.zip"
"$AAPT2" link -I "$ANDROID_JAR" --manifest "$HERE/AndroidManifest.xml" -A "$BUILD/assets" \
  --min-sdk-version $MIN_SDK --target-sdk-version $TARGET_SDK \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -o "$BUILD/unsigned.apk" "$BUILD/res.zip"

echo "[4/6] java -> dex"
javac -Xlint:-options -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" \
  -d "$BUILD/classes" $(find "$HERE/src" -name '*.java')
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=$MIN_SDK \
  --output="$BUILD/dex/classes.dex" "$BUILD/classes"
(cd "$BUILD/dex" && zip -q -j "$BUILD/unsigned.apk" classes.dex)

echo "[5/6] align + sign"
java -jar "$TOOLS/uber-apk-signer.jar" -a "$BUILD/unsigned.apk" -o "$BUILD/signed" > "$BUILD/sign.log"
cp "$BUILD"/signed/*.apk "$DIST/world-minesweeper.apk"

echo "[6/6] verify"
"$AAPT2" dump badging "$DIST/world-minesweeper.apk" | head -3
java -jar "$TOOLS/uber-apk-signer.jar" -a "$DIST/world-minesweeper.apk" --onlyVerify | grep -E "VERIFY|signature|Schemes" | head -5 || true
ls -la "$DIST/world-minesweeper.apk"
