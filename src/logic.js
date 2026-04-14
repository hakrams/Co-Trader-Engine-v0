function getNextState(eventName) {
  switch (eventName) {
    case "choch_detected":
      return "waiting_for_ob_tap";

    case "ob_tap":
      return "ready_for_ltf";

    default:
      return null;
  }
}

function getDecisionFromSetupState(setupState) {
  switch (setupState) {
    case "waiting_for_ob_tap":
      return "monitoring";

    case "ready_for_ltf":
      return "actionable";

    default:
      return "none";
  }
}

module.exports = {
  getNextState,
  getDecisionFromSetupState
};