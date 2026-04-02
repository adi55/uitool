const output = document.getElementById('output')

const harness = {
  storage: {},
  runtimeMessages: [],
  tabMessages: [],
  activeTabId: 1,
  nextTabId: 2,
  tabs: new Map([
    [1, { id: 1, url: 'https://example.test/', status: 'complete', title: 'Example Test' }]
  ]),
  stepPlans: new Map()
}

const listeners = {
  runtime: [],
  installed: [],
  startup: [],
  tabsUpdated: []
}

globalThis.__TIM_UI_RECORDER_TESTING__ = true

window.fetch = async (url) => {
  const target = String(url)
  if (target.includes('/api/health')) {
    return createJsonResponse({ status: 'UP' })
  }
  if (target.includes('/api/profiles')) {
    return createJsonResponse({
      profiles: [{ id: 'tim-ui-junit4-selenide', displayName: 'TIM UI JUnit4 Selenide' }]
    })
  }
  return createJsonResponse({})
}

window.chrome = {
  sidePanel: {
    async setPanelBehavior() {}
  },
  runtime: {
    getURL(path) {
      return `chrome-extension://${path}`
    },
    onInstalled: {
      addListener(listener) {
        listeners.installed.push(listener)
      }
    },
    onStartup: {
      addListener(listener) {
        listeners.startup.push(listener)
      }
    },
    onMessage: {
      addListener(listener) {
        listeners.runtime.push(listener)
      }
    },
    async sendMessage(message) {
      harness.runtimeMessages.push(structuredClone(message))
      return { ok: true }
    }
  },
  tabs: {
    onUpdated: {
      addListener(listener) {
        listeners.tabsUpdated.push(listener)
      }
    },
    async query(queryInfo) {
      if (queryInfo?.url) {
        return Array.from(harness.tabs.values()).filter((tab) => tab.url === queryInfo.url)
      }
      const activeTab = harness.tabs.get(harness.activeTabId)
      return activeTab ? [structuredClone(activeTab)] : []
    },
    async create(tabInfo) {
      const id = harness.nextTabId
      harness.nextTabId += 1
      const tab = {
        id,
        url: tabInfo.url || 'about:blank',
        status: 'complete',
        title: tabInfo.url || 'New Tab'
      }
      harness.tabs.set(id, tab)
      return structuredClone(tab)
    },
    async get(tabId) {
      const tab = harness.tabs.get(tabId)
      if (!tab) {
        throw new Error(`Unknown tab ${tabId}`)
      }
      return structuredClone(tab)
    },
    async update(tabId, updateInfo) {
      const tab = harness.tabs.get(tabId)
      if (!tab) {
        throw new Error(`Unknown tab ${tabId}`)
      }
      if (updateInfo.url) {
        tab.url = updateInfo.url
        tab.status = 'loading'
        setTimeout(() => {
          tab.status = 'complete'
        }, 20)
      }
      return structuredClone(tab)
    },
    async sendMessage(tabId, message) {
      harness.tabMessages.push(structuredClone(message))
      if (!harness.tabs.has(tabId)) {
        throw new Error(`Unknown tab ${tabId}`)
      }

      if (message.type === 'REPLAY_CONTROL') {
        return {
          ok: true,
          type: 'REPLAY_STATUS_UPDATE',
          sessionId: message.sessionId,
          status: message.command === 'pause'
            ? 'paused'
            : message.command === 'stop'
              ? 'stopped'
              : 'running',
          paused: message.command === 'pause',
          stopped: message.command === 'stop',
          currentStepIndex: message.currentStepIndex ?? null,
          totalSteps: message.totalSteps ?? null
        }
      }

      if (message.type === 'REPLAY_EXECUTE_STEP') {
        const planKey = String(message.stepIndex)
        const queue = harness.stepPlans.get(planKey) || []
        const plan = queue.length ? queue.shift() : { delay: 0, ok: true }
        const delayMs = Number(plan.delay || 0)

        if (delayMs > 0) {
          await wait(delayMs)
        }

        if (plan.ok === false) {
          return {
            ok: false,
            type: 'REPLAY_ERROR',
            sessionId: message.sessionId,
            stepIndex: message.stepIndex,
            stepId: message.step?.id || null,
            error: plan.error || 'Replay step failed'
          }
        }

        return {
          ok: true,
          type: 'REPLAY_STEP_RESULT',
          sessionId: message.sessionId,
          stepIndex: message.stepIndex,
          stepId: message.step?.id || null,
          stepType: message.step?.type || null
        }
      }

      return { ok: true }
    },
    async captureVisibleTab() {
      return 'data:image/png;base64,AAAA'
    }
  },
  downloads: {
    async download() {
      return 1
    }
  },
  storage: {
    local: {
      async get(key) {
        if (typeof key === 'string') {
          return { [key]: structuredClone(harness.storage[key]) }
        }
        return structuredClone(harness.storage)
      },
      async set(value) {
        Object.assign(harness.storage, structuredClone(value))
      }
    }
  }
}

