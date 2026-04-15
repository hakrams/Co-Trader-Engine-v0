const express = require("express");
const app = express();

const parser = require("./src/parser");
const state = require("./src/state");
const logic = require("./src/logic");

app.use(express.json());
app.use(express.static("public"));

app.post("/webhook", (req, res) => {
  try {
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

// simple debug endpoint
app.get("/state", (req, res) => {
  const currentState = state.getState();
  const reactions = state.getReactions();

  res.json({
    ...currentState,
    reactions
  });
});

app.listen(4000, "0.0.0.0", () => {
  console.log("Server running on port 4000");
});