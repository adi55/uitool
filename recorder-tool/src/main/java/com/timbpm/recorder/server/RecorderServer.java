package com.timbpm.recorder.server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.timbpm.recorder.app.AppPaths;
import com.timbpm.recorder.generator.GeneratedJavaFile;
import com.timbpm.recorder.generator.JavaTestGenerator;
import com.timbpm.recorder.io.ScenarioIO;
import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.playback.PlaybackLogEntry;
import com.timbpm.recorder.playback.ReplayOptions;
import com.timbpm.recorder.playback.ReplayReport;
import com.timbpm.recorder.playback.ScenarioPlaybackRunner;
import com.timbpm.recorder.profile.FrameworkProfile;
import com.timbpm.recorder.profile.ProfileRegistry;
import com.timbpm.recorder.util.DataAccess;
import com.timbpm.recorder.util.StructuredData;
import com.timbpm.recorder.validation.ScenarioValidationResult;
import com.timbpm.recorder.validation.ScenarioValidator;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

public final class RecorderServer {
    private final AppPaths appPaths;
    private final ProfileRegistry profileRegistry;
    private final JavaTestGenerator generator = new JavaTestGenerator();
    private final ScenarioPlaybackRunner playbackRunner = new ScenarioPlaybackRunner();
    private final ScenarioValidator validator = new ScenarioValidator();
    private HttpServer server;

    public RecorderServer(AppPaths appPaths, ProfileRegistry profileRegistry) {
        this.appPaths = appPaths;
        this.profileRegistry = profileRegistry;
    }

    public void start(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/api/health", this::handleHealth);
        server.createContext("/api/profiles", this::handleProfiles);
        server.createContext("/api/scenario/list", this::handleListScenarios);
        server.createContext("/api/scenario/load", this::handleLoadScenario);
        server.createContext("/api/scenario/validate", this::handleValidateScenario);
        server.createContext("/api/scenario/save", this::handleSaveScenario);
        server.createContext("/api/generate/java", this::handleGenerateJava);
        server.createContext("/api/replay", this::handleReplay);
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("status", "ok");
        response.put("profilesDir", appPaths.profilesDir().toString());
        response.put("examplesDir", appPaths.examplesDir().toString());
        response.put("generatedDir", appPaths.generatedDir().toString());
        sendJson(exchange, 200, response);
    }

    private void handleProfiles(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        List<Object> profiles = new ArrayList<>();
        for (FrameworkProfile profile : profileRegistry.all()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", profile.getId());
            item.put("displayName", profile.getOrDefault("profile.displayName", profile.getId()));
            item.put("properties", new LinkedHashMap<>(profile.getProperties()));
            profiles.add(item);
        }
        sendJson(exchange, 200, Map.of("profiles", profiles));
    }

