package com.timbpm.recorder.playback;

import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.model.SelectorCandidate;
import com.timbpm.recorder.model.SelectorMetadata;
import com.timbpm.recorder.model.StepType;
import com.timbpm.recorder.model.WaitKind;
import com.timbpm.recorder.model.WaitStrategy;
import com.timbpm.recorder.model.WindowContext;
import com.timbpm.recorder.util.DataAccess;
import com.timbpm.recorder.util.StructuredData;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

public final class BrowserSession implements AutoCloseable {
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final Process process;
    private final int debugPort;
    private final Path userDataDir;
    private final boolean ownsProcess;
    private final Consumer<PlaybackLogEntry> logSink;
    private CdpClient cdpClient;
    private String lastAlertText;
    private String targetUrlHint;
    private boolean recoveringExecutionContext;

    private BrowserSession(Process process, int debugPort, Path userDataDir, boolean ownsProcess, Consumer<PlaybackLogEntry> logSink) {
        this.process = process;
        this.debugPort = debugPort;
        this.userDataDir = userDataDir;
        this.ownsProcess = ownsProcess;
        this.logSink = logSink == null ? entry -> {
        } : logSink;
    }

    public static BrowserSession launch(boolean headless) {
        return launch(headless, null, null);
    }

    public static BrowserSession launch(boolean headless, String initialUrl) {
        return launch(headless, initialUrl, null);
    }

    public static BrowserSession launch(boolean headless, String initialUrl, Consumer<PlaybackLogEntry> logSink) {
        try {
            String chrome = locateChrome();
            int port = freePort();
            Path userDataDir = Files.createTempDirectory("recorder-tool-chrome-profile");
            List<String> command = new ArrayList<>();
            command.add(chrome);
            command.add("--remote-debugging-port=" + port);
            command.add("--user-data-dir=" + userDataDir.toAbsolutePath());
            command.add("--no-first-run");
            command.add("--no-default-browser-check");
            command.add("--disable-popup-blocking");
            command.add("--disable-background-networking");
            if (headless) {
                command.add("--headless=new");
                command.add("--disable-gpu");
            }
            if (initialUrl != null && !initialUrl.isBlank()) {
                command.add(initialUrl);
            }
            ProcessBuilder processBuilder = new ProcessBuilder(command);
            processBuilder.redirectError(ProcessBuilder.Redirect.DISCARD);
            processBuilder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            Process process = processBuilder.start();
            BrowserSession session = new BrowserSession(process, port, userDataDir, true, logSink);
            session.info("Launched Chrome with remote debugging port " + port);
            session.waitForDebugger();
            if (initialUrl != null && !initialUrl.isBlank()) {
                session.connectToBestPage(initialUrl);
                session.waitForDocumentReady(15000);
            } else {
                session.connectToFirstPage();
            }
            return session;
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to launch Chrome", exception);
        }
    }

    public static BrowserSession attach(int debugPort, String preferredUrl, Consumer<PlaybackLogEntry> logSink) {
        BrowserSession session = new BrowserSession(null, debugPort, null, false, logSink);
        session.info("Attaching to existing Chrome debugger on port " + debugPort);
        session.waitForDebugger();
        if (preferredUrl != null && !preferredUrl.isBlank()) {
            session.connectToBestPage(preferredUrl);
            session.waitForDocumentReady(15000);
        } else {
            session.connectToFirstPage();
        }
        return session;
    }

