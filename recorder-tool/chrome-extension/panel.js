const DEFAULT_BACKEND_URL = 'http://127.0.0.1:17845'
const REPLAY_STATUS_UPDATE = 'REPLAY_STATUS_UPDATE'
const REPLAY_ERROR = 'REPLAY_ERROR'

const StepIds = globalThis.TimUiRecorderStepIds
if (!StepIds) {
  throw new Error('TIM UI Recorder step id helpers failed to load.')
}

const REPLAY_COMMANDS = {
  START: 'REPLAY_START',
  PAUSE: 'REPLAY_PAUSE',
  RESUME: 'REPLAY_RESUME',
  STOP: 'REPLAY_STOP',
  NEXT: 'REPLAY_NEXT_STEP',
  RETRY: 'REPLAY_RETRY_STEP',
  SKIP: 'REPLAY_SKIP_STEP'
}

const TARGET_STRATEGIES = [
  { value: 'text', label: 'Visible Text' },
  { value: 'label', label: 'Label' },
  { value: 'name', label: 'Name' },
  { value: 'placeholder', label: 'Placeholder' },
  { value: 'ariaLabel', label: 'Aria Label' },
  { value: 'dataTestId', label: 'Test ID' },
  { value: 'id', label: 'ID' },
  { value: 'css', label: 'CSS Selector' },
  { value: 'xpath', label: 'XPath' },
  { value: 'url', label: 'URL' }
]

const ASSERTION_TYPES = [
  { value: 'assert_visible', label: 'Visible' },
  { value: 'assert_hidden', label: 'Not Visible' },
  { value: 'assert_exists', label: 'Exists' },
  { value: 'assert_not_exists', label: 'Does Not Exist' },
  { value: 'assert_text_equals', label: 'Text Equals' },
  { value: 'assert_text_contains', label: 'Text Contains' },
  { value: 'assert_text_not_present', label: 'Text Not Present' },
  { value: 'assert_popup_present', label: 'Popup Present' },
  { value: 'assert_popup_text', label: 'Popup Text' },
  { value: 'assert_url_contains', label: 'URL Contains' }
]

const ASSERTION_TYPE_LABELS = Object.freeze({
  assert_visible: 'Visible',
  assert_hidden: 'Not Visible',
  assert_exists: 'Exists',
  assert_not_exists: 'Does Not Exist',
  assert_text_equals: 'Text Equals',
  assert_text_contains: 'Text Contains',
  assert_text_not_present: 'Text Not Present',
  assert_value_equals: 'Value Equals',
  assert_enabled: 'Enabled',
  assert_disabled: 'Disabled',
  assert_url_contains: 'URL Contains',
  assert_popup_present: 'Popup Present',
  assert_popup_text: 'Popup Text',
  assert_alert_present: 'Popup Present',
  assert_alert_text: 'Popup Text'
})

const MANUAL_ACTION_TYPES = [
  { value: 'navigate', label: 'Navigate' },
  { value: 'click', label: 'Click' },
  { value: 'type', label: 'Type' },
  { value: 'select', label: 'Select' },
  { value: 'check', label: 'Check' },
  { value: 'uncheck', label: 'Uncheck' },
  { value: 'wait', label: 'Wait' }
]

const WAIT_CONDITIONS = [
  { value: 'visible', label: 'Visible' },
  { value: 'exists', label: 'Exists' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'text_contains', label: 'Text Contains' },
  { value: 'value_equals', label: 'Value Equals' },
  { value: 'url_change', label: 'URL Contains' }
]

const ACTION_TYPES = new Set([
  'navigate',
  'click',
  'double_click',
  'right_click',
  'type',
  'select',
  'checkbox_set',
  'radio_set',
  'wait',
  'clear',
  'press_key',
  'upload_file'
])

let elements = {}
let currentState = null
let uiLogEntries = []
let stepFilter = 'all'
let actionDraft = null
let assertionDraft = null
let lastPendingActionKey = null
let lastPendingAssertionKey = null
let pendingStepScroll = false

let recorderState = {
  recording: false,
  recordingPaused: false,
  replaying: false,
  replayPaused: false,
  replayStatus: 'idle',
  replayMode: 'local',
  replaySessionId: null,
  replayCurrentStepIndex: null,
  replayTotalSteps: 0,
  replayStepInProgress: false,
  replayFailedStepIndex: null,
  replayCompletedStepIndexes: [],
  replayLastError: null,
  selectedStepIndex: null,
  activeTestId: null,
  activeTabId: null,
  pendingAction: null,
  backendMessage: null,
  backendMessageState: null
}

document.addEventListener('DOMContentLoaded', () => {
  initializePanel().catch((error) => {
    console.error(error)
    window.alert(error.message || 'Failed to initialize the recorder panel.')
  })
})

async function initializePanel() {
  cacheElements()
  populateSelects()
  bindAllButtons()
  bindFieldListeners()
  registerRuntimeListeners()
  await refreshStateFromRuntime({ silent: true })
  logAction('Panel initialized', 'INFO', { persist: false })
}

function cacheElements() {
  elements = {
    backendState: requireElement('backendState'),
    backendActionState: requireElement('backendActionState'),
    activeTestState: requireElement('activeTestState'),
    currentModePill: requireElement('currentModePill'),
    recordingState: requireElement('recordingState'),
    recordingModePill: requireElement('recordingModePill'),
    playbackModePill: requireElement('playbackModePill'),
    selectionState: requireElement('selectionState'),
    scenarioNameLabel: requireElement('scenarioNameLabel'),
    replaySummary: requireElement('replaySummary'),
    replayError: requireElement('replayError'),
    replayHelp: requireElement('replayHelp'),
    replayProgress: requireElement('replayProgress'),
    heroTitle: requireElement('heroTitle'),
    testTabState: requireElement('testTabState'),
    statusActiveTest: requireElement('statusActiveTest'),
    statusTestStatus: requireElement('statusTestStatus'),
    statusAttachedTab: requireElement('statusAttachedTab'),
    statusCurrentMode: requireElement('statusCurrentMode'),
    statusSelectedStep: requireElement('statusSelectedStep'),
    statusRecording: requireElement('statusRecording'),
    statusReplay: requireElement('statusReplay'),
    testSessionSummary: requireElement('testSessionSummary'),
    creationModeHelp: requireElement('creationModeHelp'),
    backendUrl: requireElement('backendUrl'),
    testsList: requireElement('testsList'),
    scenarioName: requireElement('scenarioName'),
    startUrl: requireElement('startUrl'),
    profileSelect: requireElement('profileSelect'),
    javaClassName: requireElement('javaClassName'),
    captureScreenshots: requireElement('captureScreenshots'),
    stepCount: requireElement('stepCount'),
    stepsList: requireElement('stepsList'),
    playbackLog: requireElement('playbackLog'),
    selectedStepCategory: requireElement('selectedStepCategory'),
    stepEditorHelp: requireElement('stepEditorHelp'),
    stepEditorEmpty: requireElement('stepEditorEmpty'),
    stepEditor: requireElement('stepEditor'),
    selectedStepHint: requireElement('selectedStepHint'),
    stepSubtype: requireElement('stepSubtype'),
    stepStageSelect: requireElement('stepStageSelect'),
    stepSubtypeField: requireElement('stepSubtypeField'),
    stepStageField: requireElement('stepStageField'),
    selectedStepOrigin: requireElement('selectedStepOrigin'),
    stepTargetStrategy: requireElement('stepTargetStrategy'),
    stepTargetValue: requireElement('stepTargetValue'),
    stepTargetStrategyField: requireElement('stepTargetStrategyField'),
    stepTargetValueField: requireElement('stepTargetValueField'),
    stepActionValue: requireElement('stepActionValue'),
    stepActionValueField: requireElement('stepActionValueField'),
    stepActionValueLabel: requireElement('stepActionValueLabel'),
    stepWaitConditionField: requireElement('stepWaitConditionField'),
    stepWaitConditionSelect: requireElement('stepWaitConditionSelect'),
    stepExpectedValue: requireElement('stepExpectedValue'),
    stepExpectedValueField: requireElement('stepExpectedValueField'),
    stepExpectedValueLabel: requireElement('stepExpectedValueLabel'),
    stepTimeoutMs: requireElement('stepTimeoutMs'),
    stepTimeoutField: requireElement('stepTimeoutField'),
    stepNoteField: requireElement('stepNoteField'),
    stepNoteInput: requireElement('stepNoteInput'),
    stepTargetPreview: requireElement('stepTargetPreview'),
    stepSummaryPreview: requireElement('stepSummaryPreview'),
    pickStepTarget: requireElement('pickStepTarget'),
    applyStepChanges: requireElement('applyStepChanges'),
    actionComposer: requireElement('actionComposer'),
    actionTargetSummary: requireElement('actionTargetSummary'),
    actionScopeSummary: requireElement('actionScopeSummary'),
    actionTypeSelect: requireElement('actionTypeSelect'),
    actionTargetStrategy: requireElement('actionTargetStrategy'),
    actionTargetValue: requireElement('actionTargetValue'),
    actionTargetStrategyField: requireElement('actionTargetStrategyField'),
    actionTargetValueField: requireElement('actionTargetValueField'),
    actionValueField: requireElement('actionValueField'),
    actionValueLabel: requireElement('actionValueLabel'),
    actionValueInput: requireElement('actionValueInput'),
    actionWaitConditionField: requireElement('actionWaitConditionField'),
    actionWaitConditionSelect: requireElement('actionWaitConditionSelect'),
    actionTimeoutField: requireElement('actionTimeoutField'),
    actionTimeoutMs: requireElement('actionTimeoutMs'),
    actionNoteField: requireElement('actionNoteField'),
    actionNoteInput: requireElement('actionNoteInput'),
    actionSummaryPreview: requireElement('actionSummaryPreview'),
    pickActionTarget: requireElement('pickActionTarget'),
    createAction: requireElement('createAction'),
    cancelAction: requireElement('cancelAction'),
    assertionComposer: requireElement('assertionComposer'),
    assertionTargetSummary: requireElement('assertionTargetSummary'),
    assertionScopeSummary: requireElement('assertionScopeSummary'),
    assertionTypeSelect: requireElement('assertionTypeSelect'),
    assertionTypeField: requireElement('assertionTypeField'),
    assertionTargetStrategy: requireElement('assertionTargetStrategy'),
    assertionTargetValue: requireElement('assertionTargetValue'),
    assertionTargetStrategyField: requireElement('assertionTargetStrategyField'),
    assertionTargetValueField: requireElement('assertionTargetValueField'),
    assertionExpectedValue: requireElement('assertionExpectedValue'),
    assertionExpectedValueField: requireElement('assertionExpectedValueField'),
    assertionExpectedValueLabel: requireElement('assertionExpectedValueLabel'),
    assertionTimeoutMs: requireElement('assertionTimeoutMs'),
    assertionTimeoutField: requireElement('assertionTimeoutField'),
    assertionTargetPreview: requireElement('assertionTargetPreview'),
    pickAssertionTarget: requireElement('pickAssertionTarget'),
    startNewTest: requireElement('startNewTest'),
    finishTest: requireElement('finishTest'),
    renameTest: requireElement('renameTest'),
    duplicateTest: requireElement('duplicateTest'),
    deleteTest: requireElement('deleteTest'),
    modeRecordAction: requireElement('modeRecordAction'),
    addActionMode: requireElement('addActionMode'),
    clearComposerMode: requireElement('clearComposerMode'),
    startRecording: requireElement('startRecording'),
    pauseRecording: requireElement('pauseRecording'),
    resumeRecording: requireElement('resumeRecording'),
    stopRecording: requireElement('stopRecording'),
    assertionMode: requireElement('assertionMode'),
    undoLastStep: requireElement('undoLastStep'),
    replayAll: requireElement('replayAll'),
    replayFromCurrent: requireElement('replayFromCurrent'),
    stopPlayback: requireElement('stopPlayback'),
    pausePlayback: requireElement('pausePlayback'),
    resumePlayback: requireElement('resumePlayback'),
    nextPlaybackStep: requireElement('nextPlaybackStep'),
    retryPlaybackStep: requireElement('retryPlaybackStep'),
    skipPlaybackStep: requireElement('skipPlaybackStep'),
    moveStepUp: requireElement('moveStepUp'),
    moveStepDown: requireElement('moveStepDown'),
    deleteSelectedStep: requireElement('deleteSelectedStep'),
    addNote: requireElement('addNote'),
    markSetup: requireElement('markSetup'),
    markTest: requireElement('markTest'),
    markCleanup: requireElement('markCleanup'),
    validateScenario: requireElement('validateScenario'),
    saveScenario: requireElement('saveScenario'),
    exportScenario: requireElement('exportScenario'),
    generateJava: requireElement('generateJava'),
    createAssertion: requireElement('createAssertion'),
    cancelAssertion: requireElement('cancelAssertion'),
    filterAllSteps: requireElement('filterAllSteps'),
    filterActionSteps: requireElement('filterActionSteps'),
    filterAssertionSteps: requireElement('filterAssertionSteps')
  }
}

function requireElement(id) {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing panel element: #${id}`)
  }
  return element
}

function populateSelects() {
  populateSelect(elements.actionTypeSelect, MANUAL_ACTION_TYPES)
  populateSelect(elements.actionTargetStrategy, TARGET_STRATEGIES)
  populateSelect(elements.actionWaitConditionSelect, WAIT_CONDITIONS)
  populateSelect(elements.stepTargetStrategy, TARGET_STRATEGIES)
  populateSelect(elements.stepWaitConditionSelect, WAIT_CONDITIONS)
  populateSelect(elements.assertionTargetStrategy, TARGET_STRATEGIES)
  populateSelect(elements.assertionTypeSelect, ASSERTION_TYPES)
}

function populateSelect(select, options) {
  select.innerHTML = ''
  options.forEach((option) => {
    const element = document.createElement('option')
    element.value = option.value
    element.textContent = option.label
    select.appendChild(element)
  })
}

