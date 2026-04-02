package com.timbpm.recorder.model;

public enum StepType {
    CLICK,
    DOUBLE_CLICK,
    RIGHT_CLICK,
    TYPE,
    CLEAR,
    PRESS_KEY,
    SELECT,
    CHECKBOX_SET,
    RADIO_SET,
    SWITCH_FRAME,
    SWITCH_DEFAULT_CONTENT,
    SWITCH_WINDOW,
    NAVIGATE,
    UPLOAD_FILE,
    WAIT,
    ASSERT_TEXT_EQUALS,
    ASSERT_TEXT_CONTAINS,
    ASSERT_VISIBLE,
    ASSERT_HIDDEN,
    ASSERT_EXISTS,
    ASSERT_NOT_EXISTS,
    ASSERT_ENABLED,
    ASSERT_DISABLED,
    ASSERT_VALUE_EQUALS,
    ASSERT_URL_CONTAINS,
    ASSERT_ALERT_PRESENT,
    ASSERT_ALERT_TEXT,
    ACCEPT_ALERT,
    DISMISS_ALERT;

    public static StepType fromText(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String normalized = text.trim().replace('-', '_').replace(' ', '_').toUpperCase();
        return StepType.valueOf(normalized);
    }
}
