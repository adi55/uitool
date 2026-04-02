package com.timbpm.recorder.wait;

import com.timbpm.recorder.model.ScenarioStep;
import com.timbpm.recorder.model.StepType;
import com.timbpm.recorder.model.WaitKind;
import com.timbpm.recorder.model.WaitStrategy;

public final class WaitPlanner {
    public WaitStrategy suggestForStep(ScenarioStep step) {
        WaitStrategy strategy = new WaitStrategy();
        strategy.setTimeoutMs(5000);
        if (step.getWaitStrategy() != null && step.getWaitStrategy().getKind() != WaitKind.NONE) {
            return step.getWaitStrategy();
        }
        if (step.getType() == StepType.NAVIGATE) {
            strategy.setKind(WaitKind.URL_CHANGE);
            strategy.setExpectedUrlFragment(step.getValue());
            strategy.setNotes("Suggested URL wait for navigation step");
            return strategy;
        }
        if (step.getType() == StepType.CLICK && step.getSelector() != null && "button".equalsIgnoreCase(step.getSelector().getElementTag())) {
            strategy.setKind(WaitKind.LOADING_OVERLAY_DISAPPEAR);
            strategy.setNotes("Suggested overlay disappearance after button click");
            return strategy;
        }
        if (step.getType() == StepType.TYPE || step.getType() == StepType.SELECT) {
            strategy.setKind(WaitKind.VALUE_EQUALS);
            strategy.setExpectedValue(step.getValue());
            strategy.setNotes("Suggested value confirmation after form update");
            return strategy;
        }
        if (step.getType() == StepType.WAIT) {
            return step.getWaitStrategy();
        }
        strategy.setKind(WaitKind.NONE);
        strategy.setNotes("No explicit wait needed");
        return strategy;
    }
}
