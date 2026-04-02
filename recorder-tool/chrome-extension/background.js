const DEFAULT_BACKEND_URL = 'http://127.0.0.1:17845'
const DEFAULT_PROFILE = {
  id: 'tim-ui-junit4-selenide',
  displayName: 'TIM UI JUnit4 Selenide'
}
const DEFAULT_START_URL = 'https://example.com/'
const STORAGE_KEY = 'timUiRecorderState'
const REPLAY_STATUS_UPDATE = 'REPLAY_STATUS_UPDATE'
const REPLAY_ERROR = 'REPLAY_ERROR'
const REPLAY_CONTROL = 'REPLAY_CONTROL'
const REPLAY_EXECUTE_STEP = 'REPLAY_EXECUTE_STEP'

if (typeof importScripts === 'function') {
  importScripts('scenario-step-ids.js')
}

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

let replaySessionCounter = 0
let activeReplayRunner = null
let state = createInitialState()

appendActivityLog('INFO', 'Background script loaded')
appendActivityLog('INFO', `Start New Test handler registered (${typeof chrome?.tabs?.create === 'function' ? 'tab creation available' : 'tab creation unavailable'})`)

chrome.runtime.onInstalled?.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  }
})

loadState()

chrome.tabs.onUpdated?.addListener(async (tabId, changeInfo, tab) => {
  const activeTest = getActiveTestRecord()
  if (!activeTest) {
    return
  }

  if (activeTest.tabId === tabId && changeInfo.status === 'complete') {
    await pushModeToActiveTestTab()
  }

  if (!state.recording || state.paused || state.playback.replaying) {
    return
  }
  if (!Number.isInteger(activeTest.tabId) || activeTest.tabId !== tabId) {
    return
  }
  if (changeInfo.status !== 'complete' || !tab?.url || tab.url.startsWith('chrome://')) {
    return
  }
  if (tab.url === 'about:blank') {
    return
  }

  const steps = activeTest.scenario.orderedSteps
  const lastStep = steps[steps.length - 1]
  if (lastStep?.type === 'navigate' && lastStep.value === tab.url) {
    return
  }

  if (!activeTest.scenario.metadata.sourceUrl) {
    activeTest.scenario.metadata.sourceUrl = tab.url
  }

  await addRecordedStep({
    type: 'navigate',
    stage: 'test',
    description: `Navigate to ${tab.url}`,
    timestamp: Date.now(),
    url: tab.url,
    value: tab.url,
    visibleText: '',
    expectedValue: null,
    key: null,
    optionText: null,
    checked: null,
    enabled: true,
    uploadAlias: null,
    fileNames: [],
    screenshotPath: null,
    todo: null,
    tags: ['ui'],
    mappingHints: [],
    selector: normalizeSelector({
      primaryStrategy: 'url',
      primaryValue: tab.url,
      explanation: 'Navigation step',
      candidates: [{ strategy: 'url', value: tab.url, confidenceScore: 1, explanation: 'Page URL', primary: true }]
    }),
    frameContext: createDefaultFrameContext(),
    windowContext: {
      title: tab.title || tab.url,
      url: tab.url,
      index: 0,
      handleName: tab.title || tab.url
    },
    waitStrategy: { kind: 'url_change', expectedUrlFragment: tab.url, timeoutMs: 8000 },
    extra: {}
  }, tabId)
})

chrome.tabs.onRemoved?.addListener(async (tabId) => {
  const changed = detachTestTab(tabId)
  if (!changed) {
    return
  }

  if (state.playback.targetTabId === tabId && hasTrackedReplaySession()) {
    await stopReplaySession('Replay stopped because the controlled test tab was closed')
  }

  await persistAndBroadcast()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(async (error) => {
      const messageText = String(error?.message || error)
      console.error('[recorder][background] message handling failed', message?.type, messageText)
      appendActivityLog('ERROR', `Background error for ${message?.type || 'message'}: ${messageText}`)
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: state })
      } catch (persistError) {
        void persistError
      }
      sendResponse({ ok: false, error: messageText, state })
    })
  return true
})

async function handleMessage(message, sender = {}) {
  console.log('[recorder][background] received message', message?.type, {
    activeTestId: state.activeTestId,
    activeTabId: state.activeTabId
  })
  if (message?.type === 'GET_STATE') {
    markPanelConnected()
  }
  switch (message.type) {
    case 'GET_STATE':
      repairAllTestScenarioStepIds()
      syncActiveTestIntoState()
      await refreshBackendStatus()
      return { ok: true, state }
    case 'UPDATE_SETTINGS':
      updateSettings(message)
      return persistAndBroadcast()
    case 'START_NEW_TEST':
      return startNewTest(message)
    case 'FINISH_TEST':
      return finishTest()
    case 'SELECT_TEST':
      return selectTest(message.testId)
    case 'RENAME_TEST':
      return renameTest(message.testId || state.activeTestId, message.name)
    case 'DELETE_TEST':
      return deleteTest(message.testId || state.activeTestId)
    case 'DUPLICATE_TEST':
      return duplicateTest(message.testId || state.activeTestId)
    case 'START_RECORDING':
      await ensureActiveControlledTab('Start New Test to open a controlled browser tab before recording.')
      state.recording = true
      state.paused = false
      state.assertionMode = false
      state.pickerMode = null
      state.pendingAssertion = null
      state.pendingActionTarget = null
      setActiveTestLifecycleStatus('recording')
      touchActiveTestRecord()
      await pushModeToActiveTestTab()
      return persistAndBroadcast()
    case 'PAUSE_RECORDING':
      state.paused = true
      setActiveTestLifecycleStatus('recording')
      await pushModeToActiveTestTab()
      return persistAndBroadcast()
    case 'RESUME_RECORDING':
      await ensureActiveControlledTab('This test does not have an attached browser tab.')
      state.recording = true
      state.paused = false
      setActiveTestLifecycleStatus('recording')
      await pushModeToActiveTestTab()
      return persistAndBroadcast()
    case 'STOP_RECORDING':
      state.recording = false
      state.paused = false
      state.assertionMode = false
      state.pickerMode = null
      state.pendingAssertion = null
      state.pendingActionTarget = null
      setActiveTestLifecycleStatus('draft')
      await pushModeToActiveTestTab()
      return persistAndBroadcast()
    case 'UNDO_LAST_STEP':
      await prepareScenarioMutation('removing the last step')
      getActiveScenario().orderedSteps.pop()
      clampSelectedStep()
      touchActiveTestRecord()
      return persistAndBroadcast()
    case 'MOVE_SELECTED_STEP':
      await prepareScenarioMutation('reordering steps')
      moveSelectedStep(Number(message.delta) || 0)
      touchActiveTestRecord()
      return persistAndBroadcast()
    case 'DELETE_SELECTED_STEP':
      await prepareScenarioMutation('deleting a step')
      deleteSelectedStep()
      touchActiveTestRecord()
      return persistAndBroadcast()
    case 'SET_ASSERTION_MODE':
      return setPickerMode({
        enabled: Boolean(message.enabled),
        kind: 'assertion',
        stepType: message.stepType || null,
        clearPending: Boolean(message.clearPending)
      })
    case 'SET_PICKER_MODE':
      return setPickerMode({
        enabled: Boolean(message.enabled),
        kind: message.kind || 'action',
        stepType: message.stepType || null,
        clearPending: Boolean(message.clearPending)
      })
    case 'SET_SELECTED_STEP':
      setSelectedStepFromPanel(Number(message.index))
      return persistAndBroadcast()
    case 'MARK_SELECTED_STAGE':
      await prepareScenarioMutation('changing a step stage')
      updateSelectedStep((step) => {
        step.stage = message.stage || step.stage
      })
      return persistAndBroadcast()
    case 'UPDATE_SELECTED_STEP':
      await prepareScenarioMutation('editing a step')
      updateSelectedStepFromMessage(message.updates || {})
      return persistAndBroadcast()
    case 'ADD_SCENARIO_NOTE':
      if (message.note) {
        getActiveScenario().notes.push(message.note)
        touchActiveTestRecord()
      }
      return persistAndBroadcast()
    case 'CREATE_ASSERTION_STEP':
      await prepareScenarioMutation('adding an assertion step')
      createAssertionStep(message)
      state.assertionMode = false
      state.pickerMode = null
      state.pendingAssertion = null
      await pushModeToActiveTestTab()
      return persistAndBroadcast()
    case 'CREATE_ACTION_STEP':
      await prepareScenarioMutation('adding an action step')
      createActionStep(message)
      state.pickerMode = null
      state.pendingActionTarget = null
      await pushModeToActiveTestTab()
      return persistAndBroadcast()
    case 'SAVE_SCENARIO':
      return saveScenario()
    case 'EXPORT_SCENARIO':
      await downloadScenario()
      return { ok: true }
    case 'GENERATE_JAVA':
      return generateJava()
    case 'CHECK_BACKEND':
      await refreshBackendStatus()
      return { ok: true, state }
    case REPLAY_COMMANDS.START:
    case 'REPLAY_SCENARIO':
      await startReplayCommand(message)
      return { ok: true, state }
    case REPLAY_COMMANDS.PAUSE:
    case 'PAUSE_PLAYBACK':
      await pauseReplaySession('Replay paused')
      return { ok: true, state }
    case REPLAY_COMMANDS.RESUME:
    case 'RESUME_PLAYBACK':
      await resumeReplaySession('Replay resumed')
      return { ok: true, state }
    case REPLAY_COMMANDS.NEXT:
    case 'NEXT_PLAYBACK_STEP':
      await stepReplaySessionOnce(false)
      return { ok: true, state }
    case REPLAY_COMMANDS.RETRY:
    case 'RETRY_PLAYBACK_STEP':
      await retryReplaySessionStep()
      return { ok: true, state }
    case REPLAY_COMMANDS.SKIP:
    case 'SKIP_PLAYBACK_STEP':
      await skipReplaySessionStep()
      return { ok: true, state }
    case REPLAY_COMMANDS.STOP:
    case 'STOP_PLAYBACK':
      await stopReplaySession('Replay stopped')
      return { ok: true, state }
    case 'RECORDED_STEP':
      await addRecordedStep(message.step, sender.tab?.id)
      return { ok: true }
    case 'PICKER_TARGET_SELECTED':
    case 'ASSERTION_TARGET_SELECTED':
      if (sender.tab?.id && sender.tab.id !== state.activeTabId) {
        return { ok: true }
      }
      acceptPickerTarget(message.payload)
      state.assertionMode = false
      state.pickerMode = null
      await pushModeToActiveTestTab()
      return persistAndBroadcast()
    default:
      return { ok: true, state }
  }
}

function updateSettings(message) {
  const activeTest = requireActiveTest('There is no active test to update.')
  state.backendUrl = message.backendUrl || DEFAULT_BACKEND_URL
  state.captureScreenshots = Boolean(message.captureScreenshots)

  activeTest.scenario.metadata.name = message.scenarioName || activeTest.scenario.metadata.name
  activeTest.name = activeTest.scenario.metadata.name
  activeTest.scenario.metadata.profileId = message.profileId || activeTest.scenario.metadata.profileId
  activeTest.scenario.metadata.sourceUrl = normalizeOptionalUrl(message.startUrl, activeTest.scenario.metadata.sourceUrl || '')
  activeTest.javaClassName = message.javaClassName || ''
  state.javaClassName = activeTest.javaClassName
  touchActiveTestRecord()
}

