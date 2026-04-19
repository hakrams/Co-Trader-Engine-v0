const fs = require("fs");
const path = require("path");
const { getFinalDecision } = require("./logic");

const STATE_FILE = path.join(__dirname, "..", "data", "engine-state.json");
const ARCHIVE_DIR = path.join(__dirname, "..", "data", "archive");

function createDefaultScoring() {
  return {
    context_profile: null,
    categories: {
      bias: {
        score: 0,
        timeframe: ""
      },
      anchor_poi: {
        score: 0,
        timeframe: ""
      },
      mid_poi: {
        score: 0,
        timeframe: ""
      },
      refinement: {
        score: 0,
        timeframe: ""
      },
      alignment: {
        score: 0,
        timeframes: []
      }
    },
    total: 0,
    threshold: "none"
  };
}

function createDefaultEntryModels() {
  return {
    context_type: "unknown",
    available: [],
    blocked: [],
    pending: [],
    notes: [],
    models: {
      color_switch: {
        status: "unavailable",
        family: "continuation_reaction",
        dependency_type: "standalone",
        context_type: "continuation",
        reason: null,
        requires: null,
        blocked_when: null
      },
      reactive_flip: {
        status: "unavailable",
        family: "continuation_reaction",
        dependency_type: "standalone",
        context_type: "continuation",
        reason: null,
        requires: null,
        blocked_when: null
      },
      sniper_confirmation: {
        status: "unavailable",
        family: "reversal",
        dependency_type: "standalone",
        context_type: "reversal",
        reason: null,
        requires: null,
        blocked_when: null
      },
      scout_backup: {
        status: "unavailable",
        family: "support_backup",
        dependency_type: "dependent",
        context_type: "continuation",
        reason: null,
        requires: null,
        blocked_when: null
      }
    }
  };
}

function createDefaultExecutionValidation() {
  return {
    status: "invalid",
    checks: {
      structure_present: false,
      zone_context_present: false,
      eligibility_ok: false,
      threshold_ok: false,
      entry_model_available: false,
      invalidation_status: "unknown",
      confirmation_status: "unknown"
    },
    reasons: [],
    missing: [],
    forced_trade_flags: [],
    notes: []
  };
}

function createDefaultLiquidityEngineering() {
  return {
    enabled: false,
    timeframe_eligible: false,

    status: "inactive",
    activation_reason: null,

    tap_count: 0,
    first_tap_at: null,
    last_tap_at: null,

    activation_window_seconds: 120,
    activation_window_started_at: null,
    activation_window_ends_at: null,

    activated_at: null,

    monitoring_window_minutes: 5,
    monitoring_window_starts_at: null,
    monitoring_window_ends_at: null,

    waiting_for_color_switch: false,
    color_switch_handoff_ready_at: null,

    poi_persistence_supported: false,
    poi_persistence_status: "deferred",
    poi_persistence_started_at: null,
    poi_persistence_min_minutes: 3,
    poi_persistence_max_minutes: 15,

    completed_at: null,
    blocked_reason: null,

    notes: []
  };
}

function createDefaultRiskSettings() {
  return {
    tradingEnabled: true,
    enforcementMode: "manual",
    maxTradesPerDay: 100,
    maxConsecutiveLosses: 100,
    maxDailyRisk: 100,
    breakEvenCountsAsNeutral: true
  };
}

function createDefaultRiskRuntime() {
  return {
    tradesTakenToday: 0,
    wins: 0,
    losses: 0,
    breakEvens: 0,
    consecutiveLosses: 0,
    dailyRiskUsed: 0,
    lastTradeResult: null,
    lastUpdated: null
  };
}

function createDefaultRiskStatus() {
  return {
    state: "risk_allowed",
    reasons: []
  };
}

function createDefaultRiskState() {
  return {
    settings: createDefaultRiskSettings(),
    runtime: createDefaultRiskRuntime(),
    status: createDefaultRiskStatus()
  };
}

