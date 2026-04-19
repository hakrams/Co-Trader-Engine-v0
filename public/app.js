if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

const DECISION_ORDER = [
  "actionable_high_priority",
  "actionable",
  "qualified",
  "monitor",
  "observe",
  "paused",
  "blocked",
  "ignore",
  "none",
  "unknown"
];

let previousReactions = JSON.parse(
  localStorage.getItem("previousReactions") || "{}"
);

function showBrowserNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function humanize(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function joinList(items, fallback = "none") {
  if (!Array.isArray(items) || items.length === 0) return fallback;
  return items.join(", ");
}

function getDecisionClass(decision) {
  if (decision === "actionable" || decision === "actionable_high_priority") {
    return "badge-good";
  }

  if (decision === "qualified" || decision === "monitor") {
    return "badge-warn";
  }

  if (decision === "blocked" || decision === "paused") {
    return "badge-bad";
  }

  return "";
}

function getExecutionClass(status) {
  if (status === "valid") return "badge-good";
  if (status === "pending_confirmation" || status === "almost_setup") {
    return "badge-warn";
  }
  if (status === "forced_trade" || status === "invalid") return "badge-bad";
  return "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setupPageNavigation() {
  const buttons = document.querySelectorAll(".nav-btn");
  const pages = document.querySelectorAll(".page");
  const pageTitleEl = document.getElementById("page-title");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetPage = button.dataset.page;

      buttons.forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });

      pages.forEach((page) => {
        page.classList.toggle("is-active", page.dataset.page === targetPage);
      });

      if (pageTitleEl) {
        pageTitleEl.textContent = button.textContent.trim();
      }
    });
  });
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

function getReactionRecords(data) {
  const reactions = data.reactions || {};

  return Object.entries(reactions).map(([key, item]) => {
    const setup = item.setup || {};
    const scoring = setup.scoring || {};
    const entrySummary = item.entryModelsSummary || {};
    const executionSummary = item.executionValidationSummary || {};

    return {
      key,
      item,
      setup,
      scoring,
      decision: item.decision || "unknown",
      setupState: item.setupState || setup.stage || "unknown",
      executionStatus:
        executionSummary.status || setup.execution_validation?.status || "invalid",
      missing:
        executionSummary.missing || setup.execution_validation?.missing || [],
      forcedTradeFlags:
        executionSummary.forcedTradeFlags ||
        setup.execution_validation?.forced_trade_flags ||
        [],
      entryContext: entrySummary.context || setup.entry_models?.context_type || "unknown",
      availableModels: entrySummary.available || setup.entry_models?.available || [],
      blockedModels: entrySummary.blocked || [],
      pendingModels: entrySummary.pending || []
    };
  });
}

function renderOverview(data) {
  const latestNormalized = data.latestEvent?.normalized;
  const setups = data.setups || {};
  const history = data.history || [];
  const risk = data.risk || {};
  const controls = data.controls || {};
  const reactionRecords = getReactionRecords(data);

  setText("status", "Backend state fetched successfully.");
  setText("overview-setup-count", Object.keys(setups).length);
  setText("overview-raw-count", data.rawEvents?.length || 0);

  if (latestNormalized) {
    setText("overview-latest-event", latestNormalized.event_raw || "Unknown event");
    setText(
      "overview-latest-event-meta",
      `${latestNormalized.symbol || "unknown"} ${latestNormalized.timeframe || "unknown"} | ${latestNormalized.event_family || "unknown"} / ${latestNormalized.event_type || "unknown"}`
    );
  } else {
    setText("overview-latest-event", "No events received yet.");
    setText("overview-latest-event-meta", "Waiting for event stream.");
  }

  const decisionCounts = reactionRecords.reduce((acc, record) => {
    acc[record.decision] = (acc[record.decision] || 0) + 1;
    return acc;
  }, {});

  const summaryEl = document.getElementById("overview-summary");
  if (summaryEl) {
    summaryEl.classList.remove("empty-state");
    summaryEl.innerHTML = [
      ["Risk", `${risk.status?.state || "risk_allowed"} (${joinList(risk.status?.reasons || [])})`],
      [
        "Controls",
        `processing=${controls.processingEnabled !== false}, session=${controls.sessionEligible !== false}`
      ],
      ["Decisions", Object.keys(decisionCounts).length ? safeJson(decisionCounts) : "none"],
      ["Latest Raw Event", data.latestRawEvent?.receivedAt || "none"]
    ]
      .map(([label, value]) => {
        return `
          <div class="summary-item">
            <strong>${escapeHtml(label)}</strong><br />
            <span>${escapeHtml(value)}</span>
          </div>
        `;
      })
      .join("");
  }

  const historyEl = document.getElementById("overview-history");
  if (historyEl) {
    if (!history.length) {
      historyEl.classList.add("empty-state");
      historyEl.textContent = "No event history yet.";
    } else {
      historyEl.classList.remove("empty-state");
      historyEl.innerHTML = history
        .slice(-8)
        .reverse()
        .map((item, index) => {
          const normalized = item.normalized || {};
          return `
            <div class="history-item">
              <div class="history-meta">
                <strong>#${index + 1}</strong> ${escapeHtml(normalized.event_raw || "unknown")}
              </div>
              <div class="muted">
                ${escapeHtml(normalized.symbol || "unknown")} ${escapeHtml(normalized.timeframe || "unknown")}
                | ${escapeHtml(normalized.event_family || "unknown")} / ${escapeHtml(normalized.event_type || "unknown")}
              </div>
            </div>
          `;
        })
        .join("");
    }
  }
}

