if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

function showBrowserNotification(title, body) {
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  new Notification(title, { body });
}

let previousReactions = JSON.parse(
  localStorage.getItem("previousReactions") || "{}"
);

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

    if (data.latestEvent) {
      latestEventEl.textContent =
        "Latest Event: " +
        data.latestEvent.event +
        " (" +
        data.latestEvent.symbol +
        " " +
        data.latestEvent.timeframe +
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
        console.log(
          `[REACTION CHANGE] ${key}: ${previousDecision} -> ${currentDecision}`
        );

        if (currentDecision === "monitoring") {
          dashboardAlertEl.textContent = `${key} is now being monitored.`;

          showBrowserNotification(
            "Monitoring",
            `${key} is now being monitored.`
          );
        }

        if (currentDecision === "actionable") {
          dashboardAlertEl.textContent = `${key} is now actionable.`;

          showBrowserNotification(
            "Actionable Setup",
            `${key} is now actionable.`
          );
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
          key +
          " → " +
          item.setupState +
          " → " +
          item.decision +
          "<br>";
      }
    }

    const history = data.history || [];

    if (history.length === 0) {
      historyEl.textContent = "No event history yet.";
    } else {
      historyEl.innerHTML = "<strong>History:</strong><br>";

      history.forEach((item, index) => {
        historyEl.innerHTML +=
          index +
          1 +
          ". " +
          item.event +
          " (" +
          item.symbol +
          " " +
          item.timeframe +
          ")<br>";
      });
    }
  } catch (err) {
    console.error("Failed to fetch state:", err);

    const statusEl = document.getElementById("status");
    statusEl.textContent = "Failed to fetch backend state.";
  }
}

loadState();
setInterval(loadState, 2000);