function ensureRiskState(risk) {
  const base = createDefaultRiskState();
  const incoming = risk && typeof risk === "object" ? risk : {};
  const incomingSettings =
    incoming.settings && typeof incoming.settings === "object"
      ? incoming.settings
      : {};
  const incomingRuntime =
    incoming.runtime && typeof incoming.runtime === "object"
      ? incoming.runtime
      : {};
  const incomingStatus =
    incoming.status && typeof incoming.status === "object"
      ? incoming.status
      : {};

  return {
    settings: {
      tradingEnabled:
        typeof incomingSettings.tradingEnabled === "boolean"
          ? incomingSettings.tradingEnabled
          : base.settings.tradingEnabled,
      enforcementMode:
        typeof incomingSettings.enforcementMode === "string" &&
        incomingSettings.enforcementMode.trim()
          ? incomingSettings.enforcementMode.trim()
          : base.settings.enforcementMode,
      maxTradesPerDay: Number.isFinite(incomingSettings.maxTradesPerDay)
        ? incomingSettings.maxTradesPerDay
        : base.settings.maxTradesPerDay,
      maxConsecutiveLosses: Number.isFinite(
        incomingSettings.maxConsecutiveLosses
      )
        ? incomingSettings.maxConsecutiveLosses
        : base.settings.maxConsecutiveLosses,
      maxDailyRisk: Number.isFinite(incomingSettings.maxDailyRisk)
        ? incomingSettings.maxDailyRisk
        : base.settings.maxDailyRisk,
      breakEvenCountsAsNeutral:
        typeof incomingSettings.breakEvenCountsAsNeutral === "boolean"
          ? incomingSettings.breakEvenCountsAsNeutral
          : base.settings.breakEvenCountsAsNeutral
    },
    runtime: {
      tradesTakenToday: Number.isFinite(incomingRuntime.tradesTakenToday)
        ? incomingRuntime.tradesTakenToday
        : base.runtime.tradesTakenToday,
      wins: Number.isFinite(incomingRuntime.wins)
        ? incomingRuntime.wins
        : base.runtime.wins,
      losses: Number.isFinite(incomingRuntime.losses)
        ? incomingRuntime.losses
        : base.runtime.losses,
      breakEvens: Number.isFinite(incomingRuntime.breakEvens)
        ? incomingRuntime.breakEvens
        : base.runtime.breakEvens,
      consecutiveLosses: Number.isFinite(incomingRuntime.consecutiveLosses)
        ? incomingRuntime.consecutiveLosses
        : base.runtime.consecutiveLosses,
      dailyRiskUsed: Number.isFinite(incomingRuntime.dailyRiskUsed)
        ? incomingRuntime.dailyRiskUsed
        : base.runtime.dailyRiskUsed,
      lastTradeResult:
        typeof incomingRuntime.lastTradeResult === "string" ||
        incomingRuntime.lastTradeResult === null
          ? incomingRuntime.lastTradeResult
          : base.runtime.lastTradeResult,
      lastUpdated:
        typeof incomingRuntime.lastUpdated === "string" ||
        incomingRuntime.lastUpdated === null
          ? incomingRuntime.lastUpdated
          : base.runtime.lastUpdated
    },
    status: {
      state:
        typeof incomingStatus.state === "string" && incomingStatus.state.trim()
          ? incomingStatus.state.trim()
          : base.status.state,
      reasons: Array.isArray(incomingStatus.reasons)
        ? incomingStatus.reasons
        : base.status.reasons
    }
  };
}

function evaluateRiskStatus(risk) {
  const safeRisk = ensureRiskState(risk);
  const { settings, runtime } = safeRisk;
  const reasons = [];

  if (settings.tradingEnabled === false) {
    return {
      state: "risk_paused",
      reasons: ["manual_pause"]
    };
  }

  if (runtime.tradesTakenToday >= settings.maxTradesPerDay) {
    reasons.push("max_trades_guide_reached");
  }

  if (runtime.consecutiveLosses >= settings.maxConsecutiveLosses) {
    reasons.push("max_consecutive_losses_guide_reached");
  }

  if (runtime.dailyRiskUsed >= settings.maxDailyRisk) {
    reasons.push("max_daily_risk_guide_reached");
  }

  if (reasons.length > 0) {
    return {
      state: "risk_warning",
      reasons
    };
  }

  return {
    state: "risk_allowed",
    reasons: []
  };
}

function refreshRiskStatus() {
  state.risk = ensureRiskState(state.risk);
  state.risk.status = evaluateRiskStatus(state.risk);
  saveStateToFile();
  return state.risk;
}

function updateRiskState({ settings = null, runtime = null } = {}) {
  state.risk = ensureRiskState(state.risk);

  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    state.risk.settings = {
      ...state.risk.settings,
      ...settings
    };
  }

  if (runtime && typeof runtime === "object" && !Array.isArray(runtime)) {
    state.risk.runtime = {
      ...state.risk.runtime,
      ...runtime
    };
  }

  state.risk = ensureRiskState(state.risk);
  state.risk.status = evaluateRiskStatus(state.risk);

  saveStateToFile();

  return state.risk;
}

function ensureSetupHasLiquidityEngineering(setup) {
  if (!setup || typeof setup !== "object") {
    return setup;
  }

  const base = createDefaultLiquidityEngineering();
  const incoming =
    setup.liquidity_engineering &&
    typeof setup.liquidity_engineering === "object"
      ? setup.liquidity_engineering
      : {};

  return {
    ...setup,
    liquidity_engineering: {
      ...base,
      ...incoming,
      notes: Array.isArray(incoming.notes) ? incoming.notes : base.notes
    }
  };
}

function ensureSetupHasEntryModels(setup) {
  if (!setup || typeof setup !== "object") {
    return setup;
  }

  const base = createDefaultEntryModels();
  const incoming =
    setup.entry_models && typeof setup.entry_models === "object"
      ? setup.entry_models
      : {};

  const safeModels = {};

  for (const key of Object.keys(base.models)) {
    safeModels[key] = {
      ...base.models[key],
      ...(incoming.models?.[key] || {})
    };
  }

  return {
    ...setup,
    entry_models: {
      context_type: incoming.context_type ?? base.context_type,
      available: Array.isArray(incoming.available) ? incoming.available : [],
      blocked: Array.isArray(incoming.blocked) ? incoming.blocked : [],
      pending: Array.isArray(incoming.pending) ? incoming.pending : [],
      notes: Array.isArray(incoming.notes) ? incoming.notes : [],
      models: safeModels
    }
  };
}

