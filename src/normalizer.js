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

function normalizeEventName(eventName) {
  if (typeof eventName !== "string") {
    return {
      event_raw: "",
      event_type: "unknown",
      zone_type: null,
      direction: null
    };
  }

  const raw = eventName.trim();

  switch (raw) {
    case "Demand_ob_tap":
      return {
        event_raw: raw,
        event_type: "ob_tap",
        zone_type: "demand",
        direction: "bullish"
      };

    case "Supply_ob_tap":
      return {
        event_raw: raw,
        event_type: "ob_tap",
        zone_type: "supply",
        direction: "bearish"
      };

    case "bullish_choch_detected":
      return {
        event_raw: raw,
        event_type: "choch",
        zone_type: null,
        direction: "bullish"
      };

    case "bearish_choch_detected":
      return {
        event_raw: raw,
        event_type: "choch",
        zone_type: null,
        direction: "bearish"
      };

    default:
      return {
        event_raw: raw,
        event_type: "unknown",
        zone_type: null,
        direction: null
      };
  }
}

module.exports = {
  normalizeTimeframe,
  toNumberOrNull,
  normalizeEventName
};