function bindAllButtons() {
  bindButton('startNewTest', startNewTest)
  bindButton('finishTest', finishTest)
  bindButton('renameTest', renameTest)
  bindButton('duplicateTest', duplicateTest)
  bindButton('deleteTest', deleteTest)
  bindButton('modeRecordAction', enterRecordActionMode)
  bindButton('addActionMode', addAction)
  bindButton('clearComposerMode', clearComposerMode)
  bindButton('startRecording', startRecording)
  bindButton('pauseRecording', pauseRecording)
  bindButton('resumeRecording', resumeRecording)
  bindButton('stopRecording', stopRecording)
  bindButton('assertionMode', addAssertion)
  bindButton('undoLastStep', undoLastStep)
  bindButton('replayAll', replayScenario)
  bindButton('replayFromCurrent', replayFromCurrent)
  bindButton('pausePlayback', pauseReplay)
  bindButton('resumePlayback', resumeReplay)
  bindButton('nextPlaybackStep', nextPlaybackStep)
  bindButton('retryPlaybackStep', retryPlaybackStep)
  bindButton('skipPlaybackStep', skipPlaybackStep)
  bindButton('stopPlayback', stopReplay)
  bindButton('moveStepUp', moveStepUp)
  bindButton('moveStepDown', moveStepDown)
  bindButton('deleteSelectedStep', deleteStep)
  bindButton('addNote', addNote)
  bindButton('markSetup', markSetup)
  bindButton('markTest', markTest)
  bindButton('markCleanup', markCleanup)
  bindButton('validateScenario', validateScenario)
  bindButton('saveScenario', saveScenario)
  bindButton('exportScenario', exportScenario)
  bindButton('generateJava', generateJava)
  bindButton('applyStepChanges', applyStepChanges)
  bindButton('pickStepTarget', pickSelectedStepTarget)
  bindButton('pickActionTarget', pickActionTarget)
  bindButton('createAction', createActionStep)
  bindButton('cancelAction', cancelAction)
  bindButton('createAssertion', createAssertionStep)
  bindButton('pickAssertionTarget', pickAssertionTarget)
  bindButton('cancelAssertion', cancelAssertion)
  bindButton('filterAllSteps', () => setStepFilter('all'))
  bindButton('filterActionSteps', () => setStepFilter('actions'))
  bindButton('filterAssertionSteps', () => setStepFilter('assertions'))
}

function bindButton(id, handler) {
  elements[id].addEventListener('click', async (event) => {
    event.preventDefault()
    try {
      await handler(event)
    } catch (error) {
      console.error(error)
      logAction(error.message || `Action failed for ${id}`, 'ERROR')
      if (!error.__alreadyAlerted) {
        window.alert(error.message || `Action failed for ${id}.`)
      }
    }
  })
}

function bindFieldListeners() {
  elements.scenarioName.addEventListener('input', () => {
    elements.scenarioNameLabel.textContent = `Scenario: ${elements.scenarioName.value.trim() || 'Untitled Test'}`
  })

  elements.backendUrl.addEventListener('input', () => {
    setBackendUrlValidity(true)
  })

  ;[
    elements.backendUrl,
    elements.scenarioName,
    elements.startUrl,
    elements.profileSelect,
    elements.javaClassName,
    elements.captureScreenshots
  ].forEach((field) => {
    field.addEventListener('change', () => {
      void syncSettings({ alertOnError: false, logErrors: false }).catch((error) => console.error(error))
    })
  })

  ;[
    elements.actionTypeSelect,
    elements.actionTargetStrategy,
    elements.actionTargetValue,
    elements.actionValueInput,
    elements.actionWaitConditionSelect,
    elements.actionTimeoutMs,
    elements.actionNoteInput
  ].forEach((field) => field.addEventListener('input', handleActionDraftInput))

  ;[
    elements.stepTargetStrategy,
    elements.stepTargetValue,
    elements.stepActionValue,
    elements.stepWaitConditionSelect,
    elements.stepExpectedValue,
    elements.stepTimeoutMs,
    elements.stepNoteInput,
    elements.stepStageSelect
  ].forEach((field) => field.addEventListener('input', renderStepEditorPreview))

  ;[
    elements.assertionTypeSelect,
    elements.assertionTargetStrategy,
    elements.assertionTargetValue,
    elements.assertionExpectedValue,
    elements.assertionTimeoutMs
  ].forEach((field) => field.addEventListener('input', handleAssertionDraftInput))
}

function registerRuntimeListeners() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATED' && message.state) {
      applyState(message.state)
      return
    }
    if ((message.type === REPLAY_STATUS_UPDATE || message.type === REPLAY_ERROR) && message.replay && currentState) {
      currentState.playback = message.replay
      syncRecorderState()
      render()
    }
  })
}

async function refreshStateFromRuntime(options = {}) {
  const response = await sendRuntimeMessage({ type: 'GET_STATE' }, {
    alertOnError: !options.silent,
    logErrors: !options.silent
  })
  if (response.state) {
    applyState(response.state)
  }
  return response.state
}

function applyState(state) {
  const previousSelectedStepIndex = recorderState.selectedStepIndex
  const previousActiveTestId = recorderState.activeTestId
  currentState = state
  repairCurrentStateStepIds()
  syncRecorderState()
  if (
    recorderState.selectedStepIndex != null &&
    (recorderState.selectedStepIndex !== previousSelectedStepIndex || recorderState.activeTestId !== previousActiveTestId)
  ) {
    pendingStepScroll = true
  }
  syncActionDraftFromState()
  syncAssertionDraftFromState()
  render()
}

function repairCurrentStateStepIds() {
  if (!currentState) {
    return
  }
  const tests = Array.isArray(currentState.tests) ? currentState.tests : []
  tests.forEach((test) => {
    if (test?.scenario) {
      StepIds.ensureScenarioStepIds(test.scenario)
    }
  })
  if (currentState.scenario) {
    StepIds.ensureScenarioStepIds(currentState.scenario)
  }
}

function syncRecorderState() {
  const replay = currentState?.playback || {}
  recorderState.recording = Boolean(currentState?.recording)
  recorderState.recordingPaused = Boolean(currentState?.paused)
  recorderState.replaying = Boolean(replay.replaying)
  recorderState.replayPaused = Boolean(replay.paused)
  recorderState.replayStatus = replay.status || 'idle'
  recorderState.replayMode = replay.mode || 'local'
  recorderState.replaySessionId = replay.sessionId || null
  recorderState.replayCurrentStepIndex = Number.isInteger(replay.currentStepIndex) && replay.currentStepIndex >= 0 ? replay.currentStepIndex : null
  recorderState.replayTotalSteps = Number(replay.totalSteps || 0)
  recorderState.replayStepInProgress = Boolean(replay.stepInProgress)
  recorderState.replayFailedStepIndex = Number.isInteger(replay.failedStepIndex) && replay.failedStepIndex >= 0 ? replay.failedStepIndex : null
  recorderState.replayCompletedStepIndexes = Array.isArray(replay.completedStepIndexes) ? replay.completedStepIndexes : []
  recorderState.replayLastError = replay.lastError || null
  recorderState.selectedStepIndex = Number.isInteger(currentState?.selectedStepIndex) && currentState.selectedStepIndex >= 0 ? currentState.selectedStepIndex : null
  recorderState.activeTestId = currentState?.activeTestId || null
  recorderState.activeTabId = Number.isInteger(currentState?.activeTabId) ? currentState.activeTabId : null
}

function syncActionDraftFromState() {
  const pending = currentState?.pendingActionTarget || null
  const nextKey = pending ? buildPickerTargetKey(pending) : null
  if (pending && nextKey !== lastPendingActionKey) {
    actionDraft = Object.assign(createEmptyActionDraft(), {
      actionType: normalizeActionType(pending.stepType || actionDraft?.actionType || 'click'),
      targetStrategy: normalizeTargetStrategy(pending.selector?.primaryStrategy || 'text'),
      targetValue: pending.selector?.primaryValue || '',
      timeoutMs: Number(pending.timeoutMs || 5000),
      source: 'picker'
    })
    lastPendingActionKey = nextKey
  }
}

function syncAssertionDraftFromState() {
  const pending = currentState?.pendingAssertion || null
  const nextKey = pending ? buildAssertionTargetKey(pending) : null
  if (pending && nextKey !== lastPendingAssertionKey) {
    assertionDraft = Object.assign(createEmptyAssertionDraft(), {
      assertionType: inferAssertionTypeFromSuggestions(pending.suggestions),
      targetStrategy: normalizeTargetStrategy(pending.selector?.primaryStrategy || 'text'),
      targetValue: pending.selector?.primaryValue || '',
      expectedValue: pending.defaultExpectedValue || '',
      defaultExpectedValue: pending.defaultExpectedValue || pending.selector?.visibleText || '',
      timeoutMs: Number(pending.timeoutMs || 5000),
      source: 'picker'
    })
    lastPendingAssertionKey = nextKey
  }
}

function render() {
  if (!currentState) {
    return
  }
  renderSummary()
  renderProfiles()
  renderTests()
  renderActionComposer()
  renderSteps()
  renderStepEditor()
  renderAssertionComposer()
  renderLogs()
  updateButtonStates()
}

function renderSummary() {
  const activeTest = getActiveTest()
  const scenario = activeTest?.scenario || currentState.scenario
  const testName = scenario?.metadata?.name || 'Untitled Test'
  const backendOnline = Boolean(currentState.backend?.ok)
  const currentMode = resolveCurrentModeLabel()
  const selectedStep = getSelectedStep()

  elements.recordingState.textContent = resolveRecorderHeadline()
  elements.heroTitle.textContent = testName
  elements.scenarioNameLabel.textContent = `Scenario: ${testName}`
  elements.replaySummary.textContent = buildReplaySummary()
  elements.replayProgress.textContent = buildReplayProgressLabel()
  elements.replayHelp.textContent = buildReplayHelp()
  elements.testSessionSummary.textContent = buildTestSessionSummary(activeTest)
  elements.creationModeHelp.textContent = buildCreationModeHelp()
  elements.stepCount.textContent = String(scenario?.orderedSteps?.length || 0)

  setPill(elements.backendState, backendOnline ? 'Backend online' : 'Backend offline', backendOnline ? 'ok' : 'error')
  setPill(elements.backendActionState, buildBackendActionText(backendOnline), buildBackendActionState(backendOnline))
  setPill(elements.activeTestState, buildActiveTestPill(activeTest), activeTest ? (activeTest.tabId ? 'ok' : 'warning') : 'warning')
  setPill(elements.currentModePill, resolveCurrentModeLabel(), resolveCurrentModeState())
  setPill(elements.recordingModePill, recorderState.recording ? (recorderState.recordingPaused ? 'Paused' : 'Recording') : 'Idle', recorderState.recording ? 'active' : null)
  setPill(elements.playbackModePill, buildReplayPillLabel(), resolveReplayPillState())
  setPill(elements.selectionState, recorderState.selectedStepIndex == null ? 'No selection' : `Step ${recorderState.selectedStepIndex + 1} selected`, recorderState.selectedStepIndex == null ? 'warning' : 'active')
  setPill(elements.testTabState, recorderState.activeTabId ? `Controlled tab #${recorderState.activeTabId}` : 'No controlled tab', recorderState.activeTabId ? 'ok' : 'warning')
  setPill(elements.statusActiveTest, activeTest ? `Active Test: ${activeTest.name}` : 'Active Test: none', activeTest ? 'active' : 'warning')
  setPill(elements.statusTestStatus, `Test Status: ${humanizeValue(resolveTestLifecycleStatus(activeTest))}`, resolveTestLifecycleState(activeTest))
  setPill(elements.statusAttachedTab, recorderState.activeTabId ? `Tab Attached #${recorderState.activeTabId}` : 'Tab Detached', recorderState.activeTabId ? 'ok' : 'warning')
  setPill(elements.statusCurrentMode, `Current Mode: ${currentMode}`, resolveCurrentModeState())
  setPill(elements.statusSelectedStep, buildSelectedStepStatusLabel(selectedStep), selectedStep ? stepCategoryState(resolveStepCategory(selectedStep)) : 'warning')
  setPill(elements.statusRecording, recorderState.recording ? (recorderState.recordingPaused ? 'Recording Paused' : 'Recording On') : 'Recording Off', recorderState.recording ? 'active' : null)
  setPill(elements.statusReplay, `Replay ${humanizeValue(recorderState.replayStatus || 'idle')}`, resolveReplayPillState())

  setInputValue(elements.scenarioName, scenario?.metadata?.name || '')
  setInputValue(elements.startUrl, scenario?.metadata?.sourceUrl || '')
  setInputValue(elements.backendUrl, currentState.backendUrl || DEFAULT_BACKEND_URL)
  setInputValue(elements.javaClassName, currentState.javaClassName || '')
  if (document.activeElement !== elements.captureScreenshots) {
    elements.captureScreenshots.checked = Boolean(currentState.captureScreenshots)
  }

  if (recorderState.replayLastError) {
    elements.replayError.textContent = recorderState.replayLastError
    elements.replayError.classList.remove('hidden')
  } else {
    elements.replayError.textContent = ''
    elements.replayError.classList.add('hidden')
  }
}

function renderProfiles() {
  const options = currentState.availableProfiles || []
  const selectedProfileId = currentState.scenario?.metadata?.profileId || ''
  elements.profileSelect.innerHTML = ''

  if (!options.length) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = 'No profiles available'
    elements.profileSelect.appendChild(option)
    return
  }

  options.forEach((profile) => {
    const option = document.createElement('option')
    option.value = profile.id
    option.textContent = profile.displayName || profile.id
    option.selected = profile.id === selectedProfileId
    elements.profileSelect.appendChild(option)
  })
}

function renderTests() {
  const tests = Array.isArray(currentState.tests) ? currentState.tests : []
  elements.testsList.innerHTML = ''

  if (!tests.length) {
    elements.testsList.appendChild(createEmptyState('No saved tests yet. Start a new test to open a single controlled browser tab and begin recording.'))
    return
  }

  tests.forEach((test) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'test-card'
    button.classList.add(resolveTestLifecycleStatus(test))
    button.classList.add(test.tabId ? 'attached' : 'detached')
    if (test.id === recorderState.activeTestId) {
      button.classList.add('selected')
    }
    button.addEventListener('click', () => {
      void selectTest(test.id)
    })

    const title = document.createElement('div')
    title.className = 'test-title'

    const heading = document.createElement('div')
    heading.className = 'test-heading'

    const name = document.createElement('span')
    name.className = 'test-name'
    name.textContent = test.name || 'Untitled Test'

    const meta = document.createElement('span')
    meta.className = 'test-meta'
    meta.textContent = `${countScenarioSteps(test.scenario)} steps • ${test.updatedAt ? formatDateTime(test.updatedAt) : 'No updates yet'}`

    heading.appendChild(name)
    heading.appendChild(meta)

    const statuses = document.createElement('div')
    statuses.className = 'test-statuses'

    const lifecycle = document.createElement('span')
    lifecycle.className = 'pill'
    lifecycle.dataset.state = resolveTestLifecycleState(test)
    lifecycle.textContent = humanizeValue(resolveTestLifecycleStatus(test))

    const tabStatus = document.createElement('span')
    tabStatus.className = 'pill'
    tabStatus.dataset.state = test.tabId ? 'ok' : 'warning'
    tabStatus.textContent = test.tabId ? 'Tab attached' : 'Tab detached'

    title.appendChild(heading)
    statuses.appendChild(lifecycle)
    statuses.appendChild(tabStatus)
    title.appendChild(statuses)
    button.appendChild(title)
    elements.testsList.appendChild(button)
  })
}

