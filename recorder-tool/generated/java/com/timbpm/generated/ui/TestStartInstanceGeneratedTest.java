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

public class TestStartInstanceGeneratedTest extends BaseUiTest {
    private SelenideElement selector1() {
        return $(By.id("email1"));
    }

    private SelenideElement selector2() {
        return $(By.id("password1"));
    }

    private SelenideElement selector3() {
        return $(By.cssSelector("body > tim-root > tim-login-page > div.w-full.min-h-full > div.w-full.px-2 > div.bg-surface-0.dark\\:bg-surface-900:nth-of-type(1) > div:nth-of-type(2) > form.ng-dirty.ng-touched > p-button > button.p-ripple.p-button > span.p-button-icon.p-button-icon-left:nth-of-type(1)"));
    }

    private SelenideElement selector4() {
        return $(By.cssSelector("body"));
    }

    private SelenideElement selector5() {
        return $(By.cssSelector("body > li#management > div.p-tieredmenu-item-content > tim-menu-item > a.no-underline.rounded-2xl > i.mb-0.text-3xl"));
    }

    private SelenideElement selector6() {
        return $(By.cssSelector("body"));
    }

    private SelenideElement selector7() {
        return $(By.cssSelector("body"));
    }

    private SelenideElement selector8() {
        return $(By.cssSelector("body > th#name > span.flex.items-center > div.relative.flex > p-columnfilter > div.p-datatable-filter.p-datatable-popover-filter > p-button > button.p-ripple.p-button > span > i.pi.pi-filter"));
    }

    private SelenideElement selector9() {
        return $(By.cssSelector("body > div#pn_id_2 > div.p-datatable-filter-rule-list:nth-of-type(2) > div.p-datatable-filter-rule > p-columnfilterformelement > div > t-auto-complete-filter > span > p-autocomplete.p-autocomplete.p-component > input.p-autocomplete-input.p-component"));
    }

    private SelenideElement selector10() {
        return $(By.id("quickfilter-name_1"));
    }

    private SelenideElement selector11() {
        return $(By.cssSelector("body > div#pn_id_2 > div.p-datatable-filter-rule-list:nth-of-type(2) > div.p-datatable-filter-rule > p-columnfilterformelement > div > t-auto-complete-filter > span > p-autocomplete.p-autocomplete.p-component > input.p-autocomplete-input.p-component"));
    }

    private SelenideElement selector12() {
        return $(By.xpath("//*[contains(normalize-space(),'admin')]"));
    }

    private SelenideElement selector13() {
        return $(By.cssSelector("body"));
    }

    private SelenideElement selector14() {
        return $(By.cssSelector("body > p-listbox#pn_id_380_source_list > div.p-listbox-header:nth-of-type(1) > div.flex.w-full:nth-of-type(2) > p-inputgroup.w-full.flex-1 > input.p-component.p-inputtext"));
    }

    private SelenideElement selector15() {
        return $(By.xpath("//*[contains(normalize-space(),'pm')]"));
    }

    private SelenideElement selector16() {
        return $(By.xpath("//*[contains(normalize-space(),'Logout')]"));
    }

    private SelenideElement selector17() {
        return $(By.cssSelector("body"));
    }

    private SelenideElement selector18() {
        return $(By.id("email1"));
    }

    @Before
    public void prepareScenario() {
        logStep("Preparing scenario: Untitled Test 4");
    }

    @Test
    public void recordedScenario() {
        logStep("step-003 TYPE");
        selector1().setValue("sme/pm");
        logStep("step-004 TYPE");
        selector2().setValue("task!nmotion");
        logStep("step-005 CLICK");
        // TODO recorder warning: selector confidence is low.
        selector3().click();
        logStep("step-006 NAVIGATE");
        // TODO recorder warning: selector confidence is low.
        open("https://nightly.tim-bpm.com/tim/client/home");
        logStep("step-007 CLICK");
        // TODO recorder warning: selector confidence is low.
        selector5().click();
        logStep("step-008 NAVIGATE");
        // TODO recorder warning: selector confidence is low.
        open("https://nightly.tim-bpm.com/tim/client/management/administration/635236/users");
        logStep("step-009 NAVIGATE");
        // TODO recorder warning: selector confidence is low.
        open("https://nightly.tim-bpm.com/tim/client/management/administration/635236/users?status=active");
        logStep("step-010 CLICK");
        // TODO recorder warning: selector confidence is low.
        selector8().click();
        logStep("step-011 TYPE");
        selector9().setValue("ad");
        logStep("step-012 CLICK");
        selector10().click();
        logStep("step-013 PRESS_KEY");
        selector11().sendKeys(Keys.ESCAPE);
        logStep("step-014 CLICK");
        selector12().click();
        logStep("step-015 NAVIGATE");
        // TODO recorder warning: selector confidence is low.
        open("https://nightly.tim-bpm.com/tim/client/management/administration/635236/users/644407/basic-info");
        logStep("step-016 TYPE");
        selector14().setValue("2222");
        logStep("step-017 CLICK");
        selector15().click();
        logStep("step-018 CLICK");
        selector16().click();
        logStep("step-019 NAVIGATE");
        // TODO recorder warning: selector confidence is low.
        open("https://nightly.tim-bpm.com/tim/client/login");
        logStep("step-002 PRESS_KEY");
        selector18().sendKeys(Keys.TAB);
    }

    @After
    public void cleanupScenario() {
        logStep("Scenario cleanup complete");
    }
}