async function startNewTest(message = {}) {
  appendActivityLog('INFO', 'Start New Test handler received request')
  if (state.playback.replaying) {
    appendActivityLog('WARN', 'Start New Test blocked because replay is still active')
    throw new Error('Stop replay before starting a new test.')
  }

  state.recording = false
  state.paused = false
  state.assertionMode = false
  state.pickerMode = null
  state.pendingAssertion = null
  state.pendingActionTarget = null

  const test = createTestRecord({
    name: message.name || '',
    startUrl: message.startUrl || '',
    profileId: message.profileId || getActiveScenario()?.metadata?.profileId || DEFAULT_PROFILE.id,
    javaClassName: message.javaClassName || '',
    duplicateScenario: null
  })
  appendActivityLog('INFO', `Created test object ${test.id} (${test.name || 'Untitled Test'})`)

  const startUrl = normalizeStartUrl(test.scenario.metadata.sourceUrl || '')
  appendActivityLog('INFO', `Requesting new controlled tab for ${startUrl}`)

  let openedTab
  try {
    openedTab = await chrome.tabs.create({
      url: startUrl,
      active: true
    })
  } catch (error) {
    appendActivityLog('ERROR', `Tab creation failed for Start New Test: ${String(error?.message || error)}`)
    throw new Error(`Start New Test could not open a browser tab. ${String(error?.message || error)}`)
  }

  if (!Number.isInteger(openedTab?.id)) {
    appendActivityLog('ERROR', 'Tab creation returned without a valid tab id')
    throw new Error('Start New Test could not attach a valid browser tab to the new test.')
  }

  test.tabId = openedTab.id || null
  test.status = 'recording'
  test.finishedAt = null
  appendActivityLog('INFO', `Created controlled tab #${test.tabId} for ${test.id}`)
  state.tests.unshift(test)
  setActiveTest(test.id)
  appendActivityLog('INFO', `Active test updated to ${test.id}`)
  state.recording = true
  state.paused = false
  await pushModeToActiveTestTab()
  appendActivityLog('INFO', `Start New Test returning success for ${test.id} with tab #${test.tabId}`)
  const result = await persistAndBroadcast()
  return Object.assign({}, result, {
    success: true,
    testId: test.id,
    tabId: test.tabId,
    message: `Started ${test.name || test.id} in controlled tab #${test.tabId}`
  })
}

async function finishTest() {
  const activeTest = requireActiveTest('There is no active test to finish.')
  appendActivityLog('INFO', `Finish Test requested for ${activeTest.id}`)

  if (hasActiveReplaySession()) {
    appendActivityLog('WARN', 'Finish Test blocked because replay is still active')
    throw new Error('Stop replay before finishing the test.')
  }

  const recordingStopped = Boolean(state.recording || state.paused)
  const detachedTabId = Number.isInteger(activeTest.tabId) ? activeTest.tabId : null

  if (activeTest.status === 'finished' && detachedTabId == null && !recordingStopped) {
    appendActivityLog('INFO', `Test ${activeTest.id} was already finished`)
    const alreadyFinishedResult = await persistAndBroadcast()
    return Object.assign({}, alreadyFinishedResult, {
      success: true,
      finished: true,
      testId: activeTest.id,
      recordingStopped: false,
      detachedTabId: null,
      message: `Test ${activeTest.name || activeTest.id} was already finished`
    })
  }

  state.recording = false
  state.paused = false
  state.assertionMode = false
  state.pickerMode = null
  state.pendingAssertion = null
  state.pendingActionTarget = null

  if (detachedTabId != null) {
    await pushModeToActiveTestTab()
  }

  activeTest.tabId = null
  activeTest.status = 'finished'
  activeTest.finishedAt = new Date().toISOString()
  touchTestRecord(activeTest, { preserveStatus: true })
  syncActiveTestIntoState()

  appendActivityLog(
    'INFO',
    detachedTabId != null
      ? `Test finished. Recording stopped: ${recordingStopped ? 'yes' : 'no'}. Detached browser tab #${detachedTabId} from recorder control.`
      : `Test finished. Recording stopped: ${recordingStopped ? 'yes' : 'no'}. No controlled tab needed to be detached.`
  )

  const result = await persistAndBroadcast()
  return Object.assign({}, result, {
    success: true,
    finished: true,
    testId: activeTest.id,
    recordingStopped,
    detachedTabId,
    message: detachedTabId != null
      ? `Finished ${activeTest.name || activeTest.id} and detached tab #${detachedTabId}`
      : `Finished ${activeTest.name || activeTest.id}`
  })
}

function selectTest(testId) {
  if (state.recording || hasActiveReplaySession()) {
    throw new Error('Stop recording or replay before switching tests.')
  }
  setActiveTest(testId)
  state.assertionMode = false
  state.pickerMode = null
  state.pendingAssertion = null
  state.pendingActionTarget = null
  return persistAndBroadcast()
}

function renameTest(testId, name) {
  const test = requireTestById(testId)
  const nextName = String(name || '').trim()
  if (!nextName) {
    throw new Error('Test name cannot be empty.')
  }
  test.name = nextName
  test.scenario.metadata.name = nextName
  touchTestRecord(test)
  syncActiveTestIntoState()
  return persistAndBroadcast()
}

function deleteTest(testId) {
  if (state.recording || hasActiveReplaySession()) {
    throw new Error('Stop recording or replay before deleting a test.')
  }

  const index = state.tests.findIndex((item) => item.id === testId)
  if (index < 0) {
    throw new Error('The selected test no longer exists.')
  }

  state.tests.splice(index, 1)
  if (!state.tests.length) {
    state.tests.push(createTestRecord())
  }

  const nextActive = state.tests[Math.min(index, state.tests.length - 1)]
  setActiveTest(nextActive.id)
  state.pendingAssertion = null
  state.pendingActionTarget = null
  state.pickerMode = null
  return persistAndBroadcast()
}

function duplicateTest(testId) {
  const source = requireTestById(testId)
  const clone = createTestRecord({
    name: `${source.name} Copy`,
    startUrl: source.scenario.metadata.sourceUrl || '',
    profileId: source.scenario.metadata.profileId || DEFAULT_PROFILE.id,
    javaClassName: source.javaClassName || '',
    duplicateScenario: structuredClone(source.scenario)
  })

  clone.tabId = null
  clone.selectedStepIndex = -1
  state.tests.unshift(clone)
  setActiveTest(clone.id)
  return persistAndBroadcast()
}

async function addRecordedStep(step, tabId) {
  const activeTest = getActiveTestRecord()
  if (!activeTest) {
    return
  }
  if (tabId && activeTest.tabId && tabId !== activeTest.tabId) {
    return
  }

  const cloned = normalizeStep(step)
  cloned.id = nextScenarioStepId(activeTest.scenario)
  cloned.stage = cloned.stage || inferStepStage(cloned.type)
  cloned.tags = Array.isArray(cloned.tags) ? cloned.tags : ['ui']
  cloned.origin = cloned.origin || 'recorded'
  cloned.extra = Object.assign({}, cloned.extra || {}, { source: 'recorded-action' })

  if (state.captureScreenshots && Number.isInteger(tabId)) {
    try {
      cloned.screenshotPath = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
    } catch (error) {
      appendReplayLog('WARN', `Screenshot capture failed: ${String(error)}`)
    }
  }

  activeTest.scenario.orderedSteps.push(cloned)
  setSelectedStepIndex(activeTest.scenario.orderedSteps.length - 1)
  touchActiveTestRecord()
  await persistAndBroadcast()
}

async function setPickerMode(options = {}) {
  if (options.enabled) {
    await ensureActiveControlledTab('Start New Test before picking a target from the page.')
    state.pickerMode = {
      kind: options.kind === 'assertion' ? 'assertion' : 'action',
      stepType: options.stepType || null
    }
    state.assertionMode = state.pickerMode.kind === 'assertion'
  } else {
    state.pickerMode = null
    state.assertionMode = false
    if (options.clearPending) {
      state.pendingAssertion = null
      state.pendingActionTarget = null
    }
  }

  await pushModeToActiveTestTab()
  return persistAndBroadcast()
}

function acceptPickerTarget(payload = {}) {
  const kind = payload.kind === 'assertion' ? 'assertion' : 'action'
  if (kind === 'assertion') {
    state.pendingAssertion = normalizeAssertionTarget(payload)
  } else {
    state.pendingActionTarget = normalizeActionTarget(payload)
  }
}

function createAssertionStep(message) {
  const activeTest = requireActiveTest('There is no active test to add an assertion to.')
  const payload = normalizeAssertionTarget(state.pendingAssertion || {})
  const assertionType = String(message.assertionType || '').trim() || 'assert_visible'
  const targetStrategy = String(message.targetStrategy || '').trim() || payload.selector?.primaryStrategy || 'text'
  const targetValue = String(message.targetValue || '').trim() || payload.selector?.primaryValue || ''
  const expectedValue = message.expectedValue != null
    ? String(message.expectedValue)
    : String(payload.defaultExpectedValue || '')
  const timeoutMs = Number(message.timeoutMs || payload.timeoutMs || 5000)
  const selector = buildSelectorFromTarget(targetStrategy, targetValue, payload.selector)
  const summary = describeAssertionStep(assertionType, selector, expectedValue)
  const scope = resolveAssertionScope(assertionType)

  const step = normalizeStep({
    type: assertionType,
    stage: 'assertion',
    description: summary,
    timestamp: Date.now(),
    url: payload.url || activeTest.scenario.metadata.sourceUrl || '',
    visibleText: selector.visibleText || '',
    expectedValue,
    tags: ['assertion', 'ui'],
    mappingHints: [],
    selector,
    frameContext: payload.frameContext || createDefaultFrameContext(),
    windowContext: payload.windowContext || createDefaultWindowContext(activeTest.scenario.metadata.sourceUrl || ''),
    waitStrategy: { kind: 'none', timeoutMs },
    extra: {
      source: 'manual-assertion',
      scope,
      summary,
      targetSummary: summarizeSelector(selector) || (scope === 'Popup' ? 'current popup dialog' : scope === 'URL' ? 'current page URL' : '')
    },
    origin: 'manual'
  })
  step.id = nextScenarioStepId(activeTest.scenario)

  activeTest.scenario.orderedSteps.push(step)
  setSelectedStepIndex(activeTest.scenario.orderedSteps.length - 1)
  touchActiveTestRecord()
}