function renderActionComposer() {
  if (!actionDraft) {
    elements.actionComposer.classList.add('hidden')
    return
  }

  const config = getActionComposerConfig(actionDraft.actionType, actionDraft.waitCondition)
  elements.actionComposer.classList.remove('hidden')

  if (document.activeElement !== elements.actionTypeSelect) {
    elements.actionTypeSelect.value = normalizeActionType(actionDraft.actionType || 'click')
  }
  if (document.activeElement !== elements.actionTargetStrategy) {
    elements.actionTargetStrategy.value = normalizeTargetStrategy(actionDraft.targetStrategy || 'text')
  }
  if (document.activeElement !== elements.actionWaitConditionSelect) {
    elements.actionWaitConditionSelect.value = actionDraft.waitCondition || 'visible'
  }

  setInputValue(elements.actionTargetValue, actionDraft.targetValue || '')
  setInputValue(elements.actionValueInput, actionDraft.actionValue || '')
  setInputValue(elements.actionTimeoutMs, String(Number(actionDraft.timeoutMs || 5000)))
  setInputValue(elements.actionNoteInput, actionDraft.note || '')

  elements.actionValueLabel.textContent = config.actionValueLabel
  toggleVisibility(elements.actionTargetStrategyField, config.showTarget)
  toggleVisibility(elements.actionTargetValueField, config.showTarget)
  toggleVisibility(elements.actionValueField, config.showActionValue)
  toggleVisibility(elements.actionWaitConditionField, config.showWaitCondition)
  toggleVisibility(elements.actionTimeoutField, config.showTimeout)
  toggleVisibility(elements.actionNoteField, true)
  toggleVisibility(elements.pickActionTarget, config.canPickTarget)

  const targetPreview = config.showTarget
    ? buildTargetPreview(actionDraft.targetStrategy, actionDraft.targetValue)
    : ''
  elements.actionTargetSummary.textContent = targetPreview || config.summaryFallback || (config.canPickTarget ? 'Pick an element or define it manually' : 'Fill the fields manually')
  elements.actionScopeSummary.textContent = resolveActionScopeLabel(actionDraft.actionType, actionDraft.waitCondition)
  elements.actionSummaryPreview.textContent = buildActionSummary(actionDraft) || 'No action summary yet'
}

function renderSteps() {
  const steps = currentState.scenario?.orderedSteps || []
  const visibleSteps = filterSteps(steps)
  elements.stepsList.innerHTML = ''

  if (!visibleSteps.length) {
    elements.stepsList.appendChild(createEmptyState(stepFilter === 'all' ? 'No recorded steps yet.' : `No ${stepFilter} to show.`))
    return
  }

  visibleSteps.forEach(({ step, index }) => {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'step-card'
    const replayStepState = getReplayStepState(index)

    if (index === recorderState.selectedStepIndex) {
      card.classList.add('selected')
    }
    if (replayStepState === 'active') {
      card.classList.add('current')
    }
    if (replayStepState === 'completed') {
      card.classList.add('completed')
    }
    if (replayStepState === 'failed') {
      card.classList.add('failed')
    }
    if (replayStepState === 'paused') {
      card.classList.add('paused-step')
    }

    card.addEventListener('click', () => {
      void selectStep(index)
    })

    const title = document.createElement('div')
    title.className = 'step-title'

    const heading = document.createElement('div')
    heading.className = 'step-heading'

    const type = document.createElement('span')
    type.className = 'step-type'
    type.textContent = `${index + 1}. ${getStepTypeLabel(step.type || 'step')}`

    const meta = document.createElement('div')
    meta.className = 'step-meta'
    meta.textContent = `${resolveStepDescription(step)} • ${resolveTargetSummary(step)}`

    const targetSummary = resolveTargetSummary(step)
    meta.textContent = targetSummary ? `${resolveStepDescription(step)} • ${targetSummary}` : resolveStepDescription(step)
    heading.appendChild(type)
    heading.appendChild(meta)

    const badges = document.createElement('div')
    badges.className = 'step-badges'
    badges.appendChild(createStepBadge(resolveStepCategory(step), resolveStepCategoryClass(step)))
    badges.appendChild(createStepBadge(getStepTypeLabel(step.type || 'step'), 'subtype'))
    badges.appendChild(createStepBadge(resolveStepOriginLabel(step), 'origin'))

    const stage = document.createElement('span')
    stage.className = `step-stage ${String(step.stage || 'test').toLowerCase()}`
    stage.textContent = humanizeValue(step.stage || 'test')
    badges.appendChild(stage)

    const replayBadge = createReplayBadge(replayStepState)
    if (replayBadge) {
      badges.appendChild(replayBadge)
    }

    title.appendChild(heading)
    title.appendChild(badges)
    card.appendChild(title)
    elements.stepsList.appendChild(card)
  })

  if (pendingStepScroll) {
    const selectedCard = elements.stepsList.querySelector('.step-card.selected')
    if (selectedCard) {
      selectedCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    pendingStepScroll = false
  }

  setActive(elements.filterAllSteps, stepFilter === 'all')
  setActive(elements.filterActionSteps, stepFilter === 'actions')
  setActive(elements.filterAssertionSteps, stepFilter === 'assertions')
}

function renderStepEditor() {
  const step = getSelectedStep()
  if (!step) {
    elements.stepEditorHelp.textContent = 'Select a step, update its fields, then click Apply Step Changes. Replay From Selected reruns from that step in the same controlled tab.'
    elements.stepEditorEmpty.classList.remove('hidden')
    elements.stepEditor.classList.add('hidden')
    elements.stepEditorEmpty.textContent = 'Select a step from the list to edit it.'
    setPill(elements.selectedStepCategory, 'No step selected', 'warning')
    elements.selectedStepOrigin.classList.add('hidden')
    elements.selectedStepHint.textContent = ''
    elements.selectedStepHint.classList.add('hidden')
    return
  }

  elements.stepEditorEmpty.classList.add('hidden')
  elements.stepEditor.classList.remove('hidden')
  const category = resolveStepCategory(step)
  const config = getStepEditorConfig(step)
  setPill(elements.selectedStepCategory, `${category} / ${getStepTypeLabel(step.type)}`, stepCategoryState(category))
  setPill(elements.selectedStepOrigin, resolveStepOriginLabel(step), resolveStepOriginState(step))
  elements.selectedStepOrigin.classList.remove('hidden')
  elements.stepEditorHelp.textContent = buildStepEditorHelp(step)
  elements.selectedStepHint.textContent = buildSelectedStepHint(step)
  elements.selectedStepHint.classList.remove('hidden')
  setInputValue(elements.stepSubtype, getStepTypeLabel(step.type || 'step'))
  setInputValue(elements.stepTargetValue, resolveStepTargetValue(step))
  setInputValue(elements.stepActionValue, resolveStepActionValue(step))
  setInputValue(elements.stepExpectedValue, resolveStepExpectedValue(step))
  setInputValue(elements.stepTimeoutMs, String(Number(step.waitStrategy?.timeoutMs || 0) || ''))
  setInputValue(elements.stepNoteInput, step.note || '')
  if (document.activeElement !== elements.stepStageSelect) {
    elements.stepStageSelect.value = step.stage || inferEditorStage(step)
  }
  if (document.activeElement !== elements.stepTargetStrategy) {
    elements.stepTargetStrategy.value = normalizeTargetStrategy(step.selector?.primaryStrategy || inferTargetStrategy(step))
  }
  if (document.activeElement !== elements.stepWaitConditionSelect) {
    elements.stepWaitConditionSelect.value = step.waitStrategy?.kind || 'visible'
  }
  elements.stepActionValueLabel.textContent = config.actionValueLabel
  elements.stepExpectedValueLabel.textContent = config.expectedValueLabel
  toggleVisibility(elements.stepTargetStrategyField, config.showTarget)
  toggleVisibility(elements.stepTargetValueField, config.showTarget)
  toggleVisibility(elements.stepActionValueField, config.showActionValue)
  toggleVisibility(elements.stepWaitConditionField, config.showWaitCondition)
  toggleVisibility(elements.stepExpectedValueField, config.showExpectedValue)
  toggleVisibility(elements.stepTimeoutField, config.showTimeout)
  toggleVisibility(elements.stepNoteField, config.showNote)
  toggleVisibility(elements.pickStepTarget, config.canPickTarget)
  renderStepEditorPreview()
}

function renderStepEditorPreview() {
  const step = getSelectedStep()
  if (!step) {
    return
  }
  const category = resolveStepCategory(step)
  const config = getStepEditorConfig(step)
  const strategy = config.showTarget ? normalizeTargetStrategy(elements.stepTargetStrategy.value) : inferTargetStrategy(step)
  const targetValue = config.showTarget ? elements.stepTargetValue.value.trim() : resolveStepTargetValue(step)
  const actionValue = config.showActionValue ? elements.stepActionValue.value : resolveStepActionValue(step)
  const expectedValue = config.showExpectedValue ? elements.stepExpectedValue.value : resolveStepExpectedValue(step)
  const timeoutMs = Number(elements.stepTimeoutMs.value || step.waitStrategy?.timeoutMs || 5000)
  const waitCondition = config.showWaitCondition ? elements.stepWaitConditionSelect.value : (step.waitStrategy?.kind || 'visible')
  const preview = buildTargetPreview(strategy, targetValue)

  elements.stepTargetPreview.textContent = preview || resolveTargetSummary(step) || 'No target preview'
  elements.stepSummaryPreview.textContent = category === 'ASSERT'
    ? buildAssertionSummary({
        assertionType: step.type,
        targetStrategy: strategy,
        targetValue,
        expectedValue,
        timeoutMs
      })
    : category === 'ACTION'
      ? buildActionSummary({
          actionType: normalizeActionType(step.type),
          targetStrategy: strategy,
          targetValue,
          actionValue,
          waitCondition,
          timeoutMs,
          note: elements.stepNoteInput.value.trim()
        })
      : buildMetaSummary(step, elements.stepNoteInput.value.trim())
}

function renderAssertionComposer() {
  if (!assertionDraft) {
    elements.assertionComposer.classList.add('hidden')
    return
  }

  const config = getAssertionComposerConfig(assertionDraft.assertionType)
  elements.assertionComposer.classList.remove('hidden')
  setInputValue(elements.assertionTargetValue, assertionDraft.targetValue || '')
  setInputValue(elements.assertionExpectedValue, assertionDraft.expectedValue || '')
  setInputValue(elements.assertionTimeoutMs, String(assertionDraft.timeoutMs || 5000))
  if (document.activeElement !== elements.assertionTypeSelect) {
    elements.assertionTypeSelect.value = assertionDraft.assertionType || 'assert_visible'
  }
  if (document.activeElement !== elements.assertionTargetStrategy) {
    elements.assertionTargetStrategy.value = assertionDraft.targetStrategy || 'text'
  }

  elements.assertionExpectedValueLabel.textContent = config.expectedValueLabel
  toggleVisibility(elements.assertionTargetStrategyField, config.showTarget)
  toggleVisibility(elements.assertionTargetValueField, config.showTarget)
  toggleVisibility(elements.assertionExpectedValueField, config.showExpectedValue)
  toggleVisibility(elements.pickAssertionTarget, config.canPickTarget)
  const preview = config.showTarget
    ? buildTargetPreview(assertionDraft.targetStrategy, assertionDraft.targetValue)
    : ''
  elements.assertionTargetSummary.textContent = preview || config.summaryFallback || 'Pick an element or define it manually'
  elements.assertionScopeSummary.textContent = config.scopeLabel
  elements.assertionTargetPreview.textContent = buildAssertionSummary(assertionDraft) || 'No assertion summary yet'
}

function renderLogs() {
  const playbackLogs = (currentState?.playback?.logs || []).map((entry) => ({
    level: entry.level || 'INFO',
    message: entry.message || '',
    timestamp: entry.timestamp || new Date().toISOString(),
    source: 'runtime'
  }))
  const backgroundLogs = (currentState?.activityLog || []).map((entry) => ({
    level: entry.level || 'INFO',
    message: entry.message || '',
    timestamp: entry.timestamp || new Date().toISOString(),
    source: entry.source || 'background'
  }))

  const merged = playbackLogs
    .concat(backgroundLogs)
    .concat(uiLogEntries)
    .sort((left, right) => toTime(right.timestamp) - toTime(left.timestamp))
    .slice(0, 40)

  elements.playbackLog.innerHTML = ''
  if (!merged.length) {
    elements.playbackLog.appendChild(createEmptyState('Button clicks, test selection, backend calls, and replay messages will show up here.'))
    return
  }

  merged.forEach((entry) => {
    const row = document.createElement('div')
    row.className = 'log-entry'

    const topline = document.createElement('div')
    topline.className = 'log-topline'

    const level = document.createElement('span')
    const sourceLabel = entry.source === 'runtime'
      ? 'Replay'
      : entry.source === 'background'
        ? 'Background'
        : 'Panel'
    level.textContent = `${entry.level} - ${sourceLabel}`

    const time = document.createElement('span')
    time.textContent = formatTime(entry.timestamp)

    const message = document.createElement('div')
    message.className = 'log-message'
    message.textContent = entry.message

    topline.appendChild(level)
    topline.appendChild(time)
    row.appendChild(topline)
    row.appendChild(message)
    elements.playbackLog.appendChild(row)
  })
}

function updateButtonStates() {
  const activeTest = getActiveTest()
  const steps = currentState?.scenario?.orderedSteps || []
  const hasSteps = steps.length > 0
  const hasSelection = recorderState.selectedStepIndex != null
  const selectedStep = hasSelection ? steps[recorderState.selectedStepIndex] : null
  const selectedStepConfig = selectedStep ? getStepEditorConfig(selectedStep) : null
  const editingLocked = hasActiveReplayLock()
  const pending = Boolean(recorderState.pendingAction)
  const replaySessionActive = hasReplaySession()
  const replayPaused = recorderState.replayPaused || recorderState.replayStatus === 'failed'
  const replayCanAdvance = replaySessionActive &&
    replayPaused &&
    !recorderState.replayStepInProgress &&
    Number.isInteger(recorderState.replayCurrentStepIndex) &&
    recorderState.replayCurrentStepIndex >= 0 &&
    recorderState.replayCurrentStepIndex < steps.length
  const replayCanRetry = replayCanAdvance && recorderState.replayFailedStepIndex != null
  const hasControlledTab = Boolean(recorderState.activeTabId)
  const actionReady = Boolean(actionDraft) && isActionDraftValid(actionDraft)
  const assertionReady = Boolean(assertionDraft) && isAssertionDraftValid(assertionDraft)
  const hasManualComposer = Boolean(actionDraft || assertionDraft || currentState?.pickerMode)
  const testFinished = resolveTestLifecycleStatus(activeTest) === 'finished'

  toggleVisibility(elements.pauseRecording, recorderState.recording && !recorderState.recordingPaused)
  toggleVisibility(elements.resumeRecording, recorderState.recording && recorderState.recordingPaused)
  toggleVisibility(elements.pausePlayback, recorderState.replaying && !replayPaused)
  toggleVisibility(elements.resumePlayback, replaySessionActive && replayPaused)

  setDisabled(elements.startNewTest, pending || recorderState.recording || replaySessionActive)
  setDisabled(elements.finishTest, !activeTest || pending || replaySessionActive || (testFinished && !hasControlledTab && !recorderState.recording))
  setDisabled(elements.renameTest, !activeTest || pending || recorderState.recording || replaySessionActive)
  setDisabled(elements.duplicateTest, !activeTest || pending || recorderState.recording || replaySessionActive)
  setDisabled(elements.deleteTest, !activeTest || pending || recorderState.recording || replaySessionActive)
  setDisabled(elements.modeRecordAction, !activeTest || !hasControlledTab || pending || replaySessionActive)
  setDisabled(elements.addActionMode, !activeTest || pending || replaySessionActive)
  setDisabled(elements.clearComposerMode, !hasManualComposer || pending)

  setDisabled(elements.startRecording, !hasControlledTab || recorderState.recording || replaySessionActive || pending)
  setDisabled(elements.pauseRecording, !recorderState.recording || recorderState.recordingPaused || pending)
  setDisabled(elements.resumeRecording, !recorderState.recording || !recorderState.recordingPaused || pending)
  setDisabled(elements.stopRecording, !recorderState.recording || pending)
  setDisabled(elements.assertionMode, pending || replaySessionActive || !activeTest)
  setDisabled(elements.undoLastStep, !hasSteps || editingLocked || pending)

  setDisabled(elements.replayAll, !hasSteps || recorderState.recording || replaySessionActive || pending || !hasControlledTab)
  setDisabled(elements.replayFromCurrent, !hasSelection || recorderState.recording || replaySessionActive || pending || !hasControlledTab)
  setDisabled(elements.pausePlayback, !recorderState.replaying || replayPaused)
  setDisabled(elements.resumePlayback, !replaySessionActive || !replayPaused || pending)
  setDisabled(elements.stopPlayback, !replaySessionActive)
  setDisabled(elements.nextPlaybackStep, !replayCanAdvance)
  setDisabled(elements.retryPlaybackStep, !replayCanRetry)
  setDisabled(elements.skipPlaybackStep, !replayCanAdvance)

  setDisabled(elements.moveStepUp, !hasSelection || editingLocked || pending || recorderState.selectedStepIndex === 0)
  setDisabled(elements.moveStepDown, !hasSelection || editingLocked || pending || recorderState.selectedStepIndex === steps.length - 1)
  setDisabled(elements.deleteSelectedStep, !hasSelection || editingLocked || pending)
  setDisabled(elements.addNote, editingLocked || pending)
  setDisabled(elements.markSetup, !hasSelection || editingLocked || pending)
  setDisabled(elements.markTest, !hasSelection || editingLocked || pending)
  setDisabled(elements.markCleanup, !hasSelection || editingLocked || pending)

  setDisabled(elements.validateScenario, pending || replaySessionActive)
  setDisabled(elements.saveScenario, pending || replaySessionActive)
  setDisabled(elements.exportScenario, !hasSteps || pending || replaySessionActive)
  setDisabled(elements.generateJava, !hasSteps || pending || replaySessionActive)
  setDisabled(elements.applyStepChanges, !selectedStep || pending || editingLocked)
  setDisabled(elements.pickStepTarget, !selectedStepConfig?.canPickTarget || !hasControlledTab || pending || editingLocked)
  setDisabled(elements.createAction, !actionReady || pending || replaySessionActive)
  setDisabled(elements.cancelAction, !actionDraft || pending)
  setDisabled(elements.pickActionTarget, !actionDraft || !getActionComposerConfig(actionDraft?.actionType, actionDraft?.waitCondition).canPickTarget || !hasControlledTab || pending || replaySessionActive)
  setDisabled(elements.createAssertion, !assertionReady || pending || replaySessionActive)
  setDisabled(elements.cancelAssertion, !assertionDraft || pending)
  setDisabled(elements.pickAssertionTarget, !assertionDraft || !getAssertionComposerConfig(assertionDraft?.assertionType).canPickTarget || !hasControlledTab || pending || replaySessionActive)

  ;[
    elements.backendUrl,
    elements.scenarioName,
    elements.startUrl,
    elements.profileSelect,
    elements.javaClassName,
    elements.captureScreenshots
  ].forEach((field) => setDisabled(field, pending || replaySessionActive))

  setActive(elements.modeRecordAction, recorderState.recording)
  setActive(elements.addActionMode, Boolean(actionDraft || currentState?.pickerMode?.kind === 'action'))
  setActive(elements.assertionMode, Boolean(assertionDraft || currentState?.pickerMode?.kind === 'assertion'))
  setActive(elements.replayAll, recorderState.replaying && !replayPaused)
  setActive(elements.resumePlayback, replaySessionActive && replayPaused)
  setActive(elements.markSetup, selectedStep?.stage === 'setup')
  setActive(elements.markTest, selectedStep?.stage === 'test')
  setActive(elements.markCleanup, selectedStep?.stage === 'cleanup')

  elements.deleteSelectedStep.textContent = selectedStep && resolveStepCategory(selectedStep) === 'ASSERT'
    ? 'Delete Selected Assertion'
    : 'Delete Selected Step'
}

async function startNewTest() {
  logAction('Start New Test clicked')

  if (recorderState.recording || hasReplaySession()) {
    invalidAction('Stop recording or replay before starting a new test.')
    return
  }

  await withPendingAction('new-test', async () => {
    logAction('Sending START_NEW_TEST to background')
    const response = await sendRuntimeMessage({
      type: 'START_NEW_TEST',
      startUrl: elements.startUrl.value.trim(),
      profileId: elements.profileSelect.value,
      javaClassName: elements.javaClassName.value.trim()
    })
    logAction(`Background responded to START_NEW_TEST with test ${response.testId || 'unknown'} and tab ${response.tabId || 'unknown'}`)
    if (!response.success || !response.testId || !Number.isInteger(response.tabId)) {
      throw new Error('Start New Test did not return a valid test id and tab id.')
    }
    const createdTest = (response.state?.tests || []).find((test) => test.id === response.testId)
    if (!createdTest) {
      throw new Error('Start New Test completed without returning the created test in state.')
    }
    if (response.state?.activeTestId !== response.testId || response.state?.activeTabId !== response.tabId) {
      throw new Error('Start New Test did not attach the new tab to the active test state.')
    }
    logAction(`Panel state refreshed for ${response.testId} in controlled tab #${response.tabId}`)
  })

  clearActionDraftState()
  clearAssertionDraftState()
  logAction(`New test started successfully in controlled tab #${recorderState.activeTabId || 'unknown'}`)
}

async function finishTest() {
  logAction('Finish Test clicked')
  const activeTest = getActiveTest()
  if (!activeTest) {
    invalidAction('Select a test before finishing it.')
    return
  }
  if (hasReplaySession()) {
    invalidAction('Stop replay before finishing the test.')
    return
  }

  await clearManualModes({ clearPending: true, logMessage: false })

  const response = await withPendingAction('finish-test', async () => sendRuntimeMessage({ type: 'FINISH_TEST' }))
  clearActionDraftState()
  clearAssertionDraftState()

  const recordingMessage = response.recordingStopped
    ? 'Recording was stopped first.'
    : 'Recording was already stopped.'
  const tabMessage = Number.isInteger(response.detachedTabId)
    ? `Recorder control detached from browser tab #${response.detachedTabId}.`
    : 'No attached browser tab needed to be detached.'
  logAction(`Test finished. ${recordingMessage} ${tabMessage}`)
}

async function renameTest() {
  const activeTest = getActiveTest()
  if (!activeTest) {
    invalidAction('Select a test before renaming it.')
    return
  }

  const nextName = window.prompt('Rename test', activeTest.name || 'Untitled Test')
  if (!nextName || !nextName.trim()) {
    logAction('Rename Test cancelled', 'INFO', { persist: false })
    return
  }

  await sendRuntimeMessage({ type: 'RENAME_TEST', testId: activeTest.id, name: nextName.trim() })
  logAction(`Renamed test to ${nextName.trim()}`)
}

async function duplicateTest() {
  const activeTest = getActiveTest()
  if (!activeTest) {
    invalidAction('Select a test before duplicating it.')
    return
  }

  await sendRuntimeMessage({ type: 'DUPLICATE_TEST', testId: activeTest.id })
  logAction(`Duplicated test ${activeTest.name}`)
}

async function deleteTest() {
  const activeTest = getActiveTest()
  if (!activeTest) {
    invalidAction('Select a test before deleting it.')
    return
  }

  if (!window.confirm(`Delete test "${activeTest.name}"?`)) {
    logAction('Delete Test cancelled', 'INFO', { persist: false })
    return
  }

  await sendRuntimeMessage({ type: 'DELETE_TEST', testId: activeTest.id })
  clearActionDraftState()
  clearAssertionDraftState()
  logAction(`Deleted test ${activeTest.name}`)
}

async function selectTest(testId) {
  if (recorderState.recording || hasReplaySession()) {
    invalidAction('Stop recording or replay before switching tests.')
    return
  }

  await sendRuntimeMessage({ type: 'SELECT_TEST', testId }, {
    alertOnError: true,
    logErrors: true
  })
  clearActionDraftState()
  clearAssertionDraftState()
  logAction('Test selected')
}

async function startRecording() {
  logAction('Start Recording clicked')
  if (!recorderState.activeTabId) {
    invalidAction('Start New Test first so the recorder has one controlled browser tab.')
    return
  }
  if (recorderState.replaying) {
    invalidAction('Stop replay before starting recording.')
    return
  }

  await clearManualModes({ clearPending: true, logMessage: false })
  await syncSettings()
  await sendRuntimeMessage({ type: 'START_RECORDING' })
  logAction('Recording started')
}

async function pauseRecording() {
  logAction('Pause clicked')
  if (!recorderState.recording || recorderState.recordingPaused) {
    invalidAction('Recording is not running.')
    return
  }

  await sendRuntimeMessage({ type: 'PAUSE_RECORDING' })
  logAction('Recording paused')
}

async function resumeRecording() {
  logAction('Continue clicked')
  if (!recorderState.recording || !recorderState.recordingPaused) {
    invalidAction('Recording is not paused.')
    return
  }

  await sendRuntimeMessage({ type: 'RESUME_RECORDING' })
  logAction('Recording resumed')
}

async function stopRecording() {
  logAction('Stop clicked')
  if (!recorderState.recording) {
    invalidAction('Recording is already stopped.')
    return
  }

  await sendRuntimeMessage({ type: 'STOP_RECORDING' })
  logAction('Recording stopped')
}

async function replayScenario() {
  logAction('Replay triggered')
  await replayFromIndex(0)
}

async function replayFromCurrent() {
  logAction('Replay from current triggered')
  if (recorderState.selectedStepIndex == null) {
    invalidAction('Select a step before using Replay From.')
    return
  }
  await replayFromIndex(recorderState.selectedStepIndex)
}

async function replayFromIndex(startIndex) {
  const steps = currentState?.scenario?.orderedSteps || []
  if (!steps.length) {
    invalidAction('Replay is unavailable until this test has at least one step.')
    return
  }
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= steps.length) {
    invalidAction('The replay starting step is out of bounds for the current scenario.')
    return
  }
  if (!recorderState.activeTabId) {
    invalidAction('This test has no controlled browser tab. Start New Test to open one.')
    return
  }
  if (recorderState.recording) {
    invalidAction('Stop recording before replaying the test.')
    return
  }
  if (hasReplaySession()) {
    invalidAction('Replay is already running.')
    return
  }

  const validation = await validateScenario({
    silent: true,
    logClick: false,
    reason: startIndex > 0 ? `Replay validation from step ${startIndex + 1}` : 'Replay validation'
  })
  if (!validation.valid) {
    const replayMessage = 'Replay blocked because validation failed. Check the log for details.'
    logAction(replayMessage, 'WARN')
    window.alert(replayMessage)
    return
  }

  await withPendingAction('replay', async () => {
    await sendRuntimeMessage({ type: REPLAY_COMMANDS.START, startIndex, mode: 'hybrid' })
  })

  logAction(startIndex > 0 ? `Replay started from step ${startIndex + 1}` : 'Replay started')
}

