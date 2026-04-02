(function initializeScenarioStepIds(globalScope) {
  function normalizeStepIdValue(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  function parseStepIdNumber(value) {
    const match = /^step-(\d+)$/i.exec(normalizeStepIdValue(value))
    return match ? Number(match[1]) : null
  }

  function formatStepId(number) {
    const safeNumber = Number.isFinite(number) && number > 0 ? Math.floor(number) : 1
    return `step-${String(safeNumber).padStart(3, '0')}`
  }

  function ensureOrderedStepIds(orderedSteps, options = {}) {
    const steps = Array.isArray(orderedSteps) ? orderedSteps : []
    const knownIds = new Map()
    let maxNumericId = 0

    steps.forEach((step) => {
      const stepId = normalizeStepIdValue(step?.id)
      if (!stepId) {
        return
      }
      knownIds.set(stepId, (knownIds.get(stepId) || 0) + 1)
      const parsedNumber = parseStepIdNumber(stepId)
      if (parsedNumber != null) {
        maxNumericId = Math.max(maxNumericId, parsedNumber)
      }
    })

    const preservedIds = new Set()
    const repairs = []

    steps.forEach((step, index) => {
      if (!step || typeof step !== 'object') {
        return
      }

      const currentId = normalizeStepIdValue(step.id)
      const duplicatedId = currentId && knownIds.get(currentId) > 1
      const keepCurrentId = !options.regenerateAll && currentId && (!duplicatedId || !preservedIds.has(currentId))

      if (keepCurrentId) {
        step.id = currentId
        preservedIds.add(currentId)
        return
      }

      let nextId = ''
      do {
        maxNumericId += 1
        nextId = formatStepId(maxNumericId)
      } while (preservedIds.has(nextId) || knownIds.has(nextId))

      step.id = nextId
      preservedIds.add(nextId)
      repairs.push({
        index,
        previousId: currentId || null,
        nextId,
        reason: currentId
          ? (options.regenerateAll ? 'regenerated' : 'duplicate')
          : 'missing'
      })
    })

    return repairs
  }

  function ensureScenarioStepIds(scenario, options = {}) {
    return ensureOrderedStepIds(scenario?.orderedSteps, options)
  }

  function ensureScenarioDocumentStepIds(documentState, options = {}) {
    const orderedSteps = []
    ;['setup', 'steps', 'assertions', 'cleanup'].forEach((groupKey) => {
      const group = Array.isArray(documentState?.[groupKey]) ? documentState[groupKey] : []
      group.forEach((step) => orderedSteps.push(step))
    })
    return ensureOrderedStepIds(orderedSteps, options)
  }

  globalScope.TimUiRecorderStepIds = Object.freeze({
    normalizeStepIdValue,
    parseStepIdNumber,
    formatStepId,
    ensureOrderedStepIds,
    ensureScenarioStepIds,
    ensureScenarioDocumentStepIds
  })
})(typeof self !== 'undefined' ? self : globalThis)
