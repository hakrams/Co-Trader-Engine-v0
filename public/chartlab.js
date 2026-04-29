const chartViewport = {
  visibleCount: 120,
  rightIndex: null,
  priceMin: null,
  priceMax: null,
  priceManual: false,
  stickToLatest: true,
  pointers: new Map(),
  pinchDistance: null,
  pinchVisibleCount: 120,
  dragPointerId: null,
  dragStartX: 0,
  dragStartY: 0,
  startRightIndex: null,
  startPriceMin: null,
  startPriceMax: null,
  lastGeometry: null
};
let chartMode = localStorage.getItem("chartLabMode") || "line";
const chartState = {
  candles: { count: 0, items: [] },
  engine: { obBoxes: [], tapMatches: [] },
  symbols: []
};

const TIMEFRAME_MINUTES = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCandles(items) {
  return (items || [])
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
    .sort((a, b) => new Date(a.barTime || 0) - new Date(b.barTime || 0));
}

function getBucketStartIso(value, timeframe) {
  const minutes = TIMEFRAME_MINUTES[timeframe] || 1;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const bucketMs = minutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs).toISOString();
}

function aggregateCandlesFromOneMinute(items, targetTimeframe) {
  const sourceCandles = normalizeCandles(items);

  if (targetTimeframe === "1m") {
    return sourceCandles;
  }

  const buckets = new Map();

  for (const candle of sourceCandles) {
    const bucketTime = getBucketStartIso(candle.barTime, targetTimeframe);
    if (!bucketTime) continue;

    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, {
        id: `${candle.symbol}_${targetTimeframe}_${bucketTime}`,
        symbol: candle.symbol,
        exchange: candle.exchange || null,
        timeframe: targetTimeframe,
        barTime: bucketTime,
        alertTime: candle.alertTime || null,
        receivedAt: candle.receivedAt || null,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number.isFinite(Number(candle.volume)) ? Number(candle.volume) : null,
        sourceEvent: "aggregated_from_1m"
      });
      continue;
    }

    const bucket = buckets.get(bucketTime);
    bucket.high = Math.max(bucket.high, Number(candle.high));
    bucket.low = Math.min(bucket.low, Number(candle.low));
    bucket.close = Number(candle.close);
    bucket.volume =
      Number.isFinite(bucket.volume) || Number.isFinite(Number(candle.volume))
        ? Number(bucket.volume || 0) + Number(candle.volume || 0)
        : null;
    bucket.alertTime = candle.alertTime || bucket.alertTime;
    bucket.receivedAt = candle.receivedAt || bucket.receivedAt;
  }

  return Array.from(buckets.values()).sort((a, b) => new Date(a.barTime || 0) - new Date(b.barTime || 0));
}

function getChartGeometry() {
  const container = document.getElementById("candle-chart");
  const viewport = document.getElementById("chart-viewport");
  const box = (viewport || container)?.getBoundingClientRect();
  const width = Math.max(900, box?.width || 900);
  const height = Math.max(520, box?.height || 620);
  const margin = { top: 28, right: 92, bottom: 64, left: 34 };

  return {
    width,
    height,
    margin,
    plotWidth: width - margin.left - margin.right,
    plotHeight: height - margin.top - margin.bottom
  };
}

function clampVisibleCount(value, candleCount) {
  const maxVisible = Math.max(15, Math.min(500, candleCount || 15));
  return Math.round(clamp(value, 15, maxVisible));
}

function ensureChartCamera(candles) {
  const candleCount = candles.length;
  if (!candleCount) return;

  chartViewport.visibleCount = clampVisibleCount(chartViewport.visibleCount, candleCount);

  if (chartViewport.rightIndex === null || chartViewport.stickToLatest) {
    chartViewport.rightIndex = candleCount - 1;
  }

  chartViewport.rightIndex = clamp(
    chartViewport.rightIndex,
    Math.min(candleCount - 1, chartViewport.visibleCount - 1),
    candleCount - 1
  );
}

