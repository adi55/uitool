package com.timbpm.recorder.playback;

import java.util.LinkedHashMap;
import java.util.Map;

public final class ReplayOptions {
    private boolean headless = false;
    private int startIndex;
    private Integer debugPort;
    private final Map<String, String> uploadMappings = new LinkedHashMap<>();

    public boolean isHeadless() {
        return headless;
    }

    public void setHeadless(boolean headless) {
        this.headless = headless;
    }

    public int getStartIndex() {
        return startIndex;
    }

    public void setStartIndex(int startIndex) {
        this.startIndex = startIndex;
    }

    public Integer getDebugPort() {
        return debugPort;
    }

    public void setDebugPort(Integer debugPort) {
        this.debugPort = debugPort;
    }

    public Map<String, String> getUploadMappings() {
        return uploadMappings;
    }
}
