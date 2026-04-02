package com.timbpm.recorder.model;

import com.timbpm.recorder.util.DataAccess;
import java.util.LinkedHashMap;
import java.util.Map;

public final class WaitStrategy {
    private WaitKind kind = WaitKind.NONE;
    private String targetSelector;
    private String expectedUrlFragment;
    private String expectedText;
    private String expectedValue;
    private Integer timeoutMs = 5000;
    private Integer collectionSize;
    private String customHelper;
    private String notes;

    public WaitKind getKind() {
        return kind;
    }

    public void setKind(WaitKind kind) {
        this.kind = kind;
    }

    public String getTargetSelector() {
        return targetSelector;
    }

    public void setTargetSelector(String targetSelector) {
        this.targetSelector = targetSelector;
    }

    public String getExpectedUrlFragment() {
        return expectedUrlFragment;
    }

    public void setExpectedUrlFragment(String expectedUrlFragment) {
        this.expectedUrlFragment = expectedUrlFragment;
    }

    public String getExpectedText() {
        return expectedText;
    }

    public void setExpectedText(String expectedText) {
        this.expectedText = expectedText;
    }

    public String getExpectedValue() {
        return expectedValue;
    }

    public void setExpectedValue(String expectedValue) {
        this.expectedValue = expectedValue;
    }

    public Integer getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(Integer timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    public Integer getCollectionSize() {
        return collectionSize;
    }

    public void setCollectionSize(Integer collectionSize) {
        this.collectionSize = collectionSize;
    }

    public String getCustomHelper() {
        return customHelper;
    }

    public void setCustomHelper(String customHelper) {
        this.customHelper = customHelper;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("kind", kind.name().toLowerCase());
        map.put("targetSelector", targetSelector);
        map.put("expectedUrlFragment", expectedUrlFragment);
        map.put("expectedText", expectedText);
        map.put("expectedValue", expectedValue);
        map.put("timeoutMs", timeoutMs);
        map.put("collectionSize", collectionSize);
        map.put("customHelper", customHelper);
        map.put("notes", notes);
        return map;
    }

    public static WaitStrategy fromMap(Map<String, Object> source) {
        WaitStrategy strategy = new WaitStrategy();
        strategy.setKind(WaitKind.fromText(DataAccess.string(source, "kind", "none")));
        strategy.setTargetSelector(DataAccess.string(source, "targetSelector", null));
        strategy.setExpectedUrlFragment(DataAccess.string(source, "expectedUrlFragment", null));
        strategy.setExpectedText(DataAccess.string(source, "expectedText", null));
        strategy.setExpectedValue(DataAccess.string(source, "expectedValue", null));
        strategy.setTimeoutMs(DataAccess.integer(source, "timeoutMs", 5000));
        strategy.setCollectionSize(DataAccess.integer(source, "collectionSize", null));
        strategy.setCustomHelper(DataAccess.string(source, "customHelper", null));
        strategy.setNotes(DataAccess.string(source, "notes", null));
        return strategy;
    }
}
