const express = require("express");
const app = express();

const parser = require("./src/parser");
const state = require("./src/state");
const logic = require("./src/logic");

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function hasMinimalV0Fields(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    typeof payload.event === "string" &&
    typeof payload.symbol === "string" &&
    typeof payload.timeframe === "string" &&
    typeof payload.timestamp === "string"
  );
}

app.post("/webhook", (req, res) => {
  try {
    // ✅ ADD THIS LINE FIRST
    state.addRawEvent(req.body);

    const parsed = parser.parse(req.body);
    console.log("[PARSED EVENT]", JSON.stringify(parsed, null, 2));

    state.addEvent(parsed);

    const eventType = parsed.normalized.event_type;
    const symbol = parsed.normalized.symbol;
    const timeframe = parsed.normalized.timeframe;

    const nextState = logic.getNextState(eventType);

    if (nextState) {
      state.updateSetup(symbol, timeframe, eventType, nextState);
    }

    res.status(200).json({
      ok: true,
      message: "Webhook received successfully"
    });
  } catch (error) {
    console.error("[ERROR]", error.message);

    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/state", (req, res) => {
  const currentState = state.getState();
  const reactions = state.getReactions();

  res.json({
    ...currentState,
    reactions
  });
});

app.get("/api/raw-events", (req, res) => {
  const currentState = state.getState();

  res.json({
    count: currentState.rawEvents.length,
    latest: currentState.latestRawEvent,
    items: currentState.rawEvents
  });
});

app.listen(4000, "0.0.0.0", () => {
  console.log("Server running on port 4000");
});