function createActionStep(message) {
  const activeTest = requireActiveTest('There is no active test to add an action to.')
  const payload = normalizeActionTarget(state.pendingActionTarget || {})
  const actionType = String(message.actionType || '').trim() || 'click'
  const resolvedType = normalizeManualActionType(actionType)
  const targetStrategy = resolvedType === 'navigate'
    ? 'url'
    : String(message.targetStrategy || '').trim() || payload.selector?.primaryStrategy || 'text'
  const targetValue = resolvedType === 'navigate'
    ? String(message.targetValue || message.actionValue || activeTest.scenario.metadata.sourceUrl || '').trim()
    : String(message.targetValue || '').trim() || payload.selector?.primaryValue || ''
  const actionValue = message.actionValue != null ? String(message.actionValue) : ''
  const timeoutMs = Number(message.timeoutMs || payload.timeoutMs || 5000)
  const waitCondition = String(message.waitCondition || 'visible').trim() || 'visible'
  const note = String(message.note || '').trim()
  const selector = buildSelectorFromTarget(
    resolvedType === 'navigate' ? 'url' : targetStrategy,
    targetValue,
    payload.selector
  )

  const step = normalizeStep({
    type: resolveStoredActionType(resolvedType),
    stage: 'test',
    description: '',
    timestamp: Date.now(),
    url: payload.url || activeTest.scenario.metadata.sourceUrl || '',
    visibleText: selector.visibleText || '',
    value: null,
    expectedValue: null,
    checked: null,
    optionText: null,
    tags: ['ui'],
    mappingHints: [],
    selector,
    frameContext: payload.frameContext || createDefaultFrameContext(),
    windowContext: payload.windowContext || createDefaultWindowContext(activeTest.scenario.metadata.sourceUrl || ''),
    waitStrategy: { kind: 'none', timeoutMs },
    extra: { source: 'manual-action' },
    note,
    origin: 'manual'
  })
  step.id = nextScenarioStepId(activeTest.scenario)

  if (resolvedType === 'navigate') {
    step.value = targetValue
    step.url = targetValue
    step.waitStrategy = { kind: 'url_change', expectedUrlFragment: targetValue, timeoutMs }
  } else if (resolvedType === 'type') {
    step.value = actionValue
  } else if (resolvedType === 'select') {
    step.value = actionValue
    step.optionText = actionValue
  } else if (resolvedType === 'check') {
    step.type = 'checkbox_set'
    step.checked = true
  } else if (resolvedType === 'uncheck') {
    step.type = 'checkbox_set'
    step.checked = false
  } else if (resolvedType === 'wait') {
    step.type = 'wait'
    step.waitStrategy = buildWaitStrategy(waitCondition, targetStrategy, targetValue, actionValue, timeoutMs)
  }

  step.description = describeStep(step)
  activeTest.scenario.orderedSteps.push(step)
  setSelectedStepIndex(activeTest.scenario.orderedSteps.length - 1)
  touchActiveTestRecord()
}

function updateSelectedStepFromMessage(updates) {
  updateSelectedStep((step) => {
    if (updates.stage) {
      step.stage = updates.stage
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'note')) {
      step.note = String(updates.note || '')
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'value')) {
      step.value = updates.value
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'expectedValue')) {
      step.expectedValue = updates.expectedValue
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'timeoutMs')) {
      step.waitStrategy = Object.assign({}, step.waitStrategy || {}, {
        timeoutMs: Number(updates.timeoutMs) || 0
      })
    }
    if (step.type === 'wait' && Object.prototype.hasOwnProperty.call(updates, 'waitCondition')) {
      step.waitStrategy = buildWaitStrategy(
        String(updates.waitCondition || 'visible'),
        updates.targetStrategy || step.selector?.primaryStrategy || 'text',
        updates.targetValue || step.selector?.primaryValue || '',
        updates.value || step.value || '',
        Number(updates.timeoutMs || step.waitStrategy?.timeoutMs || 5000)
      )
    }

    const nextStrategy = String(updates.targetStrategy || '').trim()
    const nextValue = String(updates.targetValue || '').trim()
    if (nextStrategy || nextValue) {
      step.selector = buildSelectorFromTarget(
        nextStrategy || step.selector?.primaryStrategy || 'css',
        nextValue || step.selector?.primaryValue || '',
        step.selector
      )
      step.visibleText = step.selector.visibleText || step.visibleText || ''
      if (step.type === 'navigate') {
        step.value = nextValue || step.value
        step.url = step.value || step.url
      }
    }

    step.description = describeStep(step)
    if (isAssertionStep(step)) {
      step.extra = Object.assign({}, step.extra || {}, {
        scope: resolveAssertionScope(step.type),
        summary: step.description,
        targetSummary: summarizeSelector(step.selector) || (resolveAssertionScope(step.type) === 'Popup'
          ? 'current popup dialog'
          : resolveAssertionScope(step.type) === 'URL'
            ? 'current page URL'
            : '')
      })
    }
  })
}

async function saveScenario() {
  await refreshBackendStatus()
  if (!state.backend.ok) {
    throw new Error('Backend is not reachable')
  }
  const body = {
    scenario: buildScenarioDocument(),
    fileName: sanitizeFileName(getActiveScenario().metadata.name || 'recorded-scenario') + '.json',
    format: 'json'
  }
  const response = await fetchJson('/api/scenario/save', body)
  return { ok: true, savedPath: response.path }
}

async function downloadScenario() {
  const payload = JSON.stringify(buildScenarioDocument(), null, 2)
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  await chrome.downloads.download({
    url,
    filename: `tim-ui-recorder/${sanitizeFileName(getActiveScenario().metadata.name || 'recorded-scenario')}.json`,
    saveAs: true
  })
}

async function generateJava() {
  await refreshBackendStatus()
  if (!state.backend.ok) {
    throw new Error('Backend is not reachable')
  }
  return fetchJson('/api/generate/java', {
    scenario: buildScenarioDocument(),
    className: state.javaClassName || '',
    profileId: getActiveScenario().metadata.profileId
  })
}

async function refreshBackendStatus() {
  try {
    const response = await fetch(`${state.backendUrl}/api/health`)
    const body = await response.json()
    state.backend = { ok: true, details: body }
    await loadProfiles()
  } catch (error) {
    state.backend = { ok: false, details: String(error) }
    if (!state.availableProfiles.length) {
      state.availableProfiles = [DEFAULT_PROFILE]
    }
  }
  syncActiveTestIntoState()
  await persistAndBroadcast()
}

async function loadProfiles() {
  try {
    const response = await fetch(`${state.backendUrl}/api/profiles`)
    const body = await response.json()
    state.availableProfiles = body.profiles || [DEFAULT_PROFILE]
  } catch (error) {
    state.availableProfiles = [DEFAULT_PROFILE]
  }
}

async function fetchJson(path, body) {
  const response = await fetch(`${state.backendUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed: ${response.status}`)
  }
  return response.json()
}

function buildScenarioDocument() {
  repairActiveScenarioStepIds('scenario serialization')
  const scenario = getActiveScenario()
  const document = {
    metadata: structuredClone(scenario.metadata),
    variables: structuredClone(scenario.variables),
    uploadAliases: structuredClone(scenario.uploadAliases),
    setup: [],
    steps: [],
    assertions: [],
    cleanup: [],
    notes: structuredClone(scenario.notes)
  }

  for (const step of scenario.orderedSteps) {
    if (step.stage === 'setup') {
      document.setup.push(step)
    } else if (step.stage === 'assertion' || isAssertionStep(step)) {
      document.assertions.push(step)
    } else if (step.stage === 'cleanup') {
      document.cleanup.push(step)
    } else {
      document.steps.push(step)
    }
  }

  return document
}

async function startReplayCommand(message) {
  const scenario = getActiveScenario()
  if (!scenario.orderedSteps.length) {
    throw new Error('Replay requires at least one step')
  }
  if (state.recording) {
    throw new Error('Stop recording before replaying the scenario')
  }

  const target = await resolveReplayTargetTab()
  if (!target.ok) {
    throw new Error(target.error)
  }

  const session = await createReplaySession({
    startIndex: message.startIndex,
    mode: message.mode || 'hybrid',
    targetTabId: target.tab.id
  })

  await sendReplayControlToContent(session.sessionId, 'start')
  ensureReplayRunner(session.sessionId)
}

async function createReplaySession(options = {}) {
  if (hasActiveReplaySession()) {
    throw new Error('A replay session is already active')
  }

  const totalSteps = getActiveScenario().orderedSteps.length
  const startIndex = resolveReplayStartIndex(options.startIndex, totalSteps)
  const session = createIdleReplayState({
    sessionId: nextReplaySessionId(),
    mode: options.mode || 'local',
    status: 'running',
    replaying: true,
    running: true,
    paused: false,
    stopped: false,
    currentStepIndex: startIndex,
    currentStepId: getActiveScenario().orderedSteps[startIndex]?.id || null,
    totalSteps,
    targetTabId: options.targetTabId ?? state.activeTabId ?? null,
    startedAt: new Date().toISOString()
  })

  state.playback = session
  syncSelectedStepToReplayState('replay-session-started')
  appendReplayLog('INFO', `Replay started at step ${startIndex + 1}/${totalSteps} (${session.mode})`)
  logReplayStateDebug('replay-session-started', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: state.playback.currentStepId
  })
  await broadcastReplayStatusUpdate('started')
  return session
}

function ensureReplayRunner(sessionId) {
  if (activeReplayRunner?.sessionId === sessionId) {
    return activeReplayRunner.promise
  }

  const promise = runReplaySession(sessionId)
    .catch(async (error) => {
      console.error(error)
      if (matchesReplaySession(sessionId) && !state.playback.stopped) {
        await failReplaySession(
          sessionId,
          getActiveScenario().orderedSteps[state.playback.currentStepIndex],
          state.playback.currentStepIndex,
          error
        )
      }
    })
    .finally(() => {
      if (activeReplayRunner?.sessionId === sessionId) {
        activeReplayRunner = null
      }
    })

  activeReplayRunner = { sessionId, promise }
  return promise
}

async function runReplaySession(sessionId) {
  while (matchesReplaySession(sessionId)) {
    if (!isReplayReady(sessionId)) {
      return
    }

    if (state.playback.currentStepIndex >= state.playback.totalSteps) {
      await completeReplaySession(sessionId)
      return
    }

    const result = await executeReplayStep(sessionId, { singleStepMode: false })
    if (!result?.ok) {
      return
    }
  }
}

