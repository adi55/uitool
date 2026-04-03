# Failed-State Run Next Step Live Validation

Run folder: testingtheapp/runs/20260403-133200-failed-next-step-live-pass

## Failure Capture
- Step index: 3
- Step id: step-004
- Step type: assert_text_equals
- Selector: id = message
- Replay status: failed
- failedStepIndex: 3
- currentStepIndex: 3
- selectedStepIndex: 3
- stepInProgress: False
- Run Next Step enabled: True
- Retry Failed enabled: True
- Skip Step enabled: True
- last error: Error: Assertion failed: expected text "Logged in as bob" but got "Logged in as alice"

## Run Next Step Result
- Replay status after next step: failed
- Replay summary after next step: Replay: Failed at step 4 of 4 (Hybrid)
- Replay help after next step: Replay stopped at step 4. Review the error, edit the step if needed, then use Retry Failed, Skip Step, or Replay From Selected.
- selectedStepIndex after next step: 3
- failedStepIndex after next step: 3
- currentStepIndex after next step: 3
- stepInProgress after next step: False
- Run Next Step enabled after settle: True
- Retry Failed enabled after settle: True
- Skip Step enabled after settle: True
- last error after next step: Error: Assertion failed: expected text "Logged in as bob" but got "Logged in as alice"
- Step 4/4 started entries in recent logs after next step: 2
- Step 4/4 failed entries in recent logs after next step: 2

## Evidence Notes
- Panel-state JSON logs are the primary evidence for this pass.
- Screenshot capture was intentionally skipped so the CDP panel socket would stay stable through the failed-state replay transition.