async function pauseReplay() {
  logAction('Pause replay clicked')
  if (!recorderState.replaying || recorderState.replayPaused) {
    invalidAction('Replay is not currently running.')
    return
  }
  await sendRuntimeMessage({ type: REPLAY_COMMANDS.PAUSE })
  logAction('Replay paused')
}

async function resumeReplay() {
  logAction('Continue replay clicked')
  if (!hasReplaySession() || !(recorderState.replayPaused || recorderState.replayStatus === 'failed')) {
    invalidAction('Replay is not paused.')
    return
  }
  await sendRuntimeMessage({ type: REPLAY_COMMANDS.RESUME })
  logAction('Replay resumed')
}

async function stopReplay() {
  logAction('Stop replay clicked')
  if (!hasReplaySession()) {
    invalidAction('Replay is already stopped.')
    return
  }
  await sendRuntimeMessage({ type: REPLAY_COMMANDS.STOP })
  logAction('Replay stopped')
}

async function nextPlaybackStep() {
  logAction('Next replay step clicked')
  if (!hasReplaySession() || !(recorderState.replayPaused || recorderState.replayStatus === 'failed')) {
    invalidAction('Pause replay before stepping forward.')
    return
  }
  const steps = currentState?.scenario?.orderedSteps || []
  if (!Number.isInteger(recorderState.replayCurrentStepIndex) || recorderState.replayCurrentStepIndex < 0 || recorderState.replayCurrentStepIndex >= steps.length) {
    invalidAction('Replay is already at the end of the scenario.')
    return
  }
  await sendRuntimeMessage({ type: REPLAY_COMMANDS.NEXT })
  logAction('Advanced replay by one step')
}

async function retryPlaybackStep() {
  logAction('Retry replay step clicked')
  if (!hasReplaySession() || recorderState.replayFailedStepIndex == null) {
    invalidAction('There is no failed replay step to retry.')
    return
  }
  await sendRuntimeMessage({ type: REPLAY_COMMANDS.RETRY })
  logAction('Retry replay requested')
}

async function skipPlaybackStep() {
  logAction('Skip replay step clicked')
  if (!hasReplaySession() || !(recorderState.replayPaused || recorderState.replayStatus === 'failed')) {
    invalidAction('Pause replay before skipping a step.')
    return
  }
  await sendRuntimeMessage({ type: REPLAY_COMMANDS.SKIP })
  logAction('Replay step skipped')
}

async function deleteStep() {
  const selectedStep = getSelectedStep()
  const deletingAssertion = resolveStepCategory(selectedStep) === 'ASSERT'
  logAction(deletingAssertion ? 'Delete Selected Assertion clicked' : 'Delete Selected Step clicked')
  if (recorderState.selectedStepIndex == null || !selectedStep) {
    invalidAction('Select a step before deleting it.')
    return
  }
  if (recorderState.replaying) {
    invalidAction('Stop replay before editing steps.')
    return
  }
  await sendRuntimeMessage({ type: 'DELETE_SELECTED_STEP' })
  logAction(deletingAssertion ? 'Selected assertion deleted' : 'Selected step deleted')
}