    private void handleListScenarios(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        List<Object> scenarios = new ArrayList<>();
        try (var stream = Files.list(appPaths.examplesDir())) {
            stream
                .sorted()
                .filter(path -> {
                    String fileName = path.getFileName().toString().toLowerCase();
                    return fileName.endsWith(".json") || fileName.endsWith(".yaml") || fileName.endsWith(".yml");
                })
                .forEach(path -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("fileName", path.getFileName().toString());
                    item.put("path", path.toString());
                    item.put("format", detectFormat(path));
                    scenarios.add(item);
                });
        }
        sendJson(exchange, 200, Map.of("scenarios", scenarios));
    }

    private void handleLoadScenario(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        String fileName = queryParams(exchange).get("file");
        if (fileName == null || fileName.isBlank()) {
            sendJson(exchange, 400, Map.of("error", "Missing file query parameter"));
            return;
        }
        Path path = resolveExampleFile(fileName);
        if (!Files.exists(path)) {
            sendJson(exchange, 404, Map.of("error", "Scenario not found"));
            return;
        }
        ScenarioDocument scenario = ScenarioIO.read(path);
        sendJson(exchange, 200, Map.of(
            "fileName", fileName,
            "format", detectFormat(path),
            "scenario", scenario.toMap()
        ));
    }

    private void handleValidateScenario(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        Map<String, Object> request = readJsonBody(exchange);
        ScenarioDocument scenario = readScenario(request);
        ScenarioValidationResult result = validator.validate(scenario);
        sendJson(exchange, result.isValid() ? 200 : 400, result.toMap());
    }

    private void handleSaveScenario(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        Map<String, Object> request = readJsonBody(exchange);
        ScenarioDocument scenario = readScenario(request);
        if (sendValidationIfInvalid(exchange, scenario)) {
            return;
        }
        String fileName = DataAccess.string(request, "fileName", "recorded-scenario.json");
        String format = DataAccess.string(request, "format", fileName.endsWith(".yaml") || fileName.endsWith(".yml") ? "yaml" : "json");
        Path path = resolveExampleFile(fileName);
        if ("yaml".equalsIgnoreCase(format) || fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
            ScenarioIO.writeYaml(path, scenario);
        } else {
            ScenarioIO.writeJson(path, scenario);
        }
        sendJson(exchange, 200, Map.of("saved", true, "path", path.toString(), "format", format));
    }

    private void handleGenerateJava(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        Map<String, Object> request = readJsonBody(exchange);
        ScenarioDocument scenario = readScenario(request);
        if (sendValidationIfInvalid(exchange, scenario)) {
            return;
        }
        String profileId = DataAccess.string(request, "profileId", scenario.getMetadata().getProfileId());
        FrameworkProfile profile = profileRegistry.require(profileId == null || profileId.isBlank() ? "tim-ui-junit4-selenide" : profileId);
        String className = DataAccess.string(request, "className", null);
        GeneratedJavaFile generated = generator.generate(scenario, profile, appPaths.generatedDir().resolve("java"), className);
        Files.createDirectories(generated.outputPath().getParent());
        Files.writeString(generated.outputPath(), generated.source(), StandardCharsets.UTF_8);
        sendJson(exchange, 200, Map.of(
            "className", generated.className(),
            "path", generated.outputPath().toString(),
            "source", generated.source()
        ));
    }

    private void handleReplay(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, Map.of("error", "Method not allowed"));
            return;
        }
        Map<String, Object> request = readJsonBody(exchange);
        ScenarioDocument scenario = readScenario(request);
        if (sendValidationIfInvalid(exchange, scenario)) {
            return;
        }
        ReplayOptions options = new ReplayOptions();
        options.setHeadless(DataAccess.bool(request, "headless", true));
        options.setStartIndex(DataAccess.integer(request, "startIndex", 0));
        options.setDebugPort(DataAccess.integer(request, "debugPort", null));
        for (Map.Entry<String, Object> entry : DataAccess.childMap(request, "uploadMappings").entrySet()) {
            options.getUploadMappings().put(entry.getKey(), String.valueOf(entry.getValue()));
        }
        ReplayReport report = playbackRunner.replay(scenario, options);
        List<Object> logs = new ArrayList<>();
        for (PlaybackLogEntry entry : report.getLogs()) {
            logs.add(Map.of("level", entry.level(), "message", entry.message()));
        }
        sendJson(exchange, 200, Map.of(
            "success", report.isSuccess(),
            "finalUrl", report.getFinalUrl(),
            "failedStepId", report.getFailedStepId(),
            "logs", logs
        ));
    }

    private Map<String, Object> readJsonBody(HttpExchange exchange) throws IOException {
        try (InputStream inputStream = exchange.getRequestBody()) {
            String body = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
            if (body.isBlank()) {
                return new LinkedHashMap<>();
            }
            return DataAccess.map(StructuredData.parseJson(body));
        }
    }

    private ScenarioDocument readScenario(Map<String, Object> request) {
        Map<String, Object> scenarioMap = DataAccess.childMap(request, "scenario");
        if (scenarioMap.isEmpty()) {
            return ScenarioDocument.fromMap(request);
        }
        return ScenarioDocument.fromMap(scenarioMap);
    }

    private boolean sendValidationIfInvalid(HttpExchange exchange, ScenarioDocument scenario) throws IOException {
        ScenarioValidationResult result = validator.validate(scenario);
        if (result.isValid()) {
            return false;
        }
        sendJson(exchange, 400, result.toMap());
        return true;
    }

    private Map<String, String> queryParams(HttpExchange exchange) {
        Map<String, String> params = new LinkedHashMap<>();
        String query = exchange.getRequestURI().getRawQuery();
        if (query == null || query.isBlank()) {
            return params;
        }
        for (String pair : query.split("&")) {
            if (pair.isBlank()) {
                continue;
            }
            String[] parts = pair.split("=", 2);
            String key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
            String value = parts.length > 1 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "";
            params.put(key, value);
        }
        return params;
    }

    private Path resolveExampleFile(String fileName) {
        Path candidate = appPaths.examplesDir().resolve(fileName).normalize();
        if (!candidate.startsWith(appPaths.examplesDir())) {
            throw new IllegalArgumentException("Scenario path must stay within the examples directory");
        }
        return candidate;
    }

    private String detectFormat(Path path) {
        String fileName = path.getFileName().toString().toLowerCase();
        return fileName.endsWith(".yaml") || fileName.endsWith(".yml") ? "yaml" : "json";
    }

    private void sendJson(HttpExchange exchange, int statusCode, Map<String, Object> body) throws IOException {
        byte[] payload = StructuredData.toJson(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        exchange.sendResponseHeaders(statusCode, payload.length);
        exchange.getResponseBody().write(payload);
        exchange.close();
    }

    private boolean handleOptions(HttpExchange exchange) throws IOException {
        if (!"OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            return false;
        }
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
        return true;
    }
}
