package com.timbpm.recorder.validation;

import java.util.LinkedHashMap;
import java.util.Map;

public record ValidationIssue(String severity, String path, String message) {
    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("severity", severity);
        map.put("path", path);
        map.put("message", message);
        return map;
    }
}
