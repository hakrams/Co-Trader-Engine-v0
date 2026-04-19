function normalizeTimeframe(value) {
  if (typeof value !== "string") {
    return "unknown";
  }

  const raw = value.trim();

  const map = {
    "1": "1m",
    "2": "2m",
    "3": "3m",
    "5": "5m",
    "10": "10m",
    "15": "15m",
    "30": "30m",
    "45": "45m",
    "60": "1h",
    "120": "2h",
    "180": "3h",
    "240": "4h",
    "D": "1d",
    "W": "1w",
    "M": "1mo"
  };

  if (map[raw]) {
    return map[raw];
  }

  const alreadyNormalized = new Set([
    "1m",
    "2m",
    "3m",
    "5m",
    "10m",
    "15m",
    "30m",
    "45m",
    "1h",
    "2h",
    "3h",
    "4h",
    "1d",
    "1w",
    "1mo"
  ]);

  if (alreadyNormalized.has(raw)) {
    return raw;
  }

  return "unknown";
}

function toNumberOrNull(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === "" || trimmed.toLowerCase() === "na") {
    return null;
  }

  const numericPattern = /^-?\d+(\.\d+)?$/;
  if (!numericPattern.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const EVENT_MAP = {
  Demand_ob_tap: {
    event_family: "zone_interaction",
    event_type: "ob_tap",
    structure_type: null,
    zone_type: "demand",
    direction: "bullish"
  },

  Supply_ob_tap: {
    event_family: "zone_interaction",
    event_type: "ob_tap",
    structure_type: null,
    zone_type: "supply",
    direction: "bearish"
  },

  bullish_choch_detected: {
    event_family: "structure",
    event_type: "structure_detected",
    structure_type: "choch",
    zone_type: null,
    direction: "bullish"
  },

  bearish_choch_detected: {
    event_family: "structure",
    event_type: "structure_detected",
    structure_type: "choch",
    zone_type: null,
    direction: "bearish"
  },

  bullish_ob: {
    event_family: "zone_creation",
    event_type: "ob_created",
    structure_type: null,
    zone_type: "demand",
    direction: "bullish"
  },

  bearish_ob: {
    event_family: "zone_creation",
    event_type: "ob_created",
    structure_type: null,
    zone_type: "supply",
    direction: "bearish"
  }
};

function normalizeEventName(eventName) {
  if (typeof eventName !== "string") {
    return {
      event_raw: "",
      event_family: "unknown",
      event_type: "unknown",
      structure_type: null,
      zone_type: null,
      direction: null,
      qualifiers: {}
    };
  }

  const raw = eventName.trim();
  const mapped = EVENT_MAP[raw];

  if (!mapped) {
    return {
      event_raw: raw,
      event_family: "unknown",
      event_type: "unknown",
      structure_type: null,
      zone_type: null,
      direction: null,
      qualifiers: {}
    };
  }

  return {
    event_raw: raw,
    event_family: mapped.event_family,
    event_type: mapped.event_type,
    structure_type: mapped.structure_type,
    zone_type: mapped.zone_type,
    direction: mapped.direction,
    qualifiers: {}
  };
}

module.exports = {
  normalizeTimeframe,
  toNumberOrNull,
  normalizeEventName
};
