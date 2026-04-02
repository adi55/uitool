const output = document.getElementById('output')

const harness = {
  storage: {},
  createdTabs: [],
  nextTabId: 2,
  tabs: new Map([
    [1, { id: 1, url: 'https://example.test/', status: 'complete', title: 'Example Test' }]
  ])
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
    onInstalled: { addListener() {} },
    onMessage: { addListener() {} },
    async sendMessage() {
      return { ok: true }
    }
  },
  tabs: {
    onUpdated: { addListener() {} },
    onRemoved: { addListener() {} },
    async create(tabInfo) {
      const tab = {
        id: harness.nextTabId++,
        url: tabInfo.url,
        status: 'complete',
        title: tabInfo.url
      }
      harness.createdTabs.push(structuredClone(tab))
      harness.tabs.set(tab.id, tab)
      return structuredClone(tab)
    },
    async get(tabId) {
      const tab = harness.tabs.get(tabId)
      if (!tab) {
        throw new Error(`Unknown tab ${tabId}`)
      }
      return structuredClone(tab)
    },
    async sendMessage() {
      return { ok: true }
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
  await wait(40)

  const hooks = globalThis.__timUiRecorderTestHooks
  if (!hooks) {
    throw new Error('Session guard test hooks were not exposed by background.js')
  }

  const results = []
  results.push(await runTest('Only Start New Test creates a browser tab', () => testStartNewTestCreatesTab(hooks)))
  results.push(await runTest('Start New Test writes diagnostic logs', () => testStartNewTestLogs(hooks)))
  results.push(await runTest('Start New Test failure does not leave half-created state', () => testStartNewTestFailure(hooks)))
  results.push(await runTest('Recorded step creation assigns a stable id', () => testRecordedStepCreationAssignsId(hooks)))
  results.push(await runTest('Selecting a test does not create a new tab', () => testSelectTestDoesNotCreateTab(hooks)))
  results.push(await runTest('Finish Test detaches the session without creating a tab', () => testFinishTestDoesNotCreateTab(hooks)))
  results.push(await runTest('Manual action creation stays in the current session', () => testActionCreationStaysInSession(hooks)))
  results.push(await runTest('Manual action creation assigns a stable id', () => testManualActionCreationAssignsId(hooks)))
  results.push(await runTest('Assertion mode and step edits do not create tabs', () => testAssertionAndEditStayInSession(hooks)))
  results.push(await runTest('Manual assertion creation assigns a stable id', () => testManualAssertionCreationAssignsId(hooks)))
  results.push(await runTest('Step edits preserve ids', () => testStepEditPreservesId(hooks)))
  results.push(await runTest('Step reordering preserves ids', () => testStepReorderPreservesIds(hooks)))
  results.push(await runTest('Duplicate Test regenerates copied step ids', () => testDuplicateTestRegeneratesStepIds(hooks)))
  results.push(await runTest('Stored scenarios missing step ids are repaired on load', () => testStoredScenarioRepairsMissingIds(hooks)))
  results.push(await runTest('Popup assertions stay in the current session', () => testPopupAssertionStaysInSession(hooks)))

  const failed = results.filter((result) => !result.ok)
  document.body.dataset.status = failed.length ? 'failed' : 'passed'
  output.textContent = results.map((result) => `${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? `\n${result.detail}` : ''}`).join('\n\n')
}

async function testStartNewTestCreatesTab(hooks) {
  resetHarness(hooks)
  const response = await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login',
    profileId: 'tim-ui-junit4-selenide',
    javaClassName: 'GeneratedTest'
  })

  const state = hooks.getState()
  assert(response.success === true, 'Start New Test should return success')
  assert(response.testId === state.activeTestId, 'Start New Test should return the created test id')
  assert(response.tabId === state.activeTabId, 'Start New Test should return the created tab id')
  assert(harness.createdTabs.length === 1, 'Start New Test should create exactly one tab')
  assert(state.activeTabId === harness.createdTabs[0].id, 'New test should attach the created tab as the controlled session tab')
  assert(state.recording === true, 'New test should attach recording to the newly created tab')
}

async function testStartNewTestLogs(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  const state = hooks.getState()
  const messages = (state.activityLog || []).map((entry) => entry.message)
  assert(messages.some((message) => message.includes('Start New Test handler received request')), 'Background should log handler receipt')
  assert(messages.some((message) => message.includes('Created test object')), 'Background should log test creation')
  assert(messages.some((message) => message.includes('Requesting new controlled tab')), 'Background should log tab request')
  assert(messages.some((message) => message.includes('Created controlled tab')), 'Background should log created tab id')
  assert(messages.some((message) => message.includes('Active test updated')), 'Background should log the active test update')
}