run().catch((error) => {
  output.textContent = `FAILED\n${error.stack || error.message || String(error)}`
  document.body.dataset.status = 'failed'
})

async function run() {
  await loadScript('../background.js')
  await wait(80)

  const hooks = globalThis.__timUiRecorderTestHooks
  if (!hooks) {
    throw new Error('Replay test hooks were not exposed by background.js')
  }

  const results = []
  results.push(await runTest('Start -> Pause -> Resume -> Complete', () => testPauseResumeFlow(hooks)))
  results.push(await runTest('Duplicate replay sessions are rejected', () => testDuplicateReplayRejected(hooks)))
  results.push(await runTest('Stop cancels future steps cleanly', () => testStopFlow(hooks)))
  results.push(await runTest('Failure -> Retry -> Resume recovers the session', () => testFailureRetryFlow(hooks)))
  results.push(await runTest('Paused selection moves the replay pointer', () => testPausedSelectionMovesReplayPointer(hooks)))
  results.push(await runTest('Run Next Step can advance repeatedly and stops at the end', () => testRunNextStepRepeatedly(hooks)))
  results.push(await runTest('Running replay rejects out-of-band step selection', () => testRunningReplayRejectsSelection(hooks)))
  results.push(await runTest('Paused edits invalidate stale replay state safely', () => testPausedEditInvalidatesReplay(hooks)))
  results.push(await runTest('Navigate steps complete through the replay executor', () => testNavigateStep(hooks)))

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

async function testPauseResumeFlow(hooks) {
  resetHarnessState()
  configureScenario(hooks, makeActionSteps())
  planStep(0, [{ delay: 80, ok: true }])
  planStep(1, [{ delay: 0, ok: true }])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => countMessages('REPLAY_EXECUTE_STEP') === 1, 'first step dispatch')
  assert(hooks.getState().selectedStepIndex === 0, 'Selected step should sync to the running replay step')
  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.PAUSE })

  await waitFor(() => {
    const playback = hooks.getState().playback
    const state = hooks.getState()
    return playback.status === 'paused' &&
      playback.currentStepIndex === 1 &&
      playback.completedStepIndexes.includes(0) &&
      state.selectedStepIndex === 1
  }, 'paused after first step')

  assert(countMessages('REPLAY_EXECUTE_STEP') === 1, 'Pause should prevent the next step from starting')
  assert(controlCommands().includes('start'), 'Replay start control message was not sent')
  assert(controlCommands().includes('pause'), 'Replay pause control message was not sent')

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.RESUME })
  await waitFor(() => hooks.getState().playback.status === 'completed', 'replay completion')

  const playback = hooks.getState().playback
  assert(playback.completedStepIndexes.length === 2, 'Both replay steps should complete after resume')
  assert(hooks.getState().selectedStepIndex === 1, 'Completed replay should leave the last executed step selected')
  assert(controlCommands().includes('resume'), 'Replay resume control message was not sent')
}

async function testDuplicateReplayRejected(hooks) {
  resetHarnessState()
  configureScenario(hooks, makeActionSteps())
  planStep(0, [{ delay: 120, ok: true }])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => countMessages('REPLAY_EXECUTE_STEP') === 1, 'first step dispatch for duplicate test')

  let duplicateError = null
  try {
    await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  } catch (error) {
    duplicateError = error
  }

  assert(duplicateError, 'Expected duplicate replay start to throw an error')
  assert(String(duplicateError).includes('already active'), 'Duplicate replay error should mention the active session')

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.STOP })
  await waitFor(() => hooks.getState().playback.status === 'stopped', 'replay stop after duplicate rejection')
}