function getVisibleWindow(candles) {
  ensureChartCamera(candles);

  const candleCount = candles.length;
  const visibleCount = Math.min(chartViewport.visibleCount, candleCount);
  const rightIndex = Math.round(chartViewport.rightIndex ?? candleCount - 1);
  const leftIndex = Math.max(0, rightIndex - visibleCount + 1);

  return {
    leftIndex,
    rightIndex,
    visible: candles.slice(leftIndex, rightIndex + 1)
  };
}

function getAutoPriceRange(candles) {
  const highs = candles.map((candle) => Number(candle.high));
  const lows = candles.map((candle) => Number(candle.low));
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const padding = Math.max((maxPrice - minPrice) * 0.08, 0.0001);

  return {
    min: minPrice - padding,
    max: maxPrice + padding
  };
}

function syncPriceCamera(visibleCandles) {
  const autoRange = getAutoPriceRange(visibleCandles);
  const autoSpan = autoRange.max - autoRange.min || 1;

  if (
    !chartViewport.priceManual ||
    !Number.isFinite(chartViewport.priceMin) ||
    !Number.isFinite(chartViewport.priceMax)
  ) {
    chartViewport.priceMin = autoRange.min;
    chartViewport.priceMax = autoRange.max;
    return;
  }

  const currentSpan = chartViewport.priceMax - chartViewport.priceMin;
  if (!Number.isFinite(currentSpan) || currentSpan <= 0) {
    chartViewport.priceMin = autoRange.min;
    chartViewport.priceMax = autoRange.max;
    chartViewport.priceManual = false;
    return;
  }

  const visibleSpan = Math.max(autoSpan, currentSpan);
  const center = (chartViewport.priceMin + chartViewport.priceMax) / 2;
  chartViewport.priceMin = center - visibleSpan / 2;
  chartViewport.priceMax = center + visibleSpan / 2;
}

function getObTime(obBox) {
  return (
    obBox?.zoneOriginTime ||
    obBox?.zone_origin_time ||
    obBox?.bar_time ||
    obBox?.barTime ||
    null
  );
}

function getShortObId(obBox) {
  const id = String(obBox?.id || "ob");
  const compact = id.replace(/[^a-z0-9]/gi, "");
  return compact.slice(-4) || "ob";
}

function getObOverlayClass(obBox) {
  const status = String(obBox?.status || "active").toLowerCase();

  if (status === "liquidity_engineering_active") {
    return "chart-ob-overlay chart-ob-overlay-liquidity";
  }

  if (status === "respected" || status === "respected_high_priority") {
    return "chart-ob-overlay chart-ob-overlay-respected";
  }

  if (status === "invalidated" || obBox?.archived === true || obBox?.active === false) {
    return "chart-ob-overlay chart-ob-overlay-inactive";
  }

  return "chart-ob-overlay chart-ob-overlay-active";
}

function findCandleIndexAtOrAfter(candles, rawTime) {
  const targetMs = new Date(rawTime || 0).getTime();

  if (!Number.isFinite(targetMs)) {
    return -1;
  }

  return candles.findIndex((candle) => {
    const candleMs = new Date(candle.barTime || 0).getTime();
    return Number.isFinite(candleMs) && candleMs >= targetMs;
  });
}

function getMatchingObBoxes(symbol, timeframe) {
  return (chartState.engine.obBoxes || []).filter((obBox) => {
    return (
      String(obBox.symbol || "").toUpperCase() === symbol &&
      normalizeTimeframeInput(obBox.timeframe) === timeframe &&
      Number.isFinite(Number(obBox.high)) &&
      Number.isFinite(Number(obBox.low)) &&
      getObTime(obBox)
    );
  });
}

