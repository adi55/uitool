package com.timbpm.recorder.model;

import com.timbpm.recorder.util.DataAccess;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ScenarioDocument {
    private ScenarioMetadata metadata = new ScenarioMetadata();
    private final Map<String, Object> variables = new LinkedHashMap<>();
    private final Map<String, String> uploadAliases = new LinkedHashMap<>();
    private final List<ScenarioStep> setup = new ArrayList<>();
    private final List<ScenarioStep> steps = new ArrayList<>();
    private final List<ScenarioStep> assertions = new ArrayList<>();
    private final List<ScenarioStep> cleanup = new ArrayList<>();
    private final List<String> notes = new ArrayList<>();

    public ScenarioMetadata getMetadata() {
        return metadata;
    }

    public void setMetadata(ScenarioMetadata metadata) {
        this.metadata = metadata;
    }

    public Map<String, Object> getVariables() {
        return variables;
    }

    public Map<String, String> getUploadAliases() {
        return uploadAliases;
    }

    public List<ScenarioStep> getSetup() {
        return setup;
    }

    public List<ScenarioStep> getSteps() {
        return steps;
    }

    public List<ScenarioStep> getAssertions() {
        return assertions;
    }

    public List<ScenarioStep> getCleanup() {
        return cleanup;
    }

    public List<String> getNotes() {
        return notes;
    }

    public List<ScenarioStep> orderedSteps() {
        List<ScenarioStep> ordered = new ArrayList<>();
        ordered.addAll(setup);
        ordered.addAll(steps);
        ordered.addAll(assertions);
        ordered.addAll(cleanup);
        return ordered;
    }

    public void replaceFromOrderedSteps(List<ScenarioStep> ordered) {
        setup.clear();
        steps.clear();
        assertions.clear();
        cleanup.clear();
        for (ScenarioStep step : ordered) {
            switch (step.getStage()) {
                case SETUP -> setup.add(step);
                case ASSERTION -> assertions.add(step);
                case CLEANUP -> cleanup.add(step);
                case TEST -> steps.add(step);
                default -> steps.add(step);
            }
        }
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("metadata", metadata == null ? null : metadata.toMap());
        map.put("variables", new LinkedHashMap<>(variables));
        map.put("uploadAliases", new LinkedHashMap<>(uploadAliases));
        map.put("setup", serializeSteps(setup));
        map.put("steps", serializeSteps(steps));
        map.put("assertions", serializeSteps(assertions));
        map.put("cleanup", serializeSteps(cleanup));
        map.put("notes", new ArrayList<>(notes));
        return map;
    }

    public static ScenarioDocument fromMap(Map<String, Object> source) {
        ScenarioDocument document = new ScenarioDocument();
        document.setMetadata(ScenarioMetadata.fromMap(DataAccess.childMap(source, "metadata")));
        document.getVariables().putAll(DataAccess.childMap(source, "variables"));
        Map<String, Object> rawAliases = DataAccess.childMap(source, "uploadAliases");
        for (Map.Entry<String, Object> entry : rawAliases.entrySet()) {
            document.getUploadAliases().put(entry.getKey(), String.valueOf(entry.getValue()));
        }
        for (Map<String, Object> item : DataAccess.listOfMaps(source, "setup")) {
            document.getSetup().add(ScenarioStep.fromMap(item));
        }
        for (Map<String, Object> item : DataAccess.listOfMaps(source, "steps")) {
            document.getSteps().add(ScenarioStep.fromMap(item));
        }
        for (Map<String, Object> item : DataAccess.listOfMaps(source, "assertions")) {
            document.getAssertions().add(ScenarioStep.fromMap(item));
        }
        for (Map<String, Object> item : DataAccess.listOfMaps(source, "cleanup")) {
            document.getCleanup().add(ScenarioStep.fromMap(item));
        }
        document.getNotes().addAll(DataAccess.stringList(source, "notes"));
        ScenarioStepIds.ensureStepIds(document);
        return document;
    }

    private List<Object> serializeSteps(List<ScenarioStep> items) {
        List<Object> serialized = new ArrayList<>();
        for (ScenarioStep item : items) {
            serialized.add(item.toMap());
        }
        return serialized;
    }
}
