package com.timbpm.recorder.validation;

import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.model.StepType;
import com.timbpm.recorder.model.WaitKind;
import com.timbpm.recorder.util.ScenarioVariables;
import com.timbpm.recorder.util.ScenarioVariables.VariableDefinition;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class ScenarioValidator {
    public ScenarioValidationResult validate(ScenarioDocument scenario) {
        ScenarioValidationResult result = new ScenarioValidationResult();
        if (scenario == null) {
            result.addError("scenario", "Scenario document is required.");
            return result;
        }

        if (scenario.getMetadata() == null) {
            result.addError("metadata", "Scenario metadata is required.");
            return result;
        }

        if (isBlank(scenario.getMetadata().getScenarioId())) {
            result.addWarning("metadata.scenarioId", "Scenario id is missing.");
        }
        if (isBlank(scenario.getMetadata().getName())) {
            result.addError("metadata.name", "Scenario name is required.");
        }
        if (isBlank(scenario.getMetadata().getProfileId())) {
            result.addError("metadata.profileId", "Framework profile id is required.");
        }

        Map<String, VariableDefinition> variableDefinitions = ScenarioVariables.definitions(scenario);
        validateVariables(variableDefinitions, result);

        List<ScenarioStep> orderedSteps = scenario.orderedSteps();
        if (orderedSteps.isEmpty()) {
            result.addError("steps", "At least one setup/test/assertion/cleanup step is required.");
        }

        Set<String> stepIds = new HashSet<>();
        int index = 0;
        for (ScenarioStep step : orderedSteps) {
            validateStep(step, "orderedSteps[" + index + "]", stepIds, variableDefinitions, result);
            index++;
        }
        return result;
    }

    private void validateVariables(Map<String, VariableDefinition> variableDefinitions, ScenarioValidationResult result) {
        for (Map.Entry<String, VariableDefinition> entry : variableDefinitions.entrySet()) {
            String key = entry.getKey();
            VariableDefinition definition = entry.getValue();
            if (isBlank(key)) {
                result.addError("variables", "Variable name cannot be blank.");
                continue;
            }
            if (definition.usesEnvironment() && isBlank(definition.environmentName())) {
                result.addError("variables." + key, "Environment-backed variables require a non-empty name.");
            }
            if (!definition.usesEnvironment() && definition.literalValue() == null) {
                result.addWarning("variables." + key, "Variable has no literal value.");
            }
        }
    }

    private void validateStep(
        ScenarioStep step,
        String path,
        Set<String> stepIds,
        Map<String, VariableDefinition> variableDefinitions,
        ScenarioValidationResult result
    ) {
        if (step == null) {
            result.addError(path, "Step must not be null.");
            return;
        }
        if (isBlank(step.getId())) {
            result.addError(path + ".id", "Step id is required.");
        } else if (!stepIds.add(step.getId())) {
            result.addError(path + ".id", "Step id must be unique: " + step.getId());
        }
        if (step.getType() == null) {
            result.addError(path + ".type", "Step type is required.");
            return;
        }
        if (step.getStage() == null) {
            result.addError(path + ".stage", "Step stage is required.");
        }

        checkVariableReference(path + ".url", step.getUrl(), variableDefinitions, result);
        checkVariableReference(path + ".value", step.getValue(), variableDefinitions, result);
        checkVariableReference(path + ".expectedValue", step.getExpectedValue(), variableDefinitions, result);
        checkVariableReference(path + ".key", step.getKey(), variableDefinitions, result);
        checkVariableReference(path + ".optionText", step.getOptionText(), variableDefinitions, result);

        if (requiresSelector(step.getType()) && !hasUsableSelector(step)) {
            result.addError(path + ".selector", "A selector is required for step type " + step.getType() + ".");
        }
        if (step.getSelector() != null && step.getSelector().getPrimaryStrategy() != null && isBlank(step.getSelector().getPrimaryValue())) {
            result.addError(path + ".selector.primaryValue", "Primary selector value is required when a strategy is defined.");
        }
        if (step.getSelector() != null && (step.getSelector().getConfidenceScore() < 0.0 || step.getSelector().getConfidenceScore() > 1.0)) {
            result.addWarning(path + ".selector.confidenceScore", "Selector confidence score should be between 0.0 and 1.0.");
        }

        switch (step.getType()) {
            case NAVIGATE -> requireNonBlank(step.getValue(), path + ".value", "Navigation steps require a target URL.", result);
            case TYPE, SELECT -> requireNonBlank(step.getValue(), path + ".value", step.getType() + " steps require a value.", result);
            case PRESS_KEY -> requireNonBlank(step.getKey(), path + ".key", "Key press steps require a key.", result);
            case CHECKBOX_SET -> {
                if (step.getChecked() == null) {
                    result.addError(path + ".checked", "Checkbox steps require the checked flag.");
                }
            }
            case UPLOAD_FILE -> {
                if (isBlank(step.getUploadAlias()) && step.getFileNames().isEmpty()) {
                    result.addError(path + ".uploadAlias", "Upload steps require an upload alias or recorded file name.");
                }
            }
            case WAIT -> validateWaitStrategy(step, path, variableDefinitions, result);
            case ASSERT_TEXT_EQUALS, ASSERT_TEXT_CONTAINS, ASSERT_VALUE_EQUALS, ASSERT_URL_CONTAINS, ASSERT_ALERT_TEXT ->
                requireNonBlank(step.getExpectedValue(), path + ".expectedValue", step.getType() + " steps require an expected value.", result);
            default -> {
            }
        }
    }

    private void validateWaitStrategy(
        ScenarioStep step,
        String path,
        Map<String, VariableDefinition> variableDefinitions,
        ScenarioValidationResult result
    ) {
        if (step.getWaitStrategy() == null) {
            result.addError(path + ".waitStrategy", "Wait steps require a wait strategy.");
            return;
        }
        WaitKind kind = step.getWaitStrategy().getKind();
        if (kind == null || kind == WaitKind.NONE) {
            result.addError(path + ".waitStrategy.kind", "Wait steps require a concrete wait kind.");
            return;
        }
        checkVariableReference(path + ".waitStrategy.expectedUrlFragment", step.getWaitStrategy().getExpectedUrlFragment(), variableDefinitions, result);
        checkVariableReference(path + ".waitStrategy.expectedText", step.getWaitStrategy().getExpectedText(), variableDefinitions, result);
        checkVariableReference(path + ".waitStrategy.expectedValue", step.getWaitStrategy().getExpectedValue(), variableDefinitions, result);
        switch (kind) {
            case URL_CHANGE -> requireNonBlank(
                step.getWaitStrategy().getExpectedUrlFragment(),
                path + ".waitStrategy.expectedUrlFragment",
                "URL change waits require an expected URL fragment.",
                result
            );
            case COLLECTION_SIZE -> {
                if (step.getWaitStrategy().getCollectionSize() == null) {
                    result.addError(path + ".waitStrategy.collectionSize", "Collection waits require a collection size.");
                }
            }
            case TEXT_CONTAINS -> requireNonBlank(
                step.getWaitStrategy().getExpectedText(),
                path + ".waitStrategy.expectedText",
                "Text waits require expected text.",
                result
            );
            case VALUE_EQUALS -> requireNonBlank(
                step.getWaitStrategy().getExpectedValue(),
                path + ".waitStrategy.expectedValue",
                "Value waits require an expected value.",
                result
            );
            case CUSTOM_HELPER -> requireNonBlank(
                step.getWaitStrategy().getCustomHelper(),
                path + ".waitStrategy.customHelper",
                "Custom helper waits require a helper name.",
                result
            );
            default -> {
            }
        }
    }

    private void checkVariableReference(
        String path,
        String rawValue,
        Map<String, VariableDefinition> variableDefinitions,
        ScenarioValidationResult result
    ) {
        String referenceName = ScenarioVariables.extractReferenceName(rawValue);
        if (referenceName != null && !variableDefinitions.containsKey(referenceName)) {
            result.addError(path, "Unknown variable reference: " + referenceName);
        }
    }

    private void requireNonBlank(String value, String path, String message, ScenarioValidationResult result) {
        if (isBlank(value)) {
            result.addError(path, message);
        }
    }

    private boolean requiresSelector(StepType type) {
        return switch (type) {
            case CLICK, DOUBLE_CLICK, RIGHT_CLICK, TYPE, CLEAR, PRESS_KEY, SELECT,
                CHECKBOX_SET, RADIO_SET, SWITCH_FRAME, UPLOAD_FILE,
                ASSERT_TEXT_EQUALS, ASSERT_TEXT_CONTAINS, ASSERT_VISIBLE, ASSERT_HIDDEN,
                ASSERT_EXISTS, ASSERT_NOT_EXISTS, ASSERT_ENABLED, ASSERT_DISABLED, ASSERT_VALUE_EQUALS -> true;
            default -> false;
        };
    }

    private boolean hasUsableSelector(ScenarioStep step) {
        if (step.getSelector() == null) {
            return false;
        }
        if (!isBlank(step.getSelector().getPrimaryStrategy()) && !isBlank(step.getSelector().getPrimaryValue())) {
            return true;
        }
        return !step.getSelector().getCandidates().isEmpty();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