function renderObOverlays(candles, visibleWindow, geometry, yFor) {
  const { symbol, timeframe } = getChartFilters();
  const countNode = document.getElementById("ob-overlay-count");

  if (!symbol || !timeframe) {
    if (countNode) countNode.textContent = "OB overlays: 0";
    return "";
  }

  const matchingBoxes = getMatchingObBoxes(symbol, timeframe);
  const visibleBoxes = matchingBoxes
    .map((obBox) => {
      const startIndex = findCandleIndexAtOrAfter(candles, getObTime(obBox));

      if (startIndex < 0 || startIndex > visibleWindow.rightIndex) {
        return null;
      }

      const relativeStart = startIndex - visibleWindow.leftIndex;
      const x1 = clamp(
        geometry.margin.left + geometry.candleStep * relativeStart,
        geometry.margin.left,
        geometry.width - geometry.margin.right
      );
      const x2 = geometry.width - geometry.margin.right;
      const yHigh = yFor(Number(obBox.high));
      const yLow = yFor(Number(obBox.low));
      const y = Math.min(yHigh, yLow);
      const height = Math.max(4, Math.abs(yLow - yHigh));
      const width = Math.max(8, x2 - x1);

      return {
        obBox,
        x: x1,
        y,
        width,
        height
      };
    })
    .filter(Boolean);

  if (countNode) {
    countNode.textContent = `OB overlays: ${visibleBoxes.length}`;
  }

  return visibleBoxes.map(({ obBox, x, y, width, height }) => {
    const status = obBox.status || "active";
    const provisional = obBox.provisionalDirection || "unknown";
    const tapCount = Number(obBox.tapCount ?? obBox.tap_count ?? 0);
    const label = `OB ${getShortObId(obBox)} · ${status} · ${provisional} · ${tapCount}x`;
    const labelY = y + 14;
    const title = [
      `OB ${getShortObId(obBox)}`,
      `status ${status}`,
      `provisional ${provisional}`,
      `taps ${tapCount}`,
      `range ${formatPrice(obBox.low)} - ${formatPrice(obBox.high)}`,
      `created ${formatTimestamp(getObTime(obBox))}`
    ].join(" | ");

    return `<g class="${getObOverlayClass(obBox)}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}"></rect>
      <text x="${x + 6}" y="${labelY}">${escapeHtml(label)}</text>
      <title>${escapeHtml(title)}</title>
    </g>`;
  }).join("");
}