function ensureSetupHasExecutionValidation(setup) {
  if (!setup || typeof setup !== "object") {
    return setup;
  }

  const base = createDefaultExecutionValidation();
  const incoming =
    setup.execution_validation &&
    typeof setup.execution_validation === "object"
      ? setup.execution_validation
      : {};

  return {
    ...setup,
    execution_validation: {
      status: incoming.status ?? base.status,
      checks: {
        ...base.checks,
        ...(incoming.checks || {})
      },
      reasons: Array.isArray(incoming.reasons) ? incoming.reasons : [],
      missing: Array.isArray(incoming.missing) ? incoming.missing : [],
      forced_trade_flags: Array.isArray(incoming.forced_trade_flags)
        ? incoming.forced_trade_flags
        : [],
      notes: Array.isArray(incoming.notes) ? incoming.notes : []
    }
  };
}

function deriveEntryModelContextType(setup) {
  if (!setup || typeof setup !== "object") {
    return "unknown";
  }

  if (setup.stage === "zone_interacted") {
    return "continuation";
  }

  if (setup.stage === "structure_detected") {
    return "reversal";
  }

  return "unknown";
}

function setModelStatus(entryModels, modelKey, status, reason) {
  if (!entryModels.models[modelKey]) {
    return;
  }

  entryModels.models[modelKey].status = status;
  entryModels.models[modelKey].reason = reason;

  if (status === "available") {
    entryModels.available.push(modelKey);
  }

  if (status === "blocked") {
    entryModels.blocked.push({
      model: modelKey,
      reason
    });
  }

  if (status === "pending") {
    entryModels.pending.push({
      model: modelKey,
      reason
    });
  }
}

function evaluateEntryModelsForSetup(setup) {
  const safeSetup = ensureSetupHasEntryModels(
    ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(setup))
  );
  const entryModels = createDefaultEntryModels();

  const contextType = deriveEntryModelContextType(safeSetup);
  const eligibility = safeSetup?.eligibility || "eligible";
  const threshold = safeSetup?.scoring?.threshold || "none";

  entryModels.context_type = contextType;

  if (eligibility === "blocked") {
    entryModels.notes.push("All entry models blocked by setup eligibility.");

    for (const modelKey of Object.keys(entryModels.models)) {
      setModelStatus(entryModels, modelKey, "blocked", "eligibility_blocked");
    }

    return entryModels;
  }

  if (threshold === "none" || threshold === "no_trade") {
    entryModels.notes.push("All entry models blocked by current threshold.");

    for (const modelKey of Object.keys(entryModels.models)) {
      setModelStatus(
        entryModels,
        modelKey,
        "blocked",
        "threshold_not_tradeable"
      );
    }

    return entryModels;
  }

  if (contextType === "continuation") {
    entryModels.notes.push(
      "Continuation context derived from zone interaction stage."
    );

    setModelStatus(
      entryModels,
      "color_switch",
      "available",
      "continuation_zone_context_present"
    );

    setModelStatus(
      entryModels,
      "reactive_flip",
      "available",
      "continuation_structure_context_present"
    );

    setModelStatus(
      entryModels,
      "sniper_confirmation",
      "blocked",
      "context_mismatch"
    );

    setModelStatus(
      entryModels,
      "scout_backup",
      "pending",
      "support_context_possible_but_displacement_not_detected"
    );

    return entryModels;
  }

  if (contextType === "reversal") {
    entryModels.notes.push(
      "Reversal context derived from structure-detected stage."
    );

    setModelStatus(
      entryModels,
      "sniper_confirmation",
      "available",
      "reversal_structure_context_present"
    );

    setModelStatus(
      entryModels,
      "color_switch",
      "blocked",
      "context_mismatch"
    );

    setModelStatus(
      entryModels,
      "reactive_flip",
      "pending",
      "structure_shift_present_but_reaction_zone_not_confirmed"
    );

    setModelStatus(
      entryModels,
      "scout_backup",
      "blocked",
      "requires_continuation_context"
    );

    return entryModels;
  }

  entryModels.notes.push("Entry model context is unknown at current setup stage.");

  for (const modelKey of Object.keys(entryModels.models)) {
    setModelStatus(entryModels, modelKey, "blocked", "unknown_context");
  }

  return entryModels;
}

function buildExecutionValidationChecks(setup) {
  const safeSetup = ensureSetupHasEntryModels(
    ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(setup))
  );

  const stage = safeSetup?.stage || null;
  const eligibility = safeSetup?.eligibility || "eligible";
  const threshold = safeSetup?.scoring?.threshold || "none";
  const availableModels = safeSetup?.entry_models?.available || [];

  return {
    structure_present:
      stage === "structure_detected" || stage === "zone_interacted",
    zone_context_present: stage === "zone_interacted",
    eligibility_ok: eligibility === "eligible",
    threshold_ok: threshold !== "none" && threshold !== "no_trade",
    entry_model_available: availableModels.length > 0,
    invalidation_status: "unknown",
    confirmation_status: "unknown"
  };
}

