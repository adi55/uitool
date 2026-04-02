package com.timbpm.recorder;

import com.timbpm.recorder.app.AppPaths;
import com.timbpm.recorder.generator.GeneratedJavaFile;
import com.timbpm.recorder.generator.JavaTestGenerator;
import com.timbpm.recorder.io.ScenarioIO;
import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.playback.ReplayOptions;
import com.timbpm.recorder.playback.ReplayReport;
import com.timbpm.recorder.playback.ScenarioPlaybackRunner;
import com.timbpm.recorder.profile.FrameworkProfile;
import com.timbpm.recorder.profile.ProfileRegistry;
import com.timbpm.recorder.server.RecorderServer;
import com.timbpm.recorder.validation.ScenarioValidationResult;
import com.timbpm.recorder.validation.ScenarioValidator;
import com.timbpm.recorder.validation.ValidationIssue;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class Main {
    private Main() {
    }

    public static void main(String[] args) throws Exception {
        AppPaths paths = AppPaths.discover();
        ProfileRegistry profileRegistry = new ProfileRegistry();
        ScenarioValidator validator = new ScenarioValidator();
        profileRegistry.loadFromDirectory(paths.profilesDir());

        if (args.length == 0 || "server".equalsIgnoreCase(args[0])) {
            int port = args.length > 1 ? Integer.parseInt(args[1]) : 17845;
            RecorderServer server = new RecorderServer(paths, profileRegistry);
            server.start(port);
            System.out.println("Recorder server started on http://127.0.0.1:" + port);
            Thread.currentThread().join();
            return;
        }

        if ("generate".equalsIgnoreCase(args[0])) {
            Map<String, String> options = parseOptions(args);
            ScenarioDocument scenario = ScenarioIO.read(Path.of(options.get("--scenario")));
            requireValid(scenario, validator);
            String profileId = options.getOrDefault("--profile", scenario.getMetadata().getProfileId());
            FrameworkProfile profile = profileRegistry.require(profileId == null || profileId.isBlank() ? "tim-ui-junit4-selenide" : profileId);
            GeneratedJavaFile generated = new JavaTestGenerator().generate(
                scenario,
                profile,
                paths.generatedDir().resolve("java"),
                options.get("--class")
            );
            Files.createDirectories(generated.outputPath().getParent());
            Files.writeString(generated.outputPath(), generated.source(), StandardCharsets.UTF_8);
            System.out.println(generated.outputPath());
            return;
        }

        if ("replay".equalsIgnoreCase(args[0])) {
            Map<String, String> options = parseOptions(args);
            ScenarioDocument scenario = ScenarioIO.read(Path.of(options.get("--scenario")));
            requireValid(scenario, validator);
            ReplayOptions replayOptions = new ReplayOptions();
            replayOptions.setHeadless(Boolean.parseBoolean(options.getOrDefault("--headless", "true")));
            replayOptions.setStartIndex(Integer.parseInt(options.getOrDefault("--startIndex", "0")));
            if (options.containsKey("--debugPort")) {
                replayOptions.setDebugPort(Integer.parseInt(options.get("--debugPort")));
            }
            ReplayReport report = new ScenarioPlaybackRunner().replay(scenario, replayOptions);
            System.out.println(report.isSuccess() ? "SUCCESS" : "FAILED");
            System.out.println(report.getFinalUrl());
            report.getLogs().forEach(log -> System.out.println(log.level() + " " + log.message()));
            return;
        }

        if ("validate".equalsIgnoreCase(args[0])) {
            Map<String, String> options = parseOptions(args);
            ScenarioDocument scenario = ScenarioIO.read(Path.of(options.get("--scenario")));
            ScenarioValidationResult result = validator.validate(scenario);
            printValidationResult(result);
            if (!result.isValid()) {
                throw new IllegalArgumentException("Scenario validation failed");
            }
            return;
        }

        System.out.println("Usage:");
        System.out.println("  java -jar recorder-tool.jar server [port]");
        System.out.println("  java -cp build\\\\classes com.timbpm.recorder.Main generate --scenario <path> [--profile <id>] [--class <name>]");
        System.out.println("  java -cp build\\\\classes com.timbpm.recorder.Main replay --scenario <path> [--headless true|false] [--startIndex N] [--debugPort N]");
        System.out.println("  java -cp build\\\\classes com.timbpm.recorder.Main validate --scenario <path>");
    }

    private static Map<String, String> parseOptions(String[] args) {
        Map<String, String> options = new LinkedHashMap<>();
        for (int index = 1; index < args.length; index++) {
            String key = args[index];
            if (key.startsWith("--") && index + 1 < args.length) {
                options.put(key, args[index + 1]);
                index++;
            }
        }
        return options;
    }

    private static void requireValid(ScenarioDocument scenario, ScenarioValidator validator) {
        ScenarioValidationResult result = validator.validate(scenario);
        printValidationResult(result);
        if (!result.isValid()) {
            throw new IllegalArgumentException("Scenario validation failed");
        }
    }

    private static void printValidationResult(ScenarioValidationResult result) {
        if (result.warningCount() == 0 && result.errorCount() == 0) {
            return;
        }
        for (ValidationIssue issue : result.getIssues()) {
            System.out.println(issue.severity().toUpperCase() + " " + issue.path() + " " + issue.message());
        }
    }
}
