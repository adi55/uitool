const output = document.getElementById('output')

const listeners = []
const fetchCalls = []
let lastRuntimeMessage = null
let forceStartNewTestFailure = false

const harnessState = {
  backendUrl: 'http://127.0.0.1:17845',
  backend: { ok: true, details: { status: 'UP' } },
  availableProfiles: [{ id: 'profile-1', displayName: 'Profile One' }],
  recording: false,
  paused: false,
  assertionMode: false,
  pickerMode: null,
  pendingAssertion: null,
  pendingActionTarget: null,
  activityLog: [],
  captureScreenshots: false,
  selectedStepIndex: 1,
  javaClassName: 'GeneratedReplayTest',
  activeTestId: 'test-1',
  activeTabId: 17,
  playback: {
    sessionId: 'replay-123',
    mode: 'hybrid',
    status: 'paused',
    replaying: true,
    running: false,
    paused: true,
    stopped: false,
    stepInProgress: false,
    currentStepIndex: 1,
    totalSteps: 4,
    currentStepId: 'step-002',
    targetTabId: 17,
    completedStepIndexes: [0],
    failedStepIndex: null,
    failureIndex: null,
    lastError: null,
    lastResult: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logs: []
  },
  tests: [
    {
      id: 'test-1',
      name: 'Checkout Flow',
      updatedAt: new Date().toISOString(),
      status: 'draft',
      finishedAt: null,
      tabId: 17,
      selectedStepIndex: 1,
      javaClassName: 'GeneratedReplayTest',
      scenario: {
        metadata: {
          scenarioId: 'scenario-panel',
          name: 'Checkout Flow',
          profileId: 'profile-1',
          sourceUrl: 'https://example.test/login'
        },
        variables: {},
        uploadAliases: {},
        orderedSteps: [
          {
            id: 'step-001',
            type: 'navigate',
            stage: 'test',
            description: 'Navigate to "https://example.test/login"',
            value: 'https://example.test/login',
            waitStrategy: { kind: 'url_change', timeoutMs: 5000 },
            origin: 'manual',
            selector: { primaryStrategy: 'url', primaryValue: 'https://example.test/login' }
          },
          {
            id: 'step-002',
            type: 'click',
            stage: 'setup',
            description: 'Click element with visible text "Sign in"',
            origin: 'recorded',
            selector: { primaryStrategy: 'text', primaryValue: 'Sign in' }
          },
          {
            id: 'step-003',
            type: 'type',
            stage: 'test',
            description: 'Type "alice@example.test" into field with label "Username"',
            value: 'alice@example.test',
            origin: 'manual',
            selector: { primaryStrategy: 'label', primaryValue: 'Username' }
          },
          {
            id: 'step-004',
            type: 'assert_text_contains',
            stage: 'assertion',
            description: 'Assert text "Welcome" is visible on element with visible text "Welcome"',
            expectedValue: 'Welcome',
            origin: 'manual',
            selector: { primaryStrategy: 'text', primaryValue: 'Welcome' }
          }
        ],
        notes: []
      }
    },
    {
      id: 'test-2',
      name: 'Detached Regression',
      updatedAt: new Date().toISOString(),
      status: 'finished',
      finishedAt: new Date().toISOString(),
      tabId: null,
      selectedStepIndex: -1,
      javaClassName: '',
      scenario: {
        metadata: {
          scenarioId: 'scenario-two',
          name: 'Detached Regression',
          profileId: 'profile-1',
          sourceUrl: 'https://example.test/checkout'
        },
        variables: {},
        uploadAliases: {},
        orderedSteps: [],
        notes: []
      }
    }
  ]
}

refreshActiveScenario()
const BASELINE_STATE = structuredClone(harnessState)

window.alert = () => {}
window.prompt = () => ''
window.confirm = () => true
window.fetch = async (url, request = {}) => {
  const target = String(url)
  const payload = request.body ? JSON.parse(request.body) : null

  if (
    target.includes('/api/scenario/validate') ||
    target.includes('/api/scenario/save') ||
    target.includes('/api/generate/java') ||
    target.includes('/api/health') ||
    target.includes('/api/profiles')
  ) {
    fetchCalls.push({
      url: target,
      method: request.method || 'GET',
      body: payload
    })
  }

  if (target.includes('/api/health')) {
    return createJsonResponse({ status: 'UP' })
  }
  if (target.includes('/api/profiles')) {
    return createJsonResponse({
      profiles: [{ id: 'profile-1', displayName: 'Profile One' }]
    })
  }
  if (target.includes('/api/scenario/validate')) {
    return createJsonResponse({ valid: true, errors: [], warnings: [] })
  }
  if (target.includes('/api/scenario/save')) {
    return createJsonResponse({ saved: true, path: 'C:/tmp/checkout-flow.json' })
  }
  if (target.includes('/api/generate/java')) {
    return createJsonResponse({
      className: payload?.className || 'GeneratedReplayTest',
      path: 'C:/tmp/GeneratedReplayTest.java',
      source: 'public class GeneratedReplayTest {}'
    })
  }
  return createJsonResponse({})
}