function renderChartLab() {
  const container = document.getElementById("candle-chart");
  const title = document.getElementById("chart-title");
  const summary = document.getElementById("chart-summary");
  const overlayCount = document.getElementById("ob-overlay-count");
  if (!container) return;

  const { timeframe } = getChartFilters();
  const candles = aggregateCandlesFromOneMinute(chartState.candles.items, timeframe || "1m");

  if (!candles.length) {
    container.classList.add("empty-state");
    container.textContent = "No candle data recorded yet.";
    if (title) title.textContent = "Waiting for candles";
    if (summary) summary.textContent = "Send candle_details webhooks to start drawing local candles.";
    if (overlayCount) overlayCount.textContent = "OB overlays: 0";
    return;
  }

  const { width, height, margin, plotWidth, plotHeight } = getChartGeometry();
  const { leftIndex, rightIndex, visible } = getVisibleWindow(candles);
  syncPriceCamera(visible);

  const priceMin = chartViewport.priceMin;
  const priceMax = chartViewport.priceMax;
  const priceRange = priceMax - priceMin || 1;
  const candleStep = plotWidth / Math.max(visible.length, 1);
  const candleWidth = Math.max(2, Math.min(11, candleStep * 0.58));
  chartViewport.lastGeometry = {
    plotWidth,
    plotHeight,
    candleStep,
    marginLeft: margin.left
  };

  function xFor(index) {
    return margin.left + candleStep * index + candleStep / 2;
  }

  function yFor(price) {
    return margin.top + (priceMax - price) / priceRange * plotHeight;
  }

  const obOverlayNodes = renderObOverlays(
    candles,
    { leftIndex, rightIndex, visible },
    { width, margin, candleStep },
    yFor
  );

  const priceTicks = Array.from({ length: 7 }, (_, index) => {
    const value = priceMin + (priceRange / 6) * index;
    const y = yFor(value);
    return `<g><line class="chart-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="chart-price-label" x="${width - margin.right + 12}" y="${y + 4}">${escapeHtml(formatPrice(value))}</text></g>`;
  }).reverse().join("");

  const timeTickEvery = Math.max(1, Math.ceil(visible.length / 10));
  const timeTicks = visible.map((candle, index) => {
    if (index % timeTickEvery !== 0 && index !== visible.length - 1) return "";
    const x = xFor(index);
    return `<g><line class="chart-time-tick" x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 6}"></line><text class="chart-time-label" x="${x}" y="${height - margin.bottom + 24}">${escapeHtml(formatTimestamp(candle.barTime))}</text></g>`;
  }).join("");

  const linePoints = visible.map((candle, index) => {
    const close = Number(candle.close);
    return `${xFor(index)},${yFor(close)}`;
  }).join(" ");

  const pointNodes = visible.map((candle, index) => {
    const close = Number(candle.close);
    const x = xFor(index);
    const y = yFor(close);

    return `<circle class="chart-line-point" cx="${x}" cy="${y}" r="4">
      <title>${escapeHtml(formatTimestamp(candle.barTime))} C ${escapeHtml(formatPrice(close))}</title>
    </circle>`;
  }).join("");

  const candleNodes = visible.map((candle, index) => {
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

    return `<g class="chart-candle ${directionClass}">
      <line x1="${x}" y1="${wickTop}" x2="${x}" y2="${wickBottom}"></line>
      <rect x="${x - candleWidth / 2}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}">
        <title>${escapeHtml(formatTimestamp(candle.barTime))} O ${escapeHtml(formatPrice(open))} H ${escapeHtml(formatPrice(high))} L ${escapeHtml(formatPrice(low))} C ${escapeHtml(formatPrice(close))}</title>
      </rect>
    </g>`;
  }).join("");

  const chartNodes = chartMode === "line"
    ? `<polyline class="chart-line-path" points="${linePoints}"></polyline>${pointNodes}`
    : candleNodes;

  const latest = visible[visible.length - 1];
  if (title) {
    const modeLabel = chartMode === "line" ? "Line Chart" : "Candle Chart";
    title.textContent = `${latest.symbol || "Market"} ${timeframe || latest.timeframe || ""} ${modeLabel}`;
  }
  if (summary) {
    const sourceLabel = timeframe === "1m" ? "stored 1m" : `built from ${chartState.candles.items.length} stored 1m candles`;
    summary.textContent = `${visible.length} of ${candles.length} candles · ${leftIndex + 1}-${rightIndex + 1} · ${sourceLabel} · latest ${formatTimestamp(latest.barTime)} · O ${formatPrice(latest.open)} H ${formatPrice(latest.high)} L ${formatPrice(latest.low)} C ${formatPrice(latest.close)}`;
  }

  container.classList.remove("empty-state");
  container.innerHTML = `
  <svg class="candle-chart-svg candle-chart-svg-large" viewBox="0 0 ${width} ${height}" role="img" aria-label="Local chart">
    <defs>
      <clipPath id="chart-plot-clip">
        <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>
      </clipPath>
    </defs>
    <rect class="chart-plot-bg" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>

    <g id="plot-layer" clip-path="url(#chart-plot-clip)">
      ${obOverlayNodes}
      ${chartNodes}
    </g>

    <g id="price-axis-layer">
      ${priceTicks}
      <line class="chart-axis" x1="${width - margin.right}" y1="${margin.top}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
    </g>

    <g id="time-axis-layer">
      ${timeTicks}
      <line class="chart-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
    </g>
  </svg>`;
  setupChartViewport();
}

async function loadCandles() {
  const { symbol, timeframe } = getChartFilters();
  const params = new URLSearchParams({ limit: "5000" });

  if (symbol) params.set("symbol", symbol);
  params.set("timeframe", "1m");

  const res = await fetch(`/api/candles?${params.toString()}`);
  chartState.candles = await res.json();
  renderChartLab();
}

async function loadEngineState() {
  const res = await fetch("/state");
  chartState.engine = await res.json();
}

