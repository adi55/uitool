package com.timbpm.recorder.tests;

import com.timbpm.recorder.util.DataAccess;
import com.timbpm.recorder.util.StructuredData;
import java.util.List;
import java.util.Map;

final class StructuredDataTest {
    void run(RecorderToolSelfTest test) {
        Map<String, Object> parsedExponent = DataAccess.map(
            StructuredData.parseJson("{\"value\":1.234e+5,\"small\":-4E-2}")
        );
        test.assertEquals(123400.0d, parsedExponent.get("value"), "JSON parser should support exponent notation");
        test.assertEquals(-0.04d, parsedExponent.get("small"), "JSON parser should support signed exponents");

        Map<String, Object> parsedUnicode = DataAccess.map(
            StructuredData.parseJson("{\"text\":\"chrome-extension:\\/\\/abc\\u002Fpanel.html\"}")
        );
        test.assertEquals(
            "chrome-extension://abc/panel.html",
            parsedUnicode.get("text"),
            "JSON parser should decode unicode escapes used in Chrome protocol payloads"
        );

        Map<String, Object> parsedYaml = DataAccess.map(
            StructuredData.parseYaml(
                """
                setup:
                  - id: "step-001"
                    type: "navigate"
                    selector:
                      candidates:
                        - strategy: "css"
                          value: "#login"
                  -
                    id: "step-002"
                    type: "click"
                """
            )
        );
        List<Map<String, Object>> setup = DataAccess.listOfMaps(parsedYaml, "setup");
        test.assertEquals(2, setup.size(), "YAML parser should preserve both list entries");
        test.assertEquals("step-001", DataAccess.string(setup.get(0), "id", null), "YAML parser should support inline list maps");
        test.assertEquals("navigate", DataAccess.string(setup.get(0), "type", null), "YAML parser should preserve inline map fields");
        Map<String, Object> selector = DataAccess.childMap(setup.get(0), "selector");
        List<Map<String, Object>> candidates = DataAccess.listOfMaps(selector, "candidates");
        test.assertEquals("css", DataAccess.string(candidates.get(0), "strategy", null), "YAML parser should support nested inline list maps");
        test.assertEquals("step-002", DataAccess.string(setup.get(1), "id", null), "YAML parser should support dash-only list entries");
    }
}
