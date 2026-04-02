package com.timbpm.recorder.model;

import com.timbpm.recorder.util.DataAccess;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class SelectorMetadata {
    private String primaryStrategy;
    private String primaryValue;
    private double confidenceScore;
    private String explanation;
    private String visibleText;
    private String elementTag;
    private String inputType;
    private String id;
    private String name;
    private String ariaLabel;
    private String dataTestId;
    private String dataQa;
    private String semanticLabel;
    private String cssPath;
    private String xpath;
    private String domPath;
    private final List<String> classes = new ArrayList<>();
    private final List<SelectorCandidate> candidates = new ArrayList<>();

    public String getPrimaryStrategy() {
        return primaryStrategy;
    }

    public void setPrimaryStrategy(String primaryStrategy) {
        this.primaryStrategy = primaryStrategy;
    }

    public String getPrimaryValue() {
        return primaryValue;
    }

    public void setPrimaryValue(String primaryValue) {
        this.primaryValue = primaryValue;
    }

    public double getConfidenceScore() {
        return confidenceScore;
    }

    public void setConfidenceScore(double confidenceScore) {
        this.confidenceScore = confidenceScore;
    }

    public String getExplanation() {
        return explanation;
    }

    public void setExplanation(String explanation) {
        this.explanation = explanation;
    }

    public String getVisibleText() {
        return visibleText;
    }

    public void setVisibleText(String visibleText) {
        this.visibleText = visibleText;
    }

    public String getElementTag() {
        return elementTag;
    }

    public void setElementTag(String elementTag) {
        this.elementTag = elementTag;
    }

    public String getInputType() {
        return inputType;
    }

    public void setInputType(String inputType) {
        this.inputType = inputType;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAriaLabel() {
        return ariaLabel;
    }

    public void setAriaLabel(String ariaLabel) {
        this.ariaLabel = ariaLabel;
    }

    public String getDataTestId() {
        return dataTestId;
    }

    public void setDataTestId(String dataTestId) {
        this.dataTestId = dataTestId;
    }

    public String getDataQa() {
        return dataQa;
    }

    public void setDataQa(String dataQa) {
        this.dataQa = dataQa;
    }

    public String getSemanticLabel() {
        return semanticLabel;
    }

    public void setSemanticLabel(String semanticLabel) {
        this.semanticLabel = semanticLabel;
    }

    public String getCssPath() {
        return cssPath;
    }

    public void setCssPath(String cssPath) {
        this.cssPath = cssPath;
    }

    public String getXpath() {
        return xpath;
    }

    public void setXpath(String xpath) {
        this.xpath = xpath;
    }

    public String getDomPath() {
        return domPath;
    }

    public void setDomPath(String domPath) {
        this.domPath = domPath;
    }

    public List<String> getClasses() {
        return classes;
    }

    public List<SelectorCandidate> getCandidates() {
        return candidates;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("primaryStrategy", primaryStrategy);
        map.put("primaryValue", primaryValue);
        map.put("confidenceScore", confidenceScore);
        map.put("explanation", explanation);
        map.put("visibleText", visibleText);
        map.put("elementTag", elementTag);
        map.put("inputType", inputType);
        map.put("id", id);
        map.put("name", name);
        map.put("ariaLabel", ariaLabel);
        map.put("dataTestId", dataTestId);
        map.put("dataQa", dataQa);
        map.put("semanticLabel", semanticLabel);
        map.put("cssPath", cssPath);
        map.put("xpath", xpath);
        map.put("domPath", domPath);
        map.put("classes", new ArrayList<>(classes));
        List<Object> serializedCandidates = new ArrayList<>();
        for (SelectorCandidate candidate : candidates) {
            serializedCandidates.add(candidate.toMap());
        }
        map.put("candidates", serializedCandidates);
        return map;
    }

    public static SelectorMetadata fromMap(Map<String, Object> source) {
        SelectorMetadata metadata = new SelectorMetadata();
        metadata.setPrimaryStrategy(DataAccess.string(source, "primaryStrategy", null));
        metadata.setPrimaryValue(DataAccess.string(source, "primaryValue", null));
        metadata.setConfidenceScore(DataAccess.doubleValue(source, "confidenceScore", 0.0));
        metadata.setExplanation(DataAccess.string(source, "explanation", null));
        metadata.setVisibleText(DataAccess.string(source, "visibleText", null));
        metadata.setElementTag(DataAccess.string(source, "elementTag", null));
        metadata.setInputType(DataAccess.string(source, "inputType", null));
        metadata.setId(DataAccess.string(source, "id", null));
        metadata.setName(DataAccess.string(source, "name", null));
        metadata.setAriaLabel(DataAccess.string(source, "ariaLabel", null));
        metadata.setDataTestId(DataAccess.string(source, "dataTestId", null));
        metadata.setDataQa(DataAccess.string(source, "dataQa", null));
        metadata.setSemanticLabel(DataAccess.string(source, "semanticLabel", null));
        metadata.setCssPath(DataAccess.string(source, "cssPath", null));
        metadata.setXpath(DataAccess.string(source, "xpath", null));
        metadata.setDomPath(DataAccess.string(source, "domPath", null));
        metadata.getClasses().addAll(DataAccess.stringList(source, "classes"));
        for (Map<String, Object> item : DataAccess.listOfMaps(source, "candidates")) {
            metadata.getCandidates().add(SelectorCandidate.fromMap(item));
        }
        return metadata;
    }
}
