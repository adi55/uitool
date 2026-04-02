package com.timbpm.recorder.generator;

import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.model.SelectorMetadata;
import com.timbpm.recorder.model.StepType;
import com.timbpm.recorder.profile.FrameworkProfile;
import com.timbpm.recorder.util.ScenarioVariables;
import com.timbpm.recorder.util.ScenarioVariables.VariableDefinition;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class JavaTestGenerator {
    public GeneratedJavaFile generate(ScenarioDocument scenario, FrameworkProfile profile, Path outputRoot, String requestedClassName) {
        String packageName = profile.getOrDefault("java.package", "com.timbpm.generated.ui");
        String className = sanitizeClassName(requestedClassName != null ? requestedClassName : scenario.getMetadata().getName());
        Path outputPath = outputRoot.resolve(packageName.replace('.', '/')).resolve(className + ".java");
        Map<String, VariableDefinition> variableDefinitions = ScenarioVariables.definitions(scenario);

        StringBuilder builder = new StringBuilder();
        builder.append("package ").append(packageName).append(";\n\n");
        builder.append("import com.codeborne.selenide.Condition;\n");
        builder.append("import com.codeborne.selenide.SelenideElement;\n");
        builder.append("import java.nio.file.Paths;\n");
        builder.append("import org.junit.After;\n");
        builder.append("import org.junit.Before;\n");
        builder.append("import org.junit.Test;\n");
        builder.append("import org.openqa.selenium.By;\n");
        builder.append("import org.openqa.selenium.Keys;\n\n");
        builder.append("import ").append(profile.getOrDefault("java.baseClass", "com.timbpm.generated.support.BaseUiTest")).append(";\n");
        builder.append("import ").append(profile.getOrDefault("java.waitHelper", "com.timbpm.generated.support.UiWaits")).append(";\n");
        builder.append("import ").append(profile.getOrDefault("java.alertHelper", "com.timbpm.generated.support.UiAlerts")).append(";\n\n");
        builder.append("import static com.codeborne.selenide.Selenide.$;\n");
        builder.append("import static com.codeborne.selenide.Selenide.open;\n");
        builder.append("import static com.codeborne.selenide.Selenide.switchTo;\n\n");

        builder.append("public class ").append(className).append(" extends ")
            .append(simpleName(profile.getOrDefault("java.baseClass", "com.timbpm.generated.support.BaseUiTest"))).append(" {\n");

        for (Map.Entry<String, VariableDefinition> entry : variableDefinitions.entrySet()) {
            builder.append("    private String ").append(sanitizeFieldName(entry.getKey())).append(" = ")
                .append(renderVariableInitializer(entry.getValue())).append(";\n");
        }
        if (!variableDefinitions.isEmpty()) {
            builder.append("\n");
        }

        List<ScenarioStep> orderedSteps = scenario.orderedSteps();
        appendSelectorFactories(builder, orderedSteps);

        builder.append("    @Before\n");
        builder.append("    public void ").append(profile.getOrDefault("java.setupMethod", "prepareScenario")).append("() {\n");
        builder.append("        logStep(\"Preparing scenario: ")
            .append(escapeForJava(scenario.getMetadata().getName())).append("\");\n");
        builder.append("    }\n\n");

        builder.append("    @Test\n");
        builder.append("    public void ").append(profile.getOrDefault("java.testMethod", "recordedScenario")).append("() {\n");
        emitSteps(builder, orderedSteps, variableDefinitions, profile);
        builder.append("    }\n\n");

        builder.append("    @After\n");
        builder.append("    public void ").append(profile.getOrDefault("java.cleanupMethod", "cleanupScenario")).append("() {\n");
        builder.append("        logStep(\"Scenario cleanup complete\");\n");
        builder.append("    }\n");
        builder.append("}\n");

        return new GeneratedJavaFile(className, builder.toString(), outputPath);
    }

    private void appendSelectorFactories(StringBuilder builder, List<ScenarioStep> orderedSteps) {
        int selectorIndex = 1;
        for (ScenarioStep step : orderedSteps) {
            if (step.getSelector() == null || step.getSelector().getPrimaryStrategy() == null) {
                continue;
            }
            builder.append("    private SelenideElement selector").append(selectorIndex).append("() {\n");
            builder.append("        return ").append(renderSelector(step.getSelector())).append(";\n");
            builder.append("    }\n\n");
            selectorIndex++;
        }
    }

    private void emitSteps(
        StringBuilder builder,
        List<ScenarioStep> orderedSteps,
        Map<String, VariableDefinition> variableDefinitions,
        FrameworkProfile profile
    ) {
        int selectorIndex = 1;
        for (ScenarioStep step : orderedSteps) {
            builder.append("        logStep(").append(javaString(step.getId() + " " + step.getType())).append(");\n");
            if (step.getSelector() != null && "xpath".equalsIgnoreCase(step.getSelector().getPrimaryStrategy())) {
                builder.append("        // TODO recorder warning: this step uses XPath fallback and may be brittle.\n");
            }
            if (
                step.getSelector() != null
                && step.getSelector().getPrimaryStrategy() != null
                && step.getSelector().getConfidenceScore() < 0.60
            ) {
                builder.append("        // TODO recorder warning: selector confidence is low.\n");
            }
            String selectorMethod = step.getSelector() != null && step.getSelector().getPrimaryStrategy() != null
                ? "selector" + selectorIndex + "()"
                : null;
            builder.append("        ").append(renderStep(step, selectorMethod, variableDefinitions, profile)).append("\n");
            if (step.getSelector() != null && step.getSelector().getPrimaryStrategy() != null) {
                selectorIndex++;
            }
        }
    }

    private String renderStep(
        ScenarioStep step,
        String selectorMethod,
        Map<String, VariableDefinition> variableDefinitions,
        FrameworkProfile profile
    ) {
        String value = variableOrLiteral(step.getValue(), variableDefinitions);
        String expectedValue = variableOrLiteral(step.getExpectedValue(), variableDefinitions);
        StepType type = step.getType();
        if (type == null) {
            return "// Unknown step type";
        }
        return switch (type) {
            case NAVIGATE -> "open(" + value + ");";
            case CLICK -> selectorMethod + ".click();";
            case DOUBLE_CLICK -> selectorMethod + ".doubleClick();";
            case RIGHT_CLICK -> selectorMethod + ".contextClick();";
            case TYPE -> selectorMethod + ".setValue(" + value + ");";
            case CLEAR -> selectorMethod + ".clear();";
            case PRESS_KEY -> selectorMethod + ".sendKeys(Keys." + normalizeKey(step.getKey()) + ");";
            case SELECT -> selectorMethod + ".selectOption(" + value + ");";
            case CHECKBOX_SET -> "if (" + selectorMethod + ".isSelected() != " + Boolean.TRUE.equals(step.getChecked()) + ") { " + selectorMethod + ".click(); }";
            case RADIO_SET -> selectorMethod + ".click();";
            case SWITCH_FRAME -> "switchTo().frame(" + selectorMethod + ");";
            case SWITCH_DEFAULT_CONTENT -> "switchTo().defaultContent();";
            case SWITCH_WINDOW -> "switchTo().window(" + (step.getWindowContext().getIndex() == null ? 0 : step.getWindowContext().getIndex()) + ");";
            case UPLOAD_FILE -> selectorMethod + ".uploadFile(Paths.get(resolveUploadAlias(" + javaString(step.getUploadAlias()) + ")).toFile());";
            case WAIT -> renderWait(step, selectorMethod, variableDefinitions, profile);
            case ASSERT_TEXT_EQUALS -> selectorMethod + ".shouldHave(Condition.exactText(" + expectedValue + "));";
            case ASSERT_TEXT_CONTAINS -> selectorMethod + ".shouldHave(Condition.text(" + expectedValue + "));";
            case ASSERT_VISIBLE -> selectorMethod + ".shouldBe(Condition.visible);";
            case ASSERT_HIDDEN -> selectorMethod + ".shouldBe(Condition.hidden);";
            case ASSERT_EXISTS -> selectorMethod + ".shouldBe(Condition.exist);";
            case ASSERT_NOT_EXISTS -> selectorMethod + ".shouldBe(Condition.disappear);";
            case ASSERT_ENABLED -> selectorMethod + ".shouldBe(Condition.enabled);";
            case ASSERT_DISABLED -> selectorMethod + ".shouldBe(Condition.disabled);";
            case ASSERT_VALUE_EQUALS -> selectorMethod + ".shouldHave(Condition.value(" + expectedValue + "));";
            case ASSERT_URL_CONTAINS -> simpleName(profile.getOrDefault("java.waitHelper", "com.timbpm.generated.support.UiWaits.awaitReady"))
                + ".awaitUrlContains(" + expectedValue + ");";
            case ASSERT_ALERT_PRESENT -> simpleName(profile.getOrDefault("java.alertHelper", "com.timbpm.generated.support.UiAlerts"))
                + ".assertPresent();";
            case ASSERT_ALERT_TEXT -> simpleName(profile.getOrDefault("java.alertHelper", "com.timbpm.generated.support.UiAlerts"))
                + ".assertText(" + expectedValue + ");";
            case ACCEPT_ALERT -> "switchTo().alert().accept();";
            case DISMISS_ALERT -> "switchTo().alert().dismiss();";
        };
    }

    private String renderWait(
        ScenarioStep step,
        String selectorMethod,
        Map<String, VariableDefinition> variableDefinitions,
        FrameworkProfile profile
    ) {
        if (step.getWaitStrategy() == null) {
            return "// No wait strategy available";
        }
        return switch (step.getWaitStrategy().getKind()) {
            case VISIBLE -> selectorMethod + ".shouldBe(Condition.visible);";
            case CLICKABLE -> selectorMethod + ".shouldBe(Condition.visible).shouldBe(Condition.enabled);";
            case EXISTS -> selectorMethod + ".shouldBe(Condition.exist);";
            case HIDDEN -> selectorMethod + ".shouldBe(Condition.hidden);";
            case DISAPPEAR -> selectorMethod + ".shouldBe(Condition.disappear);";
            case TEXT_CONTAINS -> selectorMethod + ".shouldHave(Condition.text("
                + variableOrLiteral(step.getWaitStrategy().getExpectedText(), variableDefinitions) + "));";
            case VALUE_EQUALS -> selectorMethod + ".shouldHave(Condition.value("
                + variableOrLiteral(step.getWaitStrategy().getExpectedValue(), variableDefinitions) + "));";
            case ENABLED -> selectorMethod + ".shouldBe(Condition.enabled);";
            case DISABLED -> selectorMethod + ".shouldBe(Condition.disabled);";
            case COLLECTION_SIZE, CUSTOM_HELPER, LOADING_OVERLAY_DISAPPEAR ->
                simpleName(profile.getOrDefault("java.waitHelper", "com.timbpm.generated.support.UiWaits.awaitReady")) + ".awaitReady();";
            case URL_CHANGE -> simpleName(profile.getOrDefault("java.waitHelper", "com.timbpm.generated.support.UiWaits.awaitReady"))
                + ".awaitUrlContains(" + variableOrLiteral(step.getWaitStrategy().getExpectedUrlFragment(), variableDefinitions) + ");";
            case ALERT_PRESENT -> simpleName(profile.getOrDefault("java.alertHelper", "com.timbpm.generated.support.UiAlerts"))
                + ".assertPresent();";
            case NONE -> "// Wait skipped";
        };
    }

    private String renderSelector(SelectorMetadata selector) {
        String strategy = selector.getPrimaryStrategy();
        String value = selector.getPrimaryValue();
        if (strategy == null || value == null) {
            return "$(By.cssSelector(\"body\"))";
        }
        return switch (strategy) {
            case "id" -> "$(By.id(" + javaString(value) + "))";
            case "name" -> "$(By.name(" + javaString(value) + "))";
            case "dataTestId" -> "$(By.cssSelector(" + javaString("[data-testid='" + value + "']") + "))";
            case "dataQa" -> "$(By.cssSelector(" + javaString("[data-qa='" + value + "']") + "))";
            case "ariaLabel" -> "$(By.cssSelector(" + javaString("[aria-label='" + value + "']") + "))";
            case "label" -> "$(By.xpath(" + javaString("//*[normalize-space()='" + value + "']") + "))";
            case "text" -> "$(By.xpath(" + javaString("//*[contains(normalize-space(),'" + value + "')]") + "))";
            case "xpath" -> "$(By.xpath(" + javaString(value) + "))";
            case "css" -> "$(By.cssSelector(" + javaString(value) + "))";
            default -> "$(By.cssSelector(" + javaString(selector.getCssPath() == null ? "body" : selector.getCssPath()) + "))";
        };
    }

    private String variableOrLiteral(String value, Map<String, VariableDefinition> variables) {
        if (value == null) {
            return "null";
        }
        String referenceName = ScenarioVariables.extractReferenceName(value);
        if (referenceName != null && variables.containsKey(referenceName)) {
            return sanitizeFieldName(referenceName);
        }
        for (Map.Entry<String, VariableDefinition> entry : variables.entrySet()) {
            VariableDefinition definition = entry.getValue();
            if (!definition.usesEnvironment() && value.equals(definition.literalValue())) {
                return sanitizeFieldName(entry.getKey());
            }
        }
        return javaString(value);
    }

    private String renderVariableInitializer(VariableDefinition definition) {
        if (definition.usesEnvironment()) {
            return "envOrDefault("
                + javaString(definition.environmentName() == null ? definition.key() : definition.environmentName())
                + ", "
                + javaString(definition.defaultValue() == null ? "" : definition.defaultValue())
                + ")";
        }
        return javaString(definition.literalValue() == null ? "" : definition.literalValue());
    }

    private String sanitizeClassName(String rawName) {
        String candidate = rawName == null || rawName.isBlank() ? "RecordedScenarioGeneratedTest" : rawName;
        String[] parts = candidate.replaceAll("[^A-Za-z0-9]+", " ").trim().split("\\s+");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part.isBlank()) {
                continue;
            }
            builder.append(part.substring(0, 1).toUpperCase(Locale.ROOT));
            if (part.length() > 1) {
                builder.append(part.substring(1));
            }
        }
        if (builder.isEmpty()) {
            builder.append("RecordedScenarioGeneratedTest");
        }
        if (!builder.toString().endsWith("Test")) {
            builder.append("GeneratedTest");
        }
        return builder.toString();
    }

    private String sanitizeFieldName(String rawName) {
        String candidate = rawName == null || rawName.isBlank() ? "value" : rawName;
        String normalized = candidate.replaceAll("[^A-Za-z0-9]+", " ").trim();
        String[] parts = normalized.split("\\s+");
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < parts.length; index++) {
            String part = parts[index];
            if (part.isBlank()) {
                continue;
            }
            if (index == 0) {
                builder.append(part.substring(0, 1).toLowerCase(Locale.ROOT));
                if (part.length() > 1) {
                    builder.append(part.substring(1));
                }
            } else {
                builder.append(part.substring(0, 1).toUpperCase(Locale.ROOT));
                if (part.length() > 1) {
                    builder.append(part.substring(1));
                }
            }
        }
        if (builder.isEmpty()) {
            builder.append("value");
        }
        return builder.toString();
    }

    private String simpleName(String fqcnOrMethod) {
        int lastDot = fqcnOrMethod.lastIndexOf('.');
        return lastDot >= 0 ? fqcnOrMethod.substring(lastDot + 1) : fqcnOrMethod;
    }

    private String normalizeKey(String key) {
        if (key == null || key.isBlank()) {
            return "ENTER";
        }
        return key.trim().replace('-', '_').replace(' ', '_').toUpperCase(Locale.ROOT);
    }

    private String javaString(String value) {
        return "\"" + escapeForJava(value) + "\"";
    }

    private String escapeForJava(String value) {
        if (value == null) {
            return "";
        }
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\r", "\\r")
            .replace("\n", "\\n");
    }
}
