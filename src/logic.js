function getNextState(eventType, currentStage = null) {
  if (eventType === "structure_detected") {
    return "structure_detected";
  }

  if (eventType === "ob_tap") {
    if (currentStage === "structure_detected") {
      return "zone_interacted";
    }

    return null;
  }

  return null;
}

function getFinalDecision({
  setupStage,
  eligibility = "eligible",
  threshold = "none",
  executionStatus = "invalid",
  riskState = "risk_allowed"
}) {
  if (riskState === "risk_paused") {
    return "paused";
  }

  if (eligibility === "blocked") {
    return "blocked";
  }

  if (executionStatus === "forced_trade" || executionStatus === "invalid") {
    return "blocked";
  }

  if (threshold === "no_trade") {
    return "blocked";
  }

  if (executionStatus === "almost_setup") {
    return "monitor";
  }

  if (executionStatus === "pending_confirmation") {
    return "qualified";
  }

  if (executionStatus === "valid") {
    if (threshold === "A") {
      return "actionable_high_priority";
    }

    if (threshold === "B") {
      return "actionable";
    }

    return "actionable";
  }

  if (setupStage === "structure_detected") {
    return "observe";
  }

  if (setupStage === "zone_interacted") {
    return "monitor";
  }

  return "ignore";
}

module.exports = {
  getNextState,
  getFinalDecision
};