async function moveStepUp() {
  logAction('Move Up clicked')
  if (recorderState.selectedStepIndex == null) {
    invalidAction('Select a step before moving it.')
    return
  }
  if (recorderState.selectedStepIndex === 0) {
    invalidAction('The selected step is already at the top.')
    return
  }
  await sendRuntimeMessage({ type: 'MOVE_SELECTED_STEP', delta: -1 })
  logAction('Selected step moved up')
}

async function moveStepDown() {
  logAction('Move Down clicked')
  const steps = currentState?.scenario?.orderedSteps || []
  if (recorderState.selectedStepIndex == null) {
    invalidAction('Select a step before moving it.')
    return
  }
  if (recorderState.selectedStepIndex >= steps.length - 1) {
    invalidAction('The selected step is already at the bottom.')
    return
  }
  await sendRuntimeMessage({ type: 'MOVE_SELECTED_STEP', delta: 1 })
  logAction('Selected step moved down')
}

async function enterRecordActionMode() {
  logAction('Record Action clicked')
  if (!getActiveTest()) {
    invalidAction('Start or select a test before recording actions.')
    return
  }

  await clearManualModes({ clearPending: true, logMessage: false })

  if (!recorderState.recording) {
    await startRecording()
    return
  }
  if (recorderState.recordingPaused) {
    await resumeRecording()
    return
  }

  render()
  logAction('Recording actions on the active test tab')
}

async function addAction() {
  logAction('Add Action clicked')
  const activeTest = getActiveTest()
  if (!activeTest) {
    invalidAction('Start or select a test before adding an action.')
    return
  }
  if (recorderState.replaying) {
    invalidAction('Stop replay before adding an action.')
    return
  }

  if (actionDraft) {
    await cancelAction()
    return
  }

  await clearManualModes({ clearPending: true, logMessage: false })
  actionDraft = createActionDraftFromContext()
  render()
  updateButtonStates()
  logAction(activeTest.tabId
    ? 'Action composer opened. Create a manual ACTION step or pick a target in the current test tab.'
    : 'Action composer opened for manual entry. This test has no attached tab to pick from.')
}

async function clearComposerMode() {
  await clearManualModes({ clearPending: true, logMessage: true })
}

function handleActionDraftInput() {
  if (!actionDraft) {
    actionDraft = createEmptyActionDraft()
  }

  actionDraft.actionType = normalizeActionType(elements.actionTypeSelect.value)
  actionDraft.targetStrategy = normalizeTargetStrategy(elements.actionTargetStrategy.value)
  actionDraft.targetValue = elements.actionTargetValue.value.trim()
  actionDraft.actionValue = elements.actionValueInput.value
  actionDraft.waitCondition = elements.actionWaitConditionSelect.value || 'visible'
  actionDraft.timeoutMs = Number(elements.actionTimeoutMs.value || 5000)
  actionDraft.note = elements.actionNoteInput.value.trim()

  renderActionComposer()
  updateButtonStates()
}

async function pickActionTarget() {
  logAction('Pick action target clicked')
  if (!actionDraft) {
    invalidAction('Open Add Action before picking a target.')
    return
  }
  if (!recorderState.activeTabId) {
    invalidAction('This test has no attached tab to pick from.')
    return
  }

  const config = getActionComposerConfig(actionDraft.actionType, actionDraft.waitCondition)
  if (!config.canPickTarget) {
    invalidAction('This action type does not use a page target.')
    return
  }

  await sendRuntimeMessage({
    type: 'SET_PICKER_MODE',
    enabled: true,
    kind: 'action',
    stepType: actionDraft.actionType,
    clearPending: false
  }, {
    alertOnError: false,
    logErrors: true
  })
  logAction('Click an element in the current test tab to fill the action target')
}

async function createActionStep() {
  logAction('Create Action clicked')
  if (!actionDraft || !isActionDraftValid(actionDraft)) {
    invalidAction('Choose an action type and fill the required fields before creating the step.')
    return
  }

  const payload = buildActionRequestPayload(actionDraft)
  await sendRuntimeMessage(Object.assign({ type: 'CREATE_ACTION_STEP' }, payload))
  clearActionDraftState()
  render()
  updateButtonStates()
  logAction('Action step created and selected')
}

async function cancelAction() {
  if (!actionDraft && currentState?.pickerMode?.kind !== 'action' && !currentState?.pendingActionTarget) {
    return
  }

  clearActionDraftState()
  if (currentState?.pickerMode?.kind === 'action' || currentState?.pendingActionTarget) {
    await sendRuntimeMessage({
      type: 'SET_PICKER_MODE',
      enabled: false,
      clearPending: true
    }, {
      alertOnError: false,
      logErrors: false
    })
  }
  render()
  updateButtonStates()
  logAction('Action creation cancelled')
}

async function addAssertion() {
  const activeTest = getActiveTest()
  if (!activeTest) {
    invalidAction('Start or select a test before adding an assertion.')
    return
  }
  if (recorderState.replaying) {
    invalidAction('Stop replay before adding an assertion.')
    return
  }

  if (assertionDraft) {
    await cancelAssertion()
    return
  }

  await clearManualModes({ clearPending: true, logMessage: false })
  assertionDraft = createAssertionDraftFromContext()
  lastPendingAssertionKey = buildAssertionTargetKey(currentState?.pendingAssertion || {})
  render()
  updateButtonStates()
  logAction(activeTest.tabId
    ? 'Assertion composer opened. Pick an element or define it manually, then choose what is expected.'
    : 'Assertion composer opened for manual entry. This test has no attached tab to pick from.')
}

async function cancelAssertion() {
  if (!assertionDraft && currentState?.pickerMode?.kind !== 'assertion' && !currentState?.pendingAssertion) {
    return
  }

  clearAssertionDraftState()
  if (currentState?.pickerMode?.kind === 'assertion' || currentState?.pendingAssertion || currentState?.assertionMode) {
    await sendRuntimeMessage({ type: 'SET_PICKER_MODE', enabled: false, clearPending: true }, {
      alertOnError: false,
      logErrors: false
    })
  }
  render()
  updateButtonStates()
  logAction('Assertion creation cancelled')
}

function handleAssertionDraftInput() {
  if (!assertionDraft) {
    assertionDraft = createEmptyAssertionDraft()
  }

  const previousType = assertionDraft.assertionType || 'assert_visible'
  assertionDraft.assertionType = elements.assertionTypeSelect.value
  assertionDraft.targetStrategy = normalizeTargetStrategy(elements.assertionTargetStrategy.value)
  assertionDraft.targetValue = elements.assertionTargetValue.value.trim()
  assertionDraft.defaultExpectedValue = assertionDraft.defaultExpectedValue || assertionDraft.targetValue
  const configuredType = getAssertionComposerConfig(assertionDraft.assertionType)
  const typedExpectedValue = elements.assertionExpectedValue.value
  if (
    assertionDraft.assertionType !== previousType &&
    configuredType.showExpectedValue &&
    !String(typedExpectedValue || '').trim()
  ) {
    assertionDraft.expectedValue = assertionDraft.defaultExpectedValue || assertionDraft.targetValue || ''
    setInputValue(elements.assertionExpectedValue, assertionDraft.expectedValue)
  } else {
    assertionDraft.expectedValue = typedExpectedValue
  }
  assertionDraft.timeoutMs = Number(elements.assertionTimeoutMs.value || 5000)

  renderAssertionComposer()
  updateButtonStates()
}

async function pickAssertionTarget() {
  logAction('Pick assertion target clicked')
  if (!assertionDraft) {
    invalidAction('Open Add Assertion before picking a target.')
    return
  }
  if (!recorderState.activeTabId) {
    invalidAction('This test has no attached tab to pick from.')
    return
  }

  const config = getAssertionComposerConfig(assertionDraft.assertionType)
  if (!config.canPickTarget) {
    invalidAction('This assertion type does not use a page target.')
    return
  }

  await sendRuntimeMessage({
    type: 'SET_PICKER_MODE',
    enabled: true,
    kind: 'assertion',
    stepType: assertionDraft.assertionType,
    clearPending: false
  }, {
    alertOnError: false,
    logErrors: true
  })
  logAction('Click an element in the current test tab to fill the assertion target, then choose what is expected')
}

async function createAssertionStep() {
  logAction('Create Assertion clicked')
  if (!assertionDraft || !isAssertionDraftValid(assertionDraft)) {
    invalidAction('Choose an assertion type and target before creating the assertion step.')
    return
  }

  await sendRuntimeMessage({
    type: 'CREATE_ASSERTION_STEP',
    assertionType: assertionDraft.assertionType,
    targetStrategy: assertionDraft.targetStrategy,
    targetValue: assertionDraft.targetValue,
    expectedValue: assertionDraft.expectedValue,
    timeoutMs: assertionDraft.timeoutMs
  })
  clearAssertionDraftState()
  render()
  updateButtonStates()
  logAction('Assertion step created and selected')
}

async function pickSelectedStepTarget() {
  const step = getSelectedStep()
  if (!step) {
    invalidAction('Select a step before picking a target.')
    return
  }
  if (!recorderState.activeTabId) {
    invalidAction('This test has no attached tab to pick from.')
    return
  }

  const category = resolveStepCategory(step)
  const config = getStepEditorConfig(step)
  if (!config.canPickTarget) {
    invalidAction('The selected step does not use a page target.')
    return
  }

  await sendRuntimeMessage({
    type: 'SET_PICKER_MODE',
    enabled: true,
    kind: category === 'ASSERT' ? 'assertion' : 'action',
    stepType: category === 'ASSERT' ? step.type : normalizeActionType(step.type),
    clearPending: false
  }, {
    alertOnError: false,
    logErrors: true
  })
  logAction('Click an element in the current test tab to update this step target')
}

async function applyStepChanges() {
  const step = getSelectedStep()
  if (!step) {
    invalidAction('Select a step before editing it.')
    return
  }

  const category = resolveStepCategory(step)
  const config = getStepEditorConfig(step)
  const targetStrategy = config.showTarget
    ? normalizeTargetStrategy(elements.stepTargetStrategy.value)
    : inferTargetStrategy(step)
  const targetValue = config.showTarget
    ? elements.stepTargetValue.value.trim()
    : resolveStepTargetValue(step)
  const actionValue = config.showActionValue ? elements.stepActionValue.value : resolveStepActionValue(step)
  const expectedValue = config.showExpectedValue ? elements.stepExpectedValue.value : resolveStepExpectedValue(step)
  const timeoutMs = Number(elements.stepTimeoutMs.value || 0)
  const waitCondition = config.showWaitCondition ? elements.stepWaitConditionSelect.value : (step.waitStrategy?.kind || 'visible')
  const normalizedTargetStrategy = category === 'ASSERT' && step.type === 'assert_url_contains'
    ? 'url'
    : category === 'ACTION' && normalizeActionType(step.type) === 'navigate'
      ? 'url'
      : category === 'ACTION' && normalizeActionType(step.type) === 'wait' && waitCondition === 'url_change'
        ? 'url'
        : targetStrategy
  const normalizedTargetValue = normalizedTargetStrategy === 'url' && !config.showTarget
    ? (expectedValue || actionValue || targetValue)
    : targetValue
  const validationError = validateStepEditorInputs(step, config, {
    targetValue: normalizedTargetValue,
    actionValue,
    expectedValue,
    waitCondition
  })
  if (validationError) {
    invalidAction(validationError)
    return
  }

  await sendRuntimeMessage({
    type: 'UPDATE_SELECTED_STEP',
    updates: {
      stage: elements.stepStageSelect.value,
      targetStrategy: normalizedTargetStrategy,
      targetValue: normalizedTargetValue,
      value: actionValue,
      expectedValue,
      timeoutMs,
      waitCondition,
      note: elements.stepNoteInput.value.trim()
    }
  })
  render()
  logAction(`Updated step ${recorderState.selectedStepIndex + 1}`)
}

async function markTest() {
  await markStage('test', 'Mark Test clicked', 'Marked step as Test')
}

async function markSetup() {
  await markStage('setup', 'Mark Setup clicked', 'Marked step as Setup')
}

async function markCleanup() {
  await markStage('cleanup', 'Mark Cleanup clicked', 'Marked step as Cleanup')
}

async function markStage(stage, clickMessage, successMessage) {
  logAction(clickMessage)
  if (recorderState.selectedStepIndex == null) {
    invalidAction('Select a step before changing its stage.')
    return
  }
  await sendRuntimeMessage({ type: 'MARK_SELECTED_STAGE', stage })
  logAction(successMessage)
}

async function undoLastStep() {
  logAction('Undo clicked')
  if (!(currentState?.scenario?.orderedSteps || []).length) {
    invalidAction('There are no steps to undo.')
    return
  }
  await sendRuntimeMessage({ type: 'UNDO_LAST_STEP' })
  logAction('Last step removed')
}

async function addNote() {
  logAction('Add Note clicked')
  const note = window.prompt('Scenario note')
  if (!note || !note.trim()) {
    logAction('Add Note cancelled', 'INFO', { persist: false })
    return
  }
  await sendRuntimeMessage({ type: 'ADD_SCENARIO_NOTE', note: note.trim() })
  logAction('Scenario note added')
}

async function saveScenario() {
  logAction('Save clicked')
  try {
    const response = await withPendingAction('save', async () => {
      await syncSettings({ alertOnError: false, logErrors: false })
      return callApi('/api/scenario/save', 'POST', {
        scenario: buildScenarioDocument(),
        fileName: `${sanitizeFileName(getScenarioName())}.json`,
        format: 'json'
      })
    })

    setBackendFeedback('Scenario saved', 'ok')
    logAction(`Scenario saved to ${response.path}`)
    window.alert(`Saved to ${response.path}`)
  } catch (error) {
    handleBackendActionError('Save failed', error)
  }
}

async function exportScenario() {
  logAction('Export clicked')
  if (!(currentState?.scenario?.orderedSteps || []).length) {
    invalidAction('There is nothing to export yet.')
    return
  }

  const payload = JSON.stringify(buildScenarioDocument(), null, 2)
  const downloadUrl = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  try {
    await chrome.downloads.download({
      url: downloadUrl,
      filename: `tim-ui-recorder/${sanitizeFileName(getScenarioName())}.json`,
      saveAs: true
    })
    logAction('Scenario exported')
  } catch (error) {
    const message = `Export failed\n${error?.message || 'Unknown export error.'}`
    logAction(message, 'ERROR')
    window.alert(message)
  } finally {
    URL.revokeObjectURL(downloadUrl)
  }
}