window.chrome = {
  downloads: {
    async download() {
      return 1
    }
  },
  runtime: {
    onMessage: {
      addListener(listener) {
        listeners.push(listener)
      }
    },
    async sendMessage(message) {
      lastRuntimeMessage = structuredClone(message)
      switch (message.type) {
        case 'GET_STATE':
        case 'CHECK_BACKEND':
          return respond()
        case 'UPDATE_SETTINGS': {
          const active = currentHarnessTest()
          harnessState.backendUrl = message.backendUrl
          active.name = message.scenarioName
          active.scenario.metadata.name = message.scenarioName
          active.scenario.metadata.profileId = message.profileId
          active.scenario.metadata.sourceUrl = message.startUrl
          active.javaClassName = message.javaClassName
          if (active.status === 'finished') {
            active.status = 'draft'
          }
          harnessState.javaClassName = message.javaClassName
          harnessState.captureScreenshots = Boolean(message.captureScreenshots)
          refreshActiveScenario()
          return respond()
        }
        case 'SET_SELECTED_STEP': {
          harnessState.selectedStepIndex = Number(message.index)
          currentHarnessTest().selectedStepIndex = harnessState.selectedStepIndex
          refreshActiveScenario()
          return respond()
        }
        case 'SELECT_TEST': {
          harnessState.activeTestId = message.testId
          refreshActiveScenario()
          return respond()
        }
        case 'START_NEW_TEST': {
          if (forceStartNewTestFailure) {
            harnessState.activityLog.unshift({
              level: 'ERROR',
              message: 'Tab creation failed for Start New Test: access denied',
              timestamp: new Date().toISOString(),
              source: 'background'
            })
            return { ok: false, error: 'Start New Test could not open a browser tab.', state: structuredClone(harnessState) }
          }
          const nextTest = {
            id: 'test-3',
            name: 'Untitled Test 3',
            updatedAt: new Date().toISOString(),
            status: 'recording',
            finishedAt: null,
            tabId: 23,
            selectedStepIndex: -1,
            javaClassName: message.javaClassName || '',
            scenario: {
              metadata: {
                scenarioId: 'scenario-three',
                name: 'Untitled Test 3',
                profileId: message.profileId || 'profile-1',
                sourceUrl: message.startUrl || 'https://example.test/new'
              },
              variables: {},
              uploadAliases: {},
              orderedSteps: [],
              notes: []
            }
          }
          harnessState.tests.unshift(nextTest)
          harnessState.activeTestId = nextTest.id
          harnessState.recording = true
          harnessState.paused = false
          harnessState.activityLog.unshift({
            level: 'INFO',
            message: `Start New Test returning success for ${nextTest.id} with tab #${nextTest.tabId}`,
            timestamp: new Date().toISOString(),
            source: 'background'
          })
          refreshActiveScenario()
          return Object.assign(respond(), {
            success: true,
            testId: nextTest.id,
            tabId: nextTest.tabId,
            message: 'Started test'
          })
        }
        case 'FINISH_TEST': {
          const active = currentHarnessTest()
          const recordingStopped = Boolean(harnessState.recording || harnessState.paused)
          const detachedTabId = active.tabId
          harnessState.recording = false
          harnessState.paused = false
          harnessState.pickerMode = null
          harnessState.pendingAssertion = null
          harnessState.pendingActionTarget = null
          harnessState.assertionMode = false
          active.tabId = null
          active.status = 'finished'
          active.finishedAt = new Date().toISOString()
          harnessState.activityLog.unshift({
            level: 'INFO',
            message: `Test finished. Recording stopped: ${recordingStopped ? 'yes' : 'no'}. Detached browser tab #${detachedTabId}.`,
            timestamp: new Date().toISOString(),
            source: 'background'
          })
          refreshActiveScenario()
          return Object.assign(respond(), {
            success: true,
            finished: true,
            testId: active.id,
            recordingStopped,
            detachedTabId
          })
        }
        case 'SET_PICKER_MODE': {
          if (message.enabled) {
            harnessState.pickerMode = {
              kind: message.kind || 'action',
              stepType: message.stepType || null
            }
            harnessState.assertionMode = harnessState.pickerMode.kind === 'assertion'
          } else {
            harnessState.pickerMode = null
            harnessState.assertionMode = false
            if (message.clearPending) {
              harnessState.pendingAssertion = null
              harnessState.pendingActionTarget = null
            }
          }
          return respond()
        }
        case 'START_RECORDING':
          harnessState.recording = true
          harnessState.paused = false
          currentHarnessTest().status = 'recording'
          return respond()
        case 'PAUSE_RECORDING':
          harnessState.paused = true
          currentHarnessTest().status = 'recording'
          return respond()
        case 'RESUME_RECORDING':
          harnessState.recording = true
          harnessState.paused = false
          currentHarnessTest().status = 'recording'
          return respond()
        case 'STOP_RECORDING':
          harnessState.recording = false
          harnessState.paused = false
          if (currentHarnessTest().status !== 'finished') {
            currentHarnessTest().status = 'draft'
          }
          return respond()
        case 'CREATE_ACTION_STEP': {
          const active = currentHarnessTest()
          if (active.status === 'finished') {
            active.status = 'draft'
            active.finishedAt = null
          }
          active.scenario.orderedSteps.push({
            id: `step-${String(active.scenario.orderedSteps.length + 1).padStart(3, '0')}`,
            type: message.actionType === 'check' || message.actionType === 'uncheck' ? 'checkbox_set' : message.actionType,
            stage: 'test',
            description: describeHarnessAction(message),
            value: message.actionValue || '',
            origin: 'manual',
            note: message.note || '',
            waitStrategy: {
              kind: message.waitCondition || 'none',
              timeoutMs: Number(message.timeoutMs || 5000)
            },
            selector: {
              primaryStrategy: message.targetStrategy,
              primaryValue: message.targetValue
            }
          })
          harnessState.selectedStepIndex = active.scenario.orderedSteps.length - 1
          active.selectedStepIndex = harnessState.selectedStepIndex
          harnessState.pendingActionTarget = null
          harnessState.pickerMode = null
          refreshActiveScenario()
          return respond()
        }
        case 'CREATE_ASSERTION_STEP': {
          const active = currentHarnessTest()
          if (active.status === 'finished') {
            active.status = 'draft'
            active.finishedAt = null
          }
          active.scenario.orderedSteps.push({
            id: `step-${String(active.scenario.orderedSteps.length + 1).padStart(3, '0')}`,
            type: message.assertionType,
            stage: 'assertion',
            description: describeHarnessAssertion(message),
            expectedValue: message.expectedValue || '',
            origin: 'manual',
            waitStrategy: { kind: 'none', timeoutMs: Number(message.timeoutMs || 5000) },
            selector: {
              primaryStrategy: message.targetStrategy,
              primaryValue: message.targetValue
            }
          })
          harnessState.selectedStepIndex = active.scenario.orderedSteps.length - 1
          active.selectedStepIndex = harnessState.selectedStepIndex
          harnessState.pendingAssertion = null
          harnessState.pickerMode = null
          harnessState.assertionMode = false
          refreshActiveScenario()
          return respond()
        }
        case 'UPDATE_SELECTED_STEP': {
          const step = currentHarnessTest().scenario.orderedSteps[harnessState.selectedStepIndex]
          if (!step) {
            return respond()
          }
          if (currentHarnessTest().status === 'finished') {
            currentHarnessTest().status = 'draft'
            currentHarnessTest().finishedAt = null
          }
          step.stage = message.updates.stage || step.stage
          step.note = message.updates.note || ''
          step.value = message.updates.value
          step.expectedValue = message.updates.expectedValue
          step.waitStrategy = Object.assign({}, step.waitStrategy || {}, {
            kind: message.updates.waitCondition || step.waitStrategy?.kind || 'none',
            timeoutMs: Number(message.updates.timeoutMs || 0)
          })
          step.selector = {
            primaryStrategy: message.updates.targetStrategy,
            primaryValue: message.updates.targetValue
          }
          step.description = step.type.startsWith('assert_')
            ? describeHarnessAssertion({
                assertionType: step.type,
                targetStrategy: message.updates.targetStrategy,
                targetValue: message.updates.targetValue,
                expectedValue: message.updates.expectedValue
              })
            : describeHarnessAction({
                actionType: step.type,
                targetStrategy: message.updates.targetStrategy,
                targetValue: message.updates.targetValue,
                actionValue: message.updates.value,
                waitCondition: message.updates.waitCondition
              })
          refreshActiveScenario()
          return respond()
        }
        default:
          return respond()
      }
    }
  }
}

