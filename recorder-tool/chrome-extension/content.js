const recorderFlags = {
  recording: false,
  paused: false,
  assertionMode: false,
  pickerMode: null
}

const replayController = {
  sessionId: null,
  paused: false,
  stopped: false,
  status: 'idle',
  currentStepIndex: -1,
  totalSteps: 0
}

let lastDialog = null
const recentEvents = new Map()

installDialogProbe()

function emitDebugEvent(partial = {}) {
  const event = {
    id: partial.id || `content-debug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: partial.timestamp || new Date().toISOString(),
    source: partial.source || 'content',
    category: partial.category || 'general',
    actionType: partial.actionType || 'content-event',
    summary: String(partial.summary || ''),
    result: partial.error ? 'error' : (partial.result || 'success'),
    replayStepIndex: Number.isInteger(partial.replayStepIndex) ? partial.replayStepIndex : null,
    stepId: partial.stepId || null,
    error: partial.error ? String(partial.error) : null,
    details: Object.assign({
      pageUrl: window.location.href,
      pageTitle: document.title
    }, partial.details || {})
  }
  try {
    const response = chrome.runtime.sendMessage({ type: 'DEBUG_EVENT', event })
    if (response?.catch) {
      response.catch(() => {})
    }
  } catch (error) {
    void error
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_MODE') {
    recorderFlags.recording = Boolean(message.recording)
    recorderFlags.paused = Boolean(message.paused)
    recorderFlags.assertionMode = Boolean(message.assertionMode)
    recorderFlags.pickerMode = message.pickerMode || (message.assertionMode ? { kind: 'assertion', stepType: null } : null)
    sendResponse({ ok: true })
    return
  }
  if (message.type === 'REPLAY_CONTROL') {
    emitDebugEvent({
      category: 'replay',
      actionType: 'replay-control-received',
      summary: `Received replay control ${message.command || 'unknown'}`,
      result: 'success',
      replayStepIndex: Number.isInteger(message.currentStepIndex) ? message.currentStepIndex : null,
      details: {
        command: message.command || null,
        sessionId: message.sessionId || null,
        totalSteps: Number.isInteger(message.totalSteps) ? message.totalSteps : null
      }
    })
    sendResponse(handleReplayControl(message))
    return
  }
  if (message.type === 'REPLAY_EXECUTE_STEP' || message.type === 'EXECUTE_STEP') {
    emitDebugEvent({
      category: 'replay',
      actionType: 'replay-step-received',
      summary: `Received replay step ${Number(message.stepIndex) + 1}`,
      result: 'success',
      replayStepIndex: Number.isInteger(message.stepIndex) ? message.stepIndex : null,
      stepId: message.step?.id || null,
      details: {
        sessionId: message.sessionId || null,
        stepType: message.step?.type || null
      }
    })
    executeReplayMessage(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        type: 'REPLAY_ERROR',
        sessionId: message.sessionId || null,
        stepIndex: Number.isInteger(message.stepIndex) ? message.stepIndex : null,
        error: String(error)
      }))
    return true
  }
})

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'tim-ui-recorder') {
    return
  }
  if (event.data.type === 'dialog-opened') {
    lastDialog = event.data
  }
})

document.addEventListener('click', handleClick, true)
document.addEventListener('dblclick', handleDoubleClick, true)
document.addEventListener('contextmenu', handleContextMenu, true)
document.addEventListener('change', handleChange, true)
document.addEventListener('keydown', handleKeyDown, true)

function handleReplayControl(message) {
  if (message.sessionId && replayController.sessionId && message.sessionId !== replayController.sessionId) {
    return {
      ok: true,
      type: 'REPLAY_STATUS_UPDATE',
      sessionId: replayController.sessionId,
      status: replayController.status,
      paused: replayController.paused,
      stopped: replayController.stopped,
      currentStepIndex: replayController.currentStepIndex,
      totalSteps: replayController.totalSteps
    }
  }

  if (message.command === 'start') {
    replayController.sessionId = message.sessionId || replayController.sessionId
    replayController.currentStepIndex = Number.isInteger(message.currentStepIndex)
      ? message.currentStepIndex
      : replayController.currentStepIndex
    replayController.totalSteps = Number.isInteger(message.totalSteps)
      ? message.totalSteps
      : replayController.totalSteps
    replayController.paused = false
    replayController.stopped = false
    replayController.status = 'running'
  } else if (message.command === 'pause') {
    replayController.sessionId = message.sessionId || replayController.sessionId
    replayController.paused = true
    replayController.stopped = false
    replayController.currentStepIndex = Number.isInteger(message.currentStepIndex)
      ? message.currentStepIndex
      : replayController.currentStepIndex
    replayController.totalSteps = Number.isInteger(message.totalSteps)
      ? message.totalSteps
      : replayController.totalSteps
    replayController.status = 'paused'
  } else if (message.command === 'resume') {
    replayController.sessionId = message.sessionId || replayController.sessionId
    replayController.paused = false
    replayController.stopped = false
    replayController.currentStepIndex = Number.isInteger(message.currentStepIndex)
      ? message.currentStepIndex
      : replayController.currentStepIndex
    replayController.totalSteps = Number.isInteger(message.totalSteps)
      ? message.totalSteps
      : replayController.totalSteps
    replayController.status = 'running'
  } else if (message.command === 'stop') {
    replayController.sessionId = message.sessionId || replayController.sessionId
    replayController.paused = false
    replayController.stopped = true
    replayController.currentStepIndex = Number.isInteger(message.currentStepIndex)
      ? message.currentStepIndex
      : replayController.currentStepIndex
    replayController.totalSteps = Number.isInteger(message.totalSteps)
      ? message.totalSteps
      : replayController.totalSteps
    replayController.status = 'stopped'
  }

  return {
    ok: true,
    type: 'REPLAY_STATUS_UPDATE',
    sessionId: replayController.sessionId,
    status: replayController.status,
    paused: replayController.paused,
    stopped: replayController.stopped,
    currentStepIndex: replayController.currentStepIndex,
    totalSteps: replayController.totalSteps
  }
}

async function executeReplayMessage(message) {
  const replayContext = {
    sessionId: message.sessionId || null,
    stepIndex: Number.isInteger(message.stepIndex) ? message.stepIndex : -1,
    totalSteps: Number.isInteger(message.totalSteps) ? message.totalSteps : 0,
    mode: message.mode || 'local'
  }

  startReplayContext(replayContext)
  emitDebugEvent({
    category: 'replay',
    actionType: 'replay-step-started',
    summary: `Executing replay step ${replayContext.stepIndex + 1}`,
    result: 'success',
    replayStepIndex: replayContext.stepIndex,
    stepId: message.step?.id || null,
    details: {
      sessionId: replayContext.sessionId,
      stepType: message.step?.type || null
    }
  })
  const result = await executeStep(message.step, replayContext)
  return formatReplayResponse(result, message.step, replayContext)
}

function handleClick(event) {
  const target = event.target instanceof Element ? event.target : null
  if (!target || shouldIgnore(target)) {
    return
  }
  if (recorderFlags.pickerMode?.kind) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()
    selectPickerTarget(target, recorderFlags.pickerMode)
    return
  }
  if (!shouldRecord() || isFormValueControl(target)) {
    return
  }
  recordStep(buildStep('click', target, {
    description: `Click ${target.innerText?.trim() || target.getAttribute('aria-label') || target.tagName.toLowerCase()}`
  }))
}

function handleDoubleClick(event) {
  const target = event.target instanceof Element ? event.target : null
  if (!target || !shouldRecord() || shouldIgnore(target)) {
    return
  }
  recordStep(buildStep('double_click', target, {
    description: `Double click ${target.tagName.toLowerCase()}`
  }))
}

function handleContextMenu(event) {
  const target = event.target instanceof Element ? event.target : null
  if (!target || !shouldRecord() || shouldIgnore(target)) {
    return
  }
  recordStep(buildStep('right_click', target, {
    description: `Right click ${target.tagName.toLowerCase()}`
  }))
}

function handleChange(event) {
  const target = event.target instanceof Element ? event.target : null
  if (!target || !shouldRecord() || shouldIgnore(target)) {
    return
  }
  if (target instanceof HTMLInputElement && target.type === 'file') {
    const file = target.files?.[0]
    const alias = toAlias(file?.name || 'upload-file')
    recordStep(buildStep('upload_file', target, {
      description: `Upload ${file?.name || 'file'}`,
      uploadAlias: alias,
      fileNames: Array.from(target.files || []).map((item) => item.name),
      tags: ['ui', 'upload']
    }))
    return
  }
  if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
    recordStep(buildStep(target.type === 'checkbox' ? 'checkbox_set' : 'radio_set', target, {
      description: `${target.type === 'checkbox' ? 'Set checkbox' : 'Select radio'} ${target.name || target.id || ''}`,
      checked: target.checked
    }))
    return
  }
  if (target instanceof HTMLSelectElement) {
    recordStep(buildStep('select', target, {
      description: `Select ${target.value}`,
      value: target.value,
      optionText: target.selectedOptions?.[0]?.textContent?.trim() || ''
    }))
    return
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const eventKey = `${selectorKey(target)}::${target.value}`
    if (recentEvents.get(eventKey) && Date.now() - recentEvents.get(eventKey) < 250) {
      return
    }
    recentEvents.set(eventKey, Date.now())
    recordStep(buildStep('type', target, {
      description: `Type into ${target.name || target.id || target.tagName.toLowerCase()}`,
      value: target.value
    }))
  }
}

function handleKeyDown(event) {
  const target = event.target instanceof Element ? event.target : null
  if (!target || !shouldRecord() || shouldIgnore(target)) {
    return
  }
  if (!['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    return
  }
  recordStep(buildStep('press_key', target, {
    description: `Press ${event.key}`,
    key: event.key
  }))
}

function shouldRecord() {
  return recorderFlags.recording && !recorderFlags.paused && !recorderFlags.assertionMode
}

function shouldIgnore(target) {
  return target.closest('[data-tim-ui-recorder-ignore]') != null
}

function isFormValueControl(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

function recordStep(step) {
  emitDebugEvent({
    category: 'recorder',
    actionType: 'record-step-captured',
    summary: `Captured ${step.type} step from the page`,
    result: 'success',
    stepId: step.id || null,
    details: {
      stepType: step.type,
      target: `${step.selector?.primaryStrategy || 'selector'}:${step.selector?.primaryValue || ''}`.trim()
    }
  })
  chrome.runtime.sendMessage({ type: 'RECORDED_STEP', step })
}

function buildStep(type, target, overrides = {}) {
  const selector = buildSelector(target)
  return {
    id: '',
    type,
    stage: overrides.stage || 'test',
    description: overrides.description || type,
    note: '',
    timestamp: Date.now(),
    url: window.location.href,
    visibleText: selector.visibleText || '',
    value: overrides.value ?? null,
    expectedValue: overrides.expectedValue ?? null,
    key: overrides.key ?? null,
    optionText: overrides.optionText ?? null,
    checked: overrides.checked ?? null,
    enabled: !target.disabled,
    uploadAlias: overrides.uploadAlias ?? null,
    fileNames: overrides.fileNames ?? [],
    screenshotPath: null,
    todo: null,
    tags: overrides.tags || ['ui'],
    origin: 'recorded',
    mappingHints: [],
    selector,
    frameContext: buildFrameContext(),
    windowContext: {
      title: document.title,
      url: window.location.href,
      index: 0,
      handleName: document.title || window.location.href
    },
    waitStrategy: {
      kind: 'none',
      timeoutMs: 5000
    },
    extra: {}
  }
}

function buildSelector(target) {
  const snapshot = {
    elementTag: target.tagName.toLowerCase(),
    inputType: target instanceof HTMLInputElement ? target.type : '',
    id: target.id || null,
    name: target.getAttribute('name'),
    placeholder: target.getAttribute('placeholder'),
    ariaLabel: target.getAttribute('aria-label'),
    dataTestId: target.getAttribute('data-testid'),
    dataQa: target.getAttribute('data-qa'),
    semanticLabel: semanticLabel(target),
    visibleText: extractVisibleText(target),
    cssPath: cssPath(target),
    xpath: xpath(target),
    domPath: cssPath(target),
    classes: Array.from(target.classList || [])
  }
  const candidates = []
  pushCandidate(candidates, 'id', snapshot.id, 0.99, !looksDynamic(snapshot.id), 'Stable element id')
  pushCandidate(candidates, 'dataTestId', snapshot.dataTestId, 0.91, true, 'Explicit test id')
  pushCandidate(candidates, 'dataQa', snapshot.dataQa, 0.90, true, 'QA attribute')
  pushCandidate(candidates, 'name', snapshot.name, 0.88, !looksDynamic(snapshot.name), 'Element name')
  pushCandidate(candidates, 'placeholder', snapshot.placeholder, 0.87, true, 'Input placeholder')
  pushCandidate(candidates, 'ariaLabel', snapshot.ariaLabel, 0.86, true, 'Accessible label')
  pushCandidate(candidates, 'label', snapshot.semanticLabel, 0.82, true, 'Semantic label')
  pushCandidate(candidates, 'text', snapshot.visibleText, 0.76, snapshot.visibleText?.length < 60, 'Visible text')
  pushCandidate(candidates, 'css', snapshot.cssPath, 0.54, Boolean(snapshot.cssPath), 'CSS path fallback')
  pushCandidate(candidates, 'xpath', snapshot.xpath, 0.37, Boolean(snapshot.xpath), 'XPath fallback')
  candidates.sort((left, right) => right.confidenceScore - left.confidenceScore)
  const primary = candidates[0] || { strategy: 'css', value: snapshot.cssPath, confidenceScore: 0.1, explanation: 'Fallback' }
  primary.primary = true
  return {
    primaryStrategy: primary.strategy,
    primaryValue: primary.value,
    confidenceScore: primary.confidenceScore,
    explanation: primary.explanation,
    visibleText: snapshot.visibleText,
    elementTag: snapshot.elementTag,
    inputType: snapshot.inputType,
    id: snapshot.id,
    name: snapshot.name,
    placeholder: snapshot.placeholder,
    ariaLabel: snapshot.ariaLabel,
    dataTestId: snapshot.dataTestId,
    dataQa: snapshot.dataQa,
    semanticLabel: snapshot.semanticLabel,
    cssPath: snapshot.cssPath,
    xpath: snapshot.xpath,
    domPath: snapshot.domPath,
    classes: snapshot.classes,
    candidates
  }
}

function pushCandidate(candidates, strategy, value, baseScore, accepted, explanation) {
  if (!accepted || !value) {
    return
  }
  candidates.push({
    strategy,
    value,
    confidenceScore: looksDynamic(value) ? Math.max(0.1, baseScore - 0.3) : baseScore,
    explanation: `${explanation}${looksDynamic(value) ? ' (reduced confidence for dynamic token)' : ''}`,
    primary: false
  })
}

function looksDynamic(value) {
  if (!value) {
    return false
  }
  return /\d{4,}/.test(value) || /[a-f0-9]{10,}/i.test(value) || value.includes('__') || value.includes(':r')
}

function semanticLabel(target) {
  if (target.id) {
    const label = document.querySelector(`label[for="${cssEscape(target.id)}"]`)
    if (label) {
      return label.textContent?.trim() || ''
    }
  }
  const ancestorLabel = target.closest('label')
  if (ancestorLabel) {
    return ancestorLabel.textContent?.trim() || ''
  }
  return target.getAttribute('placeholder') || ''
}

function extractVisibleText(target) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.value || target.getAttribute('placeholder') || target.getAttribute('aria-label') || ''
  }
  return (target.innerText || target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120)
}

function buildFrameContext() {
  const selectors = []
  let sameOrigin = true
  try {
    let current = window
    while (current !== current.top) {
      const frame = current.frameElement
      if (!frame) {
        break
      }
      selectors.unshift(cssPath(frame))
      current = current.parent
    }
  } catch (error) {
    sameOrigin = false
  }
  return {
    frameSelectors: selectors,
    frameName: window.frameElement?.getAttribute('name') || null,
    sameOrigin
  }
}

function cssPath(element) {
  if (!(element instanceof Element)) {
    return ''
  }
  const parts = []
  let current = element
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    let selector = current.tagName.toLowerCase()
    if (current.id) {
      selector += `#${cssEscape(current.id)}`
      parts.unshift(selector)
      break
    }
    const classes = Array.from(current.classList).slice(0, 2).map(cssEscape)
    if (classes.length) {
      selector += '.' + classes.join('.')
    }
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current.tagName)
      if (siblings.length > 1) {
        selector += `:nth-of-type(${siblings.indexOf(current) + 1})`
      }
    }
    parts.unshift(selector)
    current = parent
  }
  parts.unshift('body')
  return parts.join(' > ')
}

