const {
  normalizeTimeframe,
  toNumberOrNull,
  normalizeEventName
} = require("./normalizer");

function parse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload must be a valid JSON object");
  }

  const receivedAt = new Date().toISOString();

  const rawEvent =
    typeof payload.event === "string" ? payload.event.trim() : "";
  const rawSymbol =
    typeof payload.symbol === "string" ? payload.symbol.trim() : "";
  const rawTimeframe =
    typeof payload.timeframe === "string" ? payload.timeframe.trim() : "";

  if (!rawEvent) {
    throw new Error("Missing or invalid 'event'");
  }

  if (!rawSymbol) {
    throw new Error("Missing or invalid 'symbol'");
  }

  if (!rawTimeframe) {
    throw new Error("Missing or invalid 'timeframe'");
  }

  const normalizedEvent = normalizeEventName(rawEvent);

  const plots = {};
  for (const key in payload) {
    if (key.startsWith("plot_")) {
      plots[key] = toNumberOrNull(payload[key]);
    }
  }

  return {
    raw: {
      payload,
      event: rawEvent,
      timeframe: rawTimeframe,
      received_at: receivedAt
    },
    normalized: {
      event_raw: normalizedEvent.event_raw,
      event_type: normalizedEvent.event_type,
      zone_type: normalizedEvent.zone_type,
      direction: normalizedEvent.direction,

      symbol: rawSymbol,
      timeframe_raw: rawTimeframe,
      timeframe: normalizeTimeframe(rawTimeframe),

      times: {
        timestamp:
          typeof payload.timestamp === "string" && payload.timestamp.trim()
            ? payload.timestamp.trim()
            : null,
        bar_time:
          typeof payload.bar_time === "string" && payload.bar_time.trim()
            ? payload.bar_time.trim()
            : null,
        alert_time:
          typeof payload.alert_time === "string" && payload.alert_time.trim()
            ? payload.alert_time.trim()
            : null,
        received_at: receivedAt
      },

      price: {
        open: toNumberOrNull(payload.open),
        high: toNumberOrNull(payload.high),
        low: toNumberOrNull(payload.low),
        close: toNumberOrNull(payload.close)
      },

      volume: toNumberOrNull(payload.volume),

      meta: {
        exchange:
          typeof payload.exchange === "string" && payload.exchange.trim()
            ? payload.exchange.trim()
            : null,
        currency:
          typeof payload.currency === "string" && payload.currency.trim()
            ? payload.currency.trim()
            : null,
        base_currency:
          typeof payload.base_currency === "string" &&
          payload.base_currency.trim()
            ? payload.base_currency.trim()
            : null,
        source: "tradingview",
        plots
      }
    }
  };
}

module.exports = {
  parse
};