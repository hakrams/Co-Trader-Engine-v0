const fs = require("fs");
const path = require("path");
const { getDecisionFromSetupState } = require("./logic");

const STATE_FILE = path.join(__dirname, "..", "data", "engine-state.json");

const defaultState = {
  latestEvent: null,
  history: [],
  setups: {},
  rawEvents: [],
  latestRawEvent: null
};

function loadStateFromFile() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { ...defaultState };
    }

    const fileContent = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(fileContent);

    return {
      latestEvent: parsed.latestEvent ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      setups: parsed.setups && typeof parsed.setups === "object" ? parsed.setups : {},
      rawEvents: Array.isArray(parsed.rawEvents) ? parsed.rawEvents : [],
      latestRawEvent: parsed.latestRawEvent ?? null
    };
  } catch (error) {
    console.error("[STATE LOAD ERROR]", error.message);
    return { ...defaultState };
  }
}

const state = loadStateFromFile();

function getKey(symbol, timeframe) {
  return `${symbol}_${timeframe}`;
}

function addRawEvent(payload) {
  const entry = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    receivedAt: new Date().toISOString(),
    payload
  };

  state.latestRawEvent = entry;
  state.rawEvents.unshift(entry);

  if (state.rawEvents.length > 100) {
    state.rawEvents = state.rawEvents.slice(0, 100);
  }

  return entry;
}

function addEvent(event) {
  state.latestEvent = event;
  state.history.push(event);
}

function getSetup(symbol, timeframe) {
  const key = getKey(symbol, timeframe);
  return state.setups[key] || null;
}

function isTransitionAllowed(event, currentState) {
  if (event === "choch") {
    return true;
  }

  if (event === "ob_tap") {
    if (currentState === "waiting_for_ob_tap") {
      return true;
    }

    console.log(
      `[RULE] Invalid sequence: ob_tap received while current state is ${currentState}`
    );
    return false;
  }

  console.log(`[RULE] Unknown event ignored: ${event}`);
  return false;
}

function updateSetup(symbol, timeframe, event, newSetupState) {
  const key = getKey(symbol, timeframe);
  const previousState = state.setups[key] || null;

  const allowed = isTransitionAllowed(event, previousState);

  if (!allowed) {
    console.log(
      `[STATE] Blocked transition for ${symbol} ${timeframe}: event=${event}, current=${previousState}, attempted=${newSetupState}`
    );
    return;
  }

  state.setups[key] = newSetupState;

  console.log(
    `[STATE] ${symbol} ${timeframe}: ${previousState} -> ${newSetupState}`
  );
}

function getState() {
  return state;
}

function getReactions() {
  const reactions = {};

  for (const key in state.setups) {
    const setupState = state.setups[key];

    reactions[key] = {
      setupState,
      decision: getDecisionFromSetupState(setupState)
    };
  }

  return reactions;
}

module.exports = {
  addRawEvent,
  addEvent,
  getSetup,
  updateSetup,
  getState,
  getReactions
};