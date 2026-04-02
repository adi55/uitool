package com.timbpm.generated.support;

public class BaseUiTest {
    protected void logStep(String message) {
    }

    protected String resolveUploadAlias(String alias) {
        return alias;
    }

    protected String envOrDefault(String key, String defaultValue) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