function evaluateExecutionValidationForSetup(setup) {
  const safeSetup = ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(setup))
    )
  );

  const checks = buildExecutionValidationChecks(safeSetup);
  const result = createDefaultExecutionValidation();
  result.checks = checks;

  if (checks.structure_present) {
    result.reasons.push("Structure context is present.");
  } else {
    result.missing.push("structure_missing");
  }

  if (checks.zone_context_present) {
    result.reasons.push("Zone interaction context is present.");
  } else {
    result.missing.push("zone_interaction_missing");
  }

  if (checks.eligibility_ok) {
    result.reasons.push("Setup eligibility allows execution evaluation.");
  } else {
    result.missing.push("eligibility_blocked");
    result.forced_trade_flags.push("eligibility_blocked");
  }

  if (checks.threshold_ok) {
    result.reasons.push("Threshold is tradeable.");
  } else {
    result.missing.push("threshold_not_tradeable");
    result.forced_trade_flags.push("threshold_not_tradeable");
  }

  if (checks.entry_model_available) {
    result.reasons.push("At least one approved entry model is available.");
  } else {
    result.missing.push("entry_model_unavailable");
  }

  result.notes.push("Invalidation is not yet explicitly modeled by the engine.");
  result.notes.push("Confirmation is not yet explicitly detected by the engine.");

  const inExecutionContext =
    checks.structure_present &&
    checks.zone_context_present &&
    checks.eligibility_ok &&
    checks.threshold_ok &&
    checks.entry_model_available;

  if (
    inExecutionContext &&
    (checks.confirmation_status === "missing" ||
      checks.confirmation_status === "unknown")
  ) {
    result.missing.push("confirmation_not_detected");
    result.forced_trade_flags.push("confirmation_missing_for_execution");
  }

  const hasMissingAlignment =
    !checks.structure_present ||
    !checks.zone_context_present ||
    !checks.eligibility_ok ||
    !checks.threshold_ok ||
    !checks.entry_model_available;

  if (hasMissingAlignment) {
    result.forced_trade_flags.push("missing_full_setup_alignment");
  }

  result.forced_trade_flags = [...new Set(result.forced_trade_flags)];
  result.missing = [...new Set(result.missing)];

  const hardForcedTrade =
    result.forced_trade_flags.includes("eligibility_blocked") ||
    result.forced_trade_flags.includes("threshold_not_tradeable");

  if (hardForcedTrade) {
    result.status = "forced_trade";
    return result;
  }

  if (inExecutionContext) {
    result.status = "pending_confirmation";
    return result;
  }

  if (
    checks.structure_present &&
    !checks.zone_context_present &&
    checks.eligibility_ok &&
    checks.threshold_ok
  ) {
    result.status = "almost_setup";
    return result;
  }

  if (
    checks.structure_present &&
    checks.eligibility_ok &&
    checks.threshold_ok &&
    !checks.entry_model_available
  ) {
    result.status = "almost_setup";
    return result;
  }

  result.status = "invalid";
  return result;
}

function refreshSetupEntryModels(symbol, timeframe, direction) {
  const key = getKey(symbol, timeframe, direction);
  const existingSetup = state.setups[key];

  if (!existingSetup) {
    return;
  }

  const safeSetup = ensureSetupHasEntryModels(
    ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(existingSetup))
  );

  state.setups[key] = {
    ...safeSetup,
    entry_models: evaluateEntryModelsForSetup(safeSetup),
    updatedAt: new Date().toISOString()
  };

  state.setups[key].execution_validation = evaluateExecutionValidationForSetup(
    state.setups[key]
  );

  saveStateToFile();
}

function refreshSetupExecutionValidation(symbol, timeframe, direction) {
  const key = getKey(symbol, timeframe, direction);
  const existingSetup = state.setups[key];

  if (!existingSetup) {
    return;
  }

  const safeSetup = ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(existingSetup))
    )
  );

  state.setups[key] = {
    ...safeSetup,
    execution_validation: evaluateExecutionValidationForSetup(safeSetup),
    updatedAt: new Date().toISOString()
  };

  saveStateToFile();
}

function ensureSetupHasScoring(setup) {
  if (!setup || typeof setup !== "object") {
    return setup;
  }

  return ensureSetupHasLiquidityEngineering(ensureSetupHasEntryModels({
    ...setup,
    scoring:
      setup.scoring && typeof setup.scoring === "object"
        ? {
            context_profile: setup.scoring.context_profile ?? null,
            categories: {
              bias: {
                score: setup.scoring.categories?.bias?.score ?? 0,
                timeframe: setup.scoring.categories?.bias?.timeframe ?? ""
              },
              anchor_poi: {
                score: setup.scoring.categories?.anchor_poi?.score ?? 0,
                timeframe:
                  setup.scoring.categories?.anchor_poi?.timeframe ?? ""
              },
              mid_poi: {
                score: setup.scoring.categories?.mid_poi?.score ?? 0,
                timeframe: setup.scoring.categories?.mid_poi?.timeframe ?? ""
              },
              refinement: {
                score: setup.scoring.categories?.refinement?.score ?? 0,
                timeframe:
                  setup.scoring.categories?.refinement?.timeframe ?? ""
              },
              alignment: {
                score: setup.scoring.categories?.alignment?.score ?? 0,
                timeframes: Array.isArray(
                  setup.scoring.categories?.alignment?.timeframes
                )
                  ? setup.scoring.categories.alignment.timeframes
                  : []
              }
            },
            total: setup.scoring.total ?? 0,
            threshold: setup.scoring.threshold ?? "none"
          }
        : createDefaultScoring()
  }));
}

