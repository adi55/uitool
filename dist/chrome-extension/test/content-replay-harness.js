const output = document.getElementById('output')
const actionButton = document.getElementById('actionButton')
const nameInput = document.getElementById('nameInput')
const statusLabel = document.getElementById('statusLabel')

const messageListeners = []
const sentMessages = []
let clickCount = 0

actionButton.addEventListener('click', () => {
  clickCount += 1
})

window.chrome = {
  runtime: {
    onMessage: {
      addListener(listener) {
        messageListeners.push(listener)
      }
    },
    async sendMessage(message) {
      sentMessages.push(structuredClone(message))
      return { ok: true }
    }
  }
}

run().catch((error) => {
  output.textContent = `FAILED\n${error.stack || error.message || String(error)}`
  document.body.dataset.status = 'failed'
})

async function run() {
  await loadScript('../content.js')

  const results = []
  results.push(await runTest('Click replay executes against the page', testClickReplay))
  results.push(await runTest('Type replay writes input values', testTypeReplay))
  results.push(await runTest('Wait replay resolves when the condition becomes true', testWaitReplay))
  results.push(await runTest('Assertion replay reports success for matching text', testAssertionReplay))
  results.push(await runTest('Negative assertion replay supports not-exists and text-not-present', testNegativeAssertions))
  results.push(await runTest('Assertion failures return human-readable replay messages', testAssertionFailureMessages))
  results.push(await runTest('Popup present assertions use the current dialog state', testPopupPresentAssertion))
  results.push(await runTest('Popup text assertions compare the current dialog text', testPopupTextAssertion))
  results.push(await runTest('Readable target strategies resolve the same element', testReadableTargetStrategies))
  results.push(await runTest('Picker mode supports manual action targets', testActionPickerMode))
  results.push(await runTest('Picker mode supports manual assertion targets', testAssertionPickerMode))
  results.push(await runTest('Paused replay does not continue until resume', testPauseResumeGate))
  results.push(await runTest('Stopped replay aborts long waits cleanly', testStopAbort))
  results.push(await runTest('Unknown replay step types do not break execution', testUnknownStepPasses))

  const failed = results.filter((result) => !result.ok)
  document.body.dataset.status = failed.length ? 'failed' : 'passed'
  output.textContent = results.map((result) => `${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? `\n${result.detail}` : ''}`).join('\n\n')
}

async function runTest(name, work) {
  try {
    await work()
    return { name, ok: true }
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error.stack || error.message || String(error)
    }
  }
}

async function testClickReplay() {
  clickCount = 0
  const result = await dispatchMessage(createExecuteMessage('session-click', 0, {
    id: 'step-001',
    type: 'click',
    selector: selectorFor('#actionButton')
  }))

  assert(result.ok === true, 'Click replay should succeed')
  assert(clickCount === 1, 'Click replay should trigger the button click handler')
}

async function testTypeReplay() {
  nameInput.value = ''
  const result = await dispatchMessage(createExecuteMessage('session-type', 0, {
    id: 'step-002',
    type: 'type',
    value: 'Alice',
    selector: selectorFor('#nameInput')
  }))

  assert(result.ok === true, 'Type replay should succeed')
  assert(nameInput.value === 'Alice', 'Type replay should update the input value')
}

async function testWaitReplay() {
  statusLabel.hidden = true
  setTimeout(() => {
    statusLabel.hidden = false
  }, 120)

  const result = await dispatchMessage(createExecuteMessage('session-wait', 0, {
    id: 'step-003',
    type: 'wait',
    selector: selectorFor('#statusLabel'),
    waitStrategy: {
      kind: 'visible',
      timeoutMs: 1000
    }
  }))

  assert(result.ok === true, 'Wait replay should succeed when the target becomes visible')
}

async function testAssertionReplay() {
  statusLabel.hidden = false
  statusLabel.textContent = 'Ready for replay'

  const result = await dispatchMessage(createExecuteMessage('session-assert', 0, {
    id: 'step-004',
    type: 'assert_text_contains',
    expectedValue: 'for replay',
    selector: selectorFor('#statusLabel')
  }))

  assert(result.ok === true, 'Assertion replay should succeed for matching text')
}

