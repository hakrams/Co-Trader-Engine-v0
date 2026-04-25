const chartState = {
  candles: { count: 0, items: [] }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTimestamp(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toFixed(numeric >= 100 ? 2 : 5);
}

function normalizeTimeframeInput(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return `${raw}m`;
  return raw;
}

function getChartFilters() {
  const symbol = document.getElementById("chart-symbol")?.value || "";
  const timeframe = document.getElementById("chart-timeframe")?.value || "";

  return {
    symbol: String(symbol).trim().toUpperCase(),
    timeframe: normalizeTimeframeInput(timeframe)
  };
}

function renderChartLab() {
  const container = document.getElementById("candle-chart");
  const title = document.getElementById("chart-title");
  const summary = document.getElementById("chart-summary");
  if (!container) return;

  const candles = (chartState.candles.items || [])
    .filter((item) => {
      return (
        item &&
        Number.isFinite(Number(item.open)) &&
        Number.isFinite(Number(item.high)) &&
        Number.isFinite(Number(item.low)) &&
        Number.isFinite(Number(item.close)) &&
        item.barTime
      );
    })
    .sort((a, b) => new Date(a.barTime || 0) - new Date(b.barTime || 0))
    .slice(-360);

  if (!candles.length) {
    container.classList.add("empty-state");
    container.textContent = "No candle data recorded yet.";
    if (title) title.textContent = "Waiting for candles";
    if (summary) summary.textContent = "Send candle_details webhooks to start drawing local candles.";
    return;
  }

  const width = 1440;
  const height = 720;
  const margin = { top: 28, right: 92, bottom: 64, left: 34 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const highs = candles.map((candle) => Number(candle.high));
  const lows = candles.map((candle) => Number(candle.low));
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const padding = Math.max((maxPrice - minPrice) * 0.08, 0.0001);
  const priceMin = minPrice - padding;
  const priceMax = maxPrice + padding;
  const priceRange = priceMax - priceMin || 1;
  const candleStep = plotWidth / Math.max(candles.length, 1);
  const candleWidth = Math.max(2, Math.min(11, candleStep * 0.58));

  function xFor(index) {
    return margin.left + candleStep * index + candleStep / 2;
  }

  function yFor(price) {
    return margin.top + (priceMax - price) / priceRange * plotHeight;
  }

  const priceTicks = Array.from({ length: 7 }, (_, index) => {
    const value = priceMin + (priceRange / 6) * index;
    const y = yFor(value);
    return `<g><line class="chart-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="chart-price-label" x="${width - margin.right + 12}" y="${y + 4}">${escapeHtml(formatPrice(value))}</text></g>`;
  }).reverse().join("");

  const timeTickEvery = Math.max(1, Math.ceil(candles.length / 10));
  const timeTicks = candles.map((candle, index) => {
    if (index % timeTickEvery !== 0 && index !== candles.length - 1) return "";
    const x = xFor(index);
    return `<g><line class="chart-time-tick" x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 6}"></line><text class="chart-time-label" x="${x}" y="${height - margin.bottom + 24}">${escapeHtml(formatTimestamp(candle.barTime))}</text></g>`;
  }).join("");

  const candleNodes = candles.map((candle, index) => {
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const x = xFor(index);
    const wickTop = yFor(high);
    const wickBottom = yFor(low);
    const bodyTop = yFor(Math.max(open, close));
    const bodyBottom = yFor(Math.min(open, close));
    const bodyHeight = Math.max(2, bodyBottom - bodyTop);
    const directionClass = close >= open ? "chart-candle-up" : "chart-candle-down";

    return `<g class="chart-candle ${directionClass}"><line x1="${x}" y1="${wickTop}" x2="${x}" y2="${wickBottom}"></line><rect x="${x - candleWidth / 2}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}"><title>${escapeHtml(formatTimestamp(candle.barTime))} O ${escapeHtml(formatPrice(open))} H ${escapeHtml(formatPrice(high))} L ${escapeHtml(formatPrice(low))} C ${escapeHtml(formatPrice(close))}</title></rect></g>`;
  }).join("");

  const latest = candles[candles.length - 1];
  if (title) title.textContent = `${latest.symbol || "Market"} ${latest.timeframe || ""} Candle Chart`;
  if (summary) {
    summary.textContent = `${candles.length} candle${candles.length === 1 ? "" : "s"} · latest ${formatTimestamp(latest.barTime)} · O ${formatPrice(latest.open)} H ${formatPrice(latest.high)} L ${formatPrice(latest.low)} C ${formatPrice(latest.close)}`;
  }

  container.classList.remove("empty-state");
  container.innerHTML = `<svg class="candle-chart-svg candle-chart-svg-large" viewBox="0 0 ${width} ${height}" role="img" aria-label="Local candle chart"><rect class="chart-plot-bg" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>${priceTicks}<line class="chart-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line><line class="chart-axis" x1="${width - margin.right}" y1="${margin.top}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>${timeTicks}${candleNodes}</svg>`;
}

async function loadCandles() {
  const { symbol, timeframe } = getChartFilters();
  const params = new URLSearchParams({ limit: "500" });

  if (symbol) params.set("symbol", symbol);
  if (timeframe) params.set("timeframe", timeframe);

  const res = await fetch(`/api/candles?${params.toString()}`);
  chartState.candles = await res.json();
  renderChartLab();
}

function setupChartLabControls() {
  const refreshButton = document.getElementById("chart-refresh");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadCandles);
  }

  ["chart-symbol", "chart-timeframe"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadCandles();
      }
    });
  });
}

setupChartLabControls();
loadCandles().catch((error) => {
  console.error("Failed to load candles:", error);
  const summary = document.getElementById("chart-summary");
  if (summary) summary.textContent = `Failed to load candles: ${error.message}`;
});
setInterval(loadCandles, 3000);