async function testStopFlow(hooks) {
  resetHarnessState()
  configureScenario(hooks, makeActionSteps())
  planStep(0, [{ delay: 120, ok: true }])
  planStep(1, [{ delay: 0, ok: true }])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => countMessages('REPLAY_EXECUTE_STEP') === 1, 'first step dispatch for stop test')
  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.STOP })
  await waitFor(() => hooks.getState().playback.status === 'stopped', 'replay stop state')
  await wait(180)

  const playback = hooks.getState().playback
  assert(countMessages('REPLAY_EXECUTE_STEP') === 1, 'Stop should prevent later steps from executing')
  assert(playback.completedStepIndexes.length === 0, 'Stopped in-flight step should not be marked completed')
  assert(controlCommands().includes('stop'), 'Replay stop control message was not sent')
}

async function testFailureRetryFlow(hooks) {
  resetHarnessState()
  configureScenario(hooks, makeActionSteps())
  planStep(0, [
    { delay: 0, ok: false, error: 'Synthetic failure' },
    { delay: 0, ok: true }
  ])
  planStep(1, [{ delay: 0, ok: true }])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => {
    const playback = hooks.getState().playback
    return playback.status === 'failed' && playback.stepInProgress === false
  }, 'failed replay state')

  let playback = hooks.getState().playback
  assert(playback.failedStepIndex === 0, 'Failed replay should point at the failing step')
  assert(playback.paused === true, 'Failed replay should remain paused for manual recovery')
  assert(hooks.getState().selectedStepIndex === 0, 'Failed replay should keep the failed step selected')

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.RETRY })
  await waitFor(() => {
    const state = hooks.getState()
    const current = state.playback
    return current.status === 'paused' &&
      current.currentStepIndex === 1 &&
      current.failedStepIndex == null &&
      state.selectedStepIndex === 1
  }, 'paused retry completion')

  playback = hooks.getState().playback
  assert(playback.completedStepIndexes.includes(0), 'Retry should complete the failed step')

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.RESUME })
  await waitFor(() => hooks.getState().playback.status === 'completed', 'completion after retry')
  assert(countMessages('REPLAY_EXECUTE_STEP') === 3, 'Expected fail + retry + final step execution messages')
  assert(hooks.getState().selectedStepIndex === 1, 'Selection should stay aligned after retry and completion')
}

async function testPausedSelectionMovesReplayPointer(hooks) {
  resetHarnessState()
  configureScenario(hooks, makeActionSteps())
  planStep(0, [
    { delay: 80, ok: true },
    { delay: 0, ok: true }
  ])
  planStep(1, [{ delay: 0, ok: true }])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => countMessages('REPLAY_EXECUTE_STEP') === 1, 'first step dispatch for paused selection test')
  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.PAUSE })
  await waitFor(() => hooks.getState().playback.status === 'paused' && hooks.getState().playback.currentStepIndex === 1, 'paused replay pointer')

  await hooks.handleMessage({ type: 'SET_SELECTED_STEP', index: 0 })
  let state = hooks.getState()
  assert(state.selectedStepIndex === 0, 'Paused replay selection should move to the requested step')
  assert(state.playback.currentStepIndex === 0, 'Paused replay pointer should follow the selected step')

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.NEXT })
  await waitFor(() => {
    const current = hooks.getState()
    return current.playback.status === 'paused' &&
      current.playback.currentStepIndex === 1 &&
      current.selectedStepIndex === 1 &&
      countMessages('REPLAY_EXECUTE_STEP') === 2
  }, 'manual step execution after pointer move')

  const executedSteps = harness.tabMessages
    .filter((message) => message.type === 'REPLAY_EXECUTE_STEP')
    .map((message) => message.stepIndex)
  assert(executedSteps[1] === 0, 'Run Next Step should execute the step selected while replay was paused')
}

