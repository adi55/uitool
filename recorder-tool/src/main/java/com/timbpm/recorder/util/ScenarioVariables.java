package com.timbpm.recorder.util;

import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioMetadata;
import com.timbpm.recorder.model.ScenarioStep;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ScenarioVariables {
    private static final Pattern EXACT_REFERENCE = Pattern.compile("^\\s*\\{\\{\\s*([A-Za-z0-9_.-]+)\\s*}}\\s*$");

    private ScenarioVariables() {
    }

    public static Map<String, VariableDefinition> definitions(ScenarioDocument scenario) {
        Map<String, VariableDefinition> definitions = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : scenario.getVariables().entrySet()) {
            definitions.put(entry.getKey(), parseDefinition(entry.getKey(), entry.getValue()));
        }
        return definitions;
    }

    public static String extractReferenceName(String text) {
        if (text == null) {
            return null;
        }
        Matcher matcher = EXACT_REFERENCE.matcher(text);
        return matcher.matches() ? matcher.group(1) : null;
    }

    public static String resolveValue(String rawValue, Map<String, VariableDefinition> definitions, Map<String, String> runtimeOverrides) {
        String referenceName = extractReferenceName(rawValue);
        if (referenceName == null) {
            return rawValue;
        }
        VariableDefinition definition = definitions.get(referenceName);
        if (definition == null) {
            return rawValue;
        }
        return definition.resolve(runtimeOverrides);
    }

    public static ScenarioDocument resolveScenario(ScenarioDocument source, Map<String, String> runtimeOverrides) {
        ScenarioDocument resolved = ScenarioDocument.fromMap(source.toMap());
        Map<String, VariableDefinition> definitions = definitions(source);
        ScenarioMetadata metadata = resolved.getMetadata();
        metadata.setBaseUrl(resolveValue(metadata.getBaseUrl(), definitions, runtimeOverrides));
        metadata.setSourceUrl(resolveValue(metadata.getSourceUrl(), definitions, runtimeOverrides));
        metadata.setDescription(resolveValue(metadata.getDescription(), definitions, runtimeOverrides));
        for (ScenarioStep step : resolved.orderedSteps()) {
            step.setDescription(resolveValue(step.getDescription(), definitions, runtimeOverrides));
            step.setUrl(resolveValue(step.getUrl(), definitions, runtimeOverrides));
            step.setVisibleText(resolveValue(step.getVisibleText(), definitions, runtimeOverrides));
            step.setValue(resolveValue(step.getValue(), definitions, runtimeOverrides));
            step.setExpectedValue(resolveValue(step.getExpectedValue(), definitions, runtimeOverrides));
            step.setKey(resolveValue(step.getKey(), definitions, runtimeOverrides));
            step.setOptionText(resolveValue(step.getOptionText(), definitions, runtimeOverrides));
            step.setUploadAlias(resolveValue(step.getUploadAlias(), definitions, runtimeOverrides));
            if (step.getWaitStrategy() != null) {
                step.getWaitStrategy().setTargetSelector(resolveValue(step.getWaitStrategy().getTargetSelector(), definitions, runtimeOverrides));
                step.getWaitStrategy().setExpectedUrlFragment(resolveValue(step.getWaitStrategy().getExpectedUrlFragment(), definitions, runtimeOverrides));
                step.getWaitStrategy().setExpectedText(resolveValue(step.getWaitStrategy().getExpectedText(), definitions, runtimeOverrides));
                step.getWaitStrategy().setExpectedValue(resolveValue(step.getWaitStrategy().getExpectedValue(), definitions, runtimeOverrides));
                step.getWaitStrategy().setCustomHelper(resolveValue(step.getWaitStrategy().getCustomHelper(), definitions, runtimeOverrides));
                step.getWaitStrategy().setNotes(resolveValue(step.getWaitStrategy().getNotes(), definitions, runtimeOverrides));
            }
        }
        for (Map.Entry<String, VariableDefinition> entry : definitions.entrySet()) {
            resolved.getVariables().put(entry.getKey(), entry.getValue().resolve(runtimeOverrides));
        }
        return resolved;
    }

    private static VariableDefinition parseDefinition(String name, Object rawValue) {
        if (rawValue instanceof Map<?, ?> rawMap) {
            Map<String, Object> map = DataAccess.map(rawMap);
            String source = DataAccess.string(map, "source", "literal");
            String environmentName = DataAccess.string(map, "name", null);
            String defaultValue = DataAccess.string(map, "defaultValue", DataAccess.string(map, "default", null));
            boolean sensitive = DataAccess.bool(map, "sensitive", false);
            return new VariableDefinition(name, source, environmentName, defaultValue, null, sensitive);
        }
        String literalValue = rawValue == null ? null : String.valueOf(rawValue);
        return new VariableDefinition(name, "literal", null, null, literalValue, false);
    }

    public record VariableDefinition(
        String key,
        String source,
        String environmentName,
        String defaultValue,
        String literalValue,
        boolean sensitive
    ) {
        public boolean usesEnvironment() {
            return "env".equalsIgnoreCase(source);
        }

        public String resolve(Map<String, String> runtimeOverrides) {
            if (runtimeOverrides != null) {
                String overridden = runtimeOverrides.get(key);
                if (overridden != null && !overridden.isBlank()) {
                    return overridden;
                }
            }
            if (usesEnvironment() && environmentName != null && !environmentName.isBlank()) {
                String environmentValue = System.getenv(environmentName);
                if (environmentValue != null && !environmentValue.isBlank()) {
                    return environmentValue;
                }
                return defaultValue == null ? "" : defaultValue;
            }
            return literalValue == null ? "" : literalValue;
        }
    }
}
