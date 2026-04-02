package com.timbpm.recorder.playback;

import com.timbpm.recorder.util.DataAccess;
import com.timbpm.recorder.util.StructuredData;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

public final class CdpClient implements WebSocket.Listener, AutoCloseable {
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final Map<Integer, CompletableFuture<Map<String, Object>>> pending = new ConcurrentHashMap<>();
    private final CopyOnWriteArrayList<Consumer<Map<String, Object>>> eventListeners = new CopyOnWriteArrayList<>();
    private final AtomicInteger ids = new AtomicInteger(1);
    private final AtomicReference<Throwable> terminalError = new AtomicReference<>();
    private final StringBuilder inboundText = new StringBuilder();
    private volatile boolean closed;
    private WebSocket webSocket;

    public static CdpClient connect(String webSocketDebuggerUrl) {
        CdpClient client = new CdpClient();
        client.webSocket = client.httpClient.newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .buildAsync(URI.create(webSocketDebuggerUrl), client)
            .join();
        return client;
    }

    public void addEventListener(Consumer<Map<String, Object>> listener) {
        eventListeners.add(listener);
    }

    public Map<String, Object> sendCommand(String method, Map<String, Object> params) {
        Throwable terminal = terminalError.get();
        if (closed || terminal != null) {
            throw new IllegalStateException("CDP websocket is closed", terminal);
        }
        int id = ids.getAndIncrement();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", id);
        payload.put("method", method);
        payload.put("params", params == null ? Map.of() : params);
        CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
        pending.put(id, future);
        webSocket.sendText(StructuredData.toJson(payload), true);
        try {
            Map<String, Object> response = future.get(30, TimeUnit.SECONDS);
            Map<String, Object> error = DataAccess.childMap(response, "error");
            if (!error.isEmpty()) {
                throw new IllegalStateException("CDP command failed: " + error);
            }
            return DataAccess.childMap(response, "result");
        } catch (Exception exception) {
            throw new IllegalStateException("CDP command failed for method " + method + ": " + exception.getMessage(), exception);
        } finally {
            pending.remove(id);
        }
    }

    @Override
    public void onOpen(WebSocket webSocket) {
        webSocket.request(1);
        WebSocket.Listener.super.onOpen(webSocket);
    }

    @Override
    public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
        synchronized (inboundText) {
            inboundText.append(data);
            if (last) {
                String payload = inboundText.toString();
                inboundText.setLength(0);
                try {
                    for (String rawMessage : splitJsonMessages(payload)) {
                        Map<String, Object> message = DataAccess.map(StructuredData.parseJson(rawMessage));
                        Integer id = DataAccess.integer(message, "id", null);
                        if (id != null) {
                            CompletableFuture<Map<String, Object>> future = pending.get(id);
                            if (future != null) {
                                future.complete(message);
                            }
                        } else {
                            for (Consumer<Map<String, Object>> listener : eventListeners) {
                                listener.accept(message);
                            }
                        }
                    }
                } catch (RuntimeException exception) {
                    IllegalStateException failure = new IllegalStateException(
                        "Failed to parse CDP payload: " + abbreviate(payload),
                        exception
                    );
                    closed = true;
                    terminalError.compareAndSet(null, failure);
                    failPending(failure);
                    try {
                        webSocket.abort();
                    } catch (Exception ignored) {
                    }
                }
            }
        }
        webSocket.request(1);
        return CompletableFuture.completedFuture(null);
    }

    @Override
    public CompletionStage<?> onBinary(WebSocket webSocket, ByteBuffer data, boolean last) {
        webSocket.request(1);
        return CompletableFuture.completedFuture(null);
    }

    @Override
    public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
        closed = true;
        IllegalStateException exception = new IllegalStateException("CDP websocket closed: " + statusCode + " " + reason);
        terminalError.compareAndSet(null, exception);
        failPending(exception);
        return CompletableFuture.completedFuture(null);
    }

    @Override
    public void onError(WebSocket webSocket, Throwable error) {
        closed = true;
        terminalError.compareAndSet(null, error);
        failPending(error);
    }

    @Override
    public void close() {
        if (webSocket != null) {
            try {
                webSocket.sendClose(WebSocket.NORMAL_CLOSURE, "bye").join();
            } catch (Exception ignored) {
            }
        }
    }

    private List<String> splitJsonMessages(String payload) {
        List<String> messages = new java.util.ArrayList<>();
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        int segmentStart = -1;
        for (int index = 0; index < payload.length(); index++) {
            char current = payload.charAt(index);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (current == '\\') {
                escaped = true;
                continue;
            }
            if (current == '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (current == '{') {
                if (depth == 0) {
                    segmentStart = index;
                }
                depth++;
            } else if (current == '}') {
                depth--;
                if (depth == 0 && segmentStart >= 0) {
                    messages.add(payload.substring(segmentStart, index + 1));
                    segmentStart = -1;
                }
            }
        }
        if (messages.isEmpty() && !payload.isBlank()) {
            messages.add(payload);
        }
        return messages;
    }

    private void failPending(Throwable error) {
        pending.values().forEach(future -> future.completeExceptionally(error));
    }

    private String abbreviate(String payload) {
        String sanitized = payload
            .replace("\r", "\\r")
            .replace("\n", "\\n");
        if (sanitized.length() <= 320) {
            return sanitized;
        }
        return sanitized.substring(0, 320) + "...";
    }
}
