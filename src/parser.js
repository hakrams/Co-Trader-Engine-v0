function parse(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload must be a valid JSON object");
  }

  const { event, symbol, timeframe, timestamp } = payload;

  if (typeof event !== "string" || event.trim() === "") {
    throw new Error("Missing or invalid 'event'");
  }

  if (typeof symbol !== "string" || symbol.trim() === "") {
    throw new Error("Missing or invalid 'symbol'");
  }

  if (typeof timeframe !== "string" || timeframe.trim() === "") {
    throw new Error("Missing or invalid 'timeframe'");
  }

  if (typeof timestamp !== "string" || timestamp.trim() === "") {
    throw new Error("Missing or invalid 'timestamp'");
  }

  return {
    event: event.trim(),
    symbol: symbol.trim(),
    timeframe: timeframe.trim(),
    timestamp: timestamp.trim()
  };
}

module.exports = {
  parse
};