const CONTEXT_PROFILE_MAP = {
  swing: {
    bias: "1d",
    anchor_poi: "4h",
    mid_poi: "1h",
    refinement: "15m",
    alignment: ["1d", "4h", "1h", "15m"]
  },
  intraday: {
    bias: "1h",
    anchor_poi: "15m",
    mid_poi: "5m",
    refinement: ["3m", "1m"],
    alignment: ["1h", "15m", "5m", "3m"]
  },
  scalping: {
    bias: "15m",
    anchor_poi: "5m",
    mid_poi: "3m",
    refinement: "1m",
    alignment: ["15m", "5m", "3m", "1m"]
  }
};

function isValidScore(value) {
  return Number.isFinite(value) && value >= 1 && value <= 5;
}

function calculateScoringFromManualInput(contextProfile, scores) {
  const profile = CONTEXT_PROFILE_MAP[contextProfile];

  if (!profile) {
    return {
      ok: false,
      error: `Invalid context_profile: ${contextProfile}`
    };
  }

  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    return {
      ok: false,
      error: "Scores must be a valid object"
    };
  }

  const requiredKeys = [
    "bias",
    "anchor_poi",
    "mid_poi",
    "refinement",
    "alignment"
  ];

  for (const key of requiredKeys) {
    if (!(key in scores)) {
      return {
        ok: false,
        error: `Missing score category: ${key}`
      };
    }

    const numericScore = Number(scores[key]);

    if (!isValidScore(numericScore)) {
      return {
        ok: false,
        error: `Invalid score for ${key}. Must be between 1 and 5`
      };
    }
  }

  const total =
    Number(scores.bias) +
    Number(scores.anchor_poi) +
    Number(scores.mid_poi) +
    Number(scores.refinement) +
    Number(scores.alignment);

  let threshold = "none";

  if (total >= 5 && total <= 16) {
    threshold = "no_trade";
  } else if (total >= 17 && total <= 20) {
    threshold = "B";
  } else if (total >= 21 && total <= 25) {
    threshold = "A";
  }

  return {
    ok: true,
    scoring: {
      context_profile: contextProfile,
      categories: {
        bias: {
          score: Number(scores.bias),
          timeframe: profile.bias
        },
        anchor_poi: {
          score: Number(scores.anchor_poi),
          timeframe: profile.anchor_poi
        },
        mid_poi: {
          score: Number(scores.mid_poi),
          timeframe: profile.mid_poi
        },
        refinement: {
          score: Number(scores.refinement),
          timeframe: profile.refinement
        },
        alignment: {
          score: Number(scores.alignment),
          timeframes: profile.alignment
        }
      },
      total,
      threshold
    }
  };
}

function applySetupScoring(symbol, timeframe, direction, contextProfile, scores) {
  const key = getKey(symbol, timeframe, direction);
  const existingSetup = ensureSetupHasLiquidityEngineering(
    ensureSetupHasScoring(state.setups[key] || null)
  );

  if (!existingSetup) {
    return {
      ok: false,
      error: `Setup not found for ${key}`
    };
  }

  const result = calculateScoringFromManualInput(contextProfile, scores);

  if (!result.ok) {
    return result;
  }

  state.setups[key] = ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering({
        ...existingSetup,
        scoring: result.scoring,
        updatedAt: new Date().toISOString()
      })
    )
  );

  state.setups[key].entry_models = evaluateEntryModelsForSetup(state.setups[key]);
  state.setups[key].execution_validation =
    evaluateExecutionValidationForSetup(state.setups[key]);

  saveStateToFile();

  console.log(
    `[SCORING] Applied scoring to ${key}: total=${result.scoring.total}, threshold=${result.scoring.threshold}`
  );

  return {
    ok: true,
    key,
    scoring: result.scoring
  };
}

const defaultState = {
  latestEvent: null,
  risk: createDefaultRiskState(),
  history: [],
  setups: {},
  rawEvents: [],
  latestRawEvent: null,
  controls: {
    processingEnabled: true,
    sessionEligible: true
  }
};

function loadStateFromFile() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { ...defaultState };
    }

    const fileContent = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(fileContent);

    const safeSetups =
      parsed.setups && typeof parsed.setups === "object" ? parsed.setups : {};

    for (const key in safeSetups) {
      safeSetups[key] = ensureSetupHasExecutionValidation(
        ensureSetupHasEntryModels(
          ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(safeSetups[key]))
        )
      );
    }

    return {
      latestEvent: parsed.latestEvent ?? null,
      risk: ensureRiskState(parsed.risk),
      history: Array.isArray(parsed.history) ? parsed.history : [],
      setups: safeSetups,
      rawEvents: Array.isArray(parsed.rawEvents) ? parsed.rawEvents : [],
      latestRawEvent: parsed.latestRawEvent ?? null,
      controls:
        parsed.controls && typeof parsed.controls === "object"
          ? {
              processingEnabled: parsed.controls.processingEnabled !== false,
              sessionEligible: parsed.controls.sessionEligible !== false
            }
          : {
              processingEnabled: true,
              sessionEligible: true
            }
    };
  } catch (error) {
    console.error("[STATE LOAD ERROR]", error.message);
    return { ...defaultState };
  }
}

function saveStateToFile() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error("[STATE SAVE ERROR]", error.message);
  }
}

function ensureArchiveDir() {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }
  } catch (error) {
    console.error("[ARCHIVE DIR ERROR]", error.message);
  }
}

