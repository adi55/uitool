package com.timbpm.recorder.model;

public enum StepStage {
    SETUP,
    TEST,
    ASSERTION,
    CLEANUP;

    public static StepStage fromText(String text) {
        if (text == null || text.isBlank()) {
            return TEST;
        }
        String normalized = text.trim().replace('-', '_').replace(' ', '_').toUpperCase();
        return StepStage.valueOf(normalized);
    }
}
