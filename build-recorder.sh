#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

rm -rf build dist
mkdir -p build/classes/main build/classes/compat build/classes/test build/classes/generated dist

find recorder-tool/src/main/java -name '*.java' | sort > build/main-sources.txt
find recorder-tool/src/compat/java -name '*.java' | sort > build/compat-sources.txt
find recorder-tool/src/test/java -name '*.java' | sort > build/test-sources.txt

javac -d build/classes/main @build/main-sources.txt
javac -cp build/classes/main -d build/classes/compat @build/compat-sources.txt
javac -cp build/classes/main -d build/classes/test @build/test-sources.txt

java -cp build/classes/main:build/classes/test com.timbpm.recorder.tests.RecorderToolSelfTest
java -cp build/classes/main com.timbpm.recorder.Main generate --scenario recorder-tool/examples/nightly-login-candidate-tasknmotion.json --profile tim-ui-junit4-selenide --class NightlyLoginGeneratedTest

find recorder-tool/generated/java -name '*.java' | sort > build/generated-sources.txt
javac -cp build/classes/main:build/classes/compat -d build/classes/generated @build/generated-sources.txt

jar --create --file dist/recorder-tool.jar --main-class com.timbpm.recorder.Main -C build/classes/main .
jar --create --file dist/chrome-extension.zip -C recorder-tool/chrome-extension .
mkdir -p dist/chrome-extension
cp -R recorder-tool/chrome-extension/. dist/chrome-extension/

echo "Build complete."
echo "  dist/recorder-tool.jar"
echo "  dist/chrome-extension.zip"
