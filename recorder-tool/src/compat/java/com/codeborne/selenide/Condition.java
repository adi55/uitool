package com.codeborne.selenide;

public final class Condition {
    public static final Condition visible = new Condition("visible");
    public static final Condition hidden = new Condition("hidden");
    public static final Condition exist = new Condition("exist");
    public static final Condition disappear = new Condition("disappear");
    public static final Condition enabled = new Condition("enabled");
    public static final Condition disabled = new Condition("disabled");

    private final String name;
    private final String expected;

    private Condition(String name) {
        this(name, null);
    }

    private Condition(String name, String expected) {
        this.name = name;
        this.expected = expected;
    }

    public static Condition text(String expected) {
        return new Condition("text", expected);
    }

    public static Condition exactText(String expected) {
        return new Condition("exactText", expected);
    }

    public static Condition value(String expected) {
        return new Condition("value", expected);
    }

    public String getName() {
        return name;
    }

    public String getExpected() {
        return expected;
    }
}