    public void executeStep(ScenarioStep step, Map<String, String> uploadMappings) {
        if (step.getWindowContext() != null) {
            switchWindow(step.getWindowContext());
        }
        StepType type = step.getType();
        if (type == null) {
            return;
        }
        switch (type) {
            case NAVIGATE -> {
                info("Navigating to " + step.getValue());
                navigate(step.getValue());
                sleep(500);
                connectToBestPage(step.getValue());
                waitForDocumentReady(10000);
            }
            case WAIT -> waitFor(step.getWaitStrategy(), step, 8000);
            case ASSERT_ALERT_PRESENT -> {
                if (lastAlertText == null) {
                    throw new IllegalStateException("Expected alert to be present");
                }
            }
            case ASSERT_ALERT_TEXT -> {
                if (lastAlertText == null || !lastAlertText.contains(step.getExpectedValue())) {
                    throw new IllegalStateException("Alert text mismatch. Expected contains: " + step.getExpectedValue() + ", actual: " + lastAlertText);
                }
            }
            case ACCEPT_ALERT -> cdpClient.sendCommand("Page.handleJavaScriptDialog", Map.of("accept", true));
            case DISMISS_ALERT -> cdpClient.sendCommand("Page.handleJavaScriptDialog", Map.of("accept", false));
            case UPLOAD_FILE -> uploadFile(step, uploadMappings);
            default -> {
                Map<String, Object> response = evaluateByValue(buildActionScript(step));
                if (!DataAccess.bool(response, "ok", false)) {
                    throw new IllegalStateException(
                        DataAccess.string(response, "error", "Unknown browser action error")
                            + " [" + describeSelector(step.getSelector()) + "]"
                    );
                }
                if (step.getWaitStrategy() != null && step.getWaitStrategy().getKind() != WaitKind.NONE) {
                    waitFor(step.getWaitStrategy(), step, step.getWaitStrategy().getTimeoutMs() == null ? 8000 : step.getWaitStrategy().getTimeoutMs());
                }
            }
        }
    }

    public String currentUrl() {
        try {
            Map<String, Object> response = evaluateByValue("(() => ({ok: true, value: window.location.href}))()");
            return DataAccess.string(response, "value", "");
        } catch (Exception exception) {
            return "";
        }
    }

    private void connectToFirstPage() {
        List<Map<String, Object>> targets = listPageTargets();
        if (targets.isEmpty()) {
            throw new IllegalStateException("Chrome started without a page target");
        }
        info("Connecting to first available page target");
        connectToTarget(targets.get(0));
    }

    private void connectToBestPage(String preferredUrl) {
        long deadline = System.currentTimeMillis() + 10000;
        RuntimeException lastError = null;
        while (System.currentTimeMillis() < deadline) {
            List<Map<String, Object>> targets = listPageTargets();
            if (!targets.isEmpty()) {
                Map<String, Object> preferred = null;
                for (Map<String, Object> target : targets) {
                    String targetUrl = DataAccess.string(target, "url", "");
                    if (preferredUrl != null && !preferredUrl.isBlank() && targetUrl.contains(preferredUrl)) {
                        preferred = target;
                        break;
                    }
                    if (preferred == null && targetUrl != null && !targetUrl.isBlank() && !"about:blank".equals(targetUrl)) {
                        preferred = target;
                    }
                }
                try {
                    info("Connecting to page target for " + (preferredUrl == null ? "active page" : preferredUrl));
                    connectToTarget(preferred == null ? targets.get(0) : preferred);
                    return;
                } catch (RuntimeException exception) {
                    lastError = exception;
                    warn("Target connection attempt failed: " + exception.getMessage());
                }
            }
            sleep(300);
        }
        throw new IllegalStateException("Chrome page target not found after navigation", lastError);
    }

    private void connectToTarget(Map<String, Object> target) {
        if (cdpClient != null) {
            cdpClient.close();
        }
        String webSocketDebuggerUrl = DataAccess.string(target, "webSocketDebuggerUrl", null);
        if (webSocketDebuggerUrl == null) {
            throw new IllegalStateException("Missing webSocketDebuggerUrl for target " + target);
        }
        RuntimeException lastError = null;
        targetUrlHint = DataAccess.string(target, "url", "");
        for (int attempt = 0; attempt < 4; attempt++) {
            try {
                info("Opening CDP websocket attempt " + (attempt + 1) + " for " + targetUrlHint);
                cdpClient = CdpClient.connect(webSocketDebuggerUrl);
                cdpClient.addEventListener(event -> {
                    String method = DataAccess.string(event, "method", "");
                    if ("Page.javascriptDialogOpening".equals(method)) {
                        Map<String, Object> params = DataAccess.childMap(event, "params");
                        lastAlertText = DataAccess.string(params, "message", null);
                        info("Observed browser dialog: " + lastAlertText);
                    }
                });
                cdpClient.sendCommand("Page.enable", Map.of());
                cdpClient.sendCommand("Runtime.enable", Map.of());
                cdpClient.sendCommand("DOM.enable", Map.of());
                try {
                    cdpClient.sendCommand("Page.bringToFront", Map.of());
                } catch (Exception ignored) {
                }
                return;
            } catch (RuntimeException exception) {
                lastError = exception;
                if (cdpClient != null) {
                    cdpClient.close();
                }
                warn("CDP websocket connection failed: " + exception.getMessage());
                sleep(300);
            }
        }
        throw new IllegalStateException("Failed to connect to target " + target, lastError);
    }