async function testRunNextStepRepeatedly(hooks) {
  resetHarnessState()
  configureScenario(hooks, [
    {
      id: 'step-001',
      type: 'click',
      stage: 'test',
      description: 'Click primary action',
      selector: { primaryStrategy: 'css', primaryValue: '#start' },
      waitStrategy: { kind: 'none', timeoutMs: 0 }
    },
    {
      id: 'step-002',
      type: 'type',
      stage: 'test',
      description: 'Type into input',
      value: 'hello',
      selector: { primaryStrategy: 'css', primaryValue: '#name' },
      waitStrategy: { kind: 'none', timeoutMs: 0 }
    },
    {
      id: 'step-003',
      type: 'click',
      stage: 'test',
      description: 'Submit the form',
      selector: { primaryStrategy: 'css', primaryValue: '#submit' },
      waitStrategy: { kind: 'none', timeoutMs: 0 }
    }
  ])
  planStep(0, [{ delay: 80, ok: true }])
  planStep(1, [{ delay: 0, ok: true }])
  planStep(2, [{ delay: 0, ok: true }])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => countMessages('REPLAY_EXECUTE_STEP') === 1, 'first step dispatch for repeated next-step test')
  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.PAUSE })
  await waitFor(() => {
    const state = hooks.getState()
    return state.playback.status === 'paused' &&
      state.playback.currentStepIndex === 1 &&
      state.selectedStepIndex === 1
  }, 'paused on second step before repeated next-step test')

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.NEXT })
  await waitFor(() => {
    const state = hooks.getState()
    return state.playback.status === 'paused' &&
      state.playback.currentStepIndex === 2 &&
      state.selectedStepIndex === 2 &&
      countMessages('REPLAY_EXECUTE_STEP') === 2
  }, 'paused on last step after stepping once')

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.NEXT })
  await waitFor(() => hooks.getState().playback.status === 'completed', 'completed replay after repeated next-step execution')

  const state = hooks.getState()
  assert(state.selectedStepIndex === 2, 'Selection should stay on the last executed step after repeated next-step execution')
  assert(countMessages('REPLAY_EXECUTE_STEP') === 3, 'Repeated next-step execution should dispatch each remaining step once')

  let nextError = null
  try {
    await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.NEXT })
  } catch (error) {
    nextError = error
  }

  assert(nextError, 'Running next step after completion should be rejected')
  assert(String(nextError).includes('not active'), 'Next-step rejection after completion should explain that replay is no longer active')
}

async function testRunningReplayRejectsSelection(hooks) {
  resetHarnessState()
  configureScenario(hooks, makeActionSteps())
  planStep(0, [{ delay: 120, ok: true }])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => countMessages('REPLAY_EXECUTE_STEP') === 1, 'running replay dispatch')

  let selectionError = null
  try {
    await hooks.handleMessage({ type: 'SET_SELECTED_STEP', index: 1 })
  } catch (error) {
    selectionError = error
  }

  const state = hooks.getState()
  assert(selectionError, 'Selecting a different step during active replay should fail')
  assert(String(selectionError).includes('Pause replay before choosing another step'), 'Running replay selection error should explain the guard')
  assert(state.selectedStepIndex === 0, 'Selection should remain aligned with the active replay step')
  assert(state.playback.currentStepIndex === 0, 'Replay pointer should not move while a step is running')

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.STOP })
  await waitFor(() => hooks.getState().playback.status === 'stopped', 'cleanup stop after selection guard')
}

async function testPausedEditInvalidatesReplay(hooks) {
  resetHarnessState()
  configureScenario(hooks, makeActionSteps())
  planStep(0, [{ delay: 80, ok: true }])
  planStep(1, [{ delay: 0, ok: true }])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => countMessages('REPLAY_EXECUTE_STEP') === 1, 'first step dispatch for edit invalidation test')
  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.PAUSE })
  await waitFor(() => hooks.getState().playback.status === 'paused' && hooks.getState().playback.currentStepIndex === 1, 'paused replay before edit')

  await hooks.handleMessage({
    type: 'UPDATE_SELECTED_STEP',
    updates: {
      targetStrategy: 'css',
      targetValue: '#edited-name',
      value: 'edited',
      note: 'edited while paused'
    }
  })

  let state = hooks.getState()
  assert(state.playback.status === 'stopped', 'Editing during paused replay should invalidate the replay session')
  assert(state.selectedStepIndex === 1, 'Edited step should remain selected after invalidation')
  assert(state.scenario.orderedSteps[1].selector.primaryValue === '#edited-name', 'Step edits should still be applied')

  let resumeError = null
  try {
    await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.RESUME })
  } catch (error) {
    resumeError = error
  }

  assert(resumeError, 'Resume should be unavailable after replay invalidation')
  assert(String(resumeError).includes('not active'), 'Resume after invalidation should explain that replay is no longer active')

  planStep(1, [{ delay: 0, ok: true }])
  const executeCountBeforeRestart = countMessages('REPLAY_EXECUTE_STEP')
  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: state.selectedStepIndex, mode: 'hybrid' })
  await waitFor(() => countMessages('REPLAY_EXECUTE_STEP') === executeCountBeforeRestart + 1, 'replay restart after edit')

  const lastExecuteMessage = harness.tabMessages.filter((message) => message.type === 'REPLAY_EXECUTE_STEP').slice(-1)[0]
  assert(lastExecuteMessage.stepIndex === 1, 'Replay restart after edit should begin from the selected edited step')
  await waitFor(() => hooks.getState().playback.status === 'completed', 'replay completion after edit restart')
}

