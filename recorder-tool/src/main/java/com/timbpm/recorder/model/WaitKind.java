package com.timbpm.recorder.model;

public enum WaitKind {
    NONE,
    VISIBLE,
    CLICKABLE,
    EXISTS,
    HIDDEN,
    DISAPPEAR,
    TEXT_CONTAINS,
    VALUE_EQUALS,
    ENABLED,
    DISABLED,
    COLLECTION_SIZE,
    URL_CHANGE,
    ALERT_PRESENT,
    LOADING_OVERLAY_DISAPPEAR,
    CUSTOM_HELPER;

    public static WaitKind fromText(String text) {
        if (text == null || text.isBlank()) {
            return NONE;
        }
        String normalized = text.trim().replace('-', '_').replace(' ', '_').toUpperCase();
        return WaitKind.valueOf(normalized);
    }
}