async function generateJava() {
  logAction('Generate Java clicked')
  if (!(currentState?.scenario?.orderedSteps || []).length) {
    invalidAction('Generate Java is unavailable until the test has at least one step.')
    return
  }

  try {
    const response = await withPendingAction('generate', async () => {
      await syncSettings({ alertOnError: false, logErrors: false })
      return callApi('/api/generate/java', 'POST', {
        scenario: buildScenarioDocument(),
        className: elements.javaClassName.value.trim(),
        profileId: elements.profileSelect.value
      })
    })

    setBackendFeedback('Java generated', 'ok')
    logAction(`Java generated: ${response.className}`)
    window.alert(`Generated ${response.className}\n${response.path}`)
  } catch (error) {
    handleBackendActionError('Generate Java failed', error)
  }
}

async function validateScenario(options = {}) {
  if (options.logClick !== false) {
    logAction('Validate clicked')
  } else if (options.reason) {
    logAction(options.reason)
  }

  try {
    const result = await withPendingAction('validate', async () => {
      await syncSettings({ alertOnError: false, logErrors: false })
      return callApi('/api/scenario/validate', 'POST', {
        scenario: buildScenarioDocument()
      })
    })

    setBackendFeedback(formatValidationSuccess(result), 'ok')
    logAction(formatValidationSuccess(result))
    if (!options.silent) {
      window.alert(formatValidationSuccess(result))
    }
    return { valid: true, result }
  } catch (error) {
    handleBackendActionError('Validation failed', error, { silent: options.silent })
    return { valid: false, result: error.payload || null, error }
  }
}

async function selectStep(index) {
  if (hasActiveReplayLock() || recorderState.replayStepInProgress) {
    invalidAction('Selection follows the active replay step. Pause replay before choosing another step.')
    return
  }
  await sendRuntimeMessage({ type: 'SET_SELECTED_STEP', index }, {
    alertOnError: false,
    logErrors: true
  })
  console.log(`Step ${index + 1} selected`)
}

async function syncSettings(options = {}) {
  const response = await sendRuntimeMessage({
    type: 'UPDATE_SETTINGS',
    backendUrl: elements.backendUrl.value.trim() || DEFAULT_BACKEND_URL,
    scenarioName: elements.scenarioName.value.trim() || 'Untitled Test',
    startUrl: elements.startUrl.value.trim(),
    profileId: elements.profileSelect.value,
    javaClassName: elements.javaClassName.value.trim(),
    captureScreenshots: elements.captureScreenshots.checked
  }, {
    alertOnError: options.alertOnError !== false,
    logErrors: options.logErrors !== false
  })

  if (response.state) {
    applyState(response.state)
  }
  return response
}

async function sendRuntimeMessage(message, options = {}) {
  try {
    const response = await chrome.runtime.sendMessage(message)
    if (response?.state) {
      applyState(response.state)
    }
    if (!response?.ok) {
      const error = new Error(response?.error || 'Action failed.')
      error.payload = response
      throw error
    }
    return response
  } catch (error) {
    if (options.logErrors !== false) {
      logAction(error.message || 'Runtime action failed', 'ERROR')
    }
    if (options.alertOnError !== false) {
      window.alert(error.message || 'Runtime action failed.')
      error.__alreadyAlerted = true
    }
    throw error
  }
}

async function withPendingAction(actionKey, work) {
  recorderState.pendingAction = actionKey
  renderSummary()
  updateButtonStates()
  try {
    return await work()
  } finally {
    recorderState.pendingAction = null
    renderSummary()
    updateButtonStates()
  }
}

async function callApi(path, method = 'GET', body = null) {
  const baseUrl = resolveBackendBaseUrl()
  const request = {
    method,
    headers: { Accept: 'application/json' }
  }

  if (body != null) {
    request.headers['Content-Type'] = 'application/json'
    request.body = JSON.stringify(body)
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, request)
    const text = await response.text()
    const payload = safeJsonParse(text)

    if (!response.ok) {
      const error = new Error(formatApiError(path, response.status, payload, text))
      error.status = response.status
      error.payload = payload
      throw error
    }

    setBackendUrlValidity(true)
    if (currentState) {
      currentState.backend = { ok: true, details: `API call succeeded: ${path}` }
    }
    return payload
  } catch (error) {
    if (error.status == null) {
      const wrappedError = new Error(`API error for ${path}: ${error.message || String(error)}`)
      wrappedError.cause = error
      throw wrappedError
    }
    throw error
  }
}

function resolveBackendBaseUrl() {
  const rawValue = (elements.backendUrl.value || currentState?.backendUrl || DEFAULT_BACKEND_URL).trim()
  try {
    const url = new URL(rawValue)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Backend URL must use http or https.')
    }
    setBackendUrlValidity(true)
    return url.toString().replace(/\/$/, '')
  } catch (error) {
    setBackendUrlValidity(false)
    throw new Error('Backend URL is invalid.')
  }
}

function buildScenarioDocument() {
  if (!currentState?.scenario) {
    throw new Error('Recorder state is not ready yet.')
  }

  const documentState = {
    metadata: structuredClone(currentState.scenario.metadata),
    variables: structuredClone(currentState.scenario.variables || {}),
    uploadAliases: structuredClone(currentState.scenario.uploadAliases || {}),
    setup: [],
    steps: [],
    assertions: [],
    cleanup: [],
    notes: structuredClone(currentState.scenario.notes || [])
  }

  ;(currentState.scenario.orderedSteps || []).forEach((step) => {
    const clonedStep = structuredClone(step)
    if (clonedStep.stage === 'setup') {
      documentState.setup.push(clonedStep)
    } else if (clonedStep.stage === 'assertion' || isAssertionStep(clonedStep)) {
      documentState.assertions.push(clonedStep)
    } else if (clonedStep.stage === 'cleanup') {
      documentState.cleanup.push(clonedStep)
    } else {
      documentState.steps.push(clonedStep)
    }
  })

  StepIds.ensureScenarioDocumentStepIds(documentState)
  return documentState
}

function buildReplaySummary() {
  const status = recorderState.replayStatus || 'idle'
  const mode = humanizeValue(recorderState.replayMode || 'local')
  const totalSteps = resolveReplayTotalSteps()

  if (status === 'idle' && !recorderState.replaySessionId) {
    return 'Replay: idle'
  }
  if (status === 'completed') {
    return `Replay: Completed ${totalSteps}/${totalSteps} (${mode})`
  }
  if (status === 'failed') {
    return `Replay: Failed at step ${resolveReplayDisplayStep()} of ${totalSteps} (${mode})`
  }
  if (status === 'paused') {
    return `Replay: Paused at step ${resolveReplayDisplayStep()} of ${totalSteps} (${mode})`
  }
  if (status === 'stopped') {
    return totalSteps ? `Replay: Stopped at step ${resolveReplayDisplayStep()} of ${totalSteps} (${mode})` : `Replay: Stopped (${mode})`
  }
  if (status === 'running' || recorderState.replaying) {
    return totalSteps ? `Replay: Running step ${resolveReplayDisplayStep()} of ${totalSteps} (${mode})` : `Replay: Running (${mode})`
  }
  return `Replay: ${humanizeValue(status)} (${mode})`
}

function buildReplayHelp() {
  const totalSteps = resolveReplayTotalSteps()
  if (!totalSteps) {
    return recorderState.activeTabId
      ? 'Replay runs in the current controlled tab. Select a step and use Replay From Selected when you only need part of the scenario.'
      : 'Replay becomes available after Start New Test opens a controlled tab and the scenario has at least one step.'
  }
  if (recorderState.replayStatus === 'failed') {
    return `Replay stopped at step ${resolveReplayDisplayStep()}. Review the error, edit the step if needed, then use Retry Failed, Skip Step, or Replay From Selected.`
  }
  if (recorderState.replayPaused) {
    return `Replay is paused at step ${resolveReplayDisplayStep()}. Use Run Next Step to advance manually, Resume Replay to continue, or Stop Replay to end the session.`
  }
  if (recorderState.replaying || recorderState.replayStatus === 'running') {
    return `Replay is running in the controlled tab. The highlighted card shows the current step (${resolveReplayDisplayStep()} of ${totalSteps}).`
  }
  if (recorderState.replayStatus === 'completed') {
    return 'Replay completed. Select any step and use Replay From Selected when you want to rerun only the tail of the scenario.'
  }
  if (recorderState.replayStatus === 'stopped') {
    return 'Replay stopped before completion. Select a step and use Replay From Selected to restart from the point you want.'
  }
  return 'Replay runs in the current controlled tab. Select a step and use Replay From Selected when you only need part of the scenario.'
}

function buildReplayProgressLabel() {
  const status = recorderState.replayStatus || 'idle'
  const totalSteps = resolveReplayTotalSteps()
  if (!totalSteps || (status === 'idle' && !recorderState.replaySessionId)) {
    return 'Replay idle'
  }
  if (status === 'completed') {
    return `Completed ${totalSteps}/${totalSteps}`
  }
  return `${humanizeValue(status)} ${resolveReplayDisplayStep()}/${totalSteps}`
}

function buildReplayPillLabel() {
  const status = recorderState.replayStatus || 'idle'
  if (status === 'idle' && !recorderState.replaySessionId) {
    return 'Idle'
  }
  return humanizeValue(status)
}

function resolveReplayPillState() {
  switch (recorderState.replayStatus) {
    case 'running':
      return 'active'
    case 'paused':
    case 'stopped':
      return 'warning'
    case 'failed':
      return 'error'
    case 'completed':
      return 'ok'
    default:
      return null
  }
}

function resolveReplayTotalSteps() {
  const scenarioStepCount = currentState?.scenario?.orderedSteps?.length || 0
  return Math.max(Number(recorderState.replayTotalSteps || 0), scenarioStepCount)
}

function resolveReplayDisplayStep() {
  const totalSteps = resolveReplayTotalSteps()
  if (!totalSteps) {
    return 0
  }
  if (recorderState.replayStatus === 'completed') {
    return totalSteps
  }
  if (recorderState.replayFailedStepIndex != null) {
    return Math.min(totalSteps, recorderState.replayFailedStepIndex + 1)
  }
  if (recorderState.replayCurrentStepIndex != null) {
    return Math.min(totalSteps, recorderState.replayCurrentStepIndex + 1)
  }
  if (recorderState.replayCompletedStepIndexes.length) {
    return Math.min(totalSteps, recorderState.replayCompletedStepIndexes.length)
  }
  return Math.min(totalSteps, 1)
}

function getReplayStepState(index) {
  if (recorderState.replayFailedStepIndex === index) {
    return 'failed'
  }
  if (recorderState.replayCompletedStepIndexes.includes(index)) {
    return 'completed'
  }
  if (recorderState.replayCurrentStepIndex === index) {
    if (recorderState.replayStatus === 'failed') {
      return 'failed'
    }
    if (recorderState.replayPaused || recorderState.replayStatus === 'paused') {
      return 'paused'
    }
    if (recorderState.replayStatus === 'running' || recorderState.replaying || recorderState.replayStepInProgress) {
      return 'active'
    }
  }
  return null
}

function createReplayBadge(replayStepState) {
  if (!replayStepState) {
    return null
  }
  const badge = document.createElement('span')
  badge.className = `step-replay-state ${replayStepState}`
  badge.textContent = replayStepState === 'completed' ? 'Done' : humanizeValue(replayStepState)
  return badge
}

function hasReplaySession() {
  return Boolean(recorderState.replaySessionId && !['idle', 'completed', 'stopped'].includes(recorderState.replayStatus))
}

function hasActiveReplayLock() {
  return Boolean(hasReplaySession() && !recorderState.replayPaused && recorderState.replayStatus !== 'failed')
}

function resolveRecorderHeadline() {
  if (recorderState.replaying || recorderState.replayStatus === 'failed') {
    return humanizeValue(recorderState.replayStatus === 'idle' ? 'replaying' : recorderState.replayStatus)
  }
  if (recorderState.recording) {
    return recorderState.recordingPaused ? 'Paused' : 'Recording'
  }
  if (resolveTestLifecycleStatus(getActiveTest()) === 'finished') {
    return 'Finished'
  }
  return 'Idle'
}

function getActiveTest() {
  return (currentState?.tests || []).find((test) => test.id === recorderState.activeTestId) || null
}

function getSelectedStep() {
  if (recorderState.selectedStepIndex == null) {
    return null
  }
  return currentState?.scenario?.orderedSteps?.[recorderState.selectedStepIndex] || null
}

function filterSteps(steps) {
  return steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => {
      if (stepFilter === 'actions') {
        return resolveStepCategory(step) === 'ACTION'
      }
      if (stepFilter === 'assertions') {
        return resolveStepCategory(step) === 'ASSERT'
      }
      return true
    })
}

function setStepFilter(nextFilter) {
  stepFilter = nextFilter
  renderSteps()
}

function resolveStepCategory(step) {
  if (isAssertionStep(step)) {
    return 'ASSERT'
  }
  if (!ACTION_TYPES.has(step.type || '')) {
    return 'META'
  }
  return 'ACTION'
}

function resolveStepCategoryClass(step) {
  const category = resolveStepCategory(step)
  return category === 'ASSERT' ? 'assert' : category === 'META' ? 'meta' : 'action'
}

function stepCategoryState(category) {
  return category === 'ASSERT' ? 'warning' : category === 'META' ? 'active' : 'ok'
}

function isAssertionStep(step) {
  return step?.stage === 'assertion' || String(step?.type || '').startsWith('assert_')
}

function countScenarioSteps(scenario) {
  return Array.isArray(scenario?.orderedSteps) ? scenario.orderedSteps.length : 0
}

function resolveStepDescription(step) {
  const category = resolveStepCategory(step)
  if (category === 'ASSERT') {
    return buildAssertionSummary({
      assertionType: step.type,
      targetStrategy: inferTargetStrategy(step),
      targetValue: resolveStepTargetValue(step),
      expectedValue: resolveStepExpectedValue(step),
      timeoutMs: step.waitStrategy?.timeoutMs || 5000
    })
  }
  if (category === 'ACTION') {
    return buildActionSummary({
      actionType: normalizeActionType(step.type),
      targetStrategy: inferTargetStrategy(step),
      targetValue: resolveStepTargetValue(step),
      actionValue: resolveStepActionValue(step),
      waitCondition: step.waitStrategy?.kind || 'visible',
      timeoutMs: step.waitStrategy?.timeoutMs || 5000,
      note: step.note || ''
    })
  }
  return buildMetaSummary(step)
}

function resolveTargetSummary(step) {
  if (['assert_popup_present', 'assert_popup_text', 'assert_alert_present', 'assert_alert_text'].includes(step?.type)) {
    return 'Current popup dialog'
  }
  const strategy = normalizeTargetStrategy(step.selector?.primaryStrategy || inferTargetStrategy(step))
  const value = resolveStepTargetValue(step)
  return buildTargetPreview(strategy, value) || (strategy === 'url' ? 'Current page URL' : 'No target')
}

