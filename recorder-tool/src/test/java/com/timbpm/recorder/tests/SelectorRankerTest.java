package com.timbpm.recorder.tests;

import com.timbpm.recorder.selector.ElementSnapshot;
import com.timbpm.recorder.selector.SelectorRanker;

final class SelectorRankerTest {
    void run(RecorderToolSelfTest test) {
        SelectorRanker ranker = new SelectorRanker();

        ElementSnapshot stableId = new ElementSnapshot();
        stableId.setTagName("button");
        stableId.setId("loginButton");
        stableId.setVisibleText("Login");
        stableId.setXpath("//*[@id='loginButton']");
        var rankedStable = ranker.rank(stableId);
        test.assertEquals("id", rankedStable.getPrimaryStrategy(), "Stable id should be preferred");

        ElementSnapshot dynamicId = new ElementSnapshot();
        dynamicId.setTagName("input");
        dynamicId.setId("ember120391203");
        dynamicId.setName("userName");
        dynamicId.setDataTestId("username-input");
        dynamicId.setXpath("//input[1]");
        var rankedDynamic = ranker.rank(dynamicId);
        test.assertEquals("dataTestId", rankedDynamic.getPrimaryStrategy(), "data-testid should beat dynamic-looking id");
        test.assertTrue(rankedDynamic.getConfidenceScore() >= 0.9, "data-testid should keep high confidence");

        ElementSnapshot explicitTestId = new ElementSnapshot();
        explicitTestId.setTagName("input");
        explicitTestId.setName("username");
        explicitTestId.setDataTestId("login-username");
        var rankedExplicitTestId = ranker.rank(explicitTestId);
        test.assertEquals("dataTestId", rankedExplicitTestId.getPrimaryStrategy(), "data-testid should outrank a stable name");
    }
}
