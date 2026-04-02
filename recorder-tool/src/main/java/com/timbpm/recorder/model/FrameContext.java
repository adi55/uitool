package com.timbpm.recorder.model;

import com.timbpm.recorder.util.DataAccess;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class FrameContext {
    private final List<String> frameSelectors = new ArrayList<>();
    private String frameName;
    private boolean sameOrigin = true;

    public List<String> getFrameSelectors() {
        return frameSelectors;
    }

    public String getFrameName() {
        return frameName;
    }

    public void setFrameName(String frameName) {
        this.frameName = frameName;
    }

    public boolean isSameOrigin() {
        return sameOrigin;
    }

    public void setSameOrigin(boolean sameOrigin) {
        this.sameOrigin = sameOrigin;
    }

    public boolean isEmpty() {
        return frameSelectors.isEmpty() && (frameName == null || frameName.isBlank());
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("frameSelectors", new ArrayList<>(frameSelectors));
        map.put("frameName", frameName);
        map.put("sameOrigin", sameOrigin);
        return map;
    }

    public static FrameContext fromMap(Map<String, Object> source) {
        FrameContext context = new FrameContext();
        context.getFrameSelectors().addAll(DataAccess.stringList(source, "frameSelectors"));
        context.setFrameName(DataAccess.string(source, "frameName", null));
        context.setSameOrigin(DataAccess.bool(source, "sameOrigin", true));
        return context;
    }
}
