package com.timbpm.recorder.tests;

import com.timbpm.recorder.generator.JavaTestGenerator;
import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioMetadata;
import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.model.StepType;
import com.timbpm.recorder.profile.ProfileRegistry;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

final class JavaGeneratorTest {
    void run(RecorderToolSelfTest test) {
        ScenarioDocument document = new ScenarioDocument();
        ScenarioMetadata metadata = new ScenarioMetadata();
        metadata.setName("Login Scenario");
        metadata.setProfileId("tim-ui-junit4-selenide");
        document.setMetadata(metadata);
        document.getVariables().put("username", "sme");
        Map<String, Object> password = new LinkedHashMap<>();
        password.put("source", "env");
        password.put("name", "TIM_UI_RECORDER_PASSWORD");
        password.put("defaultValue", "");
        password.put("sensitive", true);
        document.getVariables().put("password", password);

        ScenarioStep navigate = new ScenarioStep();
        navigate.setId("step-001");
        navigate.setType(StepType.NAVIGATE);
        navigate.setValue("https://example.test/login");
        document.getSteps().add(navigate);

        ScenarioStep type = new ScenarioStep();
        type.setId("step-002");
        type.setType(StepType.TYPE);
        type.setValue("{{username}}");
        type.getSelector().setPrimaryStrategy("id");
        type.getSelector().setPrimaryValue("username");
        document.getSteps().add(type);

        ScenarioStep passwordType = new ScenarioStep();
        passwordType.setId("step-003");
        passwordType.setType(StepType.TYPE);
        passwordType.setValue("{{password}}");
        passwordType.getSelector().setPrimaryStrategy("id");
        passwordType.getSelector().setPrimaryValue("password");
        document.getSteps().add(passwordType);

        ProfileRegistry registry = new ProfileRegistry();
        try {
            registry.loadFromDirectory(Path.of("recorder-tool", "profiles"));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
        String source = new JavaTestGenerator()
            .generate(document, registry.require("tim-ui-junit4-selenide"), Path.of("recorder-tool", "generated"), "NightlyLoginGeneratedTest")
            .source();

        test.assertTrue(source.contains("class NightlyLoginGeneratedTest"), "Generated source should contain the requested class name");
        test.assertTrue(source.contains("$(By.id(\"username\"))"), "Generated source should use the id selector");
        test.assertTrue(source.contains("setValue(username);"), "Generated source should map known variable values to fields");
        test.assertTrue(
            source.contains("private String password = envOrDefault(\"TIM_UI_RECORDER_PASSWORD\", \"\");"),
            "Generated source should bind env-backed variables through envOrDefault"
        );
        test.assertTrue(source.contains("setValue(password);"), "Generated source should resolve placeholder references to fields");
    }
}
