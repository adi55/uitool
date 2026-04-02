package com.codeborne.selenide;

import java.io.File;
import org.openqa.selenium.Keys;

public class SelenideElement {
    public SelenideElement click() {
        return this;
    }

    public SelenideElement doubleClick() {
        return this;
    }

    public SelenideElement contextClick() {
        return this;
    }

    public SelenideElement setValue(String value) {
        return this;
    }

    public SelenideElement clear() {
        return this;
    }

    public SelenideElement sendKeys(Keys key) {
        return this;
    }

    public SelenideElement selectOption(String option) {
        return this;
    }

    public SelenideElement uploadFile(File file) {
        return this;
    }

    public SelenideElement shouldBe(Condition condition) {
        return this;
    }

    public SelenideElement shouldHave(Condition condition) {
        return this;
    }

    public boolean isSelected() {
        return false;
    }
}