async function loadChartData() {
  await Promise.all([loadCandles(), loadEngineState()]);
  renderChartLab();
}

async function loadAvailableSymbols() {
  const res = await fetch("/api/candle-symbols");
  const data = await res.json();
  const symbols = (data.symbols || [])
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter(Boolean)
    .sort();
  const select = document.getElementById("chart-symbol");
  const storedSymbol = localStorage.getItem("chartLabSymbol") || "";
  const nextSymbols = symbols.length ? symbols : ["BTCUSD"];

  chartState.symbols = nextSymbols;

  if (!select) return;

  select.innerHTML = nextSymbols
    .map((symbol) => `<option value="${escapeHtml(symbol)}">${escapeHtml(symbol)}</option>`)
    .join("");
  select.value = nextSymbols.includes(storedSymbol) ? storedSymbol : nextSymbols[0];
}

function setupChartLabControls() {
  const modeButton = document.getElementById("chart-mode-toggle");

  if (modeButton) {
    modeButton.textContent = chartMode === "line" ? "Line Mode" : "Candle Mode";

    modeButton.addEventListener("click", () => {
      chartMode = chartMode === "line" ? "candle" : "line";
      localStorage.setItem("chartLabMode", chartMode);
      modeButton.textContent = chartMode === "line" ? "Line Mode" : "Candle Mode";
      renderChartLab();
    });
  }
  const refreshButton = document.getElementById("chart-refresh");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadChartData);
  }

  const symbolSelect = document.getElementById("chart-symbol");
  if (symbolSelect) {
    symbolSelect.addEventListener("change", () => {
      localStorage.setItem("chartLabSymbol", symbolSelect.value);
      chartViewport.rightIndex = null;
      chartViewport.stickToLatest = true;
      chartViewport.priceManual = false;
      loadChartData();
    });
  }

  const timeframeSelect = document.getElementById("chart-timeframe");
  if (timeframeSelect) {
    timeframeSelect.value = localStorage.getItem("chartLabTimeframe") || "1m";
    timeframeSelect.addEventListener("change", () => {
      localStorage.setItem("chartLabTimeframe", timeframeSelect.value);
      chartViewport.rightIndex = null;
      chartViewport.stickToLatest = true;
      chartViewport.priceManual = false;
      renderChartLab();
    });
  }
}

setupChartLabControls();
loadAvailableSymbols().then(loadChartData).catch((error) => {
  console.error("Failed to load candles:", error);
  const summary = document.getElementById("chart-summary");
  if (summary) summary.textContent = `Failed to load candles: ${error.message}`;
});
setInterval(loadChartData, 3000);

function getPointerDistance(points) {
  if (points.length < 2) return null;
  const dx = points[0].x - points[1].x;
  const dy = points[0].y - points[1].y;
  return Math.hypot(dx, dy);
}

function beginChartDrag(pointerId, clientX, clientY) {
  if (!chartViewport.lastGeometry) return;

  chartViewport.dragPointerId = pointerId;
  chartViewport.dragStartX = clientX;
  chartViewport.dragStartY = clientY;
  chartViewport.startRightIndex = chartViewport.rightIndex;
  chartViewport.startPriceMin = chartViewport.priceMin;
  chartViewport.startPriceMax = chartViewport.priceMax;
}

function refreshChartDragAnchor() {
  const remaining = Array.from(chartViewport.pointers.entries())[0];
  if (!remaining) {
    chartViewport.dragPointerId = null;
    return;
  }

  const [pointerId, point] = remaining;
  beginChartDrag(pointerId, point.x, point.y);
}

function clampChartRightIndex(candleCount) {
  const minRight = Math.min(candleCount - 1, chartViewport.visibleCount - 1);
  chartViewport.rightIndex = clamp(
    chartViewport.rightIndex ?? candleCount - 1,
    minRight,
    candleCount - 1
  );
  chartViewport.stickToLatest = chartViewport.rightIndex >= candleCount - 1;
}