run().catch((error) => {
  output.textContent = `FAILED\n${error.stack || error.message || String(error)}`
  document.body.dataset.status = 'failed'
})

async function run() {
  await loadScript('../panel.js')
  document.dispatchEvent(new Event('DOMContentLoaded'))
  await waitFor(() => document.querySelectorAll('.step-card').length === 4, 'panel step render')

  const results = []
  results.push(await runTest('Test list renders and highlights the active test', testListRendering))
  results.push(await runTest('Start New Test dispatches and selects the new test', testStartNewTestFlow))
  results.push(await runTest('Start New Test failure is visible in the activity log', testStartNewTestFailure))
  results.push(await runTest('Action, assert, and origin badges are visible', testStepBadges))
  results.push(await runTest('Manual Add Action is explicit and creates an action step', testActionComposerFlow))
  results.push(await runTest('Finish Test updates visible status without opening a new tab', testFinishTestFlow))
  results.push(await runTest('Pick element then choose assertion expectation stays human readable', testAssertionComposerFlow))
  results.push(await runTest('Selected step editor adapts fields by subtype', testStepEditorVisibility))
  results.push(await runTest('Assertion selection makes delete behavior explicit', testAssertionDeleteDiscoverability))
  results.push(await runTest('Replay error/status broadcasts update the panel', testReplayBroadcastUpdate))
  results.push(await runTest('Active replay keeps selection aligned with the executing step', testActiveReplaySelectionGuard))
  results.push(await runTest('Replay From Selected uses the current selected step', testReplayFromSelectedUsesCurrentSelection))
  results.push(await runTest('Replay controls and guidance explain recovery actions', testReplayGuidance))
  results.push(await runTest('Replay validation payload repairs missing step ids', testReplayValidationPayloadIncludesIds))
  results.push(await runTest('Save payload repairs missing step ids', testSavePayloadIncludesIds))
  results.push(await runTest('Generate Java payload repairs missing step ids', testGenerateJavaPayloadIncludesIds))

  const failed = results.filter((result) => !result.ok)
  document.body.dataset.status = failed.length ? 'failed' : 'passed'
  output.textContent = results.map((result) => `${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? `\n${result.detail}` : ''}`).join('\n\n')
}

