const {
  toNumberOrNull,
  normalizeParsedEvent
} = require("./normalizer");

function pickString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function parse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload must be a valid JSON object");
  }

  const receivedAt = new Date().toISOString();

  const rawEvent = pickString(payload.event) || "";
  const rawSymbol = pickString(payload.symbol) || "";
  const rawTimeframe = pickString(payload.timeframe) || "";

  if (!rawEvent) {
    throw new Error("Missing or invalid 'event'");
  }

  if (!rawSymbol) {
    throw new Error("Missing or invalid 'symbol'");
  }

  if (!rawTimeframe) {
    throw new Error("Missing or invalid 'timeframe'");
  }

  const nestedPrice =
    payload.price && typeof payload.price === "object" && !Array.isArray(payload.price)
      ? payload.price
      : {};

  const nestedMeta =
    payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
      ? payload.meta
      : {};

  const nestedPlots =
    payload.plots && typeof payload.plots === "object" && !Array.isArray(payload.plots)
      ? payload.plots
      : {};

  const plots = {};

  for (const [key, value] of Object.entries(nestedPlots)) {
    plots[key] = toNumberOrNull(value);
  }

  for (const key in payload) {
    if (key.startsWith("plot_")) {
      plots[key] = toNumberOrNull(payload[key]);
    }
  }

  const normalized = normalizeParsedEvent(payload);

  return {
    raw: {
      payload,
      event: rawEvent,
      timeframe: rawTimeframe,
      received_at: receivedAt
    },
    normalized: {
      ...normalized,
      symbol: rawSymbol,
      timeframe_raw: rawTimeframe,
      times: {
        ...normalized.times,
        timestamp: normalized.times.timestamp || pickString(payload.timestamp),
        bar_time: normalized.times.bar_time || pickString(payload.bar_time),
        alert_time: normalized.times.alert_time || pickString(payload.alert_time),
        received_at: receivedAt
      },
      price: {
        open: normalized.price.open ?? toNumberOrNull(nestedPrice.open ?? payload.open),
        high: normalized.price.high ?? toNumberOrNull(nestedPrice.high ?? payload.high),
        low: normalized.price.low ?? toNumberOrNull(nestedPrice.low ?? payload.low),
        close: normalized.price.close ?? toNumberOrNull(nestedPrice.close ?? payload.close)
      },
      volume: normalized.volume ?? toNumberOrNull(payload.volume),
      meta: {
        ...normalized.meta,
        exchange: normalized.meta.exchange ?? pickString(payload.exchange),
        currency: normalized.meta.currency ?? pickString(nestedMeta.currency, payload.currency),
        base_currency:
          normalized.meta.base_currency ??
          pickString(
            nestedMeta.base_currency,
            nestedMeta.basecurrency,
            payload.base_currency
          ),
        plots
      }
    }
  };
}

module.exports = {
  parse
};
