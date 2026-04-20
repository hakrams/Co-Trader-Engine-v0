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

const PRIORITY_RANK = {
  info: 1,
  watch: 2,
  important: 3,
  critical: 4
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  browserEnabled: true,
  soundEnabled: false,
  visualCriticalEnabled: true,
  telegramEnabled: false,
  telegramConfigured: false,
  telegramBotTokenMasked: "",
  telegramChatIdMasked: "",
  minimumPriority: "watch",
  actionableEmergencyMode: true
};

let previousReactions = JSON.parse(
  localStorage.getItem("previousReactions") || "{}"
);

let currentNotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };

function normalizeNotificationSettings(settings) {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(settings && typeof settings === "object" ? settings : {})
  };
}

function isPriorityAllowed(priority, settings = currentNotificationSettings) {
  const minimumRank = PRIORITY_RANK[settings.minimumPriority] || PRIORITY_RANK.watch;
  const currentRank = PRIORITY_RANK[priority] || PRIORITY_RANK.info;
  return currentRank >= minimumRank;
}

function getDecisionPriority(decision) {
  if (decision === "actionable" || decision === "actionable_high_priority") {
    return "critical";
  }

  if (decision === "qualified" || decision === "paused") {
    return "important";
  }

  if (decision === "monitor" || decision === "blocked") {
    return "watch";
  }

  return "info";
}

function showBrowserNotification(title, body) {
  if (!currentNotificationSettings.browserEnabled) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

function playCriticalSound() {
  if (!currentNotificationSettings.soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.45);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.5);
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
      liquidityStatus:
        item.liquidityEngineeringSummary?.status ||
        setup.liquidity_engineering?.status ||
        "inactive",
      waitingForColorSwitch:
        item.liquidityEngineeringSummary?.waitingForColorSwitch ||
        setup.liquidity_engineering?.waiting_for_color_switch ||
        false,
      entryContext: entrySummary.context || setup.entry_models?.context_type || "unknown",
      availableModels: entrySummary.available || setup.entry_models?.available || [],
      blockedModels: entrySummary.blocked || [],
      pendingModels: entrySummary.pending || []
    };
  });
}