async function runTest(name, work) {
  try {
    await work()
    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, detail: error.stack || error.message || String(error) }
  }
}

function testListRendering() {
  resetHarnessState()
  const cards = Array.from(document.querySelectorAll('.test-card'))
  assert(cards.length === 2, 'Expected two rendered tests')
  assert(cards[0].classList.contains('selected'), 'Active test should be highlighted')
  assert(document.getElementById('activeTestState').textContent.toLowerCase().includes('active'), 'Active test pill should be populated')
}

async function testStartNewTestFlow() {
  resetHarnessState()
  setReplayIdle()
  document.getElementById('startNewTest').click()
  await waitFor(() => document.querySelectorAll('.test-card').length === 3, 'new test render')
  const cards = Array.from(document.querySelectorAll('.test-card'))
  assert(lastRuntimeMessage?.type === 'START_NEW_TEST', 'Panel should dispatch START_NEW_TEST')
  assert(cards[0].classList.contains('selected'), 'New test should render selected at the top of the list')
  assert(document.getElementById('testTabState').textContent.includes('#23'), 'New test should attach the created tab id')
  assert(document.getElementById('playbackLog').textContent.includes('Start New Test returning success'), 'Visible activity log should include background success details')
}

async function testStartNewTestFailure() {
  resetHarnessState()
  setReplayIdle()
  forceStartNewTestFailure = true
  document.getElementById('startNewTest').click()
  await waitFor(() => document.getElementById('playbackLog').textContent.includes('Tab creation failed for Start New Test'), 'visible start failure log')
  assert(document.getElementById('playbackLog').textContent.includes('Start New Test could not open a browser tab.'), 'Panel should surface the start failure message')
  forceStartNewTestFailure = false
}