async function testNegativeAssertions() {
  statusLabel.hidden = false
  statusLabel.textContent = 'Ready for replay'

  const missingResult = await dispatchMessage(createExecuteMessage('session-not-exists', 0, {
    id: 'step-not-exists',
    type: 'assert_not_exists',
    selector: selectorFor('#missingNode')
  }))

  const absentTextResult = await dispatchMessage(createExecuteMessage('session-text-not-present', 0, {
    id: 'step-text-not-present',
    type: 'assert_text_not_present',
    expectedValue: 'Error',
    selector: selectorFor('#statusLabel')
  }))

  assert(missingResult.ok === true, 'Does-not-exist assertions should pass when the element is missing')
  assert(absentTextResult.ok === true, 'Text-not-present assertions should pass when the text is absent')
}

async function testAssertionFailureMessages() {
  statusLabel.hidden = false
  statusLabel.textContent = 'Error while saving'

  const visibleFailure = await dispatchMessage(createExecuteMessage('session-visible-fail', 0, {
    id: 'step-visible-fail',
    type: 'assert_visible',
    selector: selectorFor('#missingNode')
  }))

  const textFailure = await dispatchMessage(createExecuteMessage('session-text-fail', 0, {
    id: 'step-text-fail',
    type: 'assert_text_equals',
    expectedValue: 'Saved',
    selector: selectorFor('#statusLabel')
  }))

  const notExistsFailure = await dispatchMessage(createExecuteMessage('session-not-exists-fail', 0, {
    id: 'step-not-exists-fail',
    type: 'assert_not_exists',
    selector: selectorFor('#statusLabel')
  }))

  assert(visibleFailure.ok === false, 'Visible assertion should fail for a missing element')
  assert(visibleFailure.error.includes('Assertion failed: element with css selector "#missingNode" was not visible'), 'Visible assertion failure should be human readable')
  assert(textFailure.ok === false, 'Text-equals assertion should fail for mismatched text')
  assert(textFailure.error.includes('expected text "Saved" but got "Error while saving"'), 'Text-equals failure should include expected and actual text')
  assert(notExistsFailure.ok === false, 'Does-not-exist assertion should fail when the element is found')
  assert(notExistsFailure.error.includes('should not exist but was found'), 'Does-not-exist failure should explain the negative expectation')
}

async function testPopupPresentAssertion() {
  publishDialog('alert', 'Saved successfully')
  await wait(20)

  const result = await dispatchMessage(createExecuteMessage('session-popup-present', 0, {
    id: 'step-popup-present',
    type: 'assert_popup_present',
    expectedValue: '',
    selector: selectorFor('#statusLabel')
  }))

  assert(result.ok === true, 'Popup present assertion should succeed when a dialog was observed')
}

async function testPopupTextAssertion() {
  publishDialog('alert', 'Saved successfully')
  await wait(20)

  const result = await dispatchMessage(createExecuteMessage('session-popup-text', 0, {
    id: 'step-popup-text',
    type: 'assert_popup_text',
    expectedValue: 'Saved successfully',
    selector: selectorFor('#statusLabel')
  }))

  assert(result.ok === true, 'Popup text assertion should succeed when dialog text matches')
}

async function testReadableTargetStrategies() {
  nameInput.value = ''

  const strategies = [
    ['label', 'User Name'],
    ['name', 'username'],
    ['placeholder', 'Search users'],
    ['ariaLabel', 'User Name Field'],
    ['dataTestId', 'user-name-input'],
    ['id', 'nameInput']
  ]

  for (const [strategy, value] of strategies) {
    nameInput.value = ''
    const result = await dispatchMessage(createExecuteMessage(`session-${strategy}`, 0, {
      id: `step-${strategy}`,
      type: 'type',
      value: `value-${strategy}`,
      selector: {
        primaryStrategy: strategy,
        primaryValue: value,
        candidates: [{ strategy, value }]
      }
    }))

    assert(result.ok === true, `Replay should resolve ${strategy} targets`)
    assert(nameInput.value === `value-${strategy}`, `${strategy} selector should resolve the input`)
  }
}

async function testActionPickerMode() {
  sentMessages.length = 0
  clickCount = 0
  await dispatchMessage({
    type: 'SET_MODE',
    recording: false,
    paused: false,
    assertionMode: false,
    pickerMode: { kind: 'action', stepType: 'click' }
  })

  actionButton.click()
  await wait(20)

  const outbound = sentMessages.find((message) => message.type === 'PICKER_TARGET_SELECTED')
  assert(Boolean(outbound), 'Action picker should post a picker target message')
  assert(outbound.payload.kind === 'action', 'Action picker should mark the payload as an action')
  assert(outbound.payload.stepType === 'click', 'Action picker should preserve the requested action type')
  assert(clickCount === 0, 'Action picker should intercept the page click')
}