function resolveStepTargetValue(step) {
  if (!step) {
    return ''
  }
  if (['assert_popup_present', 'assert_popup_text', 'assert_alert_present', 'assert_alert_text'].includes(step.type)) {
    return ''
  }
  if (step.type === 'assert_url_contains') {
    return step.expectedValue || step.selector?.primaryValue || ''
  }
  if (step.type === 'wait' && step.waitStrategy?.kind === 'url_change') {
    return step.waitStrategy?.expectedUrlFragment || step.value || step.selector?.primaryValue || ''
  }
  if (step.selector?.primaryValue) {
    return step.selector.primaryValue
  }
  if (step.selector?.visibleText) {
    return step.selector.visibleText
  }
  if (step.type === 'navigate') {
    return step.value || step.url || ''
  }
  return ''
}

function resolveStepActionValue(step) {
  if (!step) {
    return ''
  }
  if (step.type === 'navigate') {
    return step.value || step.url || ''
  }
  if (step.type === 'wait') {
    const kind = step.waitStrategy?.kind || 'visible'
    if (kind === 'text_contains') {
      return step.waitStrategy?.expectedText || step.value || ''
    }
    if (kind === 'value_equals') {
      return step.waitStrategy?.expectedValue || step.value || ''
    }
    if (kind === 'url_change') {
      return step.waitStrategy?.expectedUrlFragment || step.value || ''
    }
    return ''
  }
  return step.value == null ? '' : String(step.value)
}

function resolveStepExpectedValue(step) {
  if (!step) {
    return ''
  }
  if (step.type === 'assert_url_contains') {
    return step.expectedValue || step.selector?.primaryValue || ''
  }
  return step.expectedValue == null ? '' : String(step.expectedValue)
}

function inferTargetStrategy(step) {
  if (!step) {
    return 'text'
  }
  if (step.type === 'navigate' || step.type === 'assert_url_contains' || (step.type === 'wait' && step.waitStrategy?.kind === 'url_change')) {
    return 'url'
  }
  return step.selector?.primaryStrategy || 'text'
}

function inferEditorStage(step) {
  return isAssertionStep(step) ? 'assertion' : (step.stage || 'test')
}

function buildTargetPreview(strategy, value) {
  const clause = buildTargetClause(strategy, value)
  if (!clause) {
    return ''
  }
  return clause.slice(0, 1).toUpperCase() + clause.slice(1)
}

function normalizeTargetStrategy(strategy) {
  const value = String(strategy || '').trim()
  return TARGET_STRATEGIES.some((item) => item.value === value) ? value : 'text'
}

function createEmptyActionDraft() {
  return {
    actionType: 'click',
    targetStrategy: 'text',
    targetValue: '',
    actionValue: '',
    waitCondition: 'visible',
    timeoutMs: 5000,
    note: '',
    source: 'manual'
  }
}

function createActionDraftFromContext() {
  const step = getSelectedStep()
  return {
    actionType: normalizeActionType(step?.type || 'click'),
    targetStrategy: normalizeTargetStrategy(step?.selector?.primaryStrategy || inferTargetStrategy(step) || 'text'),
    targetValue: resolveStepTargetValue(step),
    actionValue: resolveStepActionValue(step),
    waitCondition: step?.waitStrategy?.kind || 'visible',
    timeoutMs: Number(step?.waitStrategy?.timeoutMs || 5000),
    note: step?.note || '',
    source: 'manual'
  }
}

function normalizeActionType(type) {
  const value = String(type || '').trim()
  if (MANUAL_ACTION_TYPES.some((item) => item.value === value)) {
    return value
  }
  if (value === 'checkbox_set') {
    return 'check'
  }
  if (value === 'radio_set') {
    return 'check'
  }
  if (value === 'double_click' || value === 'right_click') {
    return 'click'
  }
  return 'click'
}

function resolveStepOriginLabel(step) {
  if (step?.origin) {
    return String(step.origin).toUpperCase()
  }
  if (step?.stage === 'assertion' || step?.extra?.source?.startsWith('manual')) {
    return 'MANUAL'
  }
  return 'RECORDED'
}

function resolveStepOriginState(step) {
  return resolveStepOriginLabel(step) === 'MANUAL' ? 'active' : 'ok'
}

function resolveActionScopeLabel(actionType, waitCondition) {
  const config = getActionComposerConfig(actionType, waitCondition)
  if (!config.showTarget) {
    return 'URL'
  }
  return normalizeActionType(actionType) === 'wait' ? 'Element Wait' : 'Element'
}

function buildPickerTargetKey(pending) {
  return [
    pending?.kind || 'action',
    pending?.stepType || '',
    pending?.url || '',
    pending?.selector?.primaryStrategy || '',
    pending?.selector?.primaryValue || ''
  ].join('::')
}

function resolveCurrentModeLabel() {
  if (recorderState.replaying || hasReplaySession() || recorderState.replayStatus === 'failed') {
    return 'Replay'
  }
  if (currentState?.pickerMode?.kind === 'action') {
    return 'Add Action'
  }
  if (currentState?.pickerMode?.kind === 'assertion' || currentState?.assertionMode) {
    return 'Add Assertion'
  }
  if (actionDraft) {
    return 'Add Action'
  }
  if (assertionDraft) {
    return 'Add Assertion'
  }
  if (recorderState.recording) {
    return 'Recording'
  }
  if (resolveTestLifecycleStatus(getActiveTest()) === 'finished') {
    return 'Finished'
  }
  return 'Idle'
}

function resolveCurrentModeState() {
  const label = resolveCurrentModeLabel()
  if (label === 'Replay') {
    return resolveReplayPillState() || 'warning'
  }
  if (label === 'Finished') {
    return 'warning'
  }
  if (label === 'Idle') {
    return null
  }
  if (recorderState.recordingPaused) {
    return 'warning'
  }
  return 'active'
}

function buildCreationModeHelp() {
  if (currentState?.pickerMode?.kind === 'action') {
    return 'Pick Element is active for Add Action. Click one element in the current test tab to fill the action target, then choose what the step should do. This never opens a new tab.'
  }
  if (currentState?.pickerMode?.kind === 'assertion' || currentState?.assertionMode) {
    return 'Pick Element is active for Add Assertion. Click one element in the current test tab to fill the assertion target, then choose what is expected. Assertions stay in the current page context and never open a new tab.'
  }
  if (actionDraft) {
    return 'Add Action manually creates a new ACTION step such as navigate, click, type, select, check, uncheck, or wait. Review the Target and Scope summaries, confirm the preview, then create the step. No new tab is opened.'
  }
  if (assertionDraft) {
    return 'Add Assertion lets you pick an element or define it manually, then choose what is expected: visible, not visible, exists, does not exist, text equals, text contains, or text not present. Popup and URL assertions stay available when needed.'
  }
  if (recorderState.recording) {
    return 'Start Recording captures ACTION steps from the active test page. Recording stays attached to the single controlled browser tab for this test until you stop or finish the test.'
  }
  return 'Use Start Recording to capture ACTION steps from the active tab, Add Action to author ACTION steps manually, and Add Assertion to author ASSERT steps manually. Finish Test stops the authoring session cleanly. Only Start New Test opens a new controlled browser tab.'
}

function getActionComposerConfig(actionType, waitCondition) {
  const normalizedType = normalizeActionType(actionType)
  const normalizedWait = String(waitCondition || 'visible').trim() || 'visible'
  const isWait = normalizedType === 'wait'
  const isUrlWait = isWait && normalizedWait === 'url_change'
  const showActionValue = normalizedType === 'type' || normalizedType === 'select' || normalizedType === 'navigate' ||
    (isWait && ['text_contains', 'value_equals', 'url_change'].includes(normalizedWait))

  let actionValueLabel = 'Action Value'
  if (normalizedType === 'type') {
    actionValueLabel = 'Text to Type'
  } else if (normalizedType === 'select') {
    actionValueLabel = 'Option Value'
  } else if (normalizedType === 'navigate') {
    actionValueLabel = 'URL'
  } else if (isWait && normalizedWait === 'text_contains') {
    actionValueLabel = 'Expected Text'
  } else if (isWait && normalizedWait === 'value_equals') {
    actionValueLabel = 'Expected Value'
  } else if (isWait && normalizedWait === 'url_change') {
    actionValueLabel = 'URL Contains'
  }

  return {
    showTarget: normalizedType !== 'navigate' && !isUrlWait,
    showActionValue,
    showWaitCondition: isWait,
    showTimeout: true,
    canPickTarget: normalizedType !== 'navigate' && !isUrlWait,
    actionValueLabel,
    summaryFallback: normalizedType === 'navigate'
      ? 'Target URL'
      : isUrlWait
        ? 'Current page URL'
        : ''
  }
}

function getAssertionComposerConfig(assertionType) {
  const type = String(assertionType || 'assert_visible').trim() || 'assert_visible'
  const showExpectedValue = [
    'assert_text_contains',
    'assert_text_equals',
    'assert_text_not_present',
    'assert_value_equals',
    'assert_url_contains',
    'assert_popup_text',
    'assert_alert_text'
  ].includes(type)
  let expectedValueLabel = 'Expected Value'
  if (type === 'assert_text_contains' || type === 'assert_text_equals') {
    expectedValueLabel = 'Expected Text'
  } else if (type === 'assert_text_not_present') {
    expectedValueLabel = 'Text That Must Not Appear'
  } else if (type === 'assert_url_contains') {
    expectedValueLabel = 'URL Contains'
  } else if (type === 'assert_popup_text' || type === 'assert_alert_text') {
    expectedValueLabel = 'Popup Text'
  }

  return {
    showTarget: !['assert_url_contains', 'assert_popup_present', 'assert_popup_text', 'assert_alert_present', 'assert_alert_text'].includes(type),
    showExpectedValue,
    canPickTarget: !['assert_url_contains', 'assert_popup_present', 'assert_popup_text', 'assert_alert_present', 'assert_alert_text'].includes(type),
    expectedValueLabel,
    scopeLabel: resolveAssertionScopeLabel(type),
    summaryFallback: type === 'assert_url_contains'
      ? 'Current page URL'
      : ['assert_popup_present', 'assert_popup_text', 'assert_alert_present', 'assert_alert_text'].includes(type)
        ? 'Current popup dialog'
        : ''
  }
}

function getStepEditorConfig(step) {
  const category = resolveStepCategory(step)
  if (category === 'ASSERT') {
    const config = getAssertionComposerConfig(step.type)
    return {
      showTarget: config.showTarget,
      showActionValue: false,
      showWaitCondition: false,
      showExpectedValue: config.showExpectedValue,
      showTimeout: true,
      showNote: true,
      canPickTarget: config.canPickTarget,
      actionValueLabel: 'Action Value',
      expectedValueLabel: config.expectedValueLabel
    }
  }
  if (category === 'ACTION') {
    const config = getActionComposerConfig(normalizeActionType(step.type), step.waitStrategy?.kind)
    return Object.assign({
      showExpectedValue: false,
      showNote: true,
      expectedValueLabel: 'Expected Value'
    }, config)
  }
  return {
    showTarget: false,
    showActionValue: false,
    showWaitCondition: false,
    showExpectedValue: false,
    showTimeout: false,
    showNote: true,
    canPickTarget: false,
    actionValueLabel: 'Action Value',
    expectedValueLabel: 'Expected Value'
  }
}

function buildTargetClause(strategy, value) {
  const cleanValue = String(value || '').trim()
  if (!cleanValue) {
    return ''
  }
  switch (normalizeTargetStrategy(strategy)) {
    case 'text':
      return `visible text "${cleanValue}"`
    case 'label':
      return `label "${cleanValue}"`
    case 'name':
      return `name "${cleanValue}"`
    case 'placeholder':
      return `placeholder "${cleanValue}"`
    case 'ariaLabel':
      return `aria-label "${cleanValue}"`
    case 'dataTestId':
      return `test id "${cleanValue}"`
    case 'id':
      return `id "${cleanValue}"`
    case 'css':
      return `css selector "${cleanValue}"`
    case 'xpath':
      return `xpath "${cleanValue}"`
    case 'url':
      return `URL "${cleanValue}"`
    default:
      return `"${cleanValue}"`
  }
}

function resolveAssertionScopeLabel(assertionType) {
  const type = String(assertionType || 'assert_visible').trim() || 'assert_visible'
  if (['assert_popup_present', 'assert_popup_text', 'assert_alert_present', 'assert_alert_text'].includes(type)) {
    return 'Popup'
  }
  if (type === 'assert_url_contains') {
    return 'URL'
  }
  if (['assert_text_contains', 'assert_text_equals', 'assert_text_not_present', 'assert_value_equals'].includes(type)) {
    return 'Element Text'
  }
  return 'Element'
}

function getStepTypeLabel(type) {
  const normalized = String(type || '').trim()
  return ASSERTION_TYPE_LABELS[normalized] || humanizeValue(normalized || 'step')
}

function buildActionSummary(draft) {
  if (!draft) {
    return ''
  }

  const actionType = normalizeActionType(draft.actionType)
  const target = buildTargetClause(draft.targetStrategy, draft.targetValue)
  const actionValue = String(draft.actionValue || '').trim()
  const waitCondition = String(draft.waitCondition || 'visible').trim() || 'visible'

  switch (actionType) {
    case 'navigate':
      return actionValue ? `Navigate to "${actionValue}"` : 'Navigate to a URL'
    case 'click':
      return `Click element with ${target || 'target'}`
    case 'type':
      return actionValue ? `Type "${actionValue}" into field with ${target || 'target'}` : `Type into field with ${target || 'target'}`
    case 'select':
      return actionValue ? `Select "${actionValue}" in field with ${target || 'target'}` : `Select an option in field with ${target || 'target'}`
    case 'check':
      return `Check element with ${target || 'target'}`
    case 'uncheck':
      return `Uncheck element with ${target || 'target'}`
    case 'wait':
      switch (waitCondition) {
        case 'exists':
          return `Wait for element with ${target || 'target'} to exist`
        case 'hidden':
          return `Wait for element with ${target || 'target'} to be hidden`
        case 'enabled':
          return `Wait for element with ${target || 'target'} to be enabled`
        case 'disabled':
          return `Wait for element with ${target || 'target'} to be disabled`
        case 'text_contains':
          return `Wait for text "${actionValue || draft.targetValue || ''}" to be visible`
        case 'value_equals':
          return `Wait for value "${actionValue || draft.targetValue || ''}" in field with ${target || 'target'}`
        case 'url_change':
          return `Wait for URL to contain "${actionValue || draft.targetValue || ''}"`
        case 'visible':
        default:
          return `Wait for element with ${target || 'target'} to be visible`
      }
    default:
      return humanizeValue(actionType)
  }
}

