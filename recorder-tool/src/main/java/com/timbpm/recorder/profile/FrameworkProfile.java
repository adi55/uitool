package com.timbpm.recorder.profile;

import java.util.LinkedHashMap;
import java.util.Map;

public final class FrameworkProfile {
    private final String id;
    private final Map<String, String> properties = new LinkedHashMap<>();

    public FrameworkProfile(String id) {
        this.id = id;
    }

    public String getId() {
        return id;
    }

    public Map<String, String> getProperties() {
        return properties;
    }

    public String get(String key) {
        return properties.get(key);
    }

    public String getOrDefault(String key, String fallback) {
        return properties.getOrDefault(key, fallback);
    }
}
