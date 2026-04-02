package com.timbpm.recorder.model;

import com.timbpm.recorder.util.DataAccess;
import java.util.LinkedHashMap;
import java.util.Map;

public final class WindowContext {
    private String title;
    private String url;
    private Integer index;
    private String handleName;

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public Integer getIndex() {
        return index;
    }

    public void setIndex(Integer index) {
        this.index = index;
    }

    public String getHandleName() {
        return handleName;
    }

    public void setHandleName(String handleName) {
        this.handleName = handleName;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("title", title);
        map.put("url", url);
        map.put("index", index);
        map.put("handleName", handleName);
        return map;
    }

    public static WindowContext fromMap(Map<String, Object> source) {
        WindowContext context = new WindowContext();
        context.setTitle(DataAccess.string(source, "title", null));
        context.setUrl(DataAccess.string(source, "url", null));
        context.setIndex(DataAccess.integer(source, "index", null));
        context.setHandleName(DataAccess.string(source, "handleName", null));
        return context;
    }
}