function getActiveSetupSummary(records) {
  const activeDecisions = new Set([
    "monitor",
    "qualified",
    "actionable",
    "actionable_high_priority",
    "paused"
  ]);
  const activeLiquidityStatuses = new Set([
    "active",
    "monitoring",
    "ready_for_color_switch"
  ]);
  const activeRecords = records.filter((record) => {
    return (
      activeDecisions.has(record.decision) ||
      activeLiquidityStatuses.has(record.liquidityStatus) ||
      record.executionStatus === "pending_confirmation" ||
      record.waitingForColorSwitch
    );
  });

  if (!activeRecords.length) {
    return "0 active";
  }

  const counts = activeRecords.reduce((acc, record) => {
    const label =
      record.decision === "actionable_high_priority"
        ? "high priority"
        : record.decision;

    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return `${activeRecords.length} active (${Object.entries(counts)
    .map(([label, count]) => `${label}: ${count}`)
    .join(", ")})`;
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

  const summaryEl = document.getElementById("overview-summary");
  if (summaryEl) {
    summaryEl.classList.remove("empty-state");
    summaryEl.innerHTML = [
      ["Risk", `${risk.status?.state || "risk_allowed"} (${joinList(risk.status?.reasons || [])})`],
      [
        "Controls",
        `processing=${controls.processingEnabled !== false}, session=${controls.sessionEligible !== false}`
      ],
      ["Active Setups", getActiveSetupSummary(reactionRecords)],
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

function renderNotificationControls(settings) {
  currentNotificationSettings = normalizeNotificationSettings(settings);

  const fields = {
    "notify-browser": currentNotificationSettings.browserEnabled,
    "notify-sound": currentNotificationSettings.soundEnabled,
    "notify-visual-critical": currentNotificationSettings.visualCriticalEnabled,
    "notify-telegram": currentNotificationSettings.telegramEnabled,
    "notify-actionable-emergency":
      currentNotificationSettings.actionableEmergencyMode
  };

  for (const [id, value] of Object.entries(fields)) {
    const input = document.getElementById(id);
    if (input) input.checked = value;
  }

  const priorityEl = document.getElementById("notify-minimum-priority");
  if (priorityEl) {
    priorityEl.value = currentNotificationSettings.minimumPriority;
  }

  const telegramTokenEl = document.getElementById("notify-telegram-token");
  const telegramChatIdEl = document.getElementById("notify-telegram-chat-id");

  if (telegramTokenEl) {
    telegramTokenEl.value = currentNotificationSettings.telegramBotTokenMasked || "";
    telegramTokenEl.disabled = currentNotificationSettings.telegramEnabled;
  }

  if (telegramChatIdEl) {
    telegramChatIdEl.value = currentNotificationSettings.telegramChatIdMasked || "";
    telegramChatIdEl.disabled = currentNotificationSettings.telegramEnabled;
  }
}

async function patchNotificationSettings(patch) {
  const statusEl = document.getElementById("notification-settings-status");
  if (statusEl) statusEl.textContent = "Saving...";

  try {
    const res = await fetch("/notifications/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(patch)
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Notification settings failed");
    }

    currentNotificationSettings = normalizeNotificationSettings(
      data.notificationSettings
    );
    renderNotificationControls(currentNotificationSettings);
    if (statusEl) statusEl.textContent = "Saved.";
  } catch (err) {
    console.error("Failed to update notification settings:", err);
    renderNotificationControls(currentNotificationSettings);
    if (statusEl) statusEl.textContent = `Failed: ${err.message}`;
  }
}

function setupNotificationControls() {
  const checkboxMap = {
    "notify-browser": "browserEnabled",
    "notify-sound": "soundEnabled",
    "notify-visual-critical": "visualCriticalEnabled",
    "notify-telegram": "telegramEnabled",
    "notify-actionable-emergency": "actionableEmergencyMode"
  };

  for (const [id, settingKey] of Object.entries(checkboxMap)) {
    const input = document.getElementById(id);
    if (!input) continue;

    input.addEventListener("change", () => {
      if (
        id === "notify-browser" &&
        input.checked &&
        "Notification" in window
      ) {
        Notification.requestPermission?.();
      }

      const patch = {
        [settingKey]: input.checked
      };

      if (id === "notify-telegram" && input.checked) {
        const tokenEl = document.getElementById("notify-telegram-token");
        const chatIdEl = document.getElementById("notify-telegram-chat-id");
        const tokenValue = tokenEl?.value?.trim() || "";
        const chatIdValue = chatIdEl?.value?.trim() || "";

        if (tokenValue && !tokenValue.includes("...")) {
          patch.telegramBotToken = tokenValue;
        }

        if (chatIdValue && !chatIdValue.includes("...")) {
          patch.telegramChatId = chatIdValue;
        }
      }

      patchNotificationSettings(patch);
    });
  }

  const priorityEl = document.getElementById("notify-minimum-priority");
  if (priorityEl) {
    priorityEl.addEventListener("change", () => {
      patchNotificationSettings({
        minimumPriority: priorityEl.value
      });
    });
  }

  const testButton = document.getElementById("notify-test-btn");
  if (testButton) {
    testButton.addEventListener("click", sendTestNotification);
  }
}

async function sendTestNotification() {
  const statusEl = document.getElementById("notification-settings-status");
  const buttonEl = document.getElementById("notify-test-btn");

  if (statusEl) statusEl.textContent = "Sending test...";
  if (buttonEl) buttonEl.disabled = true;

  try {
    const res = await fetch("/notifications/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Test notification failed");
    }

    if (statusEl) statusEl.textContent = "Test notification created.";
  } catch (err) {
    console.error("Failed to send test notification:", err);
    if (statusEl) statusEl.textContent = `Failed: ${err.message}`;
  } finally {
    if (buttonEl) buttonEl.disabled = false;
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
  const settings = normalizeNotificationSettings(data.notificationSettings);
  let criticalActionableKey = null;

  if (!dashboardAlertEl) return;

  currentNotificationSettings = settings;

  if (!dashboardAlertEl.textContent.trim()) {
    dashboardAlertEl.textContent = "No new alerts yet.";
  }

  for (const [key, reaction] of Object.entries(reactions)) {
    const previousDecision = previousReactions[key] || null;
    const currentDecision = reaction.decision;
    const priority = getDecisionPriority(currentDecision);

    if (
      settings.visualCriticalEnabled &&
      settings.actionableEmergencyMode &&
      (currentDecision === "actionable" ||
        currentDecision === "actionable_high_priority")
    ) {
      criticalActionableKey = key;
    }

    if (previousDecision === currentDecision) continue;
    if (!isPriorityAllowed(priority, settings)) continue;

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
      playCriticalSound();
    }

    if (currentDecision === "actionable_high_priority") {
      dashboardAlertEl.textContent = `${key} is now high-priority actionable.`;
      showBrowserNotification(
        "High-Priority Setup",
        `${key} is now high-priority actionable.`
      );
      playCriticalSound();
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

  document.body.classList.toggle("critical-alert-mode", Boolean(criticalActionableKey));
  if (criticalActionableKey) {
    dashboardAlertEl.textContent = `ACTIONABLE SETUP: ${criticalActionableKey}`;
  }
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

  const pin = window.prompt("Enter archive reset PIN to continue:");

  if (pin === null) {
    statusEl.textContent = "Archive reset cancelled.";
    return;
  }

  if (pin !== "1234") {
    statusEl.textContent = "Archive reset blocked: invalid PIN.";
    return;
  }

  statusEl.textContent = "Archiving and resetting active state...";
  buttonEl.disabled = true;

  try {
    const res = await fetch("/archive-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pin
      })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Archive reset failed");
    }

    const preservedCount = data.preservedSetupKeys?.length || 0;
    statusEl.textContent =
      preservedCount > 0
        ? `Archived successfully. Active state reset. Preserved ${preservedCount} live setup${preservedCount === 1 ? "" : "s"}.`
        : "Archived successfully. Active state reset.";
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

    renderNotificationControls(data.notificationSettings);
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
setupNotificationControls();
loadAll();
setInterval(loadAll, 2000);
