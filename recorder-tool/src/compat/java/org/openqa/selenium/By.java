package org.openqa.selenium;

public final class By {
    private final String kind;
    private final String value;

    private By(String kind, String value) {
        this.kind = kind;
        this.value = value;
    }

    public static By id(String value) {
        return new By("id", value);
    }

    public static By name(String value) {
        return new By("name", value);
    }

    public static By cssSelector(String value) {
        return new By("css", value);
    }

    public static By xpath(String value) {
        return new By("xpath", value);
    }

    public String getKind() {
        return kind;
    }

    public String getValue() {
        return value;
    }
}