    private void navigate(String url) {
        targetUrlHint = url == null ? "" : url;
        cdpClient.sendCommand("Page.navigate", Map.of("url", url));
    }

    private void switchWindow(WindowContext windowContext) {
        if (windowContext == null) {
            return;
        }
        List<Map<String, Object>> targets = listPageTargets();
        if (targets.isEmpty()) {
            return;
        }
        Map<String, Object> match = null;
        if (windowContext.getIndex() != null && windowContext.getIndex() >= 0 && windowContext.getIndex() < targets.size()) {
            match = targets.get(windowContext.getIndex());
        }
        if (match == null && windowContext.getUrl() != null) {
            for (Map<String, Object> target : targets) {
                if (DataAccess.string(target, "url", "").contains(windowContext.getUrl())) {
                    match = target;
                    break;
                }
            }
        }
        if (match == null && windowContext.getTitle() != null) {
            for (Map<String, Object> target : targets) {
                if (DataAccess.string(target, "title", "").contains(windowContext.getTitle())) {
                    match = target;
                    break;
                }
            }
        }
        if (match != null) {
            info("Switching window target to " + DataAccess.string(match, "url", DataAccess.string(match, "title", "window")));
            connectToTarget(match);
        }
    }

    private void uploadFile(ScenarioStep step, Map<String, String> uploadMappings) {
        String alias = step.getUploadAlias();
        String filePath = uploadMappings.get(alias);
        if (filePath == null || filePath.isBlank()) {
            throw new IllegalStateException("No upload path mapping supplied for alias: " + alias);
        }
        Path path = Path.of(filePath);
        if (!Files.exists(path)) {
            throw new IllegalStateException("Upload file path does not exist: " + filePath);
        }
        Map<String, Object> response = cdpClient.sendCommand(
            "Runtime.evaluate",
            Map.of("expression", buildElementHandleScript(step), "returnByValue", false, "awaitPromise", true)
        );
        Map<String, Object> remoteObject = DataAccess.childMap(response, "result");
        String objectId = DataAccess.string(remoteObject, "objectId", null);
        if (objectId == null) {
            throw new IllegalStateException("Failed to locate file input for alias " + alias);
        }
        Map<String, Object> nodeResponse = cdpClient.sendCommand("DOM.requestNode", Map.of("objectId", objectId));
        Integer nodeId = DataAccess.integer(nodeResponse, "nodeId", null);
        if (nodeId == null) {
            throw new IllegalStateException("Failed to resolve DOM node for upload step");
        }
        cdpClient.sendCommand("DOM.setFileInputFiles", Map.of("nodeId", nodeId, "files", List.of(path.toAbsolutePath().toString())));
        info("Uploaded file for alias " + alias + " from " + path.toAbsolutePath());
    }

