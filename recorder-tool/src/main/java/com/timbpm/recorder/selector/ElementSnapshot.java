package com.timbpm.recorder.selector;

import java.util.ArrayList;
import java.util.List;

public final class ElementSnapshot {
    private String tagName;
    private String inputType;
    private String id;
    private String name;
    private String dataTestId;
    private String dataQa;
    private String ariaLabel;
    private String semanticLabel;
    private String visibleText;
    private String cssPath;
    private String xpath;
    private String domPath;
    private final List<String> classes = new ArrayList<>();

    public String getTagName() {
        return tagName;
    }

    public void setTagName(String tagName) {
        this.tagName = tagName;
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

    public String getAriaLabel() {
        return ariaLabel;
    }

    public void setAriaLabel(String ariaLabel) {
        this.ariaLabel = ariaLabel;
    }

    public String getSemanticLabel() {
        return semanticLabel;
    }

    public void setSemanticLabel(String semanticLabel) {
        this.semanticLabel = semanticLabel;
    }

    public String getVisibleText() {
        return visibleText;
    }

    public void setVisibleText(String visibleText) {
        this.visibleText = visibleText;
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
}