function buildAssertionSummary(draft) {
  if (!draft) {
    return ''
  }

  const type = String(draft.assertionType || 'assert_visible').trim() || 'assert_visible'
  const target = buildTargetClause(draft.targetStrategy, draft.targetValue)
  const expectedValue = String(draft.expectedValue || '').trim()

  switch (type) {
    case 'assert_popup_present':
    case 'assert_alert_present':
      return 'Expect popup to be present'
    case 'assert_popup_text':
    case 'assert_alert_text':
      return `Expect popup text to equal "${expectedValue}"`
    case 'assert_text_not_present':
      return `Expect element with ${target || 'target'} text NOT to contain "${expectedValue}"`
    case 'assert_text_contains':
      return `Expect element with ${target || 'target'} text to contain "${expectedValue}"`
    case 'assert_text_equals':
      return `Expect element with ${target || 'target'} text to equal "${expectedValue}"`
    case 'assert_value_equals':
      return `Expect field with ${target || 'target'} value to equal "${expectedValue}"`
    case 'assert_enabled':
      return `Expect element with ${target || 'target'} to be enabled`
    case 'assert_disabled':
      return `Expect element with ${target || 'target'} to be disabled`
    case 'assert_exists':
      return `Expect element with ${target || 'target'} to exist`
    case 'assert_not_exists':
      return `Expect element with ${target || 'target'} NOT to exist`
    case 'assert_hidden':
      return `Expect element with ${target || 'target'} NOT to be visible`
    case 'assert_url_contains':
      return `Expect URL to contain "${expectedValue}"`
    case 'assert_visible':
    default:
      return `Expect element with ${target || 'target'} to be visible`
  }
}

function buildMetaSummary(step, note = '') {
  const stage = humanizeValue(step?.stage || 'meta')
  const description = String(note || step?.note || step?.description || '').trim()
  return description ? `${stage} metadata: ${description}` : `${stage} metadata step`
}

function isActionDraftValid(draft) {
  if (!draft?.actionType) {
    return false
  }
  const actionType = normalizeActionType(draft.actionType)
  const targetValue = String(draft.targetValue || '').trim()
  const actionValue = String(draft.actionValue || '').trim()
  if (actionType === 'navigate') {
    return Boolean(actionValue || targetValue)
  }
  if (actionType === 'type' || actionType === 'select') {
    return Boolean(targetValue && actionValue)
  }
  if (actionType === 'wait') {
    const waitCondition = String(draft.waitCondition || 'visible').trim() || 'visible'
    if (waitCondition === 'url_change') {
      return Boolean(actionValue || targetValue)
    }
    return Boolean(targetValue)
  }
  return Boolean(targetValue)
}

function buildActionRequestPayload(draft) {
  const config = getActionComposerConfig(draft.actionType, draft.waitCondition)
  const normalizedType = normalizeActionType(draft.actionType)
  const targetStrategy = config.showTarget ? normalizeTargetStrategy(draft.targetStrategy) : 'url'
  const targetValue = config.showTarget ? String(draft.targetValue || '').trim() : String(draft.actionValue || draft.targetValue || '').trim()
  return {
    actionType: normalizedType,
    targetStrategy,
    targetValue,
    actionValue: String(draft.actionValue || ''),
    waitCondition: String(draft.waitCondition || 'visible'),
    timeoutMs: Number(draft.timeoutMs || 5000),
    note: String(draft.note || '').trim()
  }
}

function clearActionDraftState() {
  actionDraft = null
  lastPendingActionKey = null
}

function clearAssertionDraftState() {
  assertionDraft = null
  lastPendingAssertionKey = null
}

async function clearManualModes(options = {}) {
  const hadAction = Boolean(actionDraft || currentState?.pickerMode?.kind === 'action' || currentState?.pendingActionTarget)
  const hadAssertion = Boolean(assertionDraft || currentState?.pickerMode?.kind === 'assertion' || currentState?.pendingAssertion || currentState?.assertionMode)

  clearActionDraftState()
  clearAssertionDraftState()

  if (currentState?.pickerMode || currentState?.pendingActionTarget || currentState?.pendingAssertion || currentState?.assertionMode) {
    await sendRuntimeMessage({
      type: 'SET_PICKER_MODE',
      enabled: false,
      clearPending: Boolean(options.clearPending)
    }, {
      alertOnError: false,
      logErrors: false
    })
  }

  render()
  updateButtonStates()

  if (options.logMessage && (hadAction || hadAssertion)) {
    logAction('Manual authoring mode cleared')
  }
}

function createStepBadge(text, kind) {
  const badge = document.createElement('span')
  badge.className = `step-badge ${kind}`
  badge.textContent = text
  return badge
}

function createAssertionDraftFromContext() {
  const step = getSelectedStep()
  return {
    assertionType: 'assert_visible',
    targetStrategy: normalizeTargetStrategy(step?.selector?.primaryStrategy || inferTargetStrategy(step) || 'text'),
    targetValue: resolveStepTargetValue(step),
    expectedValue: resolveStepExpectedValue(step),
    defaultExpectedValue: resolveStepExpectedValue(step) || resolveStepTargetValue(step),
    timeoutMs: 5000,
    source: 'manual'
  }
}

function createEmptyAssertionDraft() {
  return {
    assertionType: 'assert_visible',
    targetStrategy: 'text',
    targetValue: '',
    expectedValue: '',
    defaultExpectedValue: '',
    timeoutMs: 5000,
    source: 'manual'
  }
}

function inferAssertionTypeFromSuggestions(suggestions) {
  const types = new Set((suggestions || []).map((item) => item.type))
  return ASSERTION_TYPES.find((item) => types.has(item.value))?.value || 'assert_visible'
}

function isAssertionDraftValid(draft) {
  if (!draft?.assertionType) {
    return false
  }
  const config = getAssertionComposerConfig(draft.assertionType)
  const hasTarget = Boolean(String(draft.targetValue || '').trim())
  const hasExpected = Boolean(String(draft.expectedValue || '').trim())
  if (config.showExpectedValue && !hasExpected) {
    return false
  }
  return config.showTarget ? hasTarget : true
}

function buildAssertionTargetKey(pending) {
  return [pending?.url || '', pending?.selector?.primaryStrategy || '', pending?.selector?.primaryValue || ''].join('::')
}

function buildTestSessionSummary(activeTest) {
  if (!activeTest) {
    return 'No active test loaded.'
  }
  if (resolveTestLifecycleStatus(activeTest) === 'finished' && !activeTest.tabId) {
    return `Test "${activeTest.name}" is finished and detached from recorder control. The page can stay open, but this saved test no longer owns a controlled tab. Start New Test when you want a fresh authoring session with a new controlled browser tab.`
  }
  if (activeTest.tabId) {
    return `Test "${activeTest.name}" is attached to browser tab #${activeTest.tabId}. Recording, assertions, and replay stay inside that tab unless a recorded navigation step changes the page.`
  }
  return `Test "${activeTest.name}" has no controlled browser tab attached. Start New Test opens one tab for a fresh test session; selecting or editing this test will not open a new tab.`
}

function buildActiveTestPill(activeTest) {
  if (!activeTest) {
    return 'No active test'
  }
  const status = humanizeValue(resolveTestLifecycleStatus(activeTest))
  return activeTest.tabId ? `Active ${status.toLowerCase()} test with tab` : `Active ${status.toLowerCase()} test`
}

function resolveTestLifecycleStatus(test) {
  if (!test) {
    return 'draft'
  }
  if (test.id === recorderState.activeTestId && recorderState.recording) {
    return 'recording'
  }
  return test.status === 'finished' ? 'finished' : 'draft'
}

function resolveTestLifecycleState(test) {
  const status = resolveTestLifecycleStatus(test)
  if (status === 'recording') {
    return 'active'
  }
  if (status === 'finished') {
    return 'warning'
  }
  return 'ok'
}

function buildSelectedStepStatusLabel(step) {
  if (!step) {
    return 'Selected Step: none'
  }
  return `Selected Step: ${truncateText(resolveStepDescription(step), 56)}`
}

function buildSelectedStepHint(step) {
  const category = resolveStepCategory(step)
  const pickerHelp = recorderState.activeTabId ? ' Use Pick In Page when you want to refresh the target from the live page.' : ''
  if (category === 'ASSERT') {
    return `This is an assertion step. Update the fields below, then click Apply Step Changes. Replay From Selected is the quickest way to re-check this assertion.${pickerHelp} Use Delete Selected Assertion to remove it.`
  }
  if (category === 'ACTION') {
    const origin = resolveStepOriginLabel(step).toLowerCase()
    return `This is a ${origin} action step. Update the fields below, then click Apply Step Changes. Replay From Selected reruns the scenario from here.${pickerHelp}`
  }
  return 'This is a metadata step. Update its stage or note, then click Apply Step Changes. Replay From Selected skips directly to the next executable step after this point.'
}

function buildStepEditorHelp(step) {
  if (!step) {
    return 'Select a step, update its fields, then click Apply Step Changes. Replay From Selected reruns from that step in the same controlled tab.'
  }

  const totalSteps = currentState?.scenario?.orderedSteps?.length || 0
  const position = recorderState.selectedStepIndex == null ? 'Selected step' : `Step ${recorderState.selectedStepIndex + 1} of ${totalSteps}`
  const replayTail = recorderState.activeTabId
    ? ' Use Replay From Selected to rerun from here in the same controlled tab.'
    : ' Replay From Selected becomes available after this test has a controlled tab.'

  if (recorderState.replayStatus === 'failed') {
    return `${position} is ready to edit after a replay failure.${replayTail} Retry Failed or Skip Step stays available while the replay session is paused.`
  }
  if (recorderState.replayPaused) {
    return `${position} is ready to edit while replay is paused.${replayTail} Run Next Step advances one step at a time.`
  }
  return `${position} is ready to edit.${replayTail}`
}

function validateStepEditorInputs(step, config, values) {
  const category = resolveStepCategory(step)
  const targetValue = String(values.targetValue || '').trim()
  const actionValue = String(values.actionValue || '').trim()
  const expectedValue = String(values.expectedValue || '').trim()
  const waitCondition = String(values.waitCondition || 'visible').trim() || 'visible'

  if (config.showTarget && !targetValue) {
    return 'Choose how to find the element and fill the target before applying changes.'
  }

  if (category === 'ASSERT' && config.showExpectedValue && !expectedValue) {
    return 'Fill the expected value before applying step changes.'
  }

  if (category !== 'ACTION') {
    return ''
  }

  const actionType = normalizeActionType(step.type)
  if ((actionType === 'type' || actionType === 'select') && !actionValue) {
    return 'Fill the action value before applying step changes.'
  }
  if (actionType === 'navigate' && !actionValue) {
    return 'Fill the destination URL before applying step changes.'
  }
  if (actionType === 'wait' && ['text_contains', 'value_equals', 'url_change'].includes(waitCondition) && !actionValue) {
    return 'Fill the expected wait value before applying step changes.'
  }
  return ''
}

function truncateText(value, maxLength) {
  const text = String(value || '').trim()
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function buildBackendActionText(backendOnline) {
  if (recorderState.pendingAction) {
    return `${formatActionKey(recorderState.pendingAction)}...`
  }
  return recorderState.backendMessage || (backendOnline ? 'Backend ready' : 'Backend offline')
}

function buildBackendActionState(backendOnline) {
  if (recorderState.pendingAction) {
    return 'active'
  }
  return recorderState.backendMessageState || (backendOnline ? 'ok' : 'error')
}

function setBackendFeedback(message, stateValue) {
  recorderState.backendMessage = message
  recorderState.backendMessageState = stateValue || null
  renderSummary()
}

function handleBackendActionError(prefix, error, options = {}) {
  const message = buildBackendErrorMessage(prefix, error)
  const backendReachable = Boolean(error?.status)

  if (currentState) {
    currentState.backend = {
      ok: backendReachable,
      details: error.message || prefix
    }
  }

  setBackendFeedback(backendReachable ? prefix : 'Backend offline', backendReachable ? 'warning' : 'error')
  logAction(message, 'ERROR')
  if (!options.silent) {
    window.alert(message)
  }
}

function buildBackendErrorMessage(prefix, error) {
  const payload = error?.payload
  const issues = Array.isArray(payload?.issues) ? payload.issues : []
  if (issues.length) {
    const preview = issues.slice(0, 5).map((issue) => `${issue.path || 'scenario'}: ${issue.message}`).join('\n')
    return `${prefix}\n${preview}`
  }
  return `${prefix}\n${error?.message || 'Unknown backend error.'}`
}

function formatValidationSuccess(result) {
  const warningCount = Number(result?.warningCount || 0)
  return warningCount > 0 ? `Validation passed with ${warningCount} warning(s).` : 'Validation passed.'
}

function formatApiError(path, status, payload, text) {
  if (Array.isArray(payload?.issues) && payload.issues.length) {
    const firstIssue = payload.issues[0]
    return `${path} returned ${status}: ${firstIssue.path || 'scenario'} - ${firstIssue.message}`
  }
  if (payload?.error) {
    return `${path} returned ${status}: ${payload.error}`
  }
  if (typeof text === 'string' && text.trim()) {
    return `${path} returned ${status}: ${text.trim()}`
  }
  return `${path} returned ${status}.`
}

function safeJsonParse(text) {
  if (!text) {
    return {}
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    return { raw: text }
  }
}

function setPill(element, text, stateValue) {
  element.textContent = text
  if (stateValue) {
    element.dataset.state = stateValue
  } else {
    delete element.dataset.state
  }
}

function setInputValue(element, value) {
  if (document.activeElement === element) {
    return
  }
  element.value = value
}

function setDisabled(element, disabled) {
  element.disabled = Boolean(disabled)
}

function setActive(element, active) {
  element.classList.toggle('is-active', Boolean(active))
}

function toggleVisibility(element, visible) {
  element.classList.toggle('hidden', !visible)
}

function createEmptyState(message) {
  const empty = document.createElement('div')
  empty.className = 'empty-state'
  empty.textContent = message
  return empty
}

function getScenarioName() {
  return elements.scenarioName.value.trim() || currentState?.scenario?.metadata?.name || 'recorded-scenario'
}

function sanitizeFileName(value) {
  return (value || 'recorded-scenario').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

function setBackendUrlValidity(isValid) {
  elements.backendUrl.classList.toggle('invalid', !isValid)
}

function humanizeValue(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatActionKey(actionKey) {
  switch (actionKey) {
    case 'validate':
      return 'Validating'
    case 'save':
      return 'Saving'
    case 'generate':
      return 'Generating'
    case 'replay':
      return 'Starting replay'
    case 'new-test':
      return 'Opening test tab'
    case 'finish-test':
      return 'Finishing test'
    default:
      return 'Working'
  }
}

function invalidAction(message) {
  logAction(message, 'WARN')
}

function logAction(message, level = 'INFO', options = {}) {
  if (level === 'ERROR') {
    console.error(message)
  } else if (level === 'WARN') {
    console.warn(message)
  } else {
    console.log(message)
  }

  if (options.persist === false) {
    return
  }

  uiLogEntries.unshift({
    level,
    message,
    timestamp: new Date().toISOString(),
    source: 'panel'
  })
  uiLogEntries = uiLogEntries.slice(0, 60)
  renderLogs()
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function toTime(value) {
  const resolved = new Date(value).getTime()
  return Number.isFinite(resolved) ? resolved : 0
}