async function testNavigateStep(hooks) {
  resetHarnessState()
  configureScenario(hooks, [
    {
      id: 'step-001',
      type: 'navigate',
      stage: 'test',
      description: 'Navigate to app',
      value: 'https://example.test/dashboard',
      waitStrategy: { kind: 'url_change', timeoutMs: 500 },
      selector: null
    }
  ])

  await hooks.handleMessage({ type: hooks.REPLAY_COMMANDS.START, startIndex: 0, mode: 'hybrid' })
  await waitFor(() => hooks.getState().playback.status === 'completed', 'navigate replay completion')

  const tab = harness.tabs.get(harness.activeTabId)
  assert(tab.url === 'https://example.test/dashboard', 'Navigate replay should update the target tab URL')
}

function configureScenario(hooks, steps) {
  hooks.resetStateForTests({
    backendUrl: 'http://127.0.0.1:17845',
    backend: { ok: true, details: { status: 'UP' } },
    availableProfiles: [{ id: 'tim-ui-junit4-selenide', displayName: 'TIM UI JUnit4 Selenide' }],
    activeTestId: 'test-001',
    activeTabId: harness.activeTabId,
    tests: [
      {
        id: 'test-001',
        name: 'Replay Harness Scenario',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tabId: harness.activeTabId,
        selectedStepIndex: 0,
        javaClassName: '',
        scenario: {
          metadata: {
            scenarioId: 'scenario-test',
            name: 'Replay Harness Scenario',
            profileId: 'tim-ui-junit4-selenide',
            sourceUrl: 'https://example.test/'
          },
          variables: {},
          uploadAliases: {},
          orderedSteps: structuredClone(steps),
          notes: []
        }
      }
    ],
    playback: {
      totalSteps: steps.length
    }
  })
}

function makeActionSteps() {
  return [
    {
      id: 'step-001',
      type: 'click',
      stage: 'test',
      description: 'Click primary action',
      selector: { primaryStrategy: 'css', primaryValue: '#start' },
      waitStrategy: { kind: 'none', timeoutMs: 0 }
    },
    {
      id: 'step-002',
      type: 'type',
      stage: 'test',
      description: 'Type into input',
      value: 'hello',
      selector: { primaryStrategy: 'css', primaryValue: '#name' },
      waitStrategy: { kind: 'none', timeoutMs: 0 }
    }
  ]
}

function planStep(stepIndex, entries) {
  harness.stepPlans.set(String(stepIndex), structuredClone(entries))
}

function resetHarnessState() {
  harness.runtimeMessages = []
  harness.tabMessages = []
  harness.stepPlans = new Map()
  harness.tabs.set(harness.activeTabId, {
    id: harness.activeTabId,
    url: 'https://example.test/',
    status: 'complete',
    title: 'Example Test'
  })
}

function controlCommands() {
  return harness.tabMessages
    .filter((message) => message.type === 'REPLAY_CONTROL')
    .map((message) => message.command)
}

function countMessages(type) {
  return harness.tabMessages.filter((message) => message.type === type).length
}

function createJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return structuredClone(body)
    },
    async text() {
      return JSON.stringify(body)
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate, label, timeoutMs = 2000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return
    }
    await wait(20)
  }
  throw new Error(`Timed out waiting for ${label}`)
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