async function executeReplayStep(sessionId, options = {}) {
  if (!matchesReplaySession(sessionId) || !isReplayReady(sessionId)) {
    return { ok: false, stopped: true }
  }

  const stepIndex = state.playback.currentStepIndex
  const step = getActiveScenario().orderedSteps[stepIndex]
  if (!step) {
    await completeReplaySession(sessionId)
    return { ok: false, completed: true }
  }

  state.playback.stepInProgress = true
  state.playback.status = 'running'
  state.playback.running = true
  state.playback.currentStepId = step.id || null
  state.playback.lastError = null
  syncSelectedStepToReplayState('replay-step-started')
  await broadcastReplayStatusUpdate('step-started', {
    stepIndex,
    stepId: step.id || null
  })
  appendReplayLog('INFO', `Step ${stepIndex + 1}/${state.playback.totalSteps} started: ${step.id} ${step.type}`)
  logReplayStateDebug('replay-step-started', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: stepIndex,
    stepId: step.id || null
  })
  await broadcastReplayStatusUpdate('step-log')

  try {
    const tab = await resolveReplaySessionTab(sessionId)
    let result
    if (step.type === 'navigate') {
      result = await executeNavigateReplayStep(sessionId, tab.id, step)
    } else {
      result = await executeContentReplayStep(sessionId, tab.id, step, stepIndex)
    }

    if (!matchesReplaySession(sessionId) || state.playback.stopped) {
      return { ok: false, stopped: true }
    }
    if (!result?.ok) {
      await failReplaySession(sessionId, step, stepIndex, result?.error || 'Replay step failed')
      return { ok: false, failed: true, error: result?.error || 'Replay step failed' }
    }

    markReplayStepCompleted(stepIndex)
    state.playback.currentStepIndex = stepIndex + 1
    state.playback.currentStepId = getActiveScenario().orderedSteps[state.playback.currentStepIndex]?.id || null
    state.playback.failedStepIndex = null
    state.playback.failureIndex = null
    state.playback.lastResult = result
    appendReplayLog('INFO', `Step ${stepIndex + 1}/${state.playback.totalSteps} completed: ${step.id}`)
    if (state.playback.currentStepIndex < state.playback.totalSteps) {
      syncSelectedStepToReplayState('replay-pointer-advanced')
    }
    logReplayStateDebug('replay-step-completed', {
      selectedStepIndex: state.selectedStepIndex,
      replayPointer: state.playback.currentStepIndex,
      stepId: state.playback.currentStepId
    })
    await broadcastReplayStatusUpdate('step-completed', {
      stepIndex,
      stepId: step.id || null
    })

    if (state.playback.currentStepIndex >= state.playback.totalSteps) {
      await completeReplaySession(sessionId)
      return { ok: true, completed: true }
    }

    if (options.singleStepMode) {
      await pauseReplaySession('Replay paused after manual step', {
        suppressIfAlreadyPaused: false
      })
      return { ok: true, paused: true }
    }

    return { ok: true }
  } finally {
    if (matchesReplaySession(sessionId)) {
      state.playback.stepInProgress = false
      state.playback.running = state.playback.replaying && !state.playback.paused
      await broadcastReplayStatusUpdate('step-settled')
    }
  }
}

async function executeNavigateReplayStep(sessionId, tabId, step) {
  if (!step.value) {
    return { ok: false, error: 'Navigation step is missing a target URL' }
  }
  await chrome.tabs.update(tabId, { url: step.value })
  await waitForTabComplete(sessionId, tabId, Number(step.waitStrategy?.timeoutMs) || 15000)
  return {
    ok: true,
    type: 'REPLAY_STEP_RESULT',
    sessionId,
    stepId: step.id || null
  }
}

async function executeContentReplayStep(sessionId, tabId, step, stepIndex) {
  const message = {
    type: REPLAY_EXECUTE_STEP,
    sessionId,
    step,
    stepIndex,
    totalSteps: state.playback.totalSteps,
    mode: state.playback.mode
  }

  try {
    return await sendReplayMessageToTab(tabId, message)
  } catch (error) {
    return {
      ok: false,
      type: REPLAY_ERROR,
      sessionId,
      stepId: step.id || null,
      stepIndex,
      error: formatTabMessagingError(error)
    }
  }
}

async function pauseReplaySession(message = 'Replay paused', options = {}) {
  const replay = requireReplaySession('Pause is unavailable because replay is not active')

  if (replay.paused && options.suppressIfAlreadyPaused !== false) {
    return
  }

  replay.paused = true
  replay.running = false
  replay.status = replay.failedStepIndex != null ? 'failed' : 'paused'
  appendReplayLog('INFO', message)
  syncSelectedStepToReplayState('replay-paused')
  logReplayStateDebug('replay-paused', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: state.playback.currentStepId
  })

  if (!options.suppressContentControl) {
    await sendReplayControlToContent(replay.sessionId, 'pause')
  }

  await broadcastReplayStatusUpdate('paused')
}

async function resumeReplaySession(message = 'Replay resumed') {
  const replay = requireReplaySession('Resume is unavailable because replay is not active')
  if (replay.currentStepIndex >= replay.totalSteps) {
    await completeReplaySession(replay.sessionId)
    return
  }

  replay.paused = false
  replay.stopped = false
  replay.replaying = true
  replay.running = !replay.stepInProgress
  replay.status = 'running'
  syncSelectedStepToReplayState('replay-resumed')
  appendReplayLog('INFO', message)
  logReplayStateDebug('replay-resumed', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: state.playback.currentStepId
  })

  await sendReplayControlToContent(replay.sessionId, 'resume')
  await broadcastReplayStatusUpdate('resumed')

  if (activeReplayRunner?.sessionId !== replay.sessionId) {
    ensureReplayRunner(replay.sessionId)
  }
}

async function stopReplaySession(message = 'Replay stopped') {
  if (!hasTrackedReplaySession()) {
    return
  }

  const replay = state.playback
  const sessionId = replay.sessionId

  replay.replaying = false
  replay.running = false
  replay.paused = false
  replay.stopped = true
  replay.stepInProgress = false
  replay.status = 'stopped'
  replay.finishedAt = new Date().toISOString()
  replay.currentStepId = null
  appendReplayLog('INFO', message)
  syncSelectedStepToReplayState('replay-stopped', { fallbackToLastCompleted: true })
  logReplayStateDebug('replay-stopped', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: null
  })

  if (sessionId) {
    await sendReplayControlToContent(sessionId, 'stop')
  }

  await broadcastReplayStatusUpdate('stopped')
}

async function completeReplaySession(sessionId) {
  if (!matchesReplaySession(sessionId)) {
    return
  }

  state.playback.replaying = false
  state.playback.running = false
  state.playback.paused = false
  state.playback.stopped = false
  state.playback.status = 'completed'
  state.playback.finishedAt = new Date().toISOString()
  state.playback.currentStepId = null
  state.playback.failedStepIndex = null
  state.playback.failureIndex = null
  state.playback.lastError = null
  appendReplayLog('INFO', 'Replay completed')
  syncSelectedStepToReplayState('replay-completed', { fallbackToLastCompleted: true })
  logReplayStateDebug('replay-completed', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: null
  })
  await broadcastReplayStatusUpdate('completed')
}

async function failReplaySession(sessionId, step, stepIndex, error) {
  if (!matchesReplaySession(sessionId)) {
    return
  }

  state.playback.paused = true
  state.playback.replaying = true
  state.playback.running = false
  state.playback.stopped = false
  state.playback.status = 'failed'
  state.playback.failedStepIndex = Number.isInteger(stepIndex) ? stepIndex : state.playback.currentStepIndex
  state.playback.failureIndex = state.playback.failedStepIndex
  state.playback.currentStepIndex = state.playback.failedStepIndex
  state.playback.currentStepId = step?.id || state.playback.currentStepId
  state.playback.lastError = String(error)
  state.playback.lastResult = {
    ok: false,
    type: REPLAY_ERROR,
    sessionId,
    stepIndex: state.playback.failedStepIndex,
    stepId: step?.id || null,
    error: String(error)
  }
  appendReplayLog(
    'ERROR',
    `Step ${state.playback.failedStepIndex + 1}/${state.playback.totalSteps} failed: ${state.playback.lastError}`
  )
  syncSelectedStepToReplayState('replay-failed')
  logReplayStateDebug('replay-failed', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: state.playback.currentStepId
  })
  await broadcastReplayStatusUpdate('failed')
}

async function stepReplaySessionOnce(retryCurrentStep) {
  const replay = requireReplaySession('Step execution is unavailable because replay is not active')
  if (!replay.paused) {
    throw new Error('Pause replay before stepping forward')
  }
  if (replay.stepInProgress) {
    throw new Error('The current replay step is still in progress')
  }

  if (retryCurrentStep && replay.failedStepIndex != null) {
    replay.currentStepIndex = replay.failedStepIndex
    replay.currentStepId = getActiveScenario().orderedSteps[replay.currentStepIndex]?.id || null
  }

  if (replay.currentStepIndex >= replay.totalSteps) {
    await completeReplaySession(replay.sessionId)
    return
  }

  replay.failedStepIndex = null
  replay.failureIndex = null
  replay.lastError = null
  replay.paused = false
  replay.stopped = false
  replay.running = true
  replay.status = 'running'
  replay.replaying = true
  syncSelectedStepToReplayState(retryCurrentStep ? 'replay-retry-pointer-set' : 'replay-manual-step-pointer-set')
  logReplayStateDebug(retryCurrentStep ? 'replay-retry-pointer-set' : 'replay-manual-step-pointer-set', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: state.playback.currentStepId
  })

  const result = await executeReplayStep(replay.sessionId, { singleStepMode: true })
  if (!result?.ok && !result?.completed && !result?.stopped) {
    throw new Error(state.playback.lastError || 'Replay step failed')
  }
}

async function retryReplaySessionStep() {
  const replay = requireReplaySession('Retry is unavailable because replay is not active')
  if (replay.failedStepIndex == null) {
    throw new Error('There is no failed replay step to retry')
  }
  await stepReplaySessionOnce(true)
}

async function skipReplaySessionStep() {
  const replay = requireReplaySession('Skip is unavailable because replay is not active')
  if (!replay.paused) {
    throw new Error('Pause replay before skipping a step')
  }
  if (replay.stepInProgress) {
    throw new Error('The current replay step is still in progress')
  }
  if (replay.currentStepIndex >= replay.totalSteps) {
    throw new Error('There are no remaining steps to skip')
  }

  const step = getActiveScenario().orderedSteps[replay.currentStepIndex]
  appendReplayLog(
    'WARN',
    `Step ${replay.currentStepIndex + 1}/${replay.totalSteps} skipped: ${step?.id || 'unknown-step'}`
  )
  replay.failedStepIndex = null
  replay.failureIndex = null
  replay.lastError = null
  replay.currentStepIndex += 1
  replay.currentStepId = getActiveScenario().orderedSteps[replay.currentStepIndex]?.id || null

  if (replay.currentStepIndex >= replay.totalSteps) {
    await completeReplaySession(replay.sessionId)
    return
  }

  syncSelectedStepToReplayState('replay-step-skipped')
  logReplayStateDebug('replay-step-skipped', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: state.playback.currentStepId
  })
  await broadcastReplayStatusUpdate('skipped')
}

async function resolveReplayTargetTab() {
  const activeTest = requireActiveTest('There is no active test to replay.')
  if (!Number.isInteger(activeTest.tabId)) {
    return { ok: false, error: 'This test does not have a controlled browser tab. Start New Test to open one.' }
  }

  try {
    const tab = await chrome.tabs.get(activeTest.tabId)
    if (!tab?.url || tab.url.startsWith('chrome://')) {
      return { ok: false, error: 'Replay cannot run on the current test tab.' }
    }
    return { ok: true, tab }
  } catch (error) {
    activeTest.tabId = null
    syncActiveTestIntoState()
    return { ok: false, error: 'The controlled test tab is no longer available. Start New Test to open a fresh one.' }
  }
}

