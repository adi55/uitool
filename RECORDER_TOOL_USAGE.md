# Recorder Tool Usage

## Primary Entry Point

Windows primary command:

```bat
start-recorder.bat
```

This command now handles the practical local bootstrap flow end to end:

- creates `config/recorder.local.properties` if missing
- detects Java 17
- falls back to provisioning a project-local JDK if needed
- builds the backend jar and extension package if required
- starts the backend server
- provisions project-local Chrome for Testing if needed
- launches Chrome with:
  - a dedicated user-data directory
  - a remote debugging port
  - the unpacked recorder extension
  - the nightly startup URL
- connects to the launched browser
- opens the recorder UI automatically

Outputs:

- `dist/recorder-tool.jar`
- `dist/chrome-extension.zip`
- `dist/chrome-extension/`

Supporting commands:

```bat
start-recorder.bat doctor
start-recorder.bat validate
start-recorder.bat replay
start-recorder.bat generate
start-recorder.bat stop
```

Compatibility wrappers:

```bat
build-recorder.bat
run-recorder.bat
```

Health check:

- `http://127.0.0.1:17845/api/health`

Chrome debug endpoint:

- `http://127.0.0.1:9222/json/version`

## Credentials and Local Config

The launcher auto-creates:

- `config/recorder.local.properties`
- `config/recorder.local.properties.template`

Resolution order:

1. environment variables
2. `config/recorder.local.properties`

Important keys:

- `TIM_UI_RECORDER_USERNAME`
- `TIM_UI_RECORDER_PASSWORD`
- `TIM_UI_RECORDER_LOGIN_URL`
- `TIM_UI_RECORDER_SERVER_PORT`
- `TIM_UI_RECORDER_CHROME_DEBUG_PORT`
- `TIM_UI_RECORDER_CHROME_PATH`

Only the credentials require user input. No code edit is needed.

## Record a Scenario

1. Run `start-recorder.bat`.
2. Wait for the browser and recorder UI to open.
3. In the recorder UI, set:
   - scenario name
   - backend URL
   - framework profile
   - optional Java class name
4. Click `Start`.
5. Perform UI actions in the page:
   - clicks
   - typing
   - selects
   - checkbox/radio changes
   - file uploads
   - navigations
6. Use recorder controls as needed:
   - `Pause`
   - `Resume`
   - `Stop`
   - `Undo`
   - `Move Up`
   - `Move Down`
   - `Delete Step`
   - `Mark Setup`
   - `Mark Test`
   - `Mark Cleanup`
   - `Add Note`

## Add Assertions

1. Click `Add Assertion`.
2. Click a target element in the page.
3. The side panel will show smart assertion suggestions based on the element type.
4. Choose a suggestion.
5. Edit the expected value if needed.
6. Click `Create Assertion Step`.

Smart suggestions currently include:

- button: visible / enabled
- input: value equals / enabled
- generic text targets: text contains / text equals
- generic elements: visible / hidden

## Replay a Scenario

Primary backend replay command:

```bat
start-recorder.bat replay
```

This reuses the managed Chrome debug session started by `start-recorder.bat`.

Extension-side local replay controls are also available:

- `Replay`
- `Replay From`
- `Pause Play`
- `Resume Play`
- `Next`
- `Retry`
- `Skip`
- `Stop Play`

The previous CDP parser/runtime instability was fixed in this round. The remaining live failure against nightly is now the final login outcome, not CDP connectivity.

## Save or Export a Scenario

From the side panel:

- `Save`
  - sends the scenario to `POST /api/scenario/save`
  - rejects invalid scenario payloads with structured validation errors
  - writes to `recorder-tool/examples`
- `Export`
  - downloads the scenario JSON from the extension state

Backend scenario management endpoints:

- `GET /api/scenario/list`
- `GET /api/scenario/load?file=<name>`
- `POST /api/scenario/validate`

Supported scenario formats in the backend:

- JSON
- YAML subset

Example files:

- `recorder-tool/examples/nightly-login-candidate-tasknmotion.json`
- `recorder-tool/examples/generic-upload-example.yaml`

## Generate Java Tests

From the side panel:

- click `Generate Java`

From the launcher:

```bat
start-recorder.bat generate
```

Direct jar command:

```bash
java -jar dist/recorder-tool.jar generate --scenario recorder-tool/examples/nightly-login-candidate-tasknmotion.json --profile tim-ui-junit4-selenide --class NightlyLoginGeneratedTest
```

Generated output path:

- `recorder-tool/generated/java/com/timbpm/generated/ui/NightlyLoginGeneratedTest.java`

## Run the Example Login Scenario

Scenario file:

- `recorder-tool/examples/nightly-login-candidate-tasknmotion.json`

Generated Java test:

- `recorder-tool/generated/java/com/timbpm/generated/ui/NightlyLoginGeneratedTest.java`

Before replaying the nightly example, supply:

- `TIM_UI_RECORDER_USERNAME`
- `TIM_UI_RECORDER_PASSWORD`

Recommended options:

- set them in the environment before running `start-recorder.bat replay`
- or put them into `config/recorder.local.properties`

Live findings from 2026-03-31:

- default page fields:
  - username id `email1`
  - password id `password1`
- `?tenant=pm` adds a tenant selector and prefixes the submitted username as `pm/<username>`

Current blocker:

- the launcher, backend, managed browser, extension load, and replay flow now run automatically
- the nightly login still does not complete successfully with the currently supplied credentials, so the final live assertion fails on the login page
- because of that, the saved login scenario and generated Java test represent the discovered UI flow and credential assumptions, but successful authenticated navigation could not be validated end-to-end against the current nightly environment

## Packaging Summary

The delivered MVP-to-usable package is:

- primary launcher: `start-recorder.bat`
- backend jar: `dist/recorder-tool.jar`
- unpacked extension: `dist/chrome-extension/`
- zipped extension: `dist/chrome-extension.zip`
- support scripts:
  - `build-recorder.bat`
  - `build-recorder.sh`
  - `run-recorder.bat`
  - `run-recorder.sh`
