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
    const rawEntry = state.addRawEvent(req.body);
    console.log("[RAW WEBHOOK RECEIVED]");
    console.log(JSON.stringify(rawEntry, null, 2));

    // Keep old V0 path alive only when classic fields exist
    if (hasMinimalV0Fields(req.body)) {
      const parsed = parser.parse(req.body);
      console.log("[PARSED EVENT]", parsed);

      state.addEvent(parsed);

      const nextState = logic.getNextState(parsed.event);

      if (nextState) {
        state.updateSetup(
          parsed.symbol,
          parsed.timeframe,
          parsed.event,
          nextState
        );
      } else {
        console.log(`[STATE] No mapping for event: ${parsed.event}`);
      }
    } else {
      console.log(
        "[OBSERVATORY] Raw payload stored only. Skipped V0 parser/state path."
      );
    }

    res.status(200).json({
      ok: true,
      message: "Webhook captured successfully",
      rawEventCount: state.getState().rawEvents.length
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
