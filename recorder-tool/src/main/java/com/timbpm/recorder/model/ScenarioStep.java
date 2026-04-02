package com.timbpm.recorder.model;

import com.timbpm.recorder.util.DataAccess;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ScenarioStep {
    private String id;
    private StepType type;
    private StepStage stage = StepStage.TEST;
    private String description;
    private String note;
    private long timestamp;
    private String url;
    private String visibleText;
    private String value;
    private String expectedValue;
    private String key;
    private String optionText;
    private Boolean checked;
    private Boolean enabled;
    private String uploadAlias;
    private final List<String> fileNames = new ArrayList<>();
    private String screenshotPath;
    private String todo;
    private final List<String> tags = new ArrayList<>();
    private final List<String> mappingHints = new ArrayList<>();
    private SelectorMetadata selector = new SelectorMetadata();
    private FrameContext frameContext = new FrameContext();
    private WindowContext windowContext = new WindowContext();
    private WaitStrategy waitStrategy = new WaitStrategy();
    private final Map<String, Object> extra = new LinkedHashMap<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public StepType getType() {
        return type;
    }

    public void setType(StepType type) {
        this.type = type;
    }

    public StepStage getStage() {
        return stage;
    }

    public void setStage(StepStage stage) {
        this.stage = stage;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getVisibleText() {
        return visibleText;
    }

    public void setVisibleText(String visibleText) {
        this.visibleText = visibleText;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public String getExpectedValue() {
        return expectedValue;
    }

    public void setExpectedValue(String expectedValue) {
        this.expectedValue = expectedValue;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getOptionText() {
        return optionText;
    }

    public void setOptionText(String optionText) {
        this.optionText = optionText;
    }

    public Boolean getChecked() {
        return checked;
    }

    public void setChecked(Boolean checked) {
        this.checked = checked;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getUploadAlias() {
        return uploadAlias;
    }

    public void setUploadAlias(String uploadAlias) {
        this.uploadAlias = uploadAlias;
    }

    public List<String> getFileNames() {
        return fileNames;
    }

    public String getScreenshotPath() {
        return screenshotPath;
    }

    public void setScreenshotPath(String screenshotPath) {
        this.screenshotPath = screenshotPath;
    }

    public String getTodo() {
        return todo;
    }

    public void setTodo(String todo) {
        this.todo = todo;
    }

    public List<String> getTags() {
        return tags;
    }

    public List<String> getMappingHints() {
        return mappingHints;
    }

    public SelectorMetadata getSelector() {
        return selector;
    }

    public void setSelector(SelectorMetadata selector) {
        this.selector = selector;
    }

    public FrameContext getFrameContext() {
        return frameContext;
    }

    public void setFrameContext(FrameContext frameContext) {
        this.frameContext = frameContext;
    }

    public WindowContext getWindowContext() {
        return windowContext;
    }

    public void setWindowContext(WindowContext windowContext) {
        this.windowContext = windowContext;
    }

    public WaitStrategy getWaitStrategy() {
        return waitStrategy;
    }

    public void setWaitStrategy(WaitStrategy waitStrategy) {
        this.waitStrategy = waitStrategy;
    }

    public Map<String, Object> getExtra() {
        return extra;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", id);
        map.put("type", type == null ? null : type.name().toLowerCase());
        map.put("stage", stage.name().toLowerCase());
        map.put("description", description);
        map.put("note", note);
        map.put("timestamp", timestamp);
        map.put("url", url);
        map.put("visibleText", visibleText);
        map.put("value", value);
        map.put("expectedValue", expectedValue);
        map.put("key", key);
        map.put("optionText", optionText);
        map.put("checked", checked);
        map.put("enabled", enabled);
        map.put("uploadAlias", uploadAlias);
        map.put("fileNames", new ArrayList<>(fileNames));
        map.put("screenshotPath", screenshotPath);
        map.put("todo", todo);
        map.put("tags", new ArrayList<>(tags));
        map.put("mappingHints", new ArrayList<>(mappingHints));
        map.put("selector", selector == null ? null : selector.toMap());
        map.put("frameContext", frameContext == null ? null : frameContext.toMap());
        map.put("windowContext", windowContext == null ? null : windowContext.toMap());
        map.put("waitStrategy", waitStrategy == null ? null : waitStrategy.toMap());
        map.put("extra", new LinkedHashMap<>(extra));
        return map;
    }

    public static ScenarioStep fromMap(Map<String, Object> source) {
        ScenarioStep step = new ScenarioStep();
        step.setId(DataAccess.string(source, "id", null));
        String typeText = DataAccess.string(source, "type", null);
        step.setType(typeText == null ? null : StepType.fromText(typeText));
        step.setStage(StepStage.fromText(DataAccess.string(source, "stage", "test")));
        step.setDescription(DataAccess.string(source, "description", null));
        step.setNote(DataAccess.string(source, "note", null));
        step.setTimestamp(DataAccess.longValue(source, "timestamp", 0L));
        step.setUrl(DataAccess.string(source, "url", null));
        step.setVisibleText(DataAccess.string(source, "visibleText", null));
        step.setValue(DataAccess.string(source, "value", null));
        step.setExpectedValue(DataAccess.string(source, "expectedValue", null));
        step.setKey(DataAccess.string(source, "key", null));
        step.setOptionText(DataAccess.string(source, "optionText", null));
        step.setChecked(DataAccess.bool(source, "checked", null));
        step.setEnabled(DataAccess.bool(source, "enabled", null));
        step.setUploadAlias(DataAccess.string(source, "uploadAlias", null));
        step.getFileNames().addAll(DataAccess.stringList(source, "fileNames"));
        step.setScreenshotPath(DataAccess.string(source, "screenshotPath", null));
        step.setTodo(DataAccess.string(source, "todo", null));
        step.getTags().addAll(DataAccess.stringList(source, "tags"));
        step.getMappingHints().addAll(DataAccess.stringList(source, "mappingHints"));
        step.setSelector(SelectorMetadata.fromMap(DataAccess.childMap(source, "selector")));
        step.setFrameContext(FrameContext.fromMap(DataAccess.childMap(source, "frameContext")));
        step.setWindowContext(WindowContext.fromMap(DataAccess.childMap(source, "windowContext")));
        step.setWaitStrategy(WaitStrategy.fromMap(DataAccess.childMap(source, "waitStrategy")));
        step.getExtra().putAll(DataAccess.childMap(source, "extra"));
        return step;
    }
}
