const express = require("express");
const app = express();

const parser = require("./src/parser");
const state = require("./src/state");
const logic = require("./src/logic");
const ARCHIVE_RESET_PIN = "1234";

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
  // 🔥 1. ALWAYS capture raw FIRST (no conditions)
  state.addRawEvent(req.body);

  try {
    const parsed = parser.parse(req.body);

    console.log("[PARSED EVENT]", JSON.stringify(parsed, null, 2));

    if (parsed.normalized.event_type === "ob_tap") {
      state.trackLiquidityEngineeringObTap(
        parsed.normalized.symbol,
        parsed.normalized.timeframe,
        parsed.normalized.direction,
        parsed.normalized.times.timestamp || parsed.raw.received_at
      );
    }

    state.refreshAllLiquidityEngineeringStates();

    state.addEvent(parsed);
    const eventType = parsed.normalized.event_type;
    const symbol = parsed.normalized.symbol;
    const timeframe = parsed.normalized.timeframe;
    const direction = parsed.normalized.direction;
    const currentSetup = state.getSetup(symbol, timeframe, direction);
    const currentStage = currentSetup?.stage || null;

    const nextState = logic.getNextState(eventType, currentStage);

    if (nextState) {
      state.updateSetup(symbol, timeframe, direction, eventType, nextState);

      const eligibility = state.evaluateEligibility();
      state.setSetupEligibility(symbol, timeframe, direction, eligibility);
    } else {
      console.log(`[STATE] No mapping for event type: ${eventType}`);
    }

    state.processNotificationTriggers();
  } catch (error) {
    // ❗ IMPORTANT: DO NOT FAIL REQUEST
    console.log("[PARSER ERROR - NON BLOCKING]", error.message);
  }

  // 🔥 2. ALWAYS respond success
  res.status(200).json({
    ok: true,
    message: "Webhook received successfully"
  });
});

app.get("/state", (req, res) => {
  state.refreshAllLiquidityEngineeringStates();
  state.refreshAllSetupDerivedLayers();
  state.processNotificationTriggers();

  const currentState = state.getState();
  const reactions = state.getReactions();

  res.json({
    ...currentState,
    reactions
  });
});

app.get("/api/raw-events", (req, res) => {
  state.refreshAllLiquidityEngineeringStates();
  state.refreshAllSetupDerivedLayers();
  state.processNotificationTriggers();

  const currentState = state.getState();

  res.json({
    count: currentState.rawEvents.length,
    latest: currentState.latestRawEvent,
    items: currentState.rawEvents
  });
});

app.post("/setup-scoring", (req, res) => {
  try {
    const { symbol, timeframe, direction, context_profile, scores } = req.body;

    if (!symbol || !timeframe || !direction) {
      return res.status(400).json({
        ok: false,
        error: "Missing setup identity (symbol, timeframe, direction)"
      });
    }

    if (!context_profile) {
      return res.status(400).json({
        ok: false,
        error: "Missing context_profile"
      });
    }

    if (!scores) {
      return res.status(400).json({
        ok: false,
        error: "Missing scores object"
      });
    }

    const result = state.applySetupScoring(
      symbol,
      timeframe,
      direction,
      context_profile,
      scores
    );

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error
      });
    }

    state.processNotificationTriggers();

    res.status(200).json({
      ok: true,
      message: "Scoring applied successfully",
      key: result.key,
      scoring: result.scoring
    });
  } catch (error) {
    console.error("[SCORING ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/risk/update", (req, res) => {
  try {
    const { settings, runtime } = req.body || {};

    const updatedRisk = state.updateRiskState({ settings, runtime });
    state.processNotificationTriggers();

    res.status(200).json({
      ok: true,
      message: "Risk state updated successfully",
      risk: updatedRisk
    });
  } catch (error) {
    console.error("[RISK UPDATE ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/notifications/settings", (req, res) => {
  try {
    const updatedSettings = state.updateNotificationSettings(req.body || {});
    state.processNotificationTriggers({ initializeOnly: true });

    res.status(200).json({
      ok: true,
      message: "Notification settings updated successfully",
      notificationSettings: state.getPublicNotificationSettings(updatedSettings)
    });
  } catch (error) {
    console.error("[NOTIFICATION SETTINGS ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/controls/update", (req, res) => {
  try {
    const updatedControls = state.updateControls(req.body || {});
    state.processNotificationTriggers({ initializeOnly: true });

    res.status(200).json({
      ok: true,
      message: "Controls updated successfully",
      controls: updatedControls
    });
  } catch (error) {
    console.error("[CONTROLS UPDATE ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/notifications/test", (req, res) => {
  try {
    const notification = state.addNotification({
      type: "telegram_test",
      priority: "critical",
      message: "Co-Trader Engine test notification.",
      metadata: {
        source: "manual_test"
      }
    });

    res.status(200).json({
      ok: true,
      message: "Test notification created",
      notification
    });
  } catch (error) {
    console.error("[NOTIFICATION TEST ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/archive-reset", (req, res) => {
  try {
    const { pin } = req.body || {};

    if (pin !== ARCHIVE_RESET_PIN) {
      return res.status(403).json({
        ok: false,
        error: "Invalid archive reset PIN"
      });
    }

    const archiveResult = state.archiveCurrentState();

    if (!archiveResult.ok) {
      return res.status(500).json({
        ok: false,
        error: "Failed to archive current state"
      });
    }

    const resetResult = state.resetActiveState();

    if (!resetResult.ok) {
      return res.status(500).json({
        ok: false,
        error: "Failed to reset active state"
      });
    }

    res.status(200).json({
      ok: true,
      message: "Current state archived and active state reset",
      archiveFile: archiveResult.archiveFile,
      preservedSetupKeys: resetResult.preservedSetupKeys || []
    });
  } catch (error) {
    console.error("[ARCHIVE RESET ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.listen(4000, "0.0.0.0", () => {
  console.log("Server running on port 4000");
});