function archiveCurrentState() {
  try {
    ensureArchiveDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveFile = path.join(ARCHIVE_DIR, `archive-${timestamp}.json`);

    const archivePayload = {
      archivedAt: new Date().toISOString(),
      stateSnapshot: state
    };

    fs.writeFileSync(
      archiveFile,
      JSON.stringify(archivePayload, null, 2),
      "utf8"
    );

    return {
      ok: true,
      archiveFile
    };
  } catch (error) {
    console.error("[ARCHIVE SAVE ERROR]", error.message);
    return {
      ok: false,
      error: error.message
    };
  }
}

function resetActiveState() {
  state.latestEvent = null;
  state.risk = createDefaultRiskState();
  state.history = [];
  state.setups = {};
  state.rawEvents = [];
  state.latestRawEvent = null;

  saveStateToFile();

  return {
    ok: true
  };
}

const state = loadStateFromFile();
state.risk = ensureRiskState(state.risk);
state.risk.status = evaluateRiskStatus(state.risk);

function getKey(symbol, timeframe, direction) {
  return `${symbol}_${timeframe}_${direction}`;
}

function isLiquidityEngineeringEligibleTimeframe(timeframe) {
  return ["3m", "5m", "15m"].includes(timeframe);
}

function toIsoOrNow(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function addSecondsToIso(isoString, seconds) {
  const base = new Date(isoString);
  return new Date(base.getTime() + seconds * 1000).toISOString();
}

function addMinutesToIso(isoString, minutes) {
  const base = new Date(isoString);
  return new Date(base.getTime() + minutes * 60 * 1000).toISOString();
}

function ensureLiquidityEngineeringSetup(symbol, timeframe, direction) {
  const key = getKey(symbol, timeframe, direction);
  const now = new Date().toISOString();

  const existing = state.setups[key]
    ? ensureSetupHasExecutionValidation(
        ensureSetupHasEntryModels(
          ensureSetupHasLiquidityEngineering(
            ensureSetupHasScoring(state.setups[key])
          )
        )
      )
    : null;

  if (existing) {
    return { key, setup: existing };
  }

  const created = ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering({
        symbol,
        timeframe,
        direction,

        stage: null,
        lastEvent: null,

        eligibility: "eligible",
        scoring: createDefaultScoring(),
        entry_models: createDefaultEntryModels(),
        execution_validation: createDefaultExecutionValidation(),
        liquidity_engineering: createDefaultLiquidityEngineering(),

        createdAt: now,
        updatedAt: now
      })
    )
  );

  state.setups[key] = created;
  saveStateToFile();

  return { key, setup: created };
}

function trackLiquidityEngineeringObTap(
  symbol,
  timeframe,
  direction,
  eventTimestamp
) {
  const key = getKey(symbol, timeframe, direction);
  const timeframeEligible = isLiquidityEngineeringEligibleTimeframe(timeframe);

  if (!timeframeEligible && !state.setups[key]) {
    return null;
  }

  const setup = timeframeEligible
    ? ensureLiquidityEngineeringSetup(symbol, timeframe, direction).setup
    : state.setups[key];
  const nowIso = toIsoOrNow(eventTimestamp);

  const safeSetup = ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(setup))
    )
  );

  const le = {
    ...createDefaultLiquidityEngineering(),
    ...(safeSetup.liquidity_engineering || {})
  };

  le.enabled = timeframeEligible;
  le.timeframe_eligible = timeframeEligible;
  le.notes = Array.isArray(le.notes) ? le.notes : [];

  if (!le.timeframe_eligible) {
    le.status = "inactive";
    le.blocked_reason = null;
    le.notes = [
      ...le.notes.filter(
        (note) => note !== "timeframe_not_eligible_for_liquidity_engineering"
      ),
      "timeframe_not_eligible_for_liquidity_engineering"
    ];

    state.setups[key] = {
      ...safeSetup,
      liquidity_engineering: le,
      updatedAt: new Date().toISOString()
    };

    saveStateToFile();
    return state.setups[key];
  }

  const currentStatus = le.status || "inactive";
  const windowEndMs = le.activation_window_ends_at
    ? new Date(le.activation_window_ends_at).getTime()
    : null;
  const currentTapMs = new Date(nowIso).getTime();

  if (currentStatus === "inactive") {
    le.status = "armed";
    le.activation_reason = null;

    le.tap_count = 1;
    le.first_tap_at = nowIso;
    le.last_tap_at = nowIso;

    le.activation_window_started_at = nowIso;
    le.activation_window_ends_at = addSecondsToIso(
      nowIso,
      le.activation_window_seconds
    );

    le.activated_at = null;

    le.monitoring_window_starts_at = null;
    le.monitoring_window_ends_at = null;

    le.waiting_for_color_switch = false;
    le.color_switch_handoff_ready_at = null;

    le.completed_at = null;
    le.blocked_reason = null;
  } else if (currentStatus === "armed") {
    if (windowEndMs !== null && currentTapMs <= windowEndMs) {
      le.status = "active";
      le.activation_reason = "repeated_ob_tap_within_2_minutes";

      le.tap_count = Number(le.tap_count || 0) + 1;
      le.last_tap_at = nowIso;

      le.activated_at = nowIso;

      le.monitoring_window_starts_at = nowIso;
      le.monitoring_window_ends_at = addMinutesToIso(
        nowIso,
        le.monitoring_window_minutes
      );

      le.waiting_for_color_switch = false;
      le.color_switch_handoff_ready_at = null;

      le.blocked_reason = null;
    } else {
      le.status = "armed";
      le.activation_reason = null;

      le.tap_count = 1;
      le.first_tap_at = nowIso;
      le.last_tap_at = nowIso;

      le.activation_window_started_at = nowIso;
      le.activation_window_ends_at = addSecondsToIso(
        nowIso,
        le.activation_window_seconds
      );

      le.activated_at = null;

      le.monitoring_window_starts_at = null;
      le.monitoring_window_ends_at = null;

      le.waiting_for_color_switch = false;
      le.color_switch_handoff_ready_at = null;

      le.completed_at = null;
      le.blocked_reason = null;
    }
  } else {
    le.last_tap_at = nowIso;
    le.tap_count = Number(le.tap_count || 0) + 1;
  }

  state.setups[key] = {
    ...safeSetup,
    lastEvent: "ob_tap",
    liquidity_engineering: le,
    updatedAt: new Date().toISOString()
  };

  saveStateToFile();
  return state.setups[key];
}

