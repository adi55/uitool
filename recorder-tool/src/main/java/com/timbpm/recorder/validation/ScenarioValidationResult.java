package com.timbpm.recorder.validation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ScenarioValidationResult {
    private final List<ValidationIssue> issues = new ArrayList<>();

    public List<ValidationIssue> getIssues() {
        return issues;
    }

    public boolean isValid() {
        return errorCount() == 0;
    }

    public int errorCount() {
        int count = 0;
        for (ValidationIssue issue : issues) {
            if ("error".equalsIgnoreCase(issue.severity())) {
                count++;
            }
        }
        return count;
    }

    public int warningCount() {
        int count = 0;
        for (ValidationIssue issue : issues) {
            if ("warning".equalsIgnoreCase(issue.severity())) {
                count++;
            }
        }
        return count;
    }

    public void addError(String path, String message) {
        issues.add(new ValidationIssue("error", path, message));
    }

    public void addWarning(String path, String message) {
        issues.add(new ValidationIssue("warning", path, message));
    }

    public Map<String, Object> toMap() {
        List<Object> serialized = new ArrayList<>();
        for (ValidationIssue issue : issues) {
            serialized.add(issue.toMap());
        }
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("valid", isValid());
        map.put("errorCount", errorCount());
        map.put("warningCount", warningCount());
        map.put("issues", serialized);
        return map;
    }
}