async function resolveReplaySessionTab(sessionId) {
  if (!matchesReplaySession(sessionId)) {
    throw new Error('Replay session is no longer active')
  }

  const targetTabId = state.playback.targetTabId
  if (!Number.isInteger(targetTabId)) {
    const target = await resolveReplayTargetTab()
    if (!target.ok) {
      throw new Error(target.error)
    }
    state.playback.targetTabId = target.tab.id
    return target.tab
  }

  try {
    return await chrome.tabs.get(targetTabId)
  } catch (error) {
    const target = await resolveReplayTargetTab()
    if (!target.ok) {
      throw new Error(target.error)
    }
    state.playback.targetTabId = target.tab.id
    return target.tab
  }
}

async function sendReplayControlToContent(sessionId, command) {
  if (!matchesReplaySession(sessionId) && command !== 'stop') {
    return
  }

  const targetTabId = state.playback.targetTabId || state.activeTabId
  if (!Number.isInteger(targetTabId)) {
    return
  }

  try {
    const response = await sendReplayMessageToTab(targetTabId, {
      type: REPLAY_CONTROL,
      sessionId,
      command,
      status: state.playback.status,
      paused: state.playback.paused,
      stopped: state.playback.stopped,
      currentStepIndex: state.playback.currentStepIndex,
      totalSteps: state.playback.totalSteps,
      mode: state.playback.mode
    })
    appendReplayLog(
      'INFO',
      `Replay control "${command}" acknowledged${response?.status ? ` (${response.status})` : ''}`
    )
  } catch (error) {
    appendReplayLog('WARN', `Replay control "${command}" could not reach the page: ${formatTabMessagingError(error)}`)
    await broadcastReplayStatusUpdate('control-warning')
  }
}

async function sendReplayMessageToTab(tabId, message) {
  let lastError = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message)
      if (response?.type === REPLAY_ERROR) {
        throw new Error(response.error || 'Replay step failed')
      }
      return response
    } catch (error) {
      lastError = error
      if (!shouldRetryTabMessage(error) || attempt === 4) {
        throw error
      }
      await delay(250)
    }
  }

  throw lastError || new Error('Replay message failed')
}

function shouldRetryTabMessage(error) {
  const text = String(error)
  return text.includes('Receiving end does not exist') || text.includes('The message port closed before a response was received')
}

function formatTabMessagingError(error) {
  const text = String(error)
  if (text.includes('Receiving end does not exist')) {
    return 'The controlled page is not ready yet. Wait for it to finish loading and try again.'
  }
  return text
}

async function waitForTabComplete(sessionId, tabId, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (!matchesReplaySession(sessionId) || state.playback.stopped) {
      throw new Error('Replay stopped before navigation completed')
    }
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'complete') {
      return
    }
    await delay(150)
  }
  throw new Error('Navigation timed out')
}

function requireReplaySession(errorMessage) {
  if (!hasActiveReplaySession()) {
    throw new Error(errorMessage)
  }
  return state.playback
}

function hasActiveReplaySession() {
  return Boolean(
    state.playback.sessionId &&
    !state.playback.stopped &&
    !['idle', 'completed'].includes(state.playback.status)
  )
}

function hasTrackedReplaySession() {
  return Boolean(state.playback.sessionId)
}

function matchesReplaySession(sessionId) {
  return Boolean(sessionId) && state.playback.sessionId === sessionId
}

function isReplayReady(sessionId) {
  return Boolean(
    matchesReplaySession(sessionId) &&
    state.playback.replaying &&
    !state.playback.paused &&
    !state.playback.stopped &&
    !state.playback.stepInProgress
  )
}

function markReplayStepCompleted(stepIndex) {
  if (!state.playback.completedStepIndexes.includes(stepIndex)) {
    state.playback.completedStepIndexes.push(stepIndex)
  }
}

async function broadcastReplayStatusUpdate(eventType, details = {}) {
  const response = await persistAndBroadcast()

  try {
    await chrome.runtime.sendMessage({
      type: REPLAY_STATUS_UPDATE,
      eventType,
      details,
      replay: state.playback
    })
  } catch (error) {
    void error
  }

  if (eventType === 'failed') {
    try {
      await chrome.runtime.sendMessage({
        type: REPLAY_ERROR,
        replay: state.playback,
        error: state.playback.lastError,
        details
      })
    } catch (error) {
      void error
    }
  }

  return response
}

function appendReplayLog(level, message) {
  state.playback.logs.push({
    level,
    message,
    timestamp: new Date().toISOString()
  })
  state.playback.logs = state.playback.logs.slice(-60)
}

function logReplayStateDebug(eventName, details = {}) {
  const payload = Object.assign({
    event: eventName,
    selectedStepIndex: Number.isInteger(state.selectedStepIndex) ? state.selectedStepIndex : null,
    replayPointer: Number.isInteger(state.playback?.currentStepIndex) ? state.playback.currentStepIndex : null,
    failedStepIndex: Number.isInteger(state.playback?.failedStepIndex) ? state.playback.failedStepIndex : null,
    stepId: state.playback?.currentStepId || null
  }, details)
  appendActivityLog('INFO', `[replay-debug] ${JSON.stringify(payload)}`)
}

function resolveReplayStartIndex(rawIndex, totalSteps) {
  if (!Number.isInteger(totalSteps) || totalSteps <= 0) {
    throw new Error('Replay requires at least one step')
  }
  if (rawIndex == null) {
    return 0
  }
  const requestedIndex = Number(rawIndex)
  if (!Number.isInteger(requestedIndex) || requestedIndex < 0 || requestedIndex >= totalSteps) {
    throw new Error(`Replay start step ${requestedIndex + 1} is out of bounds for ${totalSteps} step(s).`)
  }
  return requestedIndex
}

function resolveReplaySelectionIndex(options = {}) {
  const totalSteps = getActiveScenario().orderedSteps.length
  if (
    state.playback.status === 'failed' &&
    Number.isInteger(state.playback.failedStepIndex) &&
    state.playback.failedStepIndex >= 0 &&
    state.playback.failedStepIndex < totalSteps
  ) {
    return state.playback.failedStepIndex
  }
  if (
    Number.isInteger(state.playback.currentStepIndex) &&
    state.playback.currentStepIndex >= 0 &&
    state.playback.currentStepIndex < totalSteps
  ) {
    return state.playback.currentStepIndex
  }
  if (options.fallbackToLastCompleted) {
    const completedIndexes = Array.isArray(state.playback.completedStepIndexes)
      ? state.playback.completedStepIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < totalSteps)
      : []
    if (completedIndexes.length) {
      return Math.max(...completedIndexes)
    }
  }
  return null
}

function syncSelectedStepToReplayState(reason, options = {}) {
  if (!hasTrackedReplaySession()) {
    return
  }
  const targetIndex = resolveReplaySelectionIndex(options)
  if (targetIndex == null) {
    return
  }
  setSelectedStepIndex(targetIndex, { syncReplayPointer: false })
  const stepId = getActiveScenario().orderedSteps[targetIndex]?.id || null
  logReplayStateDebug(reason, {
    selectedStepIndex: targetIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId
  })
}

async function prepareScenarioMutation(changeLabel) {
  if (!hasActiveReplaySession()) {
    return
  }

  if (state.playback.stepInProgress || (state.playback.replaying && !state.playback.paused && state.playback.status !== 'failed')) {
    throw new Error('Pause or stop replay before editing steps.')
  }

  await stopReplaySession(`Replay invalidated after ${changeLabel}. Start replay again from the selected step.`)
}

function updateSelectedStep(mutator) {
  const scenario = getActiveScenario()
  const step = scenario.orderedSteps[state.selectedStepIndex]
  if (!step) {
    return
  }
  mutator(step)
  step.id = StepIds.normalizeStepIdValue(step.id) || nextScenarioStepId(scenario)
  step.selector = normalizeSelector(step.selector)
  step.description = step.description || describeStep(step)
  touchActiveTestRecord()
}

function moveSelectedStep(delta) {
  if (!delta) {
    return
  }
  const scenario = getActiveScenario()
  const fromIndex = state.selectedStepIndex
  if (fromIndex < 0 || fromIndex >= scenario.orderedSteps.length) {
    return
  }
  const toIndex = Math.max(0, Math.min(scenario.orderedSteps.length - 1, fromIndex + delta))
  if (toIndex === fromIndex) {
    return
  }
  const [step] = scenario.orderedSteps.splice(fromIndex, 1)
  scenario.orderedSteps.splice(toIndex, 0, step)
  setSelectedStepIndex(toIndex)
}

function deleteSelectedStep() {
  const scenario = getActiveScenario()
  const index = state.selectedStepIndex
  if (index < 0 || index >= scenario.orderedSteps.length) {
    return
  }
  scenario.orderedSteps.splice(index, 1)
  clampSelectedStep()
}

function clampSelectedStep() {
  const scenario = getActiveScenario()
  if (scenario.orderedSteps.length === 0) {
    setSelectedStepIndex(-1)
    return
  }
  setSelectedStepIndex(Math.max(0, Math.min(state.selectedStepIndex, scenario.orderedSteps.length - 1)))
}

async function pushModeToActiveTestTab() {
  const activeTest = getActiveTestRecord()
  if (!Number.isInteger(activeTest?.tabId)) {
    return
  }
  try {
    await chrome.tabs.sendMessage(activeTest.tabId, {
      type: 'SET_MODE',
      recording: state.recording,
      paused: state.paused,
      assertionMode: state.assertionMode,
      pickerMode: state.pickerMode
    })
  } catch (error) {
    void error
  }
}

async function ensureActiveControlledTab(errorMessage) {
  const activeTest = requireActiveTest('There is no active test yet.')
  if (!Number.isInteger(activeTest.tabId)) {
    throw new Error(errorMessage)
  }
  try {
    const tab = await chrome.tabs.get(activeTest.tabId)
    if (!tab?.url || tab.url.startsWith('chrome://')) {
      throw new Error(errorMessage)
    }
    state.activeTabId = activeTest.tabId
    return tab
  } catch (error) {
    activeTest.tabId = null
    syncActiveTestIntoState()
    throw new Error(errorMessage)
  }
}

function setSelectedStepFromPanel(index) {
  const totalSteps = getActiveScenario().orderedSteps.length
  if (!Number.isInteger(index) || index < 0 || index >= totalSteps) {
    throw new Error('The selected step is out of bounds for the current scenario.')
  }
  if (hasActiveReplaySession() && !state.playback.paused && state.playback.status !== 'failed') {
    syncSelectedStepToReplayState('panel-selection-blocked')
    throw new Error('Selection follows the active replay step. Pause replay before choosing another step.')
  }

  setSelectedStepIndex(index, { syncReplayPointer: true })
  logReplayStateDebug('panel-selected-step', {
    selectedStepIndex: state.selectedStepIndex,
    replayPointer: state.playback.currentStepIndex,
    stepId: getActiveScenario().orderedSteps[state.selectedStepIndex]?.id || null
  })
}