function refreshLiquidityEngineeringForSetup(setup) {
  const safeSetup = ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(setup))
    )
  );

  const le = {
    ...createDefaultLiquidityEngineering(),
    ...(safeSetup.liquidity_engineering || {})
  };

  const now = new Date();
  const nowIso = now.toISOString();

  if (!le.enabled) {
    return safeSetup;
  }

  if (!le.timeframe_eligible) {
    return {
      ...safeSetup,
      liquidity_engineering: le
    };
  }

  if (
    le.status === "armed" &&
    le.activation_window_ends_at &&
    now.getTime() > new Date(le.activation_window_ends_at).getTime()
  ) {
    le.status = "inactive";
    le.activation_reason = null;

    le.tap_count = 0;
    le.first_tap_at = null;
    le.last_tap_at = null;

    le.activation_window_started_at = null;
    le.activation_window_ends_at = null;

    le.activated_at = null;

    le.monitoring_window_starts_at = null;
    le.monitoring_window_ends_at = null;

    le.waiting_for_color_switch = false;
    le.color_switch_handoff_ready_at = null;

    le.completed_at = null;
    le.blocked_reason = null;
  }

  if (le.status === "active") {
    le.status = "monitoring";
  }

  if (
    le.status === "monitoring" &&
    le.monitoring_window_ends_at &&
    now.getTime() >= new Date(le.monitoring_window_ends_at).getTime()
  ) {
    le.status = "ready_for_color_switch";
    le.waiting_for_color_switch = true;
    le.color_switch_handoff_ready_at =
      le.color_switch_handoff_ready_at || nowIso;
  }

  return {
    ...safeSetup,
    liquidity_engineering: le
  };
}

function refreshAllLiquidityEngineeringStates() {
  let changed = false;

  for (const key in state.setups) {
    const existing = state.setups[key];
    if (!existing || typeof existing !== "object") {
      continue;
    }

    const before = JSON.stringify(existing);
    const refreshed = refreshLiquidityEngineeringForSetup(existing);
    const after = JSON.stringify(refreshed);

    if (before !== after) {
      changed = true;
    }

    state.setups[key] = refreshed;
  }

  if (changed) {
    saveStateToFile();
  }

  return changed;
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

  saveStateToFile();
  return entry;
}

function addEvent(event) {
  state.latestEvent = event;
  state.history.push(event);
  saveStateToFile();
}

function getSetup(symbol, timeframe, direction) {
  const key = getKey(symbol, timeframe, direction);
  const setup = state.setups[key] || null;
  return ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(setup))
    )
  );
}

function isTransitionAllowed(event, currentStage) {
  if (event === "structure_detected") {
    return true;
  }

  if (event === "ob_tap") {
    if (currentStage === "structure_detected") {
      return true;
    }

    console.log(
      `[RULE] Invalid sequence: ob_tap received while current stage is ${currentStage}`
    );
    return false;
  }

  console.log(`[RULE] Unknown or not-yet-enabled event ignored: ${event}`);
  return false;
}

function evaluateEligibility() {
  if (!state.controls?.processingEnabled) {
    return "blocked";
  }

  if (!state.controls?.sessionEligible) {
    return "blocked";
  }

  return "eligible";
}

function setSetupEligibility(symbol, timeframe, direction, eligibility) {
  const key = getKey(symbol, timeframe, direction);
  const setup = state.setups[key];

  if (!setup) {
    return;
  }

  setup.eligibility = eligibility;
  setup.updatedAt = new Date().toISOString();
  const safeSetup = ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(setup));

  setup.liquidity_engineering = safeSetup.liquidity_engineering;
  setup.scoring = safeSetup.scoring;
  setup.entry_models = evaluateEntryModelsForSetup(setup);
  setup.execution_validation = evaluateExecutionValidationForSetup(setup);

  saveStateToFile();

  console.log(
    `[ELIGIBILITY] ${symbol} ${timeframe} ${direction}: ${eligibility}`
  );
}