async function testAssertionPickerMode() {
  sentMessages.length = 0
  await dispatchMessage({
    type: 'SET_MODE',
    recording: false,
    paused: false,
    assertionMode: false,
    pickerMode: { kind: 'assertion', stepType: 'assert_visible' }
  })

  actionButton.click()
  await wait(20)

  const outbound = sentMessages.find((message) => message.type === 'PICKER_TARGET_SELECTED')
  assert(Boolean(outbound), 'Assertion picker should post a picker target message')
  assert(outbound.payload.kind === 'assertion', 'Assertion picker should mark the payload as an assertion')
}

async function testPauseResumeGate() {
  statusLabel.hidden = true
  await dispatchMessage({
    type: 'REPLAY_CONTROL',
    sessionId: 'session-pause',
    command: 'start',
    currentStepIndex: 0,
    totalSteps: 1
  })
  await dispatchMessage({
    type: 'REPLAY_CONTROL',
    sessionId: 'session-pause',
    command: 'pause',
    currentStepIndex: 0,
    totalSteps: 1
  })

  setTimeout(() => {
    statusLabel.hidden = false
  }, 80)

  let resolved = false
  const pending = dispatchMessage(createExecuteMessage('session-pause', 0, {
    id: 'step-005',
    type: 'wait',
    selector: selectorFor('#statusLabel'),
    waitStrategy: {
      kind: 'visible',
      timeoutMs: 1000
    }
  })).then((value) => {
    resolved = true
    return value
  })

  await wait(150)
  assert(resolved === false, 'Paused replay should not resolve before a resume command')

  await dispatchMessage({
    type: 'REPLAY_CONTROL',
    sessionId: 'session-pause',
    command: 'resume',
    currentStepIndex: 0,
    totalSteps: 1
  })

  const result = await pending
  assert(result.ok === true, 'Resumed replay should continue from the paused step')
}

async function testStopAbort() {
  statusLabel.hidden = true
  await dispatchMessage({
    type: 'REPLAY_CONTROL',
    sessionId: 'session-stop',
    command: 'start',
    currentStepIndex: 0,
    totalSteps: 1
  })

  const pending = dispatchMessage(createExecuteMessage('session-stop', 0, {
    id: 'step-006',
    type: 'wait',
    selector: selectorFor('#statusLabel'),
    waitStrategy: {
      kind: 'visible',
      timeoutMs: 1000
    }
  }))

  setTimeout(() => {
    void dispatchMessage({
      type: 'REPLAY_CONTROL',
      sessionId: 'session-stop',
      command: 'stop',
      currentStepIndex: 0,
      totalSteps: 1
    })
  }, 120)

  const result = await pending
  assert(result.ok === false, 'Stopped replay should fail the in-flight wait step')
  assert(result.aborted === true, 'Stopped replay should mark the wait as aborted')
}

async function testUnknownStepPasses() {
  const result = await dispatchMessage(createExecuteMessage('session-unknown', 0, {
    id: 'step-007',
    type: 'metadata_marker',
    selector: selectorFor('#statusLabel')
  }))

  assert(result.ok === true, 'Unknown metadata-like steps should not break replay execution')
}

function selectorFor(cssSelector) {
  return {
    primaryStrategy: 'css',
    primaryValue: cssSelector,
    candidates: [{ strategy: 'css', value: cssSelector }]
  }
}

function publishDialog(kind, message) {
  window.postMessage({ source: 'tim-ui-recorder', type: 'dialog-opened', kind, message }, '*')
}

function createExecuteMessage(sessionId, stepIndex, step) {
  return {
    type: 'REPLAY_EXECUTE_STEP',
    sessionId,
    stepIndex,
    totalSteps: 1,
    mode: 'hybrid',
    step: Object.assign({
      stage: 'test',
      description: step.type,
      frameContext: { frameSelectors: [], frameName: null, sameOrigin: true },
      waitStrategy: { kind: 'none', timeoutMs: 0 }
    }, step)
  }
}

async function dispatchMessage(message) {
  for (const listener of messageListeners) {
    const response = await new Promise((resolve, reject) => {
      let resolved = false

      const finish = (value) => {
        if (!resolved) {
          resolved = true
          resolve(value)
        }
      }

      try {
        const result = listener(message, {}, finish)
        if (result !== true && result !== undefined) {
          finish(result)
        }
      } catch (error) {
        reject(error)
      }
    })

    if (response !== undefined) {
      return response
    }
  }

  throw new Error(`No message listener handled ${message.type}`)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = resolve
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}
