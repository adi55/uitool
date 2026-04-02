package com.codeborne.selenide;

import org.openqa.selenium.Alert;

public final class SelenideTargetLocator {
    public SelenideTargetLocator frame(SelenideElement element) {
        return this;
    }

    public SelenideTargetLocator defaultContent() {
        return this;
    }

    public SelenideTargetLocator window(int index) {
        return this;
    }

    public Alert alert() {
        return new Alert();
    }
}