async function testStartNewTestFailure(hooks) {
  resetHarness(hooks)
  const originalCreate = window.chrome.tabs.create
  window.chrome.tabs.create = async () => {
    throw new Error('simulated tab failure')
  }

  try {
    let failed = false
    try {
      await hooks.handleMessage({
        type: 'START_NEW_TEST',
        startUrl: 'https://example.test/login'
      })
    } catch (error) {
      failed = true
      assert(String(error.message || error).includes('could not open a browser tab'), 'Failure should explain the tab creation problem')
    }

    const state = hooks.getState()
    assert(failed, 'Start New Test failure should throw through the background handler')
    assert(harness.createdTabs.length === 0, 'Failed Start New Test should not create a tab')
    assert(state.tests.length === 1, 'Failed Start New Test should not add a half-created test')
    assert((state.activityLog || []).some((entry) => entry.message.includes('Tab creation failed for Start New Test')), 'Failure should be logged in background activity log')
  } finally {
    window.chrome.tabs.create = originalCreate
  }
}

async function testRecordedStepCreationAssignsId(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  await hooks.handleMessage({
    type: 'RECORDED_STEP',
    step: {
      type: 'click',
      stage: 'test',
      description: 'Click save',
      selector: { primaryStrategy: 'text', primaryValue: 'Save' }
    }
  }, { tab: { id: harness.createdTabs[0].id } })

  const step = hooks.getState().scenario.orderedSteps[0]
  assert(/^step-\d+$/i.test(step.id), 'Recorded steps should be assigned a stable step id immediately')
}

async function testSelectTestDoesNotCreateTab(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })
  const stateAfterCreate = hooks.getState()
  const sourceTest = stateAfterCreate.tests[0]

  await hooks.handleMessage({
    type: 'DUPLICATE_TEST',
    testId: sourceTest.id
  })

  const duplicated = hooks.getState().tests.find((test) => test.id !== sourceTest.id)
  const createCountBeforeSelect = harness.createdTabs.length
  await hooks.handleMessage({
    type: 'STOP_RECORDING'
  })
  await hooks.handleMessage({
    type: 'SELECT_TEST',
    testId: duplicated.id
  })

  const state = hooks.getState()
  assert(harness.createdTabs.length === createCountBeforeSelect, 'Selecting a test should not create a tab')
  assert(state.activeTestId === duplicated.id, 'Selecting a test should switch the active test')
  assert(state.activeTabId == null, 'Detached duplicated test should remain detached after selection')
}

async function testAssertionAndEditStayInSession(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  await hooks.handleMessage({
    type: 'RECORDED_STEP',
    step: {
      type: 'click',
      stage: 'test',
      description: 'Click save',
      selector: { primaryStrategy: 'text', primaryValue: 'Save' }
    }
  }, { tab: { id: harness.createdTabs[0].id } })

  const createdBefore = harness.createdTabs.length
  await hooks.handleMessage({ type: 'SET_ASSERTION_MODE', enabled: true })
  await hooks.handleMessage({
    type: 'ASSERTION_TARGET_SELECTED',
    payload: {
      url: 'https://example.test/login',
      selector: { primaryStrategy: 'label', primaryValue: 'Username' },
      defaultExpectedValue: '',
      suggestions: [{ type: 'assert_visible' }]
    }
  }, { tab: { id: harness.createdTabs[0].id } })
  await hooks.handleMessage({
    type: 'CREATE_ASSERTION_STEP',
    assertionType: 'assert_visible',
    targetStrategy: 'label',
    targetValue: 'Username',
    expectedValue: '',
    timeoutMs: 5000
  })
  await hooks.handleMessage({
    type: 'SET_SELECTED_STEP',
    index: 0
  })
  await hooks.handleMessage({
    type: 'UPDATE_SELECTED_STEP',
    updates: {
      targetStrategy: 'placeholder',
      targetValue: 'Search',
      value: ''
    }
  })

  const state = hooks.getState()
  assert(harness.createdTabs.length === createdBefore, 'Assertion mode and step edits should not create additional tabs')
  assert(state.scenario.orderedSteps[0].selector.primaryStrategy === 'placeholder', 'Step target edits should be applied in-place')
  assert(state.scenario.orderedSteps[1].type === 'assert_visible', 'Assertion creation should add an assert step without opening a tab')
  assert(/^step-\d+$/i.test(state.scenario.orderedSteps[1].id), 'Assertion creation should assign a stable step id')
}