function testStepBadges() {
  resetHarnessState()
  const cards = Array.from(document.querySelectorAll('.step-card'))
  assert(cards.length >= 4, 'Expected rendered step cards')
  assert(cards[1].textContent.includes('ACTION'), 'Action badge should be rendered for action steps')
  assert(cards[3].textContent.includes('ASSERT'), 'Assert badge should be rendered for assertion steps')
  assert(cards[1].textContent.includes('RECORDED'), 'Recorded origin badge should be rendered')
  assert(cards[2].textContent.includes('MANUAL'), 'Manual origin badge should be rendered')
  assert(document.getElementById('replaySummary').textContent.includes('Paused at step 2 of 4'), 'Replay summary should include paused progress')
}

async function testActionComposerFlow() {
  resetHarnessState()
  setReplayIdle()
  document.getElementById('addActionMode').click()
  await waitFor(() => !document.getElementById('actionComposer').classList.contains('hidden'), 'action composer render')
  assert(document.getElementById('currentModePill').textContent.includes('Add Action'), 'Current mode should show Add Action')
  assert(document.getElementById('actionTargetSummary').textContent.trim().length > 0, 'Action composer should render a readable target summary')
  assert(document.getElementById('actionScopeSummary').textContent.includes('Element'), 'Action composer should show Element scope for element actions')

  setSelectValue('actionTypeSelect', 'type')
  setSelectValue('actionTargetStrategy', 'label')
  setInputValueForTest('actionTargetValue', 'Username')
  setInputValueForTest('actionValueInput', 'alice')

  assert(document.getElementById('actionTargetSummary').textContent.includes('Label "Username"'), 'Action target summary should be readable')
  assert(document.getElementById('actionSummaryPreview').textContent.includes('Type "alice" into field with label "Username"'), 'Action summary preview should be human readable')

  document.getElementById('createAction').click()
  await waitFor(() => document.querySelectorAll('.step-card').length === 5, 'manual action append')
  const cards = Array.from(document.querySelectorAll('.step-card'))
  assert(cards[4].textContent.includes('ACTION'), 'Created manual action should render as ACTION')
  assert(cards[4].textContent.includes('MANUAL'), 'Created manual action should render as MANUAL')
  assert(document.getElementById('selectedStepHint').textContent.includes('manual action step'), 'Selected action hint should explain manual action editing')
}

async function testAssertionComposerFlow() {
  resetHarnessState()
  setReplayIdle()
  document.getElementById('assertionMode').click()
  await waitFor(() => !document.getElementById('assertionComposer').classList.contains('hidden'), 'assertion composer render')
  harnessState.pendingAssertion = {
    url: 'https://example.test/login',
    selector: { primaryStrategy: 'text', primaryValue: 'Login', visibleText: 'Login' },
    defaultExpectedValue: 'Login',
    suggestions: [{ type: 'assert_visible' }],
    timeoutMs: 5000
  }
  broadcast({
    type: 'STATE_UPDATED',
    state: structuredClone(harnessState)
  })
  await waitFor(() => document.getElementById('assertionTargetSummary').textContent.includes('Visible text "Login"'), 'picked assertion target render')

  assert(document.getElementById('assertionTargetSummary').textContent.includes('Visible text "Login"'), 'Picked element should fill a readable target summary')
  assert(document.getElementById('assertionScopeSummary').textContent.includes('Element'), 'Visible assertions should show Element scope')
  assert(document.getElementById('assertionTargetPreview').textContent.includes('Expect element with visible text "Login" to be visible'), 'Visible assertion summary should be readable')

  setSelectValue('assertionTypeSelect', 'assert_text_not_present')
  setInputValueForTest('assertionExpectedValue', 'Error')

  assert(!document.getElementById('assertionExpectedValueField').classList.contains('hidden'), 'Text-not-present assertions should show an expected text field')
  assert(document.getElementById('assertionScopeSummary').textContent.includes('Element Text'), 'Text assertions should show Element Text scope')
  assert(document.getElementById('assertionTargetPreview').textContent.includes('Expect element with visible text "Login" text NOT to contain "Error"'), 'Negative text assertion summary should be readable')

  document.getElementById('createAssertion').click()
  await waitFor(() => document.querySelectorAll('.step-card').length === 5, 'negative text assertion append')
  const cards = Array.from(document.querySelectorAll('.step-card'))
  assert(cards[4].textContent.includes('ASSERT'), 'Created assertion should render as ASSERT')
  assert(cards[4].textContent.includes('MANUAL'), 'Created assertion should render as MANUAL')
  assert(document.getElementById('selectedStepHint').textContent.includes('Delete Selected Assertion'), 'Created assertion should be auto-selected with delete guidance')
}