function updateSetup(symbol, timeframe, direction, event, newSetupState) {
  const key = getKey(symbol, timeframe, direction);
  const previousState = ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering(
        ensureSetupHasScoring(state.setups[key] || null)
      )
    )
  );

  const allowed = isTransitionAllowed(event, previousState?.stage || null);

  if (!allowed) {
    console.log(
      `[STATE] Blocked transition for ${symbol} ${timeframe} ${direction}: event=${event}, current=${previousState?.stage || null}, attempted=${newSetupState}`
    );
    return;
  }

  const now = new Date().toISOString();

  state.setups[key] = ensureSetupHasExecutionValidation(
    ensureSetupHasEntryModels(
      ensureSetupHasLiquidityEngineering({
        symbol,
        timeframe,
        direction,

        stage: newSetupState,
        lastEvent: event,

        eligibility: previousState?.eligibility || "eligible",
        scoring: previousState?.scoring || createDefaultScoring(),
        entry_models: previousState?.entry_models || createDefaultEntryModels(),
        liquidity_engineering:
          previousState?.liquidity_engineering ||
          createDefaultLiquidityEngineering(),
        execution_validation:
          previousState?.execution_validation ||
          createDefaultExecutionValidation(),

        createdAt: previousState?.createdAt || now,
        updatedAt: now
      })
    )
  );

  state.setups[key].entry_models = evaluateEntryModelsForSetup(state.setups[key]);
  state.setups[key].execution_validation =
    evaluateExecutionValidationForSetup(state.setups[key]);

  saveStateToFile();

  console.log(
    `[STATE] ${symbol} ${timeframe} ${direction}: ${previousState?.stage || null} -> ${newSetupState}`
  );
}

function getState() {
  const safeSetups = {};

  for (const key in state.setups) {
    safeSetups[key] = ensureSetupHasExecutionValidation(
      ensureSetupHasEntryModels(
        ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(state.setups[key]))
      )
    );
  }

  return {
    ...state,
    risk: ensureRiskState(state.risk),
    setups: safeSetups
  };
}

function getReactions() {
  const reactions = {};

  for (const key in state.setups) {
    const setup = ensureSetupHasExecutionValidation(
      ensureSetupHasEntryModels(
        ensureSetupHasLiquidityEngineering(ensureSetupHasScoring(state.setups[key]))
      )
    );
    const setupStage = setup?.stage || null;
    const eligibility = setup?.eligibility || "eligible";
    const threshold = setup?.scoring?.threshold || "none";

    reactions[key] = {
      setup,
      setupState: setupStage,
      decision: getFinalDecision({
        setupStage,
        eligibility,
        threshold,
        executionStatus: setup.execution_validation?.status || "invalid",
        riskState: state.risk?.status?.state || "risk_allowed"
      }),
      liquidityEngineeringSummary: {
        enabled: setup.liquidity_engineering?.enabled || false,
        timeframeEligible:
          setup.liquidity_engineering?.timeframe_eligible || false,
        status: setup.liquidity_engineering?.status || "inactive",
        activationReason:
          setup.liquidity_engineering?.activation_reason || null,
        tapCount: setup.liquidity_engineering?.tap_count || 0,
        activationWindow: {
          startsAt:
            setup.liquidity_engineering?.activation_window_started_at || null,
          endsAt:
            setup.liquidity_engineering?.activation_window_ends_at || null
        },
        monitoringWindow: {
          startsAt:
            setup.liquidity_engineering?.monitoring_window_starts_at || null,
          endsAt:
            setup.liquidity_engineering?.monitoring_window_ends_at || null
        },
        waitingForColorSwitch:
          setup.liquidity_engineering?.waiting_for_color_switch || false,
        readyAt:
          setup.liquidity_engineering?.color_switch_handoff_ready_at || null
      },
      entryModelsSummary: {
        context: setup.entry_models?.context_type || "unknown",
        available: setup.entry_models?.available || [],
        blocked: (setup.entry_models?.blocked || []).map((item) => item.model),
        pending: (setup.entry_models?.pending || []).map((item) => item.model)
      },
      executionValidationSummary: {
        status: setup.execution_validation?.status || "invalid",
        missing: setup.execution_validation?.missing || [],
        forcedTradeFlags:
          setup.execution_validation?.forced_trade_flags || []
      }
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
  getReactions,
  archiveCurrentState,
  resetActiveState,
  evaluateEligibility,
  setSetupEligibility,
  createDefaultScoring,
  ensureSetupHasScoring,
  calculateScoringFromManualInput,
  applySetupScoring,
  createDefaultEntryModels,
  ensureSetupHasEntryModels,
  deriveEntryModelContextType,
  evaluateEntryModelsForSetup,
  refreshSetupEntryModels,
  createDefaultRiskSettings,
  createDefaultRiskRuntime,
  createDefaultRiskStatus,
  createDefaultRiskState,
  ensureRiskState,
  evaluateRiskStatus,
  refreshRiskStatus,
  updateRiskState,
  createDefaultExecutionValidation,
  ensureSetupHasExecutionValidation,
  createDefaultLiquidityEngineering,
  ensureSetupHasLiquidityEngineering,
  trackLiquidityEngineeringObTap,
  refreshLiquidityEngineeringForSetup,
  refreshAllLiquidityEngineeringStates,
  buildExecutionValidationChecks,
  evaluateExecutionValidationForSetup,
  refreshSetupExecutionValidation
};
