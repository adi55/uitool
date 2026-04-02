package com.timbpm.recorder.tests;

import java.util.ArrayList;
import java.util.List;

public final class RecorderToolSelfTest {
    private final List<String> failures = new ArrayList<>();

    public static void main(String[] args) {
        RecorderToolSelfTest testSuite = new RecorderToolSelfTest();
        testSuite.run();
    }

    private void run() {
        new SelectorRankerTest().run(this);
        new ScenarioIoTest().run(this);
        new StructuredDataTest().run(this);
        new ScenarioValidationTest().run(this);
        new ScenarioStepIdRepairTest().run(this);
        new JavaGeneratorTest().run(this);
        if (!failures.isEmpty()) {
            failures.forEach(System.err::println);
            throw new IllegalStateException("Recorder self-tests failed: " + failures.size());
        }
        System.out.println("Recorder self-tests passed");
    }

    void assertTrue(boolean condition, String message) {
        if (!condition) {
            failures.add(message);
        }
    }

    void assertEquals(Object expected, Object actual, String message) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            failures.add(message + " expected=" + expected + " actual=" + actual);
        }
    }
}
