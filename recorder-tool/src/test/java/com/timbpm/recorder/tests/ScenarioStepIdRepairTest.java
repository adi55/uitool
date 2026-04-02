package com.timbpm.recorder.tests;

import com.timbpm.recorder.io.ScenarioIO;
import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioMetadata;
import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.model.StepType;
import com.timbpm.recorder.util.DataAccess;
import com.timbpm.recorder.util.StructuredData;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class ScenarioStepIdRepairTest {
    void run(RecorderToolSelfTest test) {
        Map<String, Object> imported = new LinkedHashMap<>();
        imported.put("metadata", Map.of("name", "Repair ids", "profileId", "tim-ui-junit4-selenide"));
        imported.put("steps", List.of(
            Map.of("id", "step-001", "type", "navigate", "value", "https://example.test/login"),
            Map.of("id", "", "type", "click", "selector", Map.of("primaryStrategy", "text", "primaryValue", "Sign in"))
        ));
        imported.put("assertions", List.of(
            Map.of(
                "id",
                "",
                "type",
                "assert_text_contains",
                "expectedValue",
                "Welcome",
                "selector",
                Map.of("primaryStrategy", "text", "primaryValue", "Welcome")
            )
        ));
        ScenarioDocument repairedImported = ScenarioDocument.fromMap(imported);
        List<String> repairedIds = collectIds(repairedImported.orderedSteps());
        test.assertEquals("step-001", repairedIds.get(0), "Existing ids should be preserved during import repair");
        test.assertEquals("step-002", repairedIds.get(1), "Missing test-step ids should be repaired deterministically");
        test.assertEquals("step-003", repairedIds.get(2), "Missing assertion-step ids should be repaired deterministically");

        Map<String, Object> duplicates = new LinkedHashMap<>();
        duplicates.put("metadata", Map.of("name", "Duplicate ids", "profileId", "tim-ui-junit4-selenide"));
        duplicates.put("steps", List.of(
            Map.of("id", "step-001", "type", "navigate", "value", "https://example.test/login"),
            Map.of("id", "step-001", "type", "click", "selector", Map.of("primaryStrategy", "text", "primaryValue", "Continue"))
        ));
        ScenarioDocument repairedDuplicates = ScenarioDocument.fromMap(duplicates);
        List<String> duplicateIds = collectIds(repairedDuplicates.getSteps());
        test.assertEquals("step-001", duplicateIds.get(0), "The first duplicate id should stay stable");
        test.assertEquals("step-002", duplicateIds.get(1), "Later duplicate ids should be reassigned");

        ScenarioDocument programmatic = new ScenarioDocument();
        ScenarioMetadata metadata = new ScenarioMetadata();
        metadata.setName("Programmatic");
        metadata.setProfileId("tim-ui-junit4-selenide");
        programmatic.setMetadata(metadata);
        ScenarioStep programmaticStep = new ScenarioStep();
        programmaticStep.setType(StepType.CLICK);
        programmaticStep.getSelector().setPrimaryStrategy("text");
        programmaticStep.getSelector().setPrimaryValue("Save");
        programmatic.getSteps().add(programmaticStep);

        String json = ScenarioIO.toJson(programmatic);
        ScenarioDocument roundTrip = ScenarioDocument.fromMap(DataAccess.map(StructuredData.parseJson(json)));
        test.assertEquals("step-001", roundTrip.getSteps().get(0).getId(), "Serialization should repair missing ids before writing");
    }

    private List<String> collectIds(List<ScenarioStep> steps) {
        List<String> ids = new ArrayList<>();
        for (ScenarioStep step : steps) {
            ids.add(step.getId());
        }
        return ids;
    }
}