async function testStepEditorVisibility() {
  resetHarnessState()
  const cards = Array.from(document.querySelectorAll('.step-card'))
  cards[0].click()
  await waitFor(() => document.getElementById('selectionState').textContent === 'Step 1 selected', 'navigate step selection')
  assert(document.getElementById('stepTargetStrategyField').classList.contains('hidden'), 'Navigate editor should hide target strategy')
  assert(!document.getElementById('stepActionValueField').classList.contains('hidden'), 'Navigate editor should keep URL field visible')
  assert(document.getElementById('stepEditorHelp').textContent.includes('Replay From Selected'), 'Step editor help should explain replay-from-selected editing')

  cards[3].click()
  await waitFor(() => document.getElementById('selectionState').textContent === 'Step 4 selected', 'assertion step selection')
  assert(!document.getElementById('stepExpectedValueField').classList.contains('hidden'), 'Assertion editor should show expected value')
  assert(document.getElementById('selectedStepCategory').textContent.includes('ASSERT'), 'Selected step category should show ASSERT')
  assert(document.getElementById('stepEditorEmpty').textContent.includes('Select a step'), 'Selected-step empty state copy should remain explicit')
  assert(document.getElementById('selectedStepHint').textContent.includes('Apply Step Changes'), 'Selected-step hint should explain how to update the step')
}

async function testFinishTestFlow() {
  resetHarnessState()
  setReplayIdle()
  document.getElementById('finishTest').click()
  await waitFor(() => document.getElementById('statusTestStatus').textContent.includes('Finished'), 'finish status render')
  const activeCard = document.querySelector('.test-card.selected')
  assert(activeCard.textContent.includes('Finished'), 'Finished test should render finished status in the list')
  assert(document.getElementById('statusAttachedTab').textContent.includes('Detached'), 'Finished test should show detached tab status')
  assert(document.getElementById('statusCurrentMode').textContent.includes('Finished'), 'Current mode should show Finished after the session ends')
  assert(document.getElementById('playbackLog').textContent.includes('Test finished.'), 'Finish Test should be visible in the activity log')
}

async function testAssertionDeleteDiscoverability() {
  resetHarnessState()
  const cards = Array.from(document.querySelectorAll('.step-card'))
  cards[3].click()
  await waitFor(() => document.getElementById('selectionState').textContent === 'Step 4 selected', 'assertion selection')
  assert(document.getElementById('deleteSelectedStep').textContent === 'Delete Selected Assertion', 'Delete button should rename for selected assertions')
  assert(document.getElementById('selectedStepHint').textContent.includes('Delete Selected Assertion'), 'Assertion hint should explain how to delete it')
}

async function testReplayBroadcastUpdate() {
  resetHarnessState()
  harnessState.playback = Object.assign({}, harnessState.playback, {
    status: 'failed',
    paused: true,
    replaying: true,
    currentStepIndex: 1,
    failedStepIndex: 1,
    lastError: 'Selector missing for Username'
  })

  broadcast({
    type: 'REPLAY_ERROR',
    replay: structuredClone(harnessState.playback)
  })

  await waitFor(() => document.getElementById('replayError').textContent.includes('Selector missing for Username'), 'replay error render')
  const cards = Array.from(document.querySelectorAll('.step-card'))
  assert(cards[1].classList.contains('failed'), 'Failed replay step should be highlighted')
}

async function testActiveReplaySelectionGuard() {
  resetHarnessState()
  harnessState.playback = Object.assign({}, harnessState.playback, {
    sessionId: 'replay-777',
    status: 'running',
    replaying: true,
    running: true,
    paused: false,
    stepInProgress: true,
    currentStepIndex: 1,
    failedStepIndex: null,
    lastError: null
  })
  harnessState.selectedStepIndex = 1
  currentHarnessTest().selectedStepIndex = 1
  refreshActiveScenario()
  broadcast({
    type: 'STATE_UPDATED',
    state: structuredClone(harnessState)
  })

  const cardsBefore = Array.from(document.querySelectorAll('.step-card'))
  cardsBefore[0].click()
  await wait(30)

  assert(document.getElementById('selectionState').textContent === 'Step 2 selected', 'Selection should stay aligned with the active replay step while replay is running')
  assert(!lastRuntimeMessage || lastRuntimeMessage.type !== 'SET_SELECTED_STEP', 'Panel should not send a selection change while replay is actively running')
}

