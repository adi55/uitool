# Recorder Tool Architecture

## Repository Discovery Result

The workspace at `c:\dev\uitool` was empty at implementation start. There were no existing framework sources to inspect for:

- base test classes
- login helpers
- frame helpers
- wait helpers
- toast helpers
- upload helpers
- page objects / reusable views

Because of that, the recorder is implemented as a standalone tool that targets the requested stack through a reusable profile instead of integrating with already-present project code.

## Implemented Structure

### Root-Level Tooling

- `start-recorder.bat`
  - primary Windows entry point
  - creates local config templates
  - resolves Java 17 or provisions a project-local JDK
  - builds the tool when sources are newer than the jar
  - starts the backend
  - provisions project-local Chrome for Testing
  - launches a managed Chrome session with remote debugging and the unpacked extension
  - connects to the browser and opens the recorder UI automatically
- `scripts/recorder-bootstrap.ps1`
  - shared bootstrap/runtime automation behind `start-recorder.bat`
  - owns pid files, logs, config loading, runtime-state tracking, and supporting commands such as `doctor`, `validate`, `replay`, `generate`, and `stop`
- `build-recorder.bat`, `build-recorder.sh`
  - compatibility wrappers for build/package
- `run-recorder.bat`, `run-recorder.sh`
  - compatibility wrappers for backend launch

### Backend

Location: `recorder-tool/src/main/java/com/timbpm/recorder`

Implemented modules:

1. Scenario model and IO
   - `model/*`
   - `io/ScenarioIO.java`
   - `util/StructuredData.java`
   - `validation/*`
   - `util/ScenarioVariables.java`
   - supports JSON and a practical YAML subset
   - supports `{{variable}}` references and env-backed variable definitions
2. Selector strategy
   - `selector/ElementSnapshot.java`
   - `selector/SelectorRanker.java`
   - ranking order:
     - id
     - data-testid
     - data-qa
     - name
     - aria-label
     - semantic label
     - stable text
     - css fallback
     - xpath fallback
3. Wait strategy
   - `wait/WaitPlanner.java`
   - reusable wait kinds:
     - visible
     - clickable
     - exists
     - hidden
     - disappear
     - textContains
     - valueEquals
     - enabled
     - disabled
     - collectionSize
     - urlChange
     - alertPresent
     - loadingOverlayDisappear
     - customHelper
4. Framework profile system
   - `profile/FrameworkProfile.java`
   - `profile/ProfileRegistry.java`
   - `profiles/tim-ui-junit4-selenide.properties`
5. Generator
   - `generator/JavaTestGenerator.java`
   - emits JUnit4/Selenide-style Java classes with sectioned setup/test/assertion/cleanup flow
6. Playback/backend automation
   - `playback/*`
   - Chrome launch/attach and CDP plumbing
   - replay now supports attaching to the managed browser session created by the launcher
   - CDP parsing was hardened for unicode escapes and exponent-form numeric payloads
7. HTTP server
   - `server/RecorderServer.java`
   - endpoints:
     - `GET /api/health`
     - `GET /api/profiles`
     - `GET /api/scenario/list`
     - `GET /api/scenario/load?file=<name>`
     - `POST /api/scenario/validate`
     - `POST /api/scenario/save`
     - `POST /api/generate/java`
     - `POST /api/replay`

### Chrome Extension

Location: `recorder-tool/chrome-extension`

Implemented pieces:

- `manifest.json`
- `background.js`
  - scenario state
  - step delete/reorder
  - save/export/generate integration
  - local playback controls
  - navigation step capture
- `content.js`
  - click/type/select/upload capture
  - selector candidate extraction
  - assertion target selection and smart suggestions
  - same-document local playback executor
- `panel.html`, `panel.css`, `panel.js`
  - start/pause/resume/stop recording
  - undo
  - move/delete selected step
  - assertion mode
  - setup/test/cleanup tagging
  - notes
  - replay / replay-from-selected
  - pause / resume / next / retry / skip / stop playback
  - export/save
  - Java generation

### Examples, Generated Output, and Compatibility Layer

- `recorder-tool/examples`
  - JSON example for the nightly login flow candidate
  - YAML example for upload alias modeling
- `recorder-tool/generated`
  - generated Java tests
