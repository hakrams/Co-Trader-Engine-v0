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

function normalizeTimestamp(value, fallback = null) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
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

  zone_created: {
    event_family: "zone_creation",
    event_type: "ob_created",
    structure_type: null,
    zone_type: null,
    direction: "unknown"
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

  bullish_bos_detected: {
    event_family: "structure",
    event_type: "structure_detected",
    structure_type: "bos",
    zone_type: null,
    direction: "bullish"
  },

  bearish_bos_detected: {
    event_family: "structure",
    event_type: "structure_detected",
    structure_type: "bos",
    zone_type: null,
    direction: "bearish"
  },

  internal_bullish_choch_detected: {
    event_family: "structure",
    event_type: "structure_detected",
    structure_type: "choch",
    zone_type: null,
    direction: "bullish"
  },

  internal_bearish_choch_detected: {
    event_family: "structure",
    event_type: "structure_detected",
    structure_type: "choch",
    zone_type: null,
    direction: "bearish"
  },

  internal_bullish_bos_detected: {
    event_family: "structure",
    event_type: "structure_detected",
    structure_type: "bos",
    zone_type: null,
    direction: "bullish"
  },

  internal_bearish_bos_detected: {
    event_family: "structure",
    event_type: "structure_detected",
    structure_type: "bos",
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
  },

  candle_details: {
    event_family: "market_data",
    event_type: "candle_details",
    structure_type: null,
    zone_type: null,
    direction: null
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
  const mapped = EVENT_MAP[raw] || EVENT_MAP[raw.toLowerCase()];

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

function normalizeParsedEvent(payload = {}) {
  const event = normalizeEventName(payload.event);
  const timeframe = normalizeTimeframe(String(payload.timeframe || ""));
  const nestedPrice =
    payload.price && typeof payload.price === "object" && !Array.isArray(payload.price)
      ? payload.price
      : {};
  const nestedMeta =
    payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
      ? payload.meta
      : {};

  return {
    event_raw: event.event_raw,
    event_family: event.event_family,
    event_type: event.event_type,
    structure_type: event.structure_type,
    zone_type: event.zone_type,
    direction: event.direction,
    qualifiers: event.qualifiers,
    symbol: typeof payload.symbol === "string" ? payload.symbol.trim() : "",
    timeframe_raw:
      typeof payload.timeframe === "string" ? payload.timeframe.trim() : "",
    timeframe,
    times: {
      timestamp: normalizeTimestamp(payload.timestamp),
      bar_time: normalizeTimestamp(payload.bar_time),
      alert_time: normalizeTimestamp(payload.alert_time)
    },
    price: {
      open: toNumberOrNull(nestedPrice.open ?? payload.open),
      high: toNumberOrNull(nestedPrice.high ?? payload.high),
      low: toNumberOrNull(nestedPrice.low ?? payload.low),
      close: toNumberOrNull(nestedPrice.close ?? payload.close)
    },
    volume: toNumberOrNull(payload.volume),
    meta: {
      exchange:
        typeof payload.exchange === "string" ? payload.exchange.trim() : null,
      currency:
        typeof nestedMeta.currency === "string"
          ? nestedMeta.currency.trim()
          : typeof payload.currency === "string"
            ? payload.currency.trim()
            : null,
      base_currency:
        typeof nestedMeta.base_currency === "string"
          ? nestedMeta.base_currency.trim()
          : typeof nestedMeta.basecurrency === "string"
            ? nestedMeta.basecurrency.trim()
            : typeof payload.base_currency === "string"
              ? payload.base_currency.trim()
              : null,
      source: "tradingview"
    }
  };
}

module.exports = {
  normalizeTimeframe,
  toNumberOrNull,
  normalizeTimestamp,
  normalizeEventName,
  normalizeParsedEvent
};
