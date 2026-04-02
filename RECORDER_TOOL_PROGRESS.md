# Recorder Tool Progress

## Context

- Date: 2026-03-31
- Workspace: `c:\dev\uitool`
- Observation: the workspace was empty at start; no existing Selenium/Selenide framework sources were present to inspect.
- Approach: build a standalone recorder platform that targets the requested Java stack and documents all inferred framework assumptions in a reusable profile.

## Work Log

### 2026-03-31 13:55

- Confirmed the workspace is empty and not a Git repository.
- Verified local tooling: Java 17, `javac`, Maven, and Google Chrome are available; Node.js is not installed.
- Chosen implementation shape:
  - Java 17 backend/server/generator/playback runner
  - Chrome extension frontend with no Node build step
  - custom JSON/YAML scenario serialization to avoid external dependency risk
  - packaged jar + extension zip + launch scripts

### 2026-03-31 14:00

- Created the required progress log and architecture/usage documentation placeholders.
- Established the working assumption that `tim-ui-junit4-selenide` must be inferred from the requested stack because no local framework code exists to map.

### 2026-03-31 15:00

- Implemented the core Java backend model:
  - scenario document schema
  - selector metadata and ranking
  - wait strategy model
  - profile registry
  - JSON and YAML serialization
- Added local compatibility stubs for JUnit4, Selenium, and Selenide to support compile validation without external jars.
- Added generator logic that emits maintainable Java tests with setup/test/assertion/cleanup sections.

### 2026-03-31 16:00

- Implemented the Chrome extension:
  - side-panel UI
  - background state management
  - content-script recording
  - assertion target picking
  - local replay controls
- Implemented backend HTTP endpoints for profile listing, scenario saving, Java generation, and replay.
- Added example scenarios:
  - nightly login JSON
  - upload YAML

### 2026-03-31 17:00

- Packaged the tool with:
  - `build-recorder.bat`
  - `build-recorder.sh`
  - `run-recorder.bat`
  - `run-recorder.sh`
  - `dist/recorder-tool.jar`
  - `dist/chrome-extension.zip`
- Ran self-tests successfully.
- Generated and compile-validated `NightlyLoginGeneratedTest.java`.
- Started the packaged jar and verified `GET /api/health`.
- Inspected the live nightly login page and auth implementation.
- Confirmed the live page currently exposes:
  - username field `email1`
  - password field `password1`
  - optional tenant flow via `?tenant=pm`

### 2026-03-31 17:15

- Attempted live auth validation against the discovered endpoint `/tim/api/auth/login`.
- Confirmed the current nightly environment rejects all provided credential combinations tested:
  - `sme` + `pm`
  - `sme` + `task!nmotion`
  - `pm/sme` + `pm`
  - `pm/sme` + `task!nmotion`
- Left the scenario and generated test in place with this blocker documented explicitly.

### 2026-04-01 08:38

- Added a first-class Java validation layer:
  - `ScenarioValidator`
  - structured validation results and issues
  - CLI validation command
  - server-side request validation before save/generate/replay
- Added scenario variable resolution with `{{variable}}` references and env-backed variables.
- Removed hardcoded nightly credentials from the example login scenario and generated Java output:
  - `TIM_UI_RECORDER_USERNAME`
  - `TIM_UI_RECORDER_PASSWORD`
- Expanded the wait model foundation with:
  - `clickable`
  - `exists`
  - `textContains`
  - `valueEquals`
  - `enabled`
  - `disabled`
- Added backend scenario management endpoints:
  - `GET /api/scenario/list`
  - `GET /api/scenario/load`
  - `POST /api/scenario/validate`
- Improved the extension side panel with practical editing/playback controls:
  - move step up
  - move step down
  - delete selected step
  - mark selected step back to `test`
  - resume playback
- Fixed step id generation so deleting/reordering steps does not create duplicate ids.
- Re-ran:
  - `build-recorder.bat`
  - self-tests
  - generated Java compile validation
  - runtime checks for `/api/scenario/list`, `/api/scenario/validate`, and `/api/health`

### 2026-04-01 09:45

- Added a single Windows entry point:
  - `start-recorder.bat`
  - backed by `scripts/recorder-bootstrap.ps1`
- Automated local runtime bootstrap:
  - project-local config template creation under `config/`
  - Java 17 detection with project-local JDK provisioning fallback via Adoptium
  - managed Chrome for Testing provisioning under `.runtime/chrome-for-testing`
  - backend pid/log handling
  - managed Chrome launch with:
    - dedicated `user-data-dir`
    - remote debugging port
    - startup URL
    - unpacked extension preload
- Removed the practical need to manually load the extension when the managed browser path is used:
  - the launcher now opens Chrome for Testing
  - detects the extension service worker/page via CDP
  - opens `panel.html` automatically if needed
- Confirmed the current installed Chrome limitation:
  - branded Chrome 137+ removed `--load-extension`
  - the launcher therefore prefers managed Chrome for Testing instead of relying on the user’s installed Chrome
- Hardened backend replay against the live site:
  - upgraded JSON parsing for CDP payloads to support exponent numbers and unicode escapes
  - added clearer CDP payload diagnostics
  - validated that the previous replay/runtime parser failure is gone
- Re-validated the launcher surface:
  - `start-recorder.bat doctor`
  - `start-recorder.bat`
  - `start-recorder.bat validate`
  - `start-recorder.bat generate`
  - `start-recorder.bat replay`
  - backend health endpoint
  - Chrome debug endpoint
- Current automation status:
  - automated now:
    - config file creation
    - Java detection
    - local JDK fallback provisioning
    - build/package
    - backend start
    - managed Chrome provisioning
    - Chrome launch/connect
    - extension startup in the managed browser
    - scenario validate/generate
    - backend replay attach to the launched browser
  - still requires human input:
    - supplying nightly credentials through environment variables or `config/recorder.local.properties`
  - still blocked by the target environment:
    - the nightly login scenario reaches the live login page and executes stably, but the login does not complete successfully with the currently provided credentials, so the final assertion still fails on the live environment

## Current Plan

1. Completed: scaffold the Java project, extension, examples, and build scripts.
2. Completed: implement the scenario model, selector ranking, wait engine, framework profile system, and JSON/YAML IO.
3. Completed: build the recorder UI and local replay workflow.
4. Completed: implement backend playback, generation, packaging, and example scenario generation.
5. Completed: add validation, env-backed variable handling, and server-side scenario management endpoints.
6. Completed with blocker documented: automate local execution end-to-end and document the remaining live nightly credential limitation precisely.
