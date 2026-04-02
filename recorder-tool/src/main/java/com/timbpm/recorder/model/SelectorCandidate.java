package com.timbpm.recorder.model;

import com.timbpm.recorder.util.DataAccess;
import java.util.LinkedHashMap;
import java.util.Map;

public final class SelectorCandidate {
    private String strategy;
    private String value;
    private double confidenceScore;
    private String explanation;
    private boolean primary;

    public String getStrategy() {
        return strategy;
    }

    public void setStrategy(String strategy) {
        this.strategy = strategy;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public double getConfidenceScore() {
        return confidenceScore;
    }

    public void setConfidenceScore(double confidenceScore) {
        this.confidenceScore = confidenceScore;
    }

    public String getExplanation() {
        return explanation;
    }

    public void setExplanation(String explanation) {
        this.explanation = explanation;
    }

    public boolean isPrimary() {
        return primary;
    }

    public void setPrimary(boolean primary) {
        this.primary = primary;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("strategy", strategy);
        map.put("value", value);
        map.put("confidenceScore", confidenceScore);
        map.put("explanation", explanation);
        map.put("primary", primary);
        return map;
    }

    public static SelectorCandidate fromMap(Map<String, Object> source) {
        SelectorCandidate candidate = new SelectorCandidate();
        candidate.setStrategy(DataAccess.string(source, "strategy", null));
        candidate.setValue(DataAccess.string(source, "value", null));
        candidate.setConfidenceScore(DataAccess.doubleValue(source, "confidenceScore", 0.0));
        candidate.setExplanation(DataAccess.string(source, "explanation", null));
        candidate.setPrimary(DataAccess.bool(source, "primary", false));
        return candidate;
    }
}
