if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

function showBrowserNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

let previousReactions = JSON.parse(
  localStorage.getItem("previousReactions") || "{}"
);

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function buildFieldSummary(rawItems) {
  const summary = {};

  for (const item of rawItems) {
    const payload = item.payload || {};

    for (const [key, value] of Object.entries(payload)) {
      if (!summary[key]) {
        summary[key] = {
          seen: 0,
          types: {},
          emptyCount: 0,
          sample: value
        };
      }

      summary[key].seen += 1;

      const type = Array.isArray(value) ? "array" : typeof value;
      summary[key].types[type] = (summary[key].types[type] || 0) + 1;

      if (
        value === "" ||
        value === null ||
        value === undefined ||
        (typeof value === "object" &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0)
      ) {
        summary[key].emptyCount += 1;
      }
    }
  }

  return summary;
}

function renderRawHistory(items) {
  const rawHistoryEl = document.getElementById("raw-history");

  if (!items.length) {
    rawHistoryEl.innerHTML = `<div class="history-item">No raw payload history yet.</div>`;
    return;
  }

  rawHistoryEl.innerHTML = items
    .map((item, index) => {
      return `
        <div class="history-item">
          <div class="history-meta">
            <strong>#${index + 1}</strong> • receivedAt: ${item.receivedAt}
          </div>
          <pre class="json-box">${safeJson(item.payload)}</pre>
        </div>
      `;
    })
    .join("");
}

async function archiveAndResetActive() {
  const statusEl = document.getElementById("archive-reset-status");
  const buttonEl = document.getElementById("archive-reset-btn");

  if (!statusEl || !buttonEl) return;

  statusEl.textContent = "Archiving and resetting active state...";
  buttonEl.disabled = true;

  try {
    const res = await fetch("/archive-reset", {
      method: "POST"
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Archive reset failed");
    }

    statusEl.textContent = `Archived successfully: ${data.archiveFile}`;
    await loadAll();
  } catch (err) {
    console.error("Archive reset failed:", err);
    statusEl.textContent = `Archive reset failed: ${err.message}`;
  } finally {
    buttonEl.disabled = false;
  }
}

async function loadState() {
  try {
    const res = await fetch("/state");
    const data = await res.json();

    const statusEl = document.getElementById("status");
    const latestEventEl = document.getElementById("latest-event");
    const dashboardAlertEl = document.getElementById("dashboard-alert");
    const setupsEl = document.getElementById("setups");
    const reactionsEl = document.getElementById("reactions");
    const historyEl = document.getElementById("history");

    statusEl.textContent = "Backend state fetched successfully.";

    if (!dashboardAlertEl.textContent.trim()) {
      dashboardAlertEl.textContent = "No new alerts yet.";
    }

    if (data.latestEvent && data.latestEvent.normalized) {
      latestEventEl.textContent =
        "Latest Event: " +
        data.latestEvent.normalized.event_raw +
        " (" +
        data.latestEvent.normalized.symbol +
        " " +
        data.latestEvent.normalized.timeframe +
        ")";
    } else {
      latestEventEl.textContent = "No events received yet.";
    }

    const setups = data.setups || {};
    if (Object.keys(setups).length === 0) {
      setupsEl.textContent = "No setups tracked yet.";
    } else {
      setupsEl.innerHTML = "<strong>Setups:</strong><br>";
      for (const key in setups) {
        setupsEl.innerHTML += key + " → " + setups[key] + "<br>";
      }
    }

    const reactions = data.reactions || {};
    for (const key in reactions) {
      const previousDecision = previousReactions[key] || null;
      const currentDecision = reactions[key].decision;

      if (previousDecision !== currentDecision) {
        if (currentDecision === "monitoring") {
          dashboardAlertEl.textContent = `${key} is now being monitored.`;
          showBrowserNotification("Monitoring", `${key} is now being monitored.`);
        }

        if (currentDecision === "actionable") {
          dashboardAlertEl.textContent = `${key} is now actionable.`;
          showBrowserNotification("Actionable Setup", `${key} is now actionable.`);
        }
      }
    }

    const updatedPrevious = {};
    for (const key in reactions) {
      updatedPrevious[key] = reactions[key].decision;
    }

    previousReactions = updatedPrevious;
    localStorage.setItem("previousReactions", JSON.stringify(previousReactions));

    if (Object.keys(reactions).length === 0) {
      reactionsEl.textContent = "No reactions yet.";
    } else {
      reactionsEl.innerHTML = "<strong>Reactions:</strong><br>";
      for (const key in reactions) {
        const item = reactions[key];
        reactionsEl.innerHTML +=
          key + " → " + item.setupState + " → " + item.decision + "<br>";
      }
    }

    const history = data.history || [];
    if (history.length === 0) {
      historyEl.textContent = "No event history yet.";
    } else {
      historyEl.innerHTML = "<strong>History:</strong><br>";
      history.forEach((item, index) => {
        const normalized = item.normalized || {};

        historyEl.innerHTML +=
          (index + 1) +
          ". " +
          (normalized.event_raw || "unknown") +
          " (" +
          (normalized.symbol || "unknown") +
          " " +
          (normalized.timeframe || "unknown") +
          ")<br>";
      });
    }
  } catch (err) {
    console.error("Failed to fetch state:", err);
    document.getElementById("status").textContent =
      "Failed to fetch backend state.";
  }
}

async function loadRawEvents() {
  try {
    const res = await fetch("/api/raw-events");
    const data = await res.json();

    const rawCountEl = document.getElementById("raw-count");
    const rawLatestMetaEl = document.getElementById("raw-latest-meta");
    const rawLatestEl = document.getElementById("raw-latest");
    const rawSummaryEl = document.getElementById("raw-summary");

    rawCountEl.textContent = `Raw events captured: ${data.count || 0}`;

    if (data.latest) {
      rawLatestMetaEl.textContent = `Latest raw event received at ${data.latest.receivedAt}`;
      rawLatestEl.textContent = safeJson(data.latest.payload);
    } else {
      rawLatestMetaEl.textContent = "No raw payload yet.";
      rawLatestEl.textContent = "Waiting for webhook...";
    }

    const items = data.items || [];
    const summary = buildFieldSummary(items);

    rawSummaryEl.textContent =
      Object.keys(summary).length > 0
        ? safeJson(summary)
        : "No fields observed yet.";

    renderRawHistory(items);
  } catch (err) {
    console.error("Failed to fetch raw events:", err);
  }
}

async function loadAll() {
  await Promise.all([loadState(), loadRawEvents()]);
}

const archiveResetBtn = document.getElementById("archive-reset-btn");
if (archiveResetBtn) {
  archiveResetBtn.addEventListener("click", archiveAndResetActive);
}

loadAll();
setInterval(loadAll, 2000);