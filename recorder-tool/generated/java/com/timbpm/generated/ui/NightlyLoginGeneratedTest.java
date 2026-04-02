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

public class NightlyLoginGeneratedTest extends BaseUiTest {
    private String loginUrl = "https://nightly.tim-bpm.com/tim/client/login";
    private String username = envOrDefault("TIM_UI_RECORDER_USERNAME", "");
    private String password = envOrDefault("TIM_UI_RECORDER_PASSWORD", "");

    private SelenideElement selector1() {
        return $(By.id("email1"));
    }

    private SelenideElement selector2() {
        return $(By.id("email1"));
    }

    private SelenideElement selector3() {
        return $(By.id("password1"));
    }

    private SelenideElement selector4() {
        return $(By.xpath("//*[contains(normalize-space(),'Login')]"));
    }

    private SelenideElement selector5() {
        return $(By.id("email1"));
    }

    @Before
    public void prepareScenario() {
        logStep("Preparing scenario: Nightly Login Candidate TaskNmotion");
    }

    @Test
    public void recordedScenario() {
        logStep("step-001 NAVIGATE");
        open(loginUrl);
        logStep("step-002 WAIT");
        selector1().shouldBe(Condition.visible);
        logStep("step-003 TYPE");
        selector2().setValue(username);
        logStep("step-004 TYPE");
        selector3().setValue(password);
        logStep("step-005 CLICK");
        selector4().click();
        logStep("step-006 ASSERT_NOT_EXISTS");
        selector5().shouldBe(Condition.disappear);
    }

    @After
    public void cleanupScenario() {
        logStep("Scenario cleanup complete");
    }
}