function setSelectedStepIndex(index, options = {}) {
  const activeTest = requireActiveTest('There is no active test selected.')
  const totalSteps = activeTest.scenario.orderedSteps.length
  let resolved = Number.isInteger(index) ? index : -1
  if (totalSteps <= 0 || resolved < 0) {
    resolved = -1
  } else if (resolved >= totalSteps) {
    resolved = totalSteps - 1
  }
  activeTest.selectedStepIndex = resolved
  state.selectedStepIndex = resolved

  const shouldSyncReplayPointer =
    options.syncReplayPointer !== false &&
    resolved >= 0 &&
    hasActiveReplaySession() &&
    !state.playback.stepInProgress &&
    (state.playback.paused || state.playback.status === 'failed')

  if (shouldSyncReplayPointer) {
    const previousFailedStepIndex = state.playback.failedStepIndex
    state.playback.currentStepIndex = resolved
    state.playback.currentStepId = activeTest.scenario.orderedSteps[resolved]?.id || null
    if (previousFailedStepIndex != null && previousFailedStepIndex !== resolved) {
      state.playback.failedStepIndex = null
      state.playback.failureIndex = null
      state.playback.lastError = null
      state.playback.lastResult = null
      if (state.playback.status === 'failed') {
        state.playback.status = 'paused'
      }
    }
    appendReplayLog('INFO', `Replay pointer moved to step ${resolved + 1}/${Math.max(totalSteps, 1)} from the selected step`)
    logReplayStateDebug('selected-step-updated-replay-pointer', {
      selectedStepIndex: resolved,
      replayPointer: state.playback.currentStepIndex,
      stepId: state.playback.currentStepId
    })
  }
}

function touchActiveTestRecord() {
  const activeTest = getActiveTestRecord()
  if (!activeTest) {
    return
  }
  touchTestRecord(activeTest)
  syncActiveTestIntoState()
}

function setActiveTestLifecycleStatus(status) {
  const activeTest = getActiveTestRecord()
  if (!activeTest) {
    return
  }
  activeTest.status = status === 'finished' ? 'finished' : status === 'recording' ? 'recording' : 'draft'
  activeTest.finishedAt = activeTest.status === 'finished' ? (activeTest.finishedAt || new Date().toISOString()) : null
}

function touchTestRecord(test, options = {}) {
  const timestamp = new Date().toISOString()
  test.updatedAt = timestamp
  test.scenario.metadata.updatedAt = timestamp
  test.name = test.scenario.metadata.name || test.name
  if (!options.preserveStatus && test.status === 'finished') {
    test.status = 'draft'
    test.finishedAt = null
  }
}

function detachTestTab(tabId) {
  let changed = false

  state.tests.forEach((test) => {
    if (test.tabId === tabId) {
      test.tabId = null
      changed = true
      if (test.status !== 'finished') {
        test.status = 'draft'
        test.finishedAt = null
      }
      if (state.activeTestId === test.id) {
        state.activeTabId = null
        state.recording = false
        state.paused = false
        state.assertionMode = false
        state.pendingAssertion = null
      }
    }
  })

  syncActiveTestIntoState()
  return changed
}

function getActiveTestRecord() {
  return state.tests.find((test) => test.id === state.activeTestId) || null
}

function requireActiveTest(errorMessage) {
  const test = getActiveTestRecord()
  if (!test) {
    throw new Error(errorMessage)
  }
  return test
}

function requireTestById(testId) {
  const test = state.tests.find((item) => item.id === testId)
  if (!test) {
    throw new Error('The selected test no longer exists.')
  }
  return test
}

function getActiveScenario() {
  return requireActiveTest('There is no active test selected.').scenario
}

function setActiveTest(testId) {
  const existing = requireTestById(testId)
  state.activeTestId = existing.id
  syncActiveTestIntoState()
}

function syncActiveTestIntoState() {
  if (!Array.isArray(state.tests) || !state.tests.length) {
    state.tests = [createTestRecord()]
  }

  if (!state.activeTestId || !state.tests.some((test) => test.id === state.activeTestId)) {
    state.activeTestId = state.tests[0].id
  }

  const activeTest = getActiveTestRecord()
  activeTest.name = activeTest.scenario.metadata.name || activeTest.name
  activeTest.selectedStepIndex = Number.isInteger(activeTest.selectedStepIndex)
    ? activeTest.selectedStepIndex
    : -1
  activeTest.javaClassName = activeTest.javaClassName || ''
  activeTest.status = activeTest.status === 'finished' ? 'finished' : activeTest.status === 'recording' ? 'recording' : 'draft'
  activeTest.finishedAt = activeTest.status === 'finished'
    ? (activeTest.finishedAt || activeTest.updatedAt || new Date().toISOString())
    : null
  activeTest.updatedAt = activeTest.scenario.metadata.updatedAt || activeTest.updatedAt || new Date().toISOString()

  state.scenario = activeTest.scenario
  state.selectedStepIndex = activeTest.selectedStepIndex
  state.activeTabId = Number.isInteger(activeTest.tabId) ? activeTest.tabId : null
  state.javaClassName = activeTest.javaClassName
}

function nextStepId() {
  return nextScenarioStepId(getActiveScenario())
}

function nextScenarioStepId(scenario) {
  const steps = Array.isArray(scenario?.orderedSteps) ? scenario.orderedSteps : []
  const knownIds = new Set()
  let maxNumericId = 0

  for (const step of steps) {
    const stepId = StepIds.normalizeStepIdValue(step?.id)
    if (!stepId) {
      continue
    }
    knownIds.add(stepId)
    const parsedNumber = StepIds.parseStepIdNumber(stepId)
    if (parsedNumber != null) {
      maxNumericId = Math.max(maxNumericId, parsedNumber)
    }
  }

  let candidate = ''
  do {
    maxNumericId += 1
    candidate = StepIds.formatStepId(maxNumericId)
  } while (knownIds.has(candidate))
  return candidate
}

function repairActiveScenarioStepIds(reason, options = {}) {
  const activeTest = getActiveTestRecord()
  if (!activeTest) {
    return []
  }
  return repairTestScenarioStepIds(activeTest, reason, options)
}

function repairAllTestScenarioStepIds(reason, options = {}) {
  const tests = Array.isArray(state.tests) ? state.tests : []
  const repairs = []
  for (const test of tests) {
    repairs.push(...repairTestScenarioStepIds(test, reason, options))
  }
  return repairs
}

function repairTestScenarioStepIds(test, reason, options = {}) {
  if (!test?.scenario) {
    return []
  }
  const repairs = StepIds.ensureScenarioStepIds(test.scenario, options)
  if (repairs.length && reason) {
    const repairedSteps = repairs.map((item) => item.index + 1).join(', ')
    appendActivityLog(
      'WARN',
      `Repaired ${repairs.length} step id(s) in ${test.name || test.id || 'scenario'} during ${reason} (steps ${repairedSteps})`
    )
  }
  return repairs
}

function nextTestId() {
  const tests = Array.isArray(state.tests) ? state.tests : []
  const max = tests.reduce((largest, test) => {
    const match = /^test-(\d+)$/i.exec(test.id || '')
    return match ? Math.max(largest, Number(match[1])) : largest
  }, 0)
  return `test-${String(max + 1).padStart(3, '0')}`
}

function nextReplaySessionId() {
  replaySessionCounter += 1
  return `replay-${Date.now()}-${replaySessionCounter}`
}

function normalizeStep(step = {}) {
  const cloned = structuredClone(step)
  cloned.id = StepIds.normalizeStepIdValue(cloned.id)
  cloned.type = cloned.type || 'meta'
  cloned.stage = cloned.stage || inferStepStage(cloned.type)
  cloned.description = cloned.description || describeStep(cloned)
  cloned.note = cloned.note || ''
  cloned.timestamp = Number(cloned.timestamp) || Date.now()
  cloned.url = cloned.url || ''
  cloned.visibleText = cloned.visibleText || cloned.selector?.visibleText || ''
  cloned.value = Object.prototype.hasOwnProperty.call(cloned, 'value') ? cloned.value : null
  cloned.expectedValue = Object.prototype.hasOwnProperty.call(cloned, 'expectedValue') ? cloned.expectedValue : null
  cloned.key = Object.prototype.hasOwnProperty.call(cloned, 'key') ? cloned.key : null
  cloned.optionText = Object.prototype.hasOwnProperty.call(cloned, 'optionText') ? cloned.optionText : null
  cloned.checked = Object.prototype.hasOwnProperty.call(cloned, 'checked') ? cloned.checked : null
  cloned.enabled = cloned.enabled !== false
  cloned.uploadAlias = cloned.uploadAlias || null
  cloned.fileNames = Array.isArray(cloned.fileNames) ? cloned.fileNames : []
  cloned.screenshotPath = cloned.screenshotPath || null
  cloned.todo = cloned.todo || null
  cloned.tags = Array.isArray(cloned.tags) ? cloned.tags : ['ui']
  cloned.origin = cloned.origin || inferStepOrigin(cloned)
  cloned.mappingHints = Array.isArray(cloned.mappingHints) ? cloned.mappingHints : []
  cloned.selector = normalizeSelector(cloned.selector)
  cloned.frameContext = cloned.frameContext || createDefaultFrameContext()
  cloned.windowContext = cloned.windowContext || createDefaultWindowContext(cloned.url || '')
  cloned.waitStrategy = Object.assign({ kind: 'none', timeoutMs: 5000 }, cloned.waitStrategy || {})
  cloned.extra = cloned.extra || {}
  return cloned
}

function normalizeSelector(selector = {}) {
  const normalized = Object.assign({
    primaryStrategy: null,
    primaryValue: null,
    confidenceScore: 0,
    explanation: '',
    visibleText: '',
    elementTag: '',
    inputType: '',
    id: null,
    name: null,
    placeholder: null,
    ariaLabel: null,
    dataTestId: null,
    dataQa: null,
    semanticLabel: null,
    cssPath: null,
    xpath: null,
    domPath: null,
    classes: [],
    candidates: []
  }, structuredClone(selector || {}))

  normalized.classes = Array.isArray(normalized.classes) ? normalized.classes : []
  normalized.candidates = Array.isArray(normalized.candidates)
    ? normalized.candidates.map((candidate) => Object.assign({}, candidate))
    : []

  if (normalized.primaryStrategy && normalized.primaryValue) {
    const hasPrimary = normalized.candidates.some((candidate) =>
      candidate.strategy === normalized.primaryStrategy && candidate.value === normalized.primaryValue
    )
    if (!hasPrimary) {
      normalized.candidates.unshift({
        strategy: normalized.primaryStrategy,
        value: normalized.primaryValue,
        confidenceScore: normalized.confidenceScore || 1,
        explanation: normalized.explanation || 'Current target',
        primary: true
      })
    }
  }

  return normalized
}

