package com.timbpm.generated.ui;

import com.codeborne.selenide.Condition;
import com.codeborne.selenide.SelenideElement;
import java.nio.file.Paths;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;

import com.timbpm.generated.support.BaseUiTest;
import com.timbpm.generated.support.UiWaits;
import com.timbpm.generated.support.UiAlerts;

import static com.codeborne.selenide.Selenide.$;
import static com.codeborne.selenide.Selenide.open;
import static com.codeborne.selenide.Selenide.switchTo;

public class StepIdRevalidation20260402122301GeneratedTest extends BaseUiTest {
    private SelenideElement selector1() {
        return $(By.cssSelector("body"));
    }

    private SelenideElement selector2() {
        return $(By.id("usernameInput"));
    }

    private SelenideElement selector3() {
        return $(By.id("loginBtn"));
    }

    private SelenideElement selector4() {
        return $(By.id("message"));
    }

    @Before
    public void prepareScenario() {
        logStep("Preparing scenario: Untitled Test 16");
    }

    @Test
    public void recordedScenario() {
        logStep("step-001 NAVIGATE");
        // TODO recorder warning: selector confidence is low.
        open("http://127.0.0.1:17846/recorder-test-page.html");
        logStep("step-002 TYPE");
        selector2().setValue("alice");
        logStep("step-003 CLICK");
        selector3().click();
        logStep("step-004 ASSERT_TEXT_EQUALS");
        selector4().shouldHave(Condition.exactText("Logged in as alice"));
    }

    @After
    public void cleanupScenario() {
        logStep("Scenario cleanup complete");
    }
}