- `recorder-tool/src/compat/java`
  - local compile-only compatibility stubs for:
    - `org.junit`
    - `org.openqa.selenium`
    - `com.codeborne.selenide`
    - inferred support classes under `com.timbpm.generated.support`

## Integration Points

### Bootstrap and Managed Runtime

The practical runtime contract on Windows is now:

1. `start-recorder.bat`
2. bootstrap resolves config and credentials
3. bootstrap ensures Java/build artifacts exist
4. bootstrap ensures a managed Chrome for Testing runtime exists
5. bootstrap starts the backend server
6. bootstrap starts or reconnects to the managed browser session
7. bootstrap confirms the extension service worker/page via CDP and opens `panel.html`

This keeps the user-facing startup flow close to a single command while preserving the agreed architecture:

- Java 17 backend
- zero-build Chrome extension
- no Node/npm dependency

### Chrome Runtime Strategy

The launcher now prefers project-local Chrome for Testing instead of the user's installed Chrome. This is a practical compatibility decision, not an architecture change.

Reason:

- branded Chrome 137+ removed the `--load-extension` flag for unpacked extension loading
- the recorder relies on automatic unpacked extension startup for the near-zero-manual workflow
- Chrome for Testing still provides a practical managed browser runtime for this use case

Fallback:

- if managed Chrome provisioning fails, the launcher can still fall back to installed Chrome for backend replay/debugging
- in that fallback mode, automatic recorder extension startup may not be available

### Profile-Based Framework Mapping

The `tim-ui-junit4-selenide` profile captures:

- Java package convention
- base test class
- wait helper class
- alert helper class
- frame helper class
- toast helper class
- upload helper class
- login helper class placeholder

This keeps framework-specific assumptions centralized instead of scattering hardcoded names through the generator.

### Upload Alias Handling

Upload steps are stored with logical aliases such as `workflowZip`. Actual file paths are resolved later via:

- scenario `uploadAliases`
- replay request `uploadMappings`
- generated test `resolveUploadAlias(...)`

### Variable and Secret Handling

Scenario variables can be stored as:

- literal strings
- env-backed definitions with `source=env`

Recorded or curated steps can reference variables through exact placeholders such as `{{username}}`.

This is used by the nightly example so generated Java and replay flows do not hardcode credentials in the repository.

### Selector Stability and TODO Surfacing

Each recorded selector stores:

- primary selector
- fallbacks
- confidence score
- explanation

The Java generator emits TODO comments when XPath fallback or low-confidence selectors are used.

## Live Nightly Login Findings

Inspected on 2026-03-31:

- URL: `https://nightly.tim-bpm.com/tim/client/login`
- default rendered form fields:
  - `Username` with id `email1`
  - `Password` with id `password1`
  - `Login` button
- no tenant/client field is shown by default
- query parameter `?tenant=pm` causes the login page to add a tenant selector prefilled with `pm`
- login code path:
  - if tenant is present, submitted username becomes `tenant + "/" + username`
  - auth endpoint is `POST /tim/api/auth/login`
  - password is base64-encoded before submission by the frontend

## Validation Status

Validated successfully:

- single-command launcher start on Windows
- config template creation
- managed Chrome for Testing provisioning
- managed browser launch with remote debugging
- automatic extension startup in the managed browser
- backend compilation
- self-tests
- generated Java compilation against compatibility stubs
- packaged jar startup and `/api/health`
- packaged jar startup and `/api/scenario/list`
- packaged jar startup and `/api/scenario/validate`
- `start-recorder.bat validate`
- `start-recorder.bat generate`
- `start-recorder.bat replay`
- live DOM inspection of the nightly login page
- live auth endpoint inspection

Blocked / partial:

- successful authenticated navigation through the nightly login flow could not be validated with the available credentials
- the provided nightly credentials were rejected by the live auth endpoint in all tested shapes:
  - `sme` + `pm`
  - `sme` + `task!nmotion`
  - `pm/sme` + `pm`
  - `pm/sme` + `task!nmotion`

## Assumptions

- On Windows, Java 17 and Chrome no longer need to be preinstalled manually for the standard launcher flow when automatic provisioning succeeds.
- Node.js is not required.
- Generated tests are compile-validated locally against compatibility stubs because the actual target framework jars are not present in this workspace.
- The final real project should replace the inferred support classes/profile mappings with the actual framework classes once those sources are available.