function xpath(element) {
  if (!(element instanceof Element)) {
    return ''
  }
  if (element.id) {
    return `//*[@id="${element.id}"]`
  }
  const parts = []
  let current = element
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1
    let sibling = current.previousElementSibling
    while (sibling) {
      if (sibling.tagName === current.tagName) {
        index += 1
      }
      sibling = sibling.previousElementSibling
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`)
    current = current.parentElement
  }
  return '/' + parts.join('/')
}

function selectorKey(target) {
  return buildSelector(target).primaryValue || cssPath(target)
}

function toAlias(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, ' ').trim().split(/\s+/).map((part, index) => {
    if (index === 0) {
      return part.toLowerCase()
    }
    return part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase()
  }).join('')
}

function selectAssertionTarget(target) {
  selectPickerTarget(target, { kind: 'assertion', stepType: null })
}

function selectPickerTarget(target, pickerMode = {}) {
  const selector = buildSelector(target)
  const payload = {
    kind: pickerMode.kind || 'action',
    stepType: pickerMode.stepType || null,
    url: window.location.href,
    selector,
    frameContext: buildFrameContext(),
    windowContext: {
      title: document.title,
      url: window.location.href,
      index: 0,
      handleName: document.title || window.location.href
    },
    defaultExpectedValue: selector.visibleText || target.value || '',
    suggestions: assertionSuggestions(target, selector),
    timeoutMs: 5000
  }
  emitDebugEvent({
    category: 'picker',
    actionType: 'picker-target-picked',
    summary: `Picked a ${payload.kind} target from the page`,
    result: 'success',
    details: {
      kind: payload.kind,
      target: `${selector.primaryStrategy || 'selector'}:${selector.primaryValue || ''}`.trim()
    }
  })
  chrome.runtime.sendMessage({ type: 'PICKER_TARGET_SELECTED', payload })
}

function assertionSuggestions(target, selector) {
  const suggestions = [
    { type: 'assert_visible', label: 'Visible', expectedValue: '' },
    { type: 'assert_hidden', label: 'Not visible', expectedValue: '' },
    { type: 'assert_exists', label: 'Exists', expectedValue: '' },
    { type: 'assert_not_exists', label: 'Does not exist', expectedValue: '' }
  ]
  if (selector.visibleText) {
    suggestions.push({ type: 'assert_text_equals', label: 'Text equals', expectedValue: selector.visibleText })
    suggestions.push({ type: 'assert_text_contains', label: 'Text contains', expectedValue: selector.visibleText })
    suggestions.push({ type: 'assert_text_not_present', label: 'Text not present', expectedValue: selector.visibleText })
  }
  return suggestions
}

async function executeStep(step, replayContext = null) {
  const gate = await waitForReplayAccess(replayContext)
  if (!gate.ok) {
    return gate
  }

  if (step.type === 'wait') {
    return waitForCondition(step, replayContext)
  }
  if (step.type === 'assert_popup_present' || step.type === 'assert_alert_present') {
    return compare(Boolean(lastDialog), 'Assertion failed: popup dialog was not present')
  }
  if (step.type === 'assert_popup_text' || step.type === 'assert_alert_text') {
    const actualPopupText = lastDialog?.message || ''
    return compare(
      actualPopupText === (step.expectedValue || ''),
      `Assertion failed: expected popup text "${step.expectedValue || ''}" but got "${actualPopupText}"`
    )
  }
  if (step.type === 'accept_alert' || step.type === 'dismiss_alert') {
    return { ok: false, error: 'Native alert handling requires backend playback.' }
  }
  if (step.type === 'upload_file') {
    return { ok: false, error: 'File upload replay requires backend playback with alias mappings.' }
  }

  const documentContext = resolveDocument(step.frameContext)
  if (!documentContext.ok) {
    return documentContext
  }
  const doc = documentContext.doc
  const element = locateElement(doc, step.selector)
  const assertionType = String(step.type || '').startsWith('assert_')

  if (!element && !['assert_not_exists', 'assert_hidden'].includes(step.type)) {
    return {
      ok: false,
      error: assertionType
        ? buildMissingAssertionFailure(step)
        : `Element not found for ${step.selector?.primaryStrategy || 'selector'} ${step.selector?.primaryValue || ''}`.trim()
    }
  }

  switch (step.type) {
    case 'click':
      element.click()
      return { ok: true }
    case 'double_click':
      element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      return { ok: true }
    case 'right_click':
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
      return { ok: true }
    case 'type':
      element.focus()
      element.value = step.value || ''
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true }
    case 'clear':
      element.value = ''
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true }
    case 'press_key':
      element.dispatchEvent(new KeyboardEvent('keydown', { key: step.key || 'Enter', bubbles: true }))
      element.dispatchEvent(new KeyboardEvent('keyup', { key: step.key || 'Enter', bubbles: true }))
      return { ok: true }
    case 'select':
      element.value = step.value || ''
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true }
    case 'checkbox_set':
      element.checked = Boolean(step.checked)
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true }
    case 'radio_set':
      element.checked = true
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true }
    case 'assert_text_equals': {
      const actualText = readElementText(element)
      return compare(
        actualText === (step.expectedValue || ''),
        `Assertion failed: expected text "${step.expectedValue || ''}" but got "${actualText}"`
      )
    }
    case 'assert_text_contains': {
      const actualText = readElementText(element)
      return compare(
        actualText.includes(step.expectedValue || ''),
        `Assertion failed: expected text "${step.expectedValue || ''}" to be present but got "${actualText}"`
      )
    }
    case 'assert_text_not_present': {
      const actualText = readElementText(element)
      return compare(
        !actualText.includes(step.expectedValue || ''),
        `Assertion failed: expected text "${step.expectedValue || ''}" NOT to be present but got "${actualText}"`
      )
    }
    case 'assert_visible':
      return compare(isVisible(element), `Assertion failed: ${describeAssertionTarget(step)} was not visible`)
    case 'assert_hidden':
      return compare(!element || !isVisible(element), `Assertion failed: ${describeAssertionTarget(step)} should not be visible`)
    case 'assert_exists':
      return compare(Boolean(element), `Assertion failed: ${describeAssertionTarget(step)} did not exist`)
    case 'assert_not_exists':
      return compare(!element, `Assertion failed: ${describeAssertionTarget(step)} should not exist but was found`)
    case 'assert_enabled':
      return compare(!element.disabled, `Assertion failed: ${describeAssertionTarget(step)} was disabled`)
    case 'assert_disabled':
      return compare(Boolean(element.disabled), `Assertion failed: ${describeAssertionTarget(step)} was enabled`)
    case 'assert_value_equals': {
      const actualValue = element.value || ''
      return compare(
        actualValue === (step.expectedValue || ''),
        `Assertion failed: expected value "${step.expectedValue || ''}" but got "${actualValue}"`
      )
    }
    case 'assert_url_contains':
      return compare(
        window.location.href.includes(step.expectedValue || ''),
        `Assertion failed: expected URL to contain "${step.expectedValue || ''}" but got "${window.location.href}"`
      )
    default:
      return { ok: true }
  }
}

function startReplayContext(replayContext) {
  if (!replayContext?.sessionId) {
    return
  }
  const isNewSession = replayController.sessionId !== replayContext.sessionId
  replayController.sessionId = replayContext.sessionId
  replayController.currentStepIndex = replayContext.stepIndex
  replayController.totalSteps = replayContext.totalSteps
  replayController.stopped = false
  if (isNewSession) {
    replayController.paused = false
  }
  replayController.status = replayController.paused ? 'paused' : 'running'
}

function formatReplayResponse(result, step, replayContext) {
  const base = {
    ok: Boolean(result?.ok),
    sessionId: replayContext.sessionId,
    stepIndex: replayContext.stepIndex,
    totalSteps: replayContext.totalSteps,
    stepId: step?.id || null,
    stepType: step?.type || null
  }

  if (result?.ok) {
    replayController.status = 'running'
    emitDebugEvent({
      category: 'replay',
      actionType: 'replay-step-succeeded',
      summary: `Replay step ${replayContext.stepIndex + 1} completed`,
      result: 'success',
      replayStepIndex: replayContext.stepIndex,
      stepId: step?.id || null,
      details: {
        sessionId: replayContext.sessionId,
        stepType: step?.type || null
      }
    })
    return Object.assign(base, {
      type: 'REPLAY_STEP_RESULT'
    }, result)
  }

  const error = result?.error || 'Replay step failed'
  if (result?.aborted) {
    replayController.status = replayController.stopped ? 'stopped' : 'paused'
  } else {
    replayController.status = 'failed'
  }
  emitDebugEvent({
    category: 'replay',
    actionType: result?.aborted ? 'replay-step-aborted' : 'replay-step-failed',
    summary: result?.aborted
      ? `Replay step ${replayContext.stepIndex + 1} was interrupted`
      : `Replay step ${replayContext.stepIndex + 1} failed`,
    result: result?.aborted ? 'warning' : 'error',
    replayStepIndex: replayContext.stepIndex,
    stepId: step?.id || null,
    error,
    details: {
      sessionId: replayContext.sessionId,
      stepType: step?.type || null,
      aborted: Boolean(result?.aborted)
    }
  })

  return Object.assign(base, {
    ok: false,
    type: 'REPLAY_ERROR',
    error,
    aborted: Boolean(result?.aborted)
  }, result)
}

async function waitForReplayAccess(replayContext) {
  if (!replayContext?.sessionId) {
    return { ok: true }
  }

  while (true) {
    if (replayController.sessionId && replayController.sessionId !== replayContext.sessionId) {
      return { ok: false, error: 'Replay session changed while executing the step', aborted: true }
    }
    if (replayController.stopped) {
      return { ok: false, error: 'Replay stopped', aborted: true }
    }
    if (!replayController.paused) {
      return { ok: true }
    }
    replayController.status = 'paused'
    await sleep(100)
  }
}

async function sleepInterruptible(ms, replayContext) {
  let remaining = Number(ms) || 0
  while (remaining > 0) {
    const gate = await waitForReplayAccess(replayContext)
    if (!gate.ok) {
      return gate
    }
    const slice = Math.min(100, remaining)
    await sleep(slice)
    remaining -= slice
  }
  return { ok: true }
}

async function waitForCondition(step, replayContext = null) {
  const timeoutMs = Number(step.waitStrategy?.timeoutMs || 5000)
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const gate = await waitForReplayAccess(replayContext)
    if (!gate.ok) {
      return gate
    }
    const documentContext = resolveDocument(step.frameContext)
    if (!documentContext.ok) {
      return documentContext
    }
    const doc = documentContext.doc
    const element = locateElement(doc, step.selector)
    const kind = step.waitStrategy?.kind || 'none'
    if (kind === 'visible' && element && isVisible(element)) {
      return { ok: true }
    }
    if (kind === 'clickable' && element && isVisible(element) && !element.disabled) {
      return { ok: true }
    }
    if (kind === 'exists' && element) {
      return { ok: true }
    }
    if (kind === 'hidden' && (!element || !isVisible(element))) {
      return { ok: true }
    }
    if (kind === 'disappear' && !element) {
      return { ok: true }
    }
    if (kind === 'text_contains' && element && (element.innerText || element.textContent || '').trim().includes(step.waitStrategy.expectedText || '')) {
      return { ok: true }
    }
    if (kind === 'value_equals' && element && (element.value || '') === (step.waitStrategy.expectedValue || '')) {
      return { ok: true }
    }
    if (kind === 'enabled' && element && !element.disabled) {
      return { ok: true }
    }
    if (kind === 'disabled' && element && Boolean(element.disabled)) {
      return { ok: true }
    }
    if (kind === 'url_change' && window.location.href.includes(step.waitStrategy.expectedUrlFragment || '')) {
      return { ok: true }
    }
    if (kind === 'alert_present' && lastDialog) {
      return { ok: true }
    }
    const delayResult = await sleepInterruptible(200, replayContext)
    if (!delayResult.ok) {
      return delayResult
    }
  }
  return { ok: false, error: 'Wait timed out' }
}

function resolveDocument(frameContext) {
  let currentDocument = document
  const selectors = frameContext?.frameSelectors || []
  try {
    for (const selector of selectors) {
      const frame = currentDocument.querySelector(selector)
      if (!frame || !frame.contentWindow) {
        return { ok: false, error: `Frame not found: ${selector}` }
      }
      currentDocument = frame.contentWindow.document
    }
    return { ok: true, doc: currentDocument }
  } catch (error) {
    return { ok: false, error: `Failed to resolve frame context: ${String(error)}` }
  }
}

function locateElement(doc, selector) {
  if (!selector) {
    return null
  }
  const candidates = Array.isArray(selector.candidates) && selector.candidates.length
    ? selector.candidates
    : [{ strategy: selector.primaryStrategy, value: selector.primaryValue }]
  for (const candidate of candidates) {
    try {
      const found = locateCandidate(doc, candidate)
      if (found) {
        return found
      }
    } catch (error) {
      void error
    }
  }
  return null
}

function locateCandidate(doc, candidate) {
  switch (candidate.strategy) {
    case 'id':
      return doc.getElementById(candidate.value)
    case 'name':
      return doc.querySelector(`[name="${cssEscape(candidate.value)}"]`)
    case 'placeholder':
      return doc.querySelector(`[placeholder="${cssEscape(candidate.value)}"]`)
    case 'dataTestId':
      return doc.querySelector(`[data-testid="${cssEscape(candidate.value)}"]`)
    case 'dataQa':
      return doc.querySelector(`[data-qa="${cssEscape(candidate.value)}"]`)
    case 'ariaLabel':
      return doc.querySelector(`[aria-label="${cssEscape(candidate.value)}"]`)
    case 'label': {
      const label = Array.from(doc.querySelectorAll('label')).find((item) => item.textContent?.trim() === candidate.value)
      if (label?.htmlFor) {
        return doc.getElementById(label.htmlFor)
      }
      return label
    }
    case 'text':
      return Array.from(doc.querySelectorAll('body *')).find((item) => (item.innerText || item.textContent || '').trim().includes(candidate.value))
    case 'xpath':
      return doc.evaluate(candidate.value, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
    case 'css':
      return doc.querySelector(candidate.value)
    default:
      return null
  }
}

function isVisible(element) {
  const style = getComputedStyle(element)
  return !!(element.offsetParent || element.getClientRects().length) && style.visibility !== 'hidden' && style.display !== 'none'
}

function readElementText(element) {
  return (element?.innerText || element?.textContent || '').trim()
}

function describeAssertionTarget(step) {
  const summary = describeSelector(step.selector)
  if (summary) {
    return `element with ${summary}`
  }
  return 'selected element'
}

function describeSelector(selector) {
  const strategy = String(selector?.primaryStrategy || '').trim()
  const value = String(selector?.primaryValue || selector?.visibleText || '').trim()
  if (!strategy || !value) {
    return ''
  }

  switch (strategy) {
    case 'text':
      return `text "${value}"`
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
      return `css selector "${value}"`
    case 'xpath':
      return `xpath "${value}"`
    default:
      return `"${value}"`
  }
}

function buildMissingAssertionFailure(step) {
  switch (step.type) {
    case 'assert_visible':
      return `Assertion failed: ${describeAssertionTarget(step)} was not visible`
    case 'assert_exists':
      return `Assertion failed: ${describeAssertionTarget(step)} did not exist`
    case 'assert_text_equals':
    case 'assert_text_contains':
    case 'assert_text_not_present':
      return `Assertion failed: ${describeAssertionTarget(step)} was not found while checking its text`
    case 'assert_value_equals':
      return `Assertion failed: ${describeAssertionTarget(step)} was not found while checking its value`
    case 'assert_enabled':
    case 'assert_disabled':
      return `Assertion failed: ${describeAssertionTarget(step)} was not found`
    default:
      return `Assertion failed: ${describeAssertionTarget(step)} was not found`
  }
}

function compare(condition, error) {
  return condition ? { ok: true } : { ok: false, error }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value)
  }
  return String(value).replace(/["\\]/g, '\\$&')
}

function installDialogProbe() {
  if (window.top !== window) {
    return
  }
  const script = document.createElement('script')
  script.textContent = `
    (() => {
      if (window.__timUiRecorderDialogProbeInstalled) return;
      window.__timUiRecorderDialogProbeInstalled = true;
      const wrap = (kind, original) => function (...args) {
        window.postMessage({ source: 'tim-ui-recorder', type: 'dialog-opened', kind, message: args[0] || '' }, '*');
        return original.apply(this, args);
      };
      window.alert = wrap('alert', window.alert);
      window.confirm = wrap('confirm', window.confirm);
      window.prompt = wrap('prompt', window.prompt);
    })();
  `
  ;(document.documentElement || document.head || document.body).appendChild(script)
  script.remove()
}
