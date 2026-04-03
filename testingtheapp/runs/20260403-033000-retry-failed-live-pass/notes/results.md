# Retry Failed Live Validation

Run folder: testingtheapp/runs/20260403-033000-retry-failed-live-pass

## Failure Capture
- Step index: 3
- Step id: step-004
- Step type: assert_text_equals
- Selector: id = message
- Replay status: failed
- Retry Failed enabled: true
- failedStepIndex: 3
- currentStepIndex: 3
- last error: Error: Assertion failed: expected text "Logged in as bob" but got "Logged in as alice"

## Retry Failed Result
- Replay status after retry: failed
- Replay summary after retry: Replay: Failed at step 4 of 4 (Hybrid)
- Replay help after retry: Replay stopped at step 4. Review the error, edit the step if needed, then use Retry Failed, Skip Step, or Replay From Selected.
- selectedStepIndex after retry: 3
- failedStepIndex after retry: 3
- currentStepIndex after retry: 3
- Retry Failed enabled after retry settles: true
- last error after retry: Error: Assertion failed: expected text "Logged in as bob" but got "Logged in as alice"
- Replay logs show step 4 started twice, confirming Retry Failed re-executed the intended failed step.
