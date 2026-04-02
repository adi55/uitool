#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f dist/recorder-tool.jar ]; then
  ./build-recorder.sh
fi

java -jar dist/recorder-tool.jar server 17845
