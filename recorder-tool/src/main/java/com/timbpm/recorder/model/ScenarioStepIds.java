package com.timbpm.recorder.model;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ScenarioStepIds {
    private static final Pattern STEP_ID_PATTERN = Pattern.compile("^step-(\\d+)$", Pattern.CASE_INSENSITIVE);

    private ScenarioStepIds() {
    }

    public static int ensureStepIds(ScenarioDocument document) {
        if (document == null) {
            return 0;
        }
        List<ScenarioStep> orderedSteps = document.orderedSteps();
        int repairs = ensureOrderedStepIds(orderedSteps, false);
        document.replaceFromOrderedSteps(orderedSteps);
        return repairs;
    }

    public static int regenerateStepIds(ScenarioDocument document) {
        if (document == null) {
            return 0;
        }
        List<ScenarioStep> orderedSteps = document.orderedSteps();
        int repairs = ensureOrderedStepIds(orderedSteps, true);
        document.replaceFromOrderedSteps(orderedSteps);
        return repairs;
    }

    private static int ensureOrderedStepIds(List<ScenarioStep> orderedSteps, boolean regenerateAll) {
        Map<String, Integer> knownIds = new HashMap<>();
        int maxNumericId = 0;
        for (ScenarioStep step : orderedSteps) {
            String stepId = normalize(step == null ? null : step.getId());
            if (stepId == null) {
                continue;
            }
            knownIds.put(stepId, knownIds.getOrDefault(stepId, 0) + 1);
            Integer parsedNumber = parseNumber(stepId);
            if (parsedNumber != null) {
                maxNumericId = Math.max(maxNumericId, parsedNumber);
            }
        }

        Set<String> preservedIds = new HashSet<>();
        int repairs = 0;
        for (ScenarioStep step : orderedSteps) {
            if (step == null) {
                continue;
            }
            String currentId = normalize(step.getId());
            boolean duplicatedId = currentId != null && knownIds.getOrDefault(currentId, 0) > 1;
            boolean keepCurrentId = !regenerateAll && currentId != null && (!duplicatedId || !preservedIds.contains(currentId));
            if (keepCurrentId) {
                step.setId(currentId);
                preservedIds.add(currentId);
                continue;
            }

            String nextId;
            do {
                maxNumericId += 1;
                nextId = formatStepId(maxNumericId);
            } while (preservedIds.contains(nextId) || knownIds.containsKey(nextId));

            step.setId(nextId);
            preservedIds.add(nextId);
            repairs += 1;
        }
        return repairs;
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static Integer parseNumber(String value) {
        Matcher matcher = STEP_ID_PATTERN.matcher(value);
        if (!matcher.matches()) {
            return null;
        }
        return Integer.parseInt(matcher.group(1));
    }

    private static String formatStepId(int value) {
        return String.format("step-%03d", Math.max(1, value));
    }
}