async function testActionCreationStaysInSession(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  const createdBefore = harness.createdTabs.length
  await hooks.handleMessage({
    type: 'SET_PICKER_MODE',
    enabled: true,
    kind: 'action',
    stepType: 'click'
  })
  await hooks.handleMessage({
    type: 'PICKER_TARGET_SELECTED',
    payload: {
      kind: 'action',
      stepType: 'click',
      url: 'https://example.test/login',
      selector: { primaryStrategy: 'text', primaryValue: 'Login' },
      timeoutMs: 5000
    }
  }, { tab: { id: harness.createdTabs[0].id } })
  await hooks.handleMessage({
    type: 'CREATE_ACTION_STEP',
    actionType: 'click',
    targetStrategy: 'text',
    targetValue: 'Login',
    actionValue: '',
    timeoutMs: 5000,
    note: ''
  })

  const state = hooks.getState()
  assert(harness.createdTabs.length === createdBefore, 'Manual action creation should not create an additional tab')
  assert(state.scenario.orderedSteps[0].type === 'click', 'Manual action creation should add an action step')
  assert(state.scenario.orderedSteps[0].origin === 'manual', 'Manual action step should be marked as manual')
  assert(/^step-\d+$/i.test(state.scenario.orderedSteps[0].id), 'Manual action creation should assign a stable step id')
}

async function testManualActionCreationAssignsId(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  await hooks.handleMessage({
    type: 'CREATE_ACTION_STEP',
    actionType: 'type',
    targetStrategy: 'label',
    targetValue: 'Username',
    actionValue: 'alice',
    timeoutMs: 5000,
    note: 'typed'
  })

  const step = hooks.getState().scenario.orderedSteps[0]
  assert(step.type === 'type', 'Manual action creation should store the requested type')
  assert(/^step-\d+$/i.test(step.id), 'Manual Add Action should assign a stable step id')
}

async function testFinishTestDoesNotCreateTab(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  const createdBefore = harness.createdTabs.length
  const activeBefore = hooks.getState().activeTestId
  const response = await hooks.handleMessage({ type: 'FINISH_TEST' })
  const state = hooks.getState()

  assert(response.success === true, 'Finish Test should return success')
  assert(harness.createdTabs.length === createdBefore, 'Finish Test should not create a new tab')
  assert(state.activeTestId === activeBefore, 'Finish Test should keep the saved test selected')
  assert(state.activeTabId == null, 'Finish Test should detach the controlled tab from recorder state')
  assert(state.tests[0].status === 'finished', 'Finish Test should mark the active test as finished')
}

async function testPopupAssertionStaysInSession(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  const createdBefore = harness.createdTabs.length
  await hooks.handleMessage({
    type: 'CREATE_ASSERTION_STEP',
    assertionType: 'assert_popup_text',
    targetStrategy: 'text',
    targetValue: '',
    expectedValue: 'Saved successfully',
    timeoutMs: 5000
  })

  const state = hooks.getState()
  assert(harness.createdTabs.length === createdBefore, 'Popup assertion creation should not create an additional tab')
  assert(state.scenario.orderedSteps[0].type === 'assert_popup_text', 'Popup assertion should be stored as an assert step')
  assert(state.scenario.orderedSteps[0].origin === 'manual', 'Popup assertion should be marked as manual')
  assert(/^step-\d+$/i.test(state.scenario.orderedSteps[0].id), 'Popup assertion creation should assign a stable step id')
}

async function testManualAssertionCreationAssignsId(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  await hooks.handleMessage({
    type: 'CREATE_ASSERTION_STEP',
    assertionType: 'assert_visible',
    targetStrategy: 'label',
    targetValue: 'Username',
    expectedValue: '',
    timeoutMs: 5000
  })

  const step = hooks.getState().scenario.orderedSteps[0]
  assert(step.type === 'assert_visible', 'Manual assertion creation should store the requested type')
  assert(/^step-\d+$/i.test(step.id), 'Manual Add Assertion should assign a stable step id')
}

async function testStepEditPreservesId(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  await hooks.handleMessage({
    type: 'CREATE_ACTION_STEP',
    actionType: 'click',
    targetStrategy: 'text',
    targetValue: 'Login',
    actionValue: '',
    timeoutMs: 5000,
    note: ''
  })
  await hooks.handleMessage({
    type: 'SET_SELECTED_STEP',
    index: 0
  })

  const beforeEditId = hooks.getState().scenario.orderedSteps[0].id
  await hooks.handleMessage({
    type: 'UPDATE_SELECTED_STEP',
    updates: {
      targetStrategy: 'label',
      targetValue: 'Sign in',
      value: '',
      note: 'edited'
    }
  })

  const afterEdit = hooks.getState().scenario.orderedSteps[0]
  assert(afterEdit.id === beforeEditId, 'Editing a step should preserve its existing id')
  assert(afterEdit.selector.primaryValue === 'Sign in', 'Editing should still update the selected step')
}