function groupRecordsByDecision(records) {
  const groups = {};

  for (const record of records) {
    const decision = record.decision || "unknown";
    if (!groups[decision]) groups[decision] = [];
    groups[decision].push(record);
  }

  return groups;
}

function getOrderedDecisionKeys(groups) {
  const known = DECISION_ORDER.filter((decision) => groups[decision]);
  const unknown = Object.keys(groups)
    .filter((decision) => !DECISION_ORDER.includes(decision))
    .sort();

  return [...known, ...unknown];
}

function renderSetupCard(record) {
  const setup = record.setup;
  const scoring = record.scoring;
  const decisionClass = getDecisionClass(record.decision);
  const executionClass = getExecutionClass(record.executionStatus);

  return `
    <article class="setup-card">
      <div class="card-title-row">
        <div>
          <div class="setup-title">${escapeHtml(record.key)}</div>
          <div class="setup-subtitle">
            ${escapeHtml(setup.symbol || "unknown")} | ${escapeHtml(setup.timeframe || "unknown")} | ${escapeHtml(setup.direction || "unknown")}
          </div>
        </div>
        <span class="badge badge-decision ${decisionClass}">${escapeHtml(humanize(record.decision))}</span>
      </div>

      <div class="badge-row">
        <span class="badge">${escapeHtml(humanize(record.setupState))}</span>
        <span class="badge ${executionClass}">exec: ${escapeHtml(humanize(record.executionStatus))}</span>
        <span class="badge">threshold: ${escapeHtml(scoring.threshold || "none")}</span>
      </div>

      <div class="detail-list">
        <div><span>Available models</span><strong>${escapeHtml(joinList(record.availableModels))}</strong></div>
        <div><span>Pending models</span><strong>${escapeHtml(joinList(record.pendingModels))}</strong></div>
        <div><span>Entry context</span><strong>${escapeHtml(record.entryContext)}</strong></div>
      </div>
    </article>
  `;
}