function normalizeAssertionTarget(payload = {}) {
  return {
    kind: 'assertion',
    stepType: payload.stepType || null,
    url: payload.url || '',
    selector: buildSelectorFromTarget(
      payload.selector?.primaryStrategy || 'text',
      payload.selector?.primaryValue || payload.selector?.visibleText || '',
      payload.selector
    ),
    frameContext: payload.frameContext || createDefaultFrameContext(),
    windowContext: payload.windowContext || createDefaultWindowContext(payload.url || ''),
    defaultExpectedValue: payload.defaultExpectedValue || payload.selector?.visibleText || '',
    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
    timeoutMs: Number(payload.timeoutMs) || 5000
  }
}

function normalizeActionTarget(payload = {}) {
  return {
    kind: 'action',
    stepType: payload.stepType || null,
    url: payload.url || '',
    selector: buildSelectorFromTarget(
      payload.selector?.primaryStrategy || payload.selector?.visibleText ? payload.selector?.primaryStrategy || 'text' : 'text',
      payload.selector?.primaryValue || payload.selector?.visibleText || '',
      payload.selector
    ),
    frameContext: payload.frameContext || createDefaultFrameContext(),
    windowContext: payload.windowContext || createDefaultWindowContext(payload.url || ''),
    timeoutMs: Number(payload.timeoutMs) || 5000
  }
}

function buildSelectorFromTarget(strategy, value, existingSelector = null) {
  const normalizedStrategy = String(strategy || '').trim() || 'css'
  const normalizedValue = String(value || '').trim()
  const base = normalizeSelector(existingSelector || {})
  base.primaryStrategy = normalizedStrategy
  base.primaryValue = normalizedValue
  base.explanation = `User selected target by ${normalizedStrategy}`
  base.confidenceScore = 1

  if (normalizedStrategy === 'text') {
    base.visibleText = normalizedValue
  } else if (normalizedStrategy === 'label') {
    base.semanticLabel = normalizedValue
  } else if (normalizedStrategy === 'name') {
    base.name = normalizedValue
  } else if (normalizedStrategy === 'placeholder') {
    base.placeholder = normalizedValue
  } else if (normalizedStrategy === 'ariaLabel') {
    base.ariaLabel = normalizedValue
  } else if (normalizedStrategy === 'dataTestId') {
    base.dataTestId = normalizedValue
  } else if (normalizedStrategy === 'id') {
    base.id = normalizedValue
  } else if (normalizedStrategy === 'css') {
    base.cssPath = normalizedValue
  } else if (normalizedStrategy === 'xpath') {
    base.xpath = normalizedValue
  }

  base.candidates = [
    {
      strategy: normalizedStrategy,
      value: normalizedValue,
      confidenceScore: 1,
      explanation: `User selected target by ${normalizedStrategy}`,
      primary: true
    }
  ].concat(base.candidates.filter((candidate) => !(candidate.strategy === normalizedStrategy && candidate.value === normalizedValue)))

  return normalizeSelector(base)
}

function describeAssertionStep(type, selector, expectedValue) {
  const subject = summarizeSelector(selector) || 'current page'
  switch (type) {
    case 'assert_popup_present':
    case 'assert_alert_present':
      return 'Expect popup to be present'
    case 'assert_popup_text':
    case 'assert_alert_text':
      return `Expect popup text to equal "${expectedValue}"`
    case 'assert_text_not_present':
      return `Expect element with ${subject} text NOT to contain "${expectedValue}"`
    case 'assert_text_equals':
      return `Expect element with ${subject} text to equal "${expectedValue}"`
    case 'assert_text_contains':
      return `Expect element with ${subject} text to contain "${expectedValue}"`
    case 'assert_value_equals':
      return `Expect field with ${subject} value to equal "${expectedValue}"`
    case 'assert_enabled':
      return `Expect element with ${subject} to be enabled`
    case 'assert_disabled':
      return `Expect element with ${subject} to be disabled`
    case 'assert_exists':
      return `Expect element with ${subject} to exist`
    case 'assert_not_exists':
      return `Expect element with ${subject} NOT to exist`
    case 'assert_hidden':
      return `Expect element with ${subject} NOT to be visible`
    case 'assert_url_contains':
      return `Expect URL to contain "${expectedValue}"`
    case 'assert_visible':
    default:
      return `Expect element with ${subject} to be visible`
  }
}

function describeStep(step) {
  const subject = summarizeSelector(step.selector)
  if (isAssertionStep(step)) {
    return describeAssertionStep(step.type, step.selector, step.expectedValue)
  }

  switch (step.type) {
    case 'click':
      return `Click element with ${subject || 'target'}`
    case 'double_click':
      return `Double click element with ${subject || 'target'}`
    case 'right_click':
      return `Right click element with ${subject || 'target'}`
    case 'type':
      return step.value != null && step.value !== ''
        ? `Type "${step.value}" into field with ${subject || 'target'}`
        : `Type into field with ${subject || 'target'}`
    case 'select':
      return `Select "${step.optionText || step.value || 'option'}" in field with ${subject || 'target'}`
    case 'checkbox_set':
      return `${Boolean(step.checked) ? 'Check' : 'Uncheck'} element with ${subject || 'checkbox'}`
    case 'radio_set':
      return `Select radio option with ${subject || 'radio option'}`
    case 'wait':
      return describeWaitStep(step, subject)
    case 'navigate':
      return `Navigate to "${step.value || step.url || 'page'}"`
    default:
      return step.description || `${step.type || 'step'} ${subject || ''}`.trim()
  }
}

function describeWaitStep(step, subject) {
  const kind = step.waitStrategy?.kind || 'visible'
  switch (kind) {
    case 'exists':
      return `Wait for element with ${subject || 'target'} to exist`
    case 'hidden':
      return `Wait for element with ${subject || 'target'} to be hidden`
    case 'enabled':
      return `Wait for element with ${subject || 'target'} to be enabled`
    case 'disabled':
      return `Wait for element with ${subject || 'target'} to be disabled`
    case 'url_change':
      return `Wait for URL to contain "${step.waitStrategy?.expectedUrlFragment || step.value || ''}"`
    case 'text_contains':
      return `Wait for text "${step.waitStrategy?.expectedText || step.selector?.primaryValue || ''}" to be visible`
    case 'value_equals':
      return `Wait for value "${step.waitStrategy?.expectedValue || step.value || ''}" on field with ${subject || 'target'}`
    case 'visible':
    default:
      return `Wait for element with ${subject || 'target'} to be visible`
  }
}

function summarizeSelector(selector) {
  if (!selector) {
    return ''
  }
  const strategy = selector.primaryStrategy
  const value = selector.primaryValue || selector.visibleText || ''
  if (!strategy || !value) {
    return selector.visibleText || ''
  }
  switch (strategy) {
    case 'text':
      return `visible text "${value}"`
    case 'label':
      return `label "${value}"`
    case 'name':
      return `name "${value}"`
    case 'placeholder':
      return `placeholder "${value}"`
    case 'ariaLabel':
      return `aria-label "${value}"`
    case 'dataTestId':
      return `test id "${value}"`
    case 'id':
      return `id "${value}"`
    case 'css':
      return `selector ${value}`
    case 'xpath':
      return `xpath ${value}`
    case 'url':
      return value
    default:
      return value
  }
}

function resolveAssertionScope(type) {
  const normalized = String(type || '').trim()
  if (['assert_popup_present', 'assert_popup_text', 'assert_alert_present', 'assert_alert_text'].includes(normalized)) {
    return 'Popup'
  }
  if (normalized === 'assert_url_contains') {
    return 'URL'
  }
  if (['assert_text_equals', 'assert_text_contains', 'assert_text_not_present', 'assert_value_equals'].includes(normalized)) {
    return 'Element Text'
  }
  return 'Element'
}

function inferStepOrigin(step) {
  if (step.stage === 'assertion') {
    return 'manual'
  }
  if (step.extra?.source === 'manual-action' || step.extra?.source === 'manual-assertion') {
    return 'manual'
  }
  return 'recorded'
}

function normalizeManualActionType(type) {
  const value = String(type || '').trim()
  if (['navigate', 'click', 'type', 'select', 'check', 'uncheck', 'wait'].includes(value)) {
    return value
  }
  return 'click'
}

function resolveStoredActionType(type) {
  switch (type) {
    case 'check':
    case 'uncheck':
      return 'checkbox_set'
    default:
      return type
  }
}

function buildWaitStrategy(waitCondition, targetStrategy, targetValue, actionValue, timeoutMs) {
  const normalized = String(waitCondition || 'visible').trim() || 'visible'
  const strategy = {
    kind: normalized,
    timeoutMs
  }

  if (normalized === 'text_contains') {
    strategy.expectedText = actionValue || targetValue
  }
  if (normalized === 'value_equals') {
    strategy.expectedValue = actionValue || targetValue
  }
  if (normalized === 'url_change') {
    strategy.expectedUrlFragment = targetValue || actionValue
  }

  return strategy
}

function inferStepStage(type) {
  return isAssertionType(type) ? 'assertion' : 'test'
}

function isAssertionType(type) {
  return String(type || '').startsWith('assert_')
}

function isAssertionStep(step) {
  return step.stage === 'assertion' || isAssertionType(step.type)
}

function createDefaultFrameContext() {
  return { frameSelectors: [], frameName: null, sameOrigin: true }
}

function createDefaultWindowContext(url) {
  return {
    title: url || 'Recorder Window',
    url: url || '',
    index: 0,
    handleName: url || 'Recorder Window'
  }
}

function createTestRecord(options = {}) {
  const now = new Date().toISOString()
  const scenario = options.duplicateScenario
    ? normalizeScenario(
        options.duplicateScenario,
        options.name || options.duplicateScenario?.metadata?.name || '',
        { regenerateStepIds: true }
      )
    : createScenario(options.name || '', options.startUrl || '', options.profileId || DEFAULT_PROFILE.id)
  const name = options.name || scenario.metadata.name || defaultTestName()

  scenario.metadata.name = name
  scenario.metadata.profileId = options.profileId || scenario.metadata.profileId || DEFAULT_PROFILE.id
  scenario.metadata.sourceUrl = normalizeOptionalUrl(options.startUrl, scenario.metadata.sourceUrl || '')
  scenario.metadata.updatedAt = now
  scenario.metadata.createdAt = scenario.metadata.createdAt || now

  return {
    id: nextTestId(),
    name,
    createdAt: now,
    updatedAt: now,
    status: options.status === 'finished' ? 'finished' : options.status === 'recording' ? 'recording' : 'draft',
    finishedAt: options.status === 'finished' ? (options.finishedAt || now) : null,
    tabId: options.tabId ?? null,
    selectedStepIndex: -1,
    javaClassName: options.javaClassName || '',
    scenario
  }
}

function createScenario(name, startUrl, profileId) {
  const now = new Date().toISOString()
  const resolvedName = String(name || '').trim() || defaultTestName()
  return {
    metadata: {
      scenarioId: `scenario-${Date.now()}`,
      name: resolvedName,
      description: 'Recorded with TIM UI Recorder',
      baseUrl: '',
      sourceUrl: normalizeOptionalUrl(startUrl, ''),
      profileId: profileId || DEFAULT_PROFILE.id,
      createdAt: now,
      updatedAt: now,
      createdBy: 'chrome-extension',
      version: '1.0',
      tags: ['ui']
    },
    variables: {},
    uploadAliases: {},
    orderedSteps: [],
    notes: []
  }
}

