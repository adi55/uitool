package com.codeborne.selenide;

import org.openqa.selenium.By;

public final class Selenide {
    private Selenide() {
    }

    public static SelenideElement $(By selector) {
        return new SelenideElement();
    }

    public static void open(String url) {
    }

    public static SelenideTargetLocator switchTo() {
        return new SelenideTargetLocator();
    }
}