async function testReplayFromSelectedUsesCurrentSelection() {
  resetHarnessState()
  setReplayIdle()
  clearFetchCalls()

  const cards = Array.from(document.querySelectorAll('.step-card'))
  cards[2].click()
  await waitFor(() => harnessState.selectedStepIndex === 2, 'selected step for replay-from-selected')

  lastRuntimeMessage = null
  document.getElementById('replayFromCurrent').click()
  await waitFor(() => Boolean(findLastFetchCall('/api/scenario/validate')), 'replay-from-selected validation request')
  await waitFor(() => lastRuntimeMessage && lastRuntimeMessage.type === 'REPLAY_START', 'replay-from-selected runtime message')

  assert(lastRuntimeMessage.startIndex === 2, 'Replay From Selected should start from the selected step index')
  assert(document.getElementById('selectionState').textContent === 'Step 3 selected', 'Selection should remain visible while Replay From Selected launches')
}

async function testReplayGuidance() {
  resetHarnessState()
  setReplayIdle()
  assert(document.getElementById('replayFromCurrent').textContent.includes('Selected'), 'Replay From button should explain that it starts from the selected step')
  assert(document.getElementById('replayHelp').textContent.includes('Replay From Selected'), 'Idle replay help should explain partial reruns')

  harnessState.playback = Object.assign({}, harnessState.playback, {
    sessionId: 'replay-999',
    status: 'failed',
    replaying: true,
    paused: true,
    stopped: false,
    currentStepIndex: 2,
    failedStepIndex: 2,
    totalSteps: 4,
    lastError: 'Expected welcome banner'
  })
  broadcast({
    type: 'REPLAY_ERROR',
    replay: structuredClone(harnessState.playback)
  })

  await waitFor(() => document.getElementById('replayHelp').textContent.includes('Retry Failed'), 'failed replay help')
  assert(document.getElementById('replayHelp').textContent.includes('Skip Step'), 'Failed replay help should mention skip recovery')
  assert(document.getElementById('retryPlaybackStep').textContent.includes('Retry Failed'), 'Retry button copy should be explicit')
}

async function testReplayValidationPayloadIncludesIds() {
  resetHarnessState()
  setReplayIdle()
  injectMissingIdsIntoActiveTest()
  clearFetchCalls()
  document.getElementById('replayAll').click()
  await waitFor(() => Boolean(findLastFetchCall('/api/scenario/validate')), 'replay validation request')
  const request = findLastFetchCall('/api/scenario/validate')
  assertScenarioPayloadHasIds(request.body.scenario, 'Replay validation should send ids for every step')
}

async function testSavePayloadIncludesIds() {
  resetHarnessState()
  setReplayIdle()
  injectMissingIdsIntoActiveTest()
  clearFetchCalls()
  document.getElementById('saveScenario').click()
  await waitFor(() => Boolean(findLastFetchCall('/api/scenario/save')), 'save request')
  const request = findLastFetchCall('/api/scenario/save')
  assertScenarioPayloadHasIds(request.body.scenario, 'Save should send ids for every step')
}

async function testGenerateJavaPayloadIncludesIds() {
  resetHarnessState()
  setReplayIdle()
  injectMissingIdsIntoActiveTest()
  clearFetchCalls()
  document.getElementById('generateJava').click()
  await waitFor(() => Boolean(findLastFetchCall('/api/generate/java')), 'generate request')
  const request = findLastFetchCall('/api/generate/java')
  assertScenarioPayloadHasIds(request.body.scenario, 'Generate Java should send ids for every step')
}

function currentHarnessTest() {
  return harnessState.tests.find((test) => test.id === harnessState.activeTestId)
}

function refreshActiveScenario() {
  const active = currentHarnessTest()
  harnessState.scenario = active.scenario
  harnessState.activeTabId = active.tabId
  harnessState.selectedStepIndex = active.selectedStepIndex
  harnessState.javaClassName = active.javaClassName
}

