package com.timbpm.recorder.tests;

import com.timbpm.recorder.io.ScenarioIO;
import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioMetadata;
import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.model.StepType;
import com.timbpm.recorder.model.WaitKind;
import com.timbpm.recorder.util.DataAccess;
import com.timbpm.recorder.util.StructuredData;
import java.util.LinkedHashMap;
import java.util.Map;

final class ScenarioIoTest {
    void run(RecorderToolSelfTest test) {
        ScenarioDocument document = new ScenarioDocument();
        ScenarioMetadata metadata = new ScenarioMetadata();
        metadata.setName("Roundtrip");
        metadata.setProfileId("tim-ui-junit4-selenide");
        document.setMetadata(metadata);
        document.getVariables().put("username", "sme");
        Map<String, Object> password = new LinkedHashMap<>();
        password.put("source", "env");
        password.put("name", "TIM_UI_RECORDER_PASSWORD");
        password.put("defaultValue", "");
        password.put("sensitive", true);
        document.getVariables().put("password", password);

        ScenarioStep step = new ScenarioStep();
        step.setId("step-001");
        step.setType(StepType.TYPE);
        step.setStage(com.timbpm.recorder.model.StepStage.TEST);
        step.setValue("{{username}}");
        step.setDescription("Type username");
        document.getSteps().add(step);

        ScenarioStep wait = new ScenarioStep();
        wait.setId("step-002");
        wait.setType(StepType.WAIT);
        wait.setStage(com.timbpm.recorder.model.StepStage.ASSERTION);
        wait.getWaitStrategy().setKind(WaitKind.VALUE_EQUALS);
        wait.getWaitStrategy().setExpectedValue("{{username}}");
        wait.getSelector().setPrimaryStrategy("id");
        wait.getSelector().setPrimaryValue("email1");
        document.getAssertions().add(wait);

        String json = ScenarioIO.toJson(document);
        ScenarioDocument fromJson = ScenarioDocument.fromMap(DataAccess.map(StructuredData.parseJson(json)));
        test.assertEquals("Roundtrip", fromJson.getMetadata().getName(), "JSON roundtrip should preserve metadata");
        test.assertEquals("{{username}}", fromJson.getSteps().get(0).getValue(), "JSON roundtrip should preserve step value");
        test.assertEquals(
            "TIM_UI_RECORDER_PASSWORD",
            DataAccess.string(DataAccess.map(fromJson.getVariables().get("password")), "name", null),
            "JSON roundtrip should preserve env-backed variable metadata"
        );
        test.assertEquals(WaitKind.VALUE_EQUALS, fromJson.getAssertions().get(0).getWaitStrategy().getKind(), "JSON roundtrip should preserve wait kind");

        String yaml = ScenarioIO.toYaml(document);
        ScenarioDocument fromYaml = ScenarioDocument.fromMap(DataAccess.map(StructuredData.parseYaml(yaml)));
        test.assertEquals("Roundtrip", fromYaml.getMetadata().getName(), "YAML roundtrip should preserve metadata");
        test.assertEquals(1, fromYaml.getSteps().size(), "YAML roundtrip should preserve steps");
        test.assertEquals("{{username}}", fromYaml.getAssertions().get(0).getWaitStrategy().getExpectedValue(), "YAML roundtrip should preserve wait expected value");
    }
}