function zoomChartAt(focusX, nextVisibleCount) {
  const candles = normalizeCandles(chartState.candles.items);
  if (!candles.length || !chartViewport.lastGeometry) return;

  const { plotWidth, candleStep, marginLeft } = chartViewport.lastGeometry;
  const plotFocusX = clamp(focusX - marginLeft, 0, plotWidth);
  const focusOffset = plotFocusX / Math.max(candleStep, 1);
  const oldVisibleCount = chartViewport.visibleCount;
  const oldRightIndex = chartViewport.rightIndex ?? candles.length - 1;
  const oldLeftIndex = oldRightIndex - oldVisibleCount + 1;
  const focusedIndex = oldLeftIndex + focusOffset;

  chartViewport.visibleCount = clampVisibleCount(nextVisibleCount, candles.length);
  chartViewport.rightIndex = focusedIndex + chartViewport.visibleCount - 1 - focusOffset;
  clampChartRightIndex(candles.length);
  renderChartLab();
}

function setupChartViewport() {
  const viewport = document.getElementById("chart-viewport");
  if (!viewport) return;

  viewport.onwheel = (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const focusX = event.clientX - rect.left;
    const factor = event.deltaY < 0 ? 0.88 : 1.12;

    zoomChartAt(focusX, chartViewport.visibleCount * factor);
  };

  viewport.onpointerdown = (event) => {
    if (event.target.closest("button, a, input, label")) return;

    viewport.setPointerCapture(event.pointerId);
    chartViewport.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (chartViewport.pointers.size === 1) {
      beginChartDrag(event.pointerId, event.clientX, event.clientY);
    } else if (chartViewport.pointers.size === 2) {
      const points = Array.from(chartViewport.pointers.values());
      chartViewport.pinchDistance = getPointerDistance(points);
      chartViewport.pinchVisibleCount = chartViewport.visibleCount;
    }
  };

  viewport.onpointermove = (event) => {
    if (!chartViewport.pointers.has(event.pointerId)) return;

    chartViewport.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (chartViewport.pointers.size === 2) {
      const points = Array.from(chartViewport.pointers.values());
      const distance = getPointerDistance(points);

      if (distance && chartViewport.pinchDistance) {
        const rect = viewport.getBoundingClientRect();
        const focusX = (points[0].x + points[1].x) / 2 - rect.left;
        zoomChartAt(
          focusX,
          chartViewport.pinchVisibleCount * (chartViewport.pinchDistance / distance)
        );
      }

      return;
    }

    if (chartViewport.dragPointerId !== event.pointerId) return;

    const candles = normalizeCandles(chartState.candles.items);
    const geometry = chartViewport.lastGeometry;
    if (!candles.length || !geometry) return;

    const deltaX = event.clientX - chartViewport.dragStartX;
    const deltaY = event.clientY - chartViewport.dragStartY;
    const candleDelta = deltaX / Math.max(geometry.candleStep, 1);
    const priceRange = chartViewport.startPriceMax - chartViewport.startPriceMin;
    const priceDelta = deltaY / Math.max(geometry.plotHeight, 1) * priceRange;

    chartViewport.rightIndex = chartViewport.startRightIndex - candleDelta;
    chartViewport.priceMin = chartViewport.startPriceMin + priceDelta;
    chartViewport.priceMax = chartViewport.startPriceMax + priceDelta;
    chartViewport.priceManual = Math.abs(deltaY) > 1;
    clampChartRightIndex(candles.length);
    renderChartLab();
  };

  const endPointer = (event) => {
    chartViewport.pointers.delete(event.pointerId);

    if (chartViewport.pointers.size < 2) {
      chartViewport.pinchDistance = null;
    }

    if (chartViewport.dragPointerId === event.pointerId) {
      refreshChartDragAnchor();
    }
  };

  viewport.onpointerup = endPointer;
  viewport.onpointercancel = endPointer;
  viewport.onlostpointercapture = endPointer;
}

window.addEventListener("resize", () => {
  renderChartLab();
});