function resetHarnessState() {
  const snapshot = structuredClone(BASELINE_STATE)
  for (const key of Object.keys(harnessState)) {
    delete harnessState[key]
  }
  Object.assign(harnessState, snapshot)
  lastRuntimeMessage = null
  forceStartNewTestFailure = false
  clearFetchCalls()
  refreshActiveScenario()
  broadcast({
    type: 'STATE_UPDATED',
    state: structuredClone(harnessState)
  })
}

function setReplayIdle() {
  harnessState.playback = Object.assign({}, harnessState.playback, {
    sessionId: null,
    status: 'idle',
    replaying: false,
    running: false,
    paused: false,
    stopped: true,
    failedStepIndex: null,
    currentStepIndex: -1,
    lastError: null
  })
  broadcast({
    type: 'REPLAY_STATUS_UPDATE',
    replay: structuredClone(harnessState.playback)
  })
}

function injectMissingIdsIntoActiveTest() {
  const active = currentHarnessTest()
  if (!active?.scenario?.orderedSteps?.length) {
    return
  }
  active.scenario.orderedSteps.forEach((step, index) => {
    if (index > 0) {
      step.id = ''
    }
  })
  refreshActiveScenario()
  broadcast({
    type: 'STATE_UPDATED',
    state: structuredClone(harnessState)
  })
}

function clearFetchCalls() {
  fetchCalls.length = 0
}

function findLastFetchCall(pathFragment) {
  for (let index = fetchCalls.length - 1; index >= 0; index -= 1) {
    if (fetchCalls[index].url.includes(pathFragment)) {
      return fetchCalls[index]
    }
  }
  return null
}

function assertScenarioPayloadHasIds(scenario, message) {
  const orderedSteps = []
  ;['setup', 'steps', 'assertions', 'cleanup'].forEach((groupKey) => {
    const group = Array.isArray(scenario?.[groupKey]) ? scenario[groupKey] : []
    group.forEach((step) => orderedSteps.push(step))
  })
  assert(orderedSteps.length > 0, `${message}: expected a scenario payload with steps`)
  assert(
    orderedSteps.every((step) => /^step-\d+$/i.test(String(step.id || ''))),
    `${message}: every serialized step should contain a stable step id`
  )
}

function respond() {
  refreshActiveScenario()
  return { ok: true, state: structuredClone(harnessState) }
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

function broadcast(message) {
  listeners.forEach((listener) => listener(structuredClone(message)))
}

function setInputValueForTest(id, value) {
  const element = document.getElementById(id)
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setSelectValue(id, value) {
  const element = document.getElementById(id)
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function describeHarnessAction(message) {
  const target = describeHarnessTarget(message.targetStrategy, message.targetValue)
  switch (message.actionType) {
    case 'navigate':
      return `Navigate to "${message.actionValue || message.targetValue}"`
    case 'type':
      return `Type "${message.actionValue}" into field with ${target}`
    case 'select':
      return `Select "${message.actionValue}" in field with ${target}`
    case 'wait':
      if (message.waitCondition === 'url_change') {
        return `Wait for URL to contain "${message.actionValue || message.targetValue}"`
      }
      return `Wait for element with ${target} to be visible`
    case 'check':
      return `Check element with ${target}`
    case 'uncheck':
      return `Uncheck element with ${target}`
    case 'click':
    default:
      return `Click element with ${target}`
  }
}

function describeHarnessAssertion(message) {
  const target = describeHarnessTarget(message.targetStrategy, message.targetValue)
  switch (message.assertionType) {
    case 'assert_popup_present':
      return 'Expect popup to be present'
    case 'assert_popup_text':
      return `Expect popup text to equal "${message.expectedValue}"`
    case 'assert_not_exists':
      return `Expect element with ${target} NOT to exist`
    case 'assert_text_not_present':
      return `Expect element with ${target} text NOT to contain "${message.expectedValue}"`
    case 'assert_url_contains':
      return `Expect URL to contain "${message.expectedValue}"`
    case 'assert_text_contains':
      return `Expect element with ${target} text to contain "${message.expectedValue}"`
    default:
      return `Expect element with ${target} to be visible`
  }
}

function describeHarnessTarget(strategy, value) {
  switch (strategy) {
    case 'label':
      return `label "${value}"`
    case 'text':
      return `visible text "${value}"`
    case 'url':
      return `URL "${value}"`
    default:
      return `${strategy} "${value}"`
  }
}

async function waitFor(predicate, label, timeoutMs = 1500) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return
    }
    await wait(20)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function wait(ms = 0) {
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