function renderSetupBoard(data) {
  const setupBoardEl = document.getElementById("setup-board-groups");
  if (!setupBoardEl) return;

  const records = getReactionRecords(data);

  if (!records.length) {
    setupBoardEl.classList.add("empty-state");
    setupBoardEl.textContent = "No setups tracked yet.";
    return;
  }

  const groups = groupRecordsByDecision(records);
  setupBoardEl.classList.remove("empty-state");
  setupBoardEl.innerHTML = getOrderedDecisionKeys(groups)
    .map((decision) => {
      const groupRecords = groups[decision];
      return `
        <section class="group-panel">
          <div class="group-header">
            <h4>${escapeHtml(humanize(decision))}</h4>
            <span class="group-count">${groupRecords.length} setup${groupRecords.length === 1 ? "" : "s"}</span>
          </div>
          <div class="card-grid">
            ${groupRecords.map(renderSetupCard).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderDecisionCard(record, riskState) {
  const scoring = record.scoring;
  const decisionClass = getDecisionClass(record.decision);
  const executionClass = getExecutionClass(record.executionStatus);

  return `
    <article class="decision-card">
      <div class="card-title-row">
        <div>
          <div class="setup-title">${escapeHtml(record.key)}</div>
          <div class="setup-subtitle">Final decision and supporting truth</div>
        </div>
        <span class="badge badge-decision ${decisionClass}">${escapeHtml(humanize(record.decision))}</span>
      </div>

      <div class="badge-row">
        <span class="badge ${executionClass}">execution: ${escapeHtml(humanize(record.executionStatus))}</span>
        <span class="badge">risk: ${escapeHtml(humanize(riskState))}</span>
        <span class="badge">threshold: ${escapeHtml(scoring.threshold || "none")}</span>
      </div>

      <div class="detail-list">
        <div><span>Setup state</span><strong>${escapeHtml(humanize(record.setupState))}</strong></div>
        <div><span>Missing</span><strong>${escapeHtml(joinList(record.missing))}</strong></div>
        <div><span>Forced-trade flags</span><strong>${escapeHtml(joinList(record.forcedTradeFlags))}</strong></div>
        <div><span>Available models</span><strong>${escapeHtml(joinList(record.availableModels))}</strong></div>
        <div><span>Blocked models</span><strong>${escapeHtml(joinList(record.blockedModels))}</strong></div>
        <div><span>Pending models</span><strong>${escapeHtml(joinList(record.pendingModels))}</strong></div>
      </div>
    </article>
  `;
}

function renderDecisionBoard(data) {
  const decisionBoardEl = document.getElementById("decision-board-groups");
  if (!decisionBoardEl) return;

  const records = getReactionRecords(data);
  const riskState = data.risk?.status?.state || "risk_allowed";

  if (!records.length) {
    decisionBoardEl.classList.add("empty-state");
    decisionBoardEl.textContent = "No decisions available yet.";
    return;
  }

  const groups = groupRecordsByDecision(records);
  decisionBoardEl.classList.remove("empty-state");
  decisionBoardEl.innerHTML = getOrderedDecisionKeys(groups)
    .map((decision) => {
      const groupRecords = groups[decision];
      return `
        <section class="group-panel">
          <div class="group-header">
            <h4>${escapeHtml(humanize(decision))}</h4>
            <span class="group-count">${groupRecords.length} decision${groupRecords.length === 1 ? "" : "s"}</span>
          </div>
          <div class="card-grid">
            ${groupRecords
              .map((record) => renderDecisionCard(record, riskState))
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function updateDecisionAlerts(data) {
  const dashboardAlertEl = document.getElementById("dashboard-alert");
  const reactions = data.reactions || {};

  if (!dashboardAlertEl) return;

  if (!dashboardAlertEl.textContent.trim()) {
    dashboardAlertEl.textContent = "No new alerts yet.";
  }

  for (const [key, reaction] of Object.entries(reactions)) {
    const previousDecision = previousReactions[key] || null;
    const currentDecision = reaction.decision;

    if (previousDecision === currentDecision) continue;

    if (currentDecision === "qualified") {
      dashboardAlertEl.textContent = `${key} is qualified and pending confirmation.`;
      showBrowserNotification("Qualified Setup", `${key} is qualified.`);
    }

    if (currentDecision === "monitor") {
      dashboardAlertEl.textContent = `${key} is now on active monitor.`;
      showBrowserNotification("Monitor Setup", `${key} is now on active monitor.`);
    }

    if (currentDecision === "observe") {
      dashboardAlertEl.textContent = `${key} is forming and should be observed.`;
    }

    if (currentDecision === "actionable") {
      dashboardAlertEl.textContent = `${key} is now actionable.`;
      showBrowserNotification("Actionable Setup", `${key} is now actionable.`);
    }

    if (currentDecision === "actionable_high_priority") {
      dashboardAlertEl.textContent = `${key} is now high-priority actionable.`;
      showBrowserNotification(
        "High-Priority Setup",
        `${key} is now high-priority actionable.`
      );
    }

    if (currentDecision === "paused") {
      dashboardAlertEl.textContent = `${key} is paused by risk controls.`;
    }

    if (currentDecision === "blocked") {
      dashboardAlertEl.textContent = `${key} is blocked by engine truth.`;
    }
  }

  previousReactions = Object.fromEntries(
    Object.entries(reactions).map(([key, reaction]) => [key, reaction.decision])
  );
  localStorage.setItem("previousReactions", JSON.stringify(previousReactions));
}

function renderRawHistory(items) {
  const rawHistoryEl = document.getElementById("raw-history");
  if (!rawHistoryEl) return;

  if (!items.length) {
    rawHistoryEl.innerHTML = `<div class="history-item">No raw payload history yet.</div>`;
    return;
  }

  rawHistoryEl.innerHTML = items
    .map((item, index) => {
      return `
        <div class="history-item">
          <div class="history-meta">
            <strong>#${index + 1}</strong> receivedAt: ${escapeHtml(item.receivedAt)}
          </div>
          <pre class="json-box">${escapeHtml(safeJson(item.payload))}</pre>
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
    previousReactions = {};
    localStorage.setItem("previousReactions", "{}");
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

    renderOverview(data);
    renderSetupBoard(data);
    renderDecisionBoard(data);
    updateDecisionAlerts(data);
  } catch (err) {
    console.error("Failed to fetch state:", err);
    setText("status", "Failed to fetch backend state.");
  }
}

async function loadRawEvents() {
  try {
    const res = await fetch("/api/raw-events");
    const data = await res.json();
    const items = data.items || [];
    const summary = buildFieldSummary(items);

    setText("raw-count", data.count || 0);
    setText("overview-raw-count", data.count || 0);

    if (data.latest) {
      setText("raw-latest-meta", `Latest raw event received at ${data.latest.receivedAt}`);
      setText("raw-latest", safeJson(data.latest.payload));
    } else {
      setText("raw-latest-meta", "No raw payload yet.");
      setText("raw-latest", "Waiting for webhook...");
    }

    setText(
      "raw-summary",
      Object.keys(summary).length > 0 ? safeJson(summary) : "No fields observed yet."
    );

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

setupPageNavigation();
loadAll();
setInterval(loadAll, 2000);
