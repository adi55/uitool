package com.timbpm.recorder.model;

import com.timbpm.recorder.util.DataAccess;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ScenarioMetadata {
    private String scenarioId;
    private String name;
    private String description;
    private String baseUrl;
    private String sourceUrl;
    private String profileId;
    private String createdAt;
    private String updatedAt;
    private String createdBy;
    private String version = "1.0";
    private final List<String> tags = new ArrayList<>();

    public String getScenarioId() {
        return scenarioId;
    }

    public void setScenarioId(String scenarioId) {
        this.scenarioId = scenarioId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public String getProfileId() {
        return profileId;
    }

    public void setProfileId(String profileId) {
        this.profileId = profileId;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(String updatedAt) {
        this.updatedAt = updatedAt;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public List<String> getTags() {
        return tags;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("scenarioId", scenarioId);
        map.put("name", name);
        map.put("description", description);
        map.put("baseUrl", baseUrl);
        map.put("sourceUrl", sourceUrl);
        map.put("profileId", profileId);
        map.put("createdAt", createdAt);
        map.put("updatedAt", updatedAt);
        map.put("createdBy", createdBy);
        map.put("version", version);
        map.put("tags", new ArrayList<>(tags));
        return map;
    }

    public static ScenarioMetadata fromMap(Map<String, Object> source) {
        ScenarioMetadata metadata = new ScenarioMetadata();
        metadata.setScenarioId(DataAccess.string(source, "scenarioId", null));
        metadata.setName(DataAccess.string(source, "name", null));
        metadata.setDescription(DataAccess.string(source, "description", null));
        metadata.setBaseUrl(DataAccess.string(source, "baseUrl", null));
        metadata.setSourceUrl(DataAccess.string(source, "sourceUrl", null));
        metadata.setProfileId(DataAccess.string(source, "profileId", null));
        metadata.setCreatedAt(DataAccess.string(source, "createdAt", null));
        metadata.setUpdatedAt(DataAccess.string(source, "updatedAt", null));
        metadata.setCreatedBy(DataAccess.string(source, "createdBy", null));
        metadata.setVersion(DataAccess.string(source, "version", "1.0"));
        metadata.getTags().addAll(DataAccess.stringList(source, "tags"));
        return metadata;
    }
}
