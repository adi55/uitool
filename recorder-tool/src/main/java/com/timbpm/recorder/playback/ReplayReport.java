package com.timbpm.recorder.playback;

import java.util.ArrayList;
import java.util.List;

public final class ReplayReport {
    private boolean success;
    private String finalUrl;
    private String failedStepId;
    private final List<PlaybackLogEntry> logs = new ArrayList<>();

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getFinalUrl() {
        return finalUrl;
    }

    public void setFinalUrl(String finalUrl) {
        this.finalUrl = finalUrl;
    }

    public String getFailedStepId() {
        return failedStepId;
    }

    public void setFailedStepId(String failedStepId) {
        this.failedStepId = failedStepId;
    }

    public List<PlaybackLogEntry> getLogs() {
        return logs;
    }
}