    private void waitFor(WaitStrategy strategy, ScenarioStep step, int timeoutMs) {
        if (strategy == null || strategy.getKind() == WaitKind.NONE) {
            return;
        }
        info("Waiting for " + strategy.getKind() + " up to " + timeoutMs + "ms");
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (evaluateWait(strategy, step)) {
                info("Wait satisfied for " + strategy.getKind());
                return;
            }
            sleep(200);
        }
        throw new IllegalStateException("Timed out waiting for " + strategy.getKind() + " [" + describeSelector(step.getSelector()) + "]");
    }

    private boolean evaluateWait(WaitStrategy strategy, ScenarioStep step) {
        return switch (strategy.getKind()) {
            case URL_CHANGE -> currentUrl().contains(strategy.getExpectedUrlFragment() == null ? "" : strategy.getExpectedUrlFragment());
            case ALERT_PRESENT -> lastAlertText != null;
            case LOADING_OVERLAY_DISAPPEAR -> {
                Map<String, Object> response = evaluateByValue(
                    "(() => ({ok: true, done: !Array.from(document.querySelectorAll('.loading,.loading-overlay,.blockUI,.spinner,.busy-indicator')).some(el => !!(el.offsetParent || el.getClientRects().length))}))()"
                );
                yield DataAccess.bool(response, "done", false);
            }
            case VISIBLE, CLICKABLE, EXISTS, HIDDEN, DISAPPEAR, TEXT_CONTAINS, VALUE_EQUALS, ENABLED, DISABLED -> {
                Map<String, Object> response = evaluateByValue(buildWaitScript(strategy.getKind(), step));
                yield DataAccess.bool(response, "done", false);
            }
            case COLLECTION_SIZE -> {
                String cssSelector = strategy.getTargetSelector() == null ? "body" : strategy.getTargetSelector();
                Map<String, Object> response = evaluateByValue(
                    "(() => ({ok: true, done: document.querySelectorAll(" + quote(cssSelector) + ").length == "
                        + (strategy.getCollectionSize() == null ? 0 : strategy.getCollectionSize()) + "}))()"
                );
                yield DataAccess.bool(response, "done", false);
            }
            case CUSTOM_HELPER, NONE -> true;
        };
    }

    private void waitForDocumentReady(int timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            try {
                Map<String, Object> response = evaluateByValue("(() => ({ok: true, ready: document.readyState === 'complete'}))()");
                if (DataAccess.bool(response, "ready", false)) {
                    info("Document readyState reached complete");
                    return;
                }
            } catch (Exception exception) {
                if (!isRecoverableCdpError(exception)) {
                    throw exception;
                }
                warn("Document readiness check lost execution context, retrying");
            }
            sleep(200);
        }
        warn("Document readiness wait reached timeout for " + targetUrlHint);
    }

    private Map<String, Object> evaluateByValue(String expression) {
        RuntimeException lastError = null;
        for (int attempt = 0; attempt < 6; attempt++) {
            try {
                Map<String, Object> response = cdpClient.sendCommand(
                    "Runtime.evaluate",
                    Map.of("expression", expression, "returnByValue", true, "awaitPromise", true)
                );
                Map<String, Object> remoteObject = DataAccess.childMap(response, "result");
                return DataAccess.map(remoteObject.get("value"));
            } catch (RuntimeException exception) {
                lastError = exception;
                if (!isRecoverableCdpError(exception) || attempt == 5) {
                    throw exception;
                }
                warn("Runtime.evaluate failed, attempting CDP recovery: " + exception.getMessage());
                if (!recoveringExecutionContext) {
                    recoverExecutionContext();
                }
                sleep(250L * (attempt + 1));
            }
        }
        throw lastError == null ? new IllegalStateException("Runtime.evaluate failed") : lastError;
    }

    private void recoverExecutionContext() {
        recoveringExecutionContext = true;
        try {
            if (targetUrlHint != null && !targetUrlHint.isBlank()) {
                connectToBestPage(targetUrlHint);
            } else {
                connectToFirstPage();
            }
            waitForDocumentReady(8000);
        } catch (RuntimeException exception) {
            warn("CDP recovery attempt failed: " + exception.getMessage());
        } finally {
            recoveringExecutionContext = false;
        }
    }

    private String buildActionScript(ScenarioStep step) {
        String action = switch (step.getType()) {
            case CLICK -> "el.scrollIntoView({block:'center'}); el.click(); return {ok:true};";
            case DOUBLE_CLICK -> "el.dispatchEvent(new MouseEvent('dblclick', {bubbles:true})); return {ok:true};";
            case RIGHT_CLICK -> "el.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true})); return {ok:true};";
            case TYPE -> "el.focus(); el.value = " + quote(step.getValue()) + "; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return {ok:true};";
            case CLEAR -> "el.focus(); el.value = ''; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return {ok:true};";
            case PRESS_KEY -> "el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', {key:" + quote(step.getKey() == null ? "Enter" : step.getKey()) + ", bubbles:true})); el.dispatchEvent(new KeyboardEvent('keyup', {key:" + quote(step.getKey() == null ? "Enter" : step.getKey()) + ", bubbles:true})); return {ok:true};";
            case SELECT -> "el.value = " + quote(step.getValue()) + "; el.dispatchEvent(new Event('change', {bubbles:true})); return {ok:true};";
            case CHECKBOX_SET -> "el.checked = " + Boolean.TRUE.equals(step.getChecked()) + "; el.dispatchEvent(new Event('change', {bubbles:true})); return {ok:true};";
            case RADIO_SET -> "el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); return {ok:true};";
            case SWITCH_FRAME, SWITCH_DEFAULT_CONTENT, SWITCH_WINDOW -> "return {ok:true};";
            case ASSERT_TEXT_EQUALS -> "return ((el.innerText || el.textContent || '').trim() === " + quote(nullToEmpty(step.getExpectedValue())) + ") ? {ok:true} : {ok:false,error:'Text mismatch'};";
            case ASSERT_TEXT_CONTAINS -> "return ((el.innerText || el.textContent || '').trim().includes(" + quote(nullToEmpty(step.getExpectedValue())) + ")) ? {ok:true} : {ok:false,error:'Text not contained'};";
            case ASSERT_VISIBLE -> "const s = getComputedStyle(el); const visible = !!(el.offsetParent || el.getClientRects().length) && s.visibility !== 'hidden' && s.display !== 'none'; return visible ? {ok:true} : {ok:false,error:'Element not visible'};";
            case ASSERT_HIDDEN -> "const sh = getComputedStyle(el); const hidden = !(el.offsetParent || el.getClientRects().length) || sh.visibility === 'hidden' || sh.display === 'none'; return hidden ? {ok:true} : {ok:false,error:'Element still visible'};";
            case ASSERT_EXISTS -> "return {ok:true};";
            case ASSERT_NOT_EXISTS -> "return {ok:false,error:'Expected no element, but one was found'};";
            case ASSERT_ENABLED -> "return (!el.disabled) ? {ok:true} : {ok:false,error:'Element disabled'};";
            case ASSERT_DISABLED -> "return (el.disabled) ? {ok:true} : {ok:false,error:'Element enabled'};";
            case ASSERT_VALUE_EQUALS -> "return ((el.value || '') === " + quote(nullToEmpty(step.getExpectedValue())) + ") ? {ok:true} : {ok:false,error:'Value mismatch'};";
            case ASSERT_URL_CONTAINS -> "return window.location.href.includes(" + quote(nullToEmpty(step.getExpectedValue())) + ") ? {ok:true} : {ok:false,error:'URL mismatch'};";
            default -> "return {ok:true};";
        };
        boolean allowMissing = step.getType() == StepType.ASSERT_NOT_EXISTS || step.getType() == StepType.ASSERT_HIDDEN;
        return buildLocateElementScript(step, action, allowMissing);
    }

    private String buildWaitScript(WaitKind kind, ScenarioStep step) {
        String action = switch (kind) {
            case VISIBLE -> "const s = getComputedStyle(el); return {ok:true, done: !!(el.offsetParent || el.getClientRects().length) && s.visibility !== 'hidden' && s.display !== 'none'};";
            case CLICKABLE -> "const s = getComputedStyle(el); const clickable = !!(el.offsetParent || el.getClientRects().length) && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled; return {ok:true, done: clickable};";
            case EXISTS -> "return {ok:true, done:true};";
            case HIDDEN, DISAPPEAR -> "const s = getComputedStyle(el); return {ok:true, done: !(el.offsetParent || el.getClientRects().length) || s.visibility === 'hidden' || s.display === 'none'};";
            case TEXT_CONTAINS -> "return {ok:true, done: ((el.innerText || el.textContent || '').trim()).includes(" + quote(nullToEmpty(step.getWaitStrategy().getExpectedText())) + ")};";
            case VALUE_EQUALS -> "return {ok:true, done: ((el.value || '') === " + quote(nullToEmpty(step.getWaitStrategy().getExpectedValue())) + ")};";
            case ENABLED -> "return {ok:true, done: !el.disabled};";
            case DISABLED -> "return {ok:true, done: !!el.disabled};";
            default -> "return {ok:true, done:true};";
        };
        return buildLocateElementScript(
            step,
            action,
            kind == WaitKind.HIDDEN || kind == WaitKind.DISAPPEAR
        );
    }

    private String buildElementHandleScript(ScenarioStep step) {
        String base = buildLocateElementScript(step, "return el;", false);
        return base;
    }

    private String buildLocateElementScript(ScenarioStep step, String action, boolean allowMissing) {
        List<Map<String, Object>> candidates = new ArrayList<>();
        SelectorMetadata selector = step.getSelector();
        if (selector != null) {
            for (SelectorCandidate candidate : selector.getCandidates()) {
                candidates.add(candidate.toMap());
            }
            if (candidates.isEmpty() && selector.getPrimaryStrategy() != null) {
                Map<String, Object> fallback = new LinkedHashMap<>();
                fallback.put("strategy", selector.getPrimaryStrategy());
                fallback.put("value", selector.getPrimaryValue());
                candidates.add(fallback);
            }
        }
        String candidatesJson = StructuredData.toJson(candidates);
        String frameSelectorsJson = StructuredData.toJson(step.getFrameContext() == null ? List.of() : step.getFrameContext().getFrameSelectors());
        return """
            (() => {
              const candidates = %s;
              const frameSelectors = %s;
              function resolveDoc() {
                let currentWindow = window;
                for (const frameSelector of frameSelectors) {
                  const frame = currentWindow.document.querySelector(frameSelector);
                  if (!frame || !frame.contentWindow) {
                    return {error: 'Frame not found: ' + frameSelector};
                  }
                  currentWindow = frame.contentWindow;
                }
                return {doc: currentWindow.document};
              }
              function findByText(doc, expected) {
                return Array.from(doc.querySelectorAll('body *')).find(el => ((el.innerText || el.textContent || '').trim()).includes(expected));
              }
              function locate(doc, candidate) {
                switch (candidate.strategy) {
                  case 'id': return doc.getElementById(candidate.value);
                  case 'name': return doc.querySelector('[name="' + candidate.value.replaceAll('"', '\\"') + '"]');
                  case 'dataTestId': return doc.querySelector('[data-testid="' + candidate.value.replaceAll('"', '\\"') + '"]');
                  case 'dataQa': return doc.querySelector('[data-qa="' + candidate.value.replaceAll('"', '\\"') + '"]');
                  case 'ariaLabel': return doc.querySelector('[aria-label="' + candidate.value.replaceAll('"', '\\"') + '"]');
                  case 'text': return findByText(doc, candidate.value);
                  case 'label':
                    const label = Array.from(doc.querySelectorAll('label')).find(item => ((item.innerText || item.textContent || '').trim()) === candidate.value);
                    if (label && label.getAttribute('for')) {
                      return doc.getElementById(label.getAttribute('for'));
                    }
                    return label;
                  case 'xpath': return doc.evaluate(candidate.value, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                  case 'css': return doc.querySelector(candidate.value);
                  default: return null;
                }
              }
              const resolved = resolveDoc();
              if (resolved.error) {
                return {ok:false, error: resolved.error};
              }
              const doc = resolved.doc;
              let el = null;
              for (const candidate of candidates) {
                try {
                  el = locate(doc, candidate);
                } catch (error) {
                  el = null;
                }
                if (el) {
                  break;
                }
              }
              if (!el) {
                return %s ? {ok:true, done:true} : {ok:false, error:'Element not found'};
              }
              try {
                %s
              } catch (error) {
                return {ok:false, error:String(error)};
              }
            })()
            """.formatted(candidatesJson, frameSelectorsJson, allowMissing ? "true" : "false", action);
    }

    private List<Map<String, Object>> listPageTargets() {
        Map<String, Object> response = getJson("/json/list");
        List<Map<String, Object>> targets = new ArrayList<>();
        for (Object item : DataAccess.list(response.get("items"))) {
            Map<String, Object> target = DataAccess.map(item);
            if ("page".equals(DataAccess.string(target, "type", ""))) {
                targets.add(target);
            }
        }
        if (!targets.isEmpty()) {
            return targets;
        }
        for (Object item : DataAccess.list(response.get("targets"))) {
            Map<String, Object> target = DataAccess.map(item);
            if ("page".equals(DataAccess.string(target, "type", ""))) {
                targets.add(target);
            }
        }
        if (!targets.isEmpty()) {
            return targets;
        }
        if (response.containsKey("0")) {
            for (Object item : response.values()) {
                Map<String, Object> target = DataAccess.map(item);
                if ("page".equals(DataAccess.string(target, "type", ""))) {
                    targets.add(target);
                }
            }
        }
        if (targets.isEmpty()) {
            Object parsed = requestRawJson("/json/list");
            for (Object item : DataAccess.list(parsed)) {
                Map<String, Object> target = DataAccess.map(item);
                if ("page".equals(DataAccess.string(target, "type", ""))) {
                    targets.add(target);
                }
            }
        }
        return targets;
    }

    private Map<String, Object> getJson(String path) {
        return DataAccess.map(requestRawJson(path));
    }

    private Object requestRawJson(String path) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + debugPort + path))
                .GET()
                .timeout(Duration.ofSeconds(10))
                .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return StructuredData.parseJson(response.body());
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to query Chrome debugger endpoint " + path, exception);
        }
    }

    private void waitForDebugger() {
        long deadline = System.currentTimeMillis() + 15000;
        while (System.currentTimeMillis() < deadline) {
            try {
                requestRawJson("/json/version");
                info("Chrome debugger endpoint is ready on port " + debugPort);
                return;
            } catch (RuntimeException ignored) {
                sleep(250);
            }
        }
        throw new IllegalStateException("Chrome debugger endpoint did not become ready");
    }

    private static String locateChrome() {
        List<String> candidates = List.of(
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
        );
        for (String candidate : candidates) {
            if (Files.exists(Path.of(candidate))) {
                return candidate;
            }
        }
        throw new IllegalStateException("Google Chrome executable not found");
    }

    private static int freePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to find a free TCP port", exception);
        }
    }

    private String quote(String value) {
        return StructuredData.toJson(value == null ? "" : value);
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting", exception);
        }
    }

    @Override
    public void close() {
        if (cdpClient != null) {
            cdpClient.close();
        }
        if (ownsProcess && process != null) {
            process.destroyForcibly();
        }
        try {
            if (ownsProcess && userDataDir != null && Files.exists(userDataDir)) {
                Files.walk(userDataDir)
                    .sorted((left, right) -> right.getNameCount() - left.getNameCount())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignored) {
                        }
                    });
            }
        } catch (IOException ignored) {
        }
    }

    private boolean isRecoverableCdpError(Exception exception) {
        String message = exception.getMessage();
        if (message == null) {
            return false;
        }
        String normalized = message.toLowerCase();
        return normalized.contains("execution context")
            || normalized.contains("cannot find context")
            || normalized.contains("target closed")
            || normalized.contains("websocket is closed")
            || normalized.contains("inspected target navigated or closed")
            || normalized.contains("cannot find object with id");
    }

    private String describeSelector(SelectorMetadata selector) {
        if (selector == null) {
            return "no selector";
        }
        if (selector.getPrimaryStrategy() == null) {
            return "selector without primary strategy";
        }
        return selector.getPrimaryStrategy() + "=" + selector.getPrimaryValue();
    }

    private void info(String message) {
        logSink.accept(new PlaybackLogEntry("INFO", message));
    }

    private void warn(String message) {
        logSink.accept(new PlaybackLogEntry("WARN", message));
    }
}