function normalizeScenario(scenario, fallbackName, options = {}) {
  const now = new Date().toISOString()
  const normalized = {
    metadata: Object.assign({
      scenarioId: `scenario-${Date.now()}`,
      name: fallbackName || defaultTestName(),
      description: 'Recorded with TIM UI Recorder',
      baseUrl: '',
      sourceUrl: '',
      profileId: DEFAULT_PROFILE.id,
      createdAt: now,
      updatedAt: now,
      createdBy: 'chrome-extension',
      version: '1.0',
      tags: ['ui']
    }, structuredClone(scenario?.metadata || {})),
    variables: structuredClone(scenario?.variables || {}),
    uploadAliases: structuredClone(scenario?.uploadAliases || {}),
    orderedSteps: Array.isArray(scenario?.orderedSteps)
      ? scenario.orderedSteps.map((step) => normalizeStep(step))
      : [],
    notes: Array.isArray(scenario?.notes) ? structuredClone(scenario.notes) : []
  }
  StepIds.ensureScenarioStepIds(normalized, {
    regenerateAll: Boolean(options.regenerateStepIds)
  })
  return normalized
}

function defaultTestName() {
  const count = Array.isArray(state.tests) ? state.tests.length : 0
  return `Untitled Test ${count + 1}`
}

function normalizeStartUrl(value) {
  return normalizeOptionalUrl(value, DEFAULT_START_URL) || DEFAULT_START_URL
}

function normalizeOptionalUrl(value, fallback = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return fallback
  }
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return fallback
    }
    return url.toString()
  } catch (error) {
    return fallback
  }
}

function sanitizeFileName(value) {
  return (value || 'recorded-scenario').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').toLowerCase()
}

function appendActivityLog(level, message) {
  const entry = {
    level: String(level || 'INFO').toUpperCase(),
    message: String(message || ''),
    timestamp: new Date().toISOString(),
    source: 'background'
  }
  console.log(`[recorder][background][${entry.level}] ${entry.message}`)
  state.activityLog = Array.isArray(state.activityLog) ? state.activityLog : []
  state.activityLog.unshift(entry)
  state.activityLog = state.activityLog.slice(0, 80)
}

function markPanelConnected() {
  state.diagnostics = Object.assign({}, state.diagnostics || {}, {
    backgroundLoaded: true,
    backgroundLoadedAt: state.diagnostics?.backgroundLoadedAt || new Date().toISOString(),
    panelConnectedAt: new Date().toISOString(),
    manifestPermissionsOk: true,
    startNewTestHandlerRegistered: true,
    tabCreateAvailable: typeof chrome?.tabs?.create === 'function'
  })
}

async function persistAndBroadcast() {
  repairAllTestScenarioStepIds('state sync')
  syncActiveTestIntoState()
  await chrome.storage.local.set({ [STORAGE_KEY]: state })
  try {
    await chrome.runtime.sendMessage({ type: 'STATE_UPDATED', state })
  } catch (error) {
    void error
  }
  return { ok: true, state }
}

async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  if (stored[STORAGE_KEY]) {
    state = mergeStoredState(stored[STORAGE_KEY])
  } else {
    syncActiveTestIntoState()
  }
  await refreshBackendStatus()
}

function mergeStoredState(storedState = {}) {
  const initial = createInitialState()
  const merged = Object.assign(initial, structuredClone(storedState || {}))
  const storedTests = Array.isArray(storedState.tests) && storedState.tests.length
    ? storedState.tests
    : [{
        id: nextTestId(),
        name: storedState.scenario?.metadata?.name || 'Untitled Test 1',
        createdAt: storedState.scenario?.metadata?.createdAt || new Date().toISOString(),
        updatedAt: storedState.scenario?.metadata?.updatedAt || new Date().toISOString(),
        status: 'draft',
        finishedAt: null,
        tabId: storedState.activeTabId ?? null,
        selectedStepIndex: Number.isInteger(storedState.selectedStepIndex) ? storedState.selectedStepIndex : -1,
        javaClassName: storedState.javaClassName || '',
        scenario: storedState.scenario || initial.scenario
      }]

  merged.tests = storedTests.map((test) => ({
    id: test.id || nextTestId(),
    name: test.name || test.scenario?.metadata?.name || defaultTestName(),
    createdAt: test.createdAt || test.scenario?.metadata?.createdAt || new Date().toISOString(),
    updatedAt: test.updatedAt || test.scenario?.metadata?.updatedAt || new Date().toISOString(),
    status: test.status === 'finished' ? 'finished' : 'draft',
    finishedAt: test.status === 'finished'
      ? (test.finishedAt || test.updatedAt || test.scenario?.metadata?.updatedAt || new Date().toISOString())
      : null,
    tabId: Number.isInteger(test.tabId) ? test.tabId : null,
    selectedStepIndex: Number.isInteger(test.selectedStepIndex) ? test.selectedStepIndex : -1,
    javaClassName: test.javaClassName || '',
    scenario: normalizeScenario(test.scenario || storedState.scenario || initial.scenario, test.name || '')
  }))
  merged.activeTestId = storedState.activeTestId && merged.tests.some((test) => test.id === storedState.activeTestId)
    ? storedState.activeTestId
    : merged.tests[0].id
  merged.recording = false
  merged.paused = false
  merged.assertionMode = false
  merged.pickerMode = null
  merged.pendingAssertion = null
  merged.pendingActionTarget = null
  merged.activityLog = Array.isArray(storedState.activityLog)
    ? storedState.activityLog.slice(-80)
    : []
  merged.diagnostics = Object.assign({}, initial.diagnostics, storedState.diagnostics || {})
  merged.diagnostics.backgroundLoaded = true
  merged.diagnostics.backgroundLoadedAt = merged.diagnostics.backgroundLoadedAt || new Date().toISOString()
  merged.diagnostics.startNewTestHandlerRegistered = true
  merged.diagnostics.tabCreateAvailable = typeof chrome?.tabs?.create === 'function'
  merged.playback = createIdleReplayState({
    logs: Array.isArray(storedState.playback?.logs) ? storedState.playback.logs.slice(-20) : [],
    totalSteps: merged.tests.find((test) => test.id === merged.activeTestId)?.scenario?.orderedSteps?.length || 0
  })
  syncActiveTestFields(merged)
  return merged
}

function syncActiveTestFields(runtimeState) {
  if (!runtimeState.tests.length) {
    runtimeState.tests.push(createTestRecord())
  }
  const activeTest = runtimeState.tests.find((test) => test.id === runtimeState.activeTestId) || runtimeState.tests[0]
  runtimeState.activeTestId = activeTest.id
  activeTest.status = activeTest.status === 'finished' ? 'finished' : activeTest.status === 'recording' ? 'recording' : 'draft'
  activeTest.finishedAt = activeTest.status === 'finished'
    ? (activeTest.finishedAt || activeTest.updatedAt || new Date().toISOString())
    : null
  runtimeState.scenario = activeTest.scenario
  runtimeState.selectedStepIndex = activeTest.selectedStepIndex
  runtimeState.activeTabId = activeTest.tabId
  runtimeState.javaClassName = activeTest.javaClassName || ''
}

function createInitialState() {
  const now = new Date().toISOString()
  const initialTest = {
    id: 'test-001',
    name: 'Untitled Test 1',
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    finishedAt: null,
    tabId: null,
    selectedStepIndex: -1,
    javaClassName: '',
    scenario: createScenario('Untitled Test 1', '', DEFAULT_PROFILE.id)
  }

  return {
    backendUrl: DEFAULT_BACKEND_URL,
    backend: { ok: false, details: 'Not checked' },
    availableProfiles: [DEFAULT_PROFILE],
    recording: false,
    paused: false,
    assertionMode: false,
    captureScreenshots: false,
    selectedStepIndex: -1,
    javaClassName: '',
    pendingAssertion: null,
    pendingActionTarget: null,
    pickerMode: null,
    activityLog: [],
    diagnostics: {
      backgroundLoaded: true,
      backgroundLoadedAt: now,
      panelConnectedAt: null,
      manifestPermissionsOk: true,
      startNewTestHandlerRegistered: true,
      tabCreateAvailable: typeof chrome?.tabs?.create === 'function'
    },
    playback: createIdleReplayState(),
    tests: [initialTest],
    activeTestId: initialTest.id,
    activeTabId: null,
    scenario: initialTest.scenario
  }
}

function createIdleReplayState(overrides = {}) {
  return Object.assign({
    sessionId: null,
    mode: 'local',
    status: 'idle',
    replaying: false,
    running: false,
    paused: false,
    stopped: false,
    stepInProgress: false,
    currentStepIndex: -1,
    totalSteps: 0,
    currentStepId: null,
    targetTabId: null,
    completedStepIndexes: [],
    failedStepIndex: null,
    failureIndex: null,
    lastError: null,
    lastResult: null,
    startedAt: null,
    finishedAt: null,
    logs: []
  }, overrides)
}

function clampIndex(index, totalSteps) {
  if (!Number.isFinite(index)) {
    return 0
  }
  if (totalSteps <= 0) {
    return 0
  }
  return Math.max(0, Math.min(totalSteps - 1, index))
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function exposeTestHooks() {
  if (!globalThis.__TIM_UI_RECORDER_TESTING__) {
    return
  }

  globalThis.__timUiRecorderTestHooks = {
    REPLAY_COMMANDS,
    buildScenarioDocument,
    createIdleReplayState,
    mergeStoredState,
    nextScenarioStepId,
    nextStepId,
    createReplaySession,
    pauseReplaySession,
    repairAllTestScenarioStepIds,
    repairTestScenarioStepIds,
    resumeReplaySession,
    stopReplaySession,
    stepReplaySessionOnce,
    retryReplaySessionStep,
    skipReplaySessionStep,
    hasActiveReplaySession,
    isReplayReady,
    resetStateForTests(overrides = {}) {
      const seed = structuredClone(overrides)
      if (!Array.isArray(seed.tests) && seed.scenario) {
        const baseTest = createInitialState().tests[0]
        seed.tests = [Object.assign({}, baseTest, {
          name: seed.scenario?.metadata?.name || baseTest.name,
          scenario: seed.scenario,
          selectedStepIndex: Number.isInteger(seed.selectedStepIndex) ? seed.selectedStepIndex : -1,
          javaClassName: seed.javaClassName || '',
          tabId: Number.isInteger(seed.activeTabId) ? seed.activeTabId : baseTest.tabId
        })]
        seed.activeTestId = seed.tests[0].id
      }
      state = mergeStoredState(seed)
      replaySessionCounter = 0
      activeReplayRunner = null
    },
    getState() {
      return structuredClone(state)
    },
    async handleMessage(message, sender = {}) {
      return handleMessage(message, sender)
    }
  }
}

exposeTestHooks()
