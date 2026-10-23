#!/bin/sh
# src/*.gs 를 하나의 Code.gs 로 합쳐 dist/ 에 만든다 (Apps Script 편집기에 붙여넣기용)
set -e
cd "$(dirname "$0")"
mkdir -p dist
{
  echo "// 업무기록 시트 — Apps Script (src/*.gs 를 build.sh 로 합친 파일입니다. 직접 고치지 말고 src 를 고치세요.)"
  for f in src/*.gs; do
    echo ""
    echo "// ===== $(basename "$f") ====="
    cat "$f"
  done
} > dist/Code.gs
cp src/Sidebar.html dist/Sidebar.html
cp src/appsscript.json dist/appsscript.json
echo "dist/Code.gs: $(wc -l < dist/Code.gs) lines"