async function testStepReorderPreservesIds(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  await hooks.handleMessage({
    type: 'CREATE_ACTION_STEP',
    actionType: 'click',
    targetStrategy: 'text',
    targetValue: 'Login',
    actionValue: '',
    timeoutMs: 5000,
    note: ''
  })
  await hooks.handleMessage({
    type: 'CREATE_ACTION_STEP',
    actionType: 'type',
    targetStrategy: 'label',
    targetValue: 'Username',
    actionValue: 'alice',
    timeoutMs: 5000,
    note: ''
  })

  const beforeReorderIds = hooks.getState().scenario.orderedSteps.map((step) => step.id)
  await hooks.handleMessage({
    type: 'SET_SELECTED_STEP',
    index: 1
  })
  await hooks.handleMessage({
    type: 'MOVE_SELECTED_STEP',
    delta: -1
  })

  const afterReorderIds = hooks.getState().scenario.orderedSteps.map((step) => step.id)
  assert(afterReorderIds[0] === beforeReorderIds[1], 'Reordering should move the same step object to the new position')
  assert(afterReorderIds[1] === beforeReorderIds[0], 'Reordering should preserve the other step id too')
  assert(new Set(afterReorderIds).size === 2, 'Reordering should preserve unique ids without generating replacements')
}

async function testDuplicateTestRegeneratesStepIds(hooks) {
  resetHarness(hooks)
  await hooks.handleMessage({
    type: 'START_NEW_TEST',
    startUrl: 'https://example.test/login'
  })

  await hooks.handleMessage({
    type: 'CREATE_ACTION_STEP',
    actionType: 'click',
    targetStrategy: 'text',
    targetValue: 'Login',
    actionValue: '',
    timeoutMs: 5000,
    note: ''
  })
  await hooks.handleMessage({
    type: 'CREATE_ASSERTION_STEP',
    assertionType: 'assert_visible',
    targetStrategy: 'label',
    targetValue: 'Username',
    expectedValue: '',
    timeoutMs: 5000
  })

  const sourceState = hooks.getState()
  const sourceTest = sourceState.tests[0]
  const sourceIds = sourceTest.scenario.orderedSteps.map((step) => step.id)
  await hooks.handleMessage({ type: 'STOP_RECORDING' })
  await hooks.handleMessage({
    type: 'DUPLICATE_TEST',
    testId: sourceTest.id
  })

  const clone = hooks.getState().tests.find((test) => test.id !== sourceTest.id)
  const clonedIds = clone.scenario.orderedSteps.map((step) => step.id)
  assert(clonedIds.length === sourceIds.length, 'Duplicate Test should keep the same step count')
  assert(clonedIds.every((id, index) => id !== sourceIds[index]), 'Duplicate Test should regenerate copied step ids')
  assert(new Set(clonedIds).size === clonedIds.length, 'Duplicate Test should keep copied ids unique')
}

async function testStoredScenarioRepairsMissingIds(hooks) {
  resetHarness(hooks)
  hooks.resetStateForTests({
    activeTabId: 2,
    scenario: {
      metadata: {
        name: 'Imported scenario',
        profileId: 'tim-ui-junit4-selenide',
        sourceUrl: 'https://example.test/login'
      },
      variables: {},
      uploadAliases: {},
      orderedSteps: [
        {
          id: '',
          type: 'click',
          stage: 'test',
          description: 'Click Login',
          selector: { primaryStrategy: 'text', primaryValue: 'Login' }
        },
        {
          id: 'step-001',
          type: 'navigate',
          stage: 'test',
          description: 'Navigate',
          value: 'https://example.test/login',
          selector: { primaryStrategy: 'url', primaryValue: 'https://example.test/login' }
        },
        {
          id: '',
          type: 'assert_visible',
          stage: 'assertion',
          description: 'Expect Username',
          selector: { primaryStrategy: 'label', primaryValue: 'Username' }
        }
      ],
      notes: []
    }
  })

  const repairedIds = hooks.getState().scenario.orderedSteps.map((step) => step.id)
  assert(repairedIds[0] === 'step-002', 'Load normalization should repair the first missing id deterministically')
  assert(repairedIds[1] === 'step-001', 'Load normalization should preserve existing step ids')
  assert(repairedIds[2] === 'step-003', 'Load normalization should repair later missing ids deterministically')
}

function resetHarness(hooks) {
  harness.createdTabs = []
  harness.nextTabId = 2
  harness.tabs = new Map([
    [1, { id: 1, url: 'https://example.test/', status: 'complete', title: 'Example Test' }]
  ])
  hooks.resetStateForTests({})
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

async function runTest(name, work) {
  try {
    await work()
    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, detail: error.stack || error.message || String(error) }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
