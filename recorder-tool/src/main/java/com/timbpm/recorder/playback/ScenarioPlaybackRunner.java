package com.timbpm.recorder.playback;

import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.util.ScenarioVariables;
import com.timbpm.recorder.util.ScenarioVariables.VariableDefinition;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ScenarioPlaybackRunner {
    public ReplayReport replay(ScenarioDocument scenario, ReplayOptions options) {
        ReplayReport report = new ReplayReport();
        Map<String, VariableDefinition> variableDefinitions = ScenarioVariables.definitions(scenario);
        ScenarioDocument resolvedScenario = ScenarioVariables.resolveScenario(scenario, Map.of());
        List<ScenarioStep> orderedSteps = resolvedScenario.orderedSteps();
        Map<String, String> uploadMappings = new LinkedHashMap<>(resolvedScenario.getUploadAliases());
        uploadMappings.putAll(options.getUploadMappings());
        int startIndex = Math.max(0, options.getStartIndex());
        if (options.getDebugPort() != null) {
            report.getLogs().add(new PlaybackLogEntry("INFO", "Attaching replay to Chrome debug port " + options.getDebugPort()));
        } else {
            report.getLogs().add(new PlaybackLogEntry("INFO", "Launching isolated Chrome session for replay"));
        }
        for (Map.Entry<String, VariableDefinition> entry : variableDefinitions.entrySet()) {
            Object resolvedValue = resolvedScenario.getVariables().get(entry.getKey());
            if (entry.getValue().usesEnvironment() && (resolvedValue == null || String.valueOf(resolvedValue).isBlank())) {
                report.getLogs().add(new PlaybackLogEntry(
                    "WARN",
                    "Environment-backed variable resolved blank: " + entry.getKey() + " (env " + entry.getValue().environmentName() + ")"
                ));
            }
        }
        String initialUrl = null;
        if (startIndex < orderedSteps.size() && orderedSteps.get(startIndex).getType() == com.timbpm.recorder.model.StepType.NAVIGATE) {
            initialUrl = orderedSteps.get(startIndex).getValue();
            startIndex++;
        }

        try (BrowserSession session = options.getDebugPort() != null
            ? BrowserSession.attach(options.getDebugPort(), initialUrl, report.getLogs()::add)
            : BrowserSession.launch(options.isHeadless(), initialUrl, report.getLogs()::add)) {
            for (int index = startIndex; index < orderedSteps.size(); index++) {
                ScenarioStep step = orderedSteps.get(index);
                report.getLogs().add(new PlaybackLogEntry("INFO", "Executing " + step.getId() + " " + step.getType()));
                try {
                    session.executeStep(step, uploadMappings);
                    report.getLogs().add(new PlaybackLogEntry("INFO", "Completed " + step.getId()));
                } catch (Exception exception) {
                    report.setSuccess(false);
                    report.setFailedStepId(step.getId());
                    report.setFinalUrl(session.currentUrl());
                    report.getLogs().add(new PlaybackLogEntry("ERROR", exception.getMessage()));
                    return report;
                }
            }
            report.setFinalUrl(session.currentUrl());
            report.setSuccess(true);
            return report;
        } catch (Exception exception) {
            report.setSuccess(false);
            report.getLogs().add(new PlaybackLogEntry("ERROR", exception.getMessage()));
            return report;
        }
    }
}
