package com.timbpm.recorder.selector;

import com.timbpm.recorder.model.SelectorCandidate;
import com.timbpm.recorder.model.SelectorMetadata;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public final class SelectorRanker {
    public SelectorMetadata rank(ElementSnapshot snapshot) {
        SelectorMetadata metadata = new SelectorMetadata();
        metadata.setElementTag(snapshot.getTagName());
        metadata.setInputType(snapshot.getInputType());
        metadata.setId(snapshot.getId());
        metadata.setName(snapshot.getName());
        metadata.setDataTestId(snapshot.getDataTestId());
        metadata.setDataQa(snapshot.getDataQa());
        metadata.setAriaLabel(snapshot.getAriaLabel());
        metadata.setSemanticLabel(snapshot.getSemanticLabel());
        metadata.setVisibleText(snapshot.getVisibleText());
        metadata.setCssPath(snapshot.getCssPath());
        metadata.setXpath(snapshot.getXpath());
        metadata.setDomPath(snapshot.getDomPath());
        metadata.getClasses().addAll(snapshot.getClasses());

        List<SelectorCandidate> candidates = new ArrayList<>();
        addCandidate(candidates, "id", snapshot.getId(), 0.99, "Stable element id", isStableToken(snapshot.getId()));
        addCandidate(candidates, "dataTestId", snapshot.getDataTestId(), 0.91, "Explicit test id attribute", true);
        addCandidate(candidates, "dataQa", snapshot.getDataQa(), 0.90, "QA-specific attribute", true);
        addCandidate(candidates, "name", snapshot.getName(), 0.88, "Element name attribute", isStableToken(snapshot.getName()));
        addCandidate(candidates, "ariaLabel", snapshot.getAriaLabel(), 0.86, "Accessible label", isStablePhrase(snapshot.getAriaLabel()));
        addCandidate(candidates, "label", snapshot.getSemanticLabel(), 0.82, "Semantic label relationship", isStablePhrase(snapshot.getSemanticLabel()));
        addCandidate(candidates, "text", normalizeText(snapshot.getVisibleText()), 0.76, "Visible text selector", isStablePhrase(snapshot.getVisibleText()));
        addCandidate(candidates, "css", snapshot.getCssPath(), 0.54, "DOM CSS path fallback", snapshot.getCssPath() != null && !snapshot.getCssPath().isBlank());
        addCandidate(candidates, "xpath", snapshot.getXpath(), 0.37, "XPath fallback", snapshot.getXpath() != null && !snapshot.getXpath().isBlank());

        candidates.sort(Comparator.comparingDouble(SelectorCandidate::getConfidenceScore).reversed());
        if (!candidates.isEmpty()) {
            candidates.get(0).setPrimary(true);
            metadata.setPrimaryStrategy(candidates.get(0).getStrategy());
            metadata.setPrimaryValue(candidates.get(0).getValue());
            metadata.setConfidenceScore(candidates.get(0).getConfidenceScore());
            metadata.setExplanation(candidates.get(0).getExplanation());
        }
        metadata.getCandidates().addAll(candidates);
        return metadata;
    }

    private void addCandidate(
        List<SelectorCandidate> candidates,
        String strategy,
        String value,
        double baseScore,
        String explanation,
        boolean acceptable
    ) {
        if (!acceptable || value == null || value.isBlank()) {
            return;
        }
        SelectorCandidate candidate = new SelectorCandidate();
        candidate.setStrategy(strategy);
        candidate.setValue(value);
        candidate.setConfidenceScore(adjustScore(baseScore, value));
        candidate.setExplanation(explanation + " (" + confidenceReason(value) + ")");
        candidates.add(candidate);
    }

    private double adjustScore(double baseScore, String value) {
        if (value == null || value.isBlank()) {
            return 0.0;
        }
        if (looksDynamic(value)) {
            return Math.max(0.10, baseScore - 0.30);
        }
        if (value.length() > 80) {
            return Math.max(0.10, baseScore - 0.15);
        }
        if (baseScore < 0.90 && value.length() <= 24) {
            return Math.min(0.99, baseScore + 0.02);
        }
        return baseScore;
    }

    private boolean isStableToken(String value) {
        return value != null && !value.isBlank() && !looksDynamic(value);
    }

    private boolean isStablePhrase(String value) {
        return value != null && !value.isBlank() && value.length() <= 60;
    }

    private boolean looksDynamic(String value) {
        String normalized = value.toLowerCase(Locale.ROOT);
        return normalized.matches(".*\\d{4,}.*")
            || normalized.matches(".*[a-f0-9]{10,}.*")
            || normalized.contains("ember")
            || normalized.contains("react-select")
            || normalized.contains("__")
            || normalized.contains(":r");
    }

    private String normalizeText(String text) {
        if (text == null) {
            return null;
        }
        return text.trim().replaceAll("\\s+", " ");
    }

    private String confidenceReason(String value) {
        return looksDynamic(value) ? "dynamic-looking token reduced confidence" : "high stability";
    }
}
