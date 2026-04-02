package com.timbpm.recorder.tests;

import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioMetadata;
import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.model.StepType;
import com.timbpm.recorder.validation.ScenarioValidationResult;
import com.timbpm.recorder.validation.ScenarioValidator;
import java.util.LinkedHashMap;
import java.util.Map;

final class ScenarioValidationTest {
    void run(RecorderToolSelfTest test) {
        ScenarioValidator validator = new ScenarioValidator();

        ScenarioDocument invalid = new ScenarioDocument();
        ScenarioMetadata invalidMetadata = new ScenarioMetadata();
        invalidMetadata.setProfileId("tim-ui-junit4-selenide");
        invalid.setMetadata(invalidMetadata);
        ScenarioStep invalidTypeStep = new ScenarioStep();
        invalidTypeStep.setId("step-001");
        invalid.getSteps().add(invalidTypeStep);

        ScenarioValidationResult invalidResult = validator.validate(invalid);
        test.assertTrue(!invalidResult.isValid(), "Missing metadata name and step type should fail validation");
        test.assertTrue(invalidResult.errorCount() >= 2, "Invalid scenario should report multiple errors");

        ScenarioDocument unresolvedVariable = new ScenarioDocument();
        ScenarioMetadata metadata = new ScenarioMetadata();
        metadata.setName("Login");
        metadata.setProfileId("tim-ui-junit4-selenide");
        unresolvedVariable.setMetadata(metadata);
        ScenarioStep type = new ScenarioStep();
        type.setId("step-001");
        type.setType(StepType.TYPE);
        type.setValue("{{username}}");
        type.getSelector().setPrimaryStrategy("id");
        type.getSelector().setPrimaryValue("email1");
        unresolvedVariable.getSteps().add(type);

        ScenarioValidationResult unresolvedResult = validator.validate(unresolvedVariable);
        test.assertTrue(!unresolvedResult.isValid(), "Unknown placeholder references should fail validation");

        ScenarioDocument valid = new ScenarioDocument();
        ScenarioMetadata validMetadata = new ScenarioMetadata();
        validMetadata.setName("Login");
        validMetadata.setProfileId("tim-ui-junit4-selenide");
        valid.setMetadata(validMetadata);
        Map<String, Object> username = new LinkedHashMap<>();
        username.put("source", "env");
        username.put("name", "TIM_UI_RECORDER_USERNAME");
        username.put("defaultValue", "");
        valid.getVariables().put("username", username);
        ScenarioStep validStep = new ScenarioStep();
        validStep.setId("step-001");
        validStep.setType(StepType.TYPE);
        validStep.setValue("{{username}}");
        validStep.getSelector().setPrimaryStrategy("id");
        validStep.getSelector().setPrimaryValue("email1");
        valid.getSteps().add(validStep);

        ScenarioValidationResult validResult = validator.validate(valid);
        test.assertTrue(validResult.isValid(), "Valid env-backed variable references should pass validation");
    }
}
