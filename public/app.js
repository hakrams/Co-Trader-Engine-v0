const VIEW_MODE_KEY = "coTraderV2ViewMode";
const TEACHING_NOTES_KEY = "coTraderV2TeachingNotes";
const TFC_VIEW_KEY = "coTraderV2TfcView";
const TFC_COLLAPSE_KEY = "coTraderV2TfcCollapsed";

let appState = {
  engine: null,
  raw: { count: 0, latest: null, items: [] },
  clues: [],
  teachingNotes: JSON.parse(localStorage.getItem(TEACHING_NOTES_KEY) || "[]")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function humanize(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function formatTimestamp(value) {
  if (!value) return "none";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setupPageNavigation() {
  const buttons = document.querySelectorAll(".nav-btn");
  const pages = document.querySelectorAll(".page");
  const titleEl = document.getElementById("page-title");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const pageName = button.dataset.page;

      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      pages.forEach((page) => {
        page.classList.toggle("is-active", page.dataset.page === pageName);
      });

      if (titleEl) titleEl.textContent = button.textContent.trim();
    });
  });
}

function applyViewMode(mode) {
  const nextMode = ["mobile", "tablet", "pc"].includes(mode) ? mode : "pc";
  document.body.classList.remove("view-mobile", "view-tablet", "view-pc");
  document.body.classList.add(`view-${nextMode}`);
  localStorage.setItem(VIEW_MODE_KEY, nextMode);

  const labels = {
    mobile: "Mobile View",
    tablet: "Tablet View",
    pc: "PC View"
  };

  setText("active-view-label", labels[nextMode]);
}

function setupViewModeControls() {
  const toggle = document.getElementById("view-mode-toggle");
  const menu = document.getElementById("view-mode-menu");

  if (toggle && menu) {
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.classList.toggle("is-open");
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", () => {
      menu.classList.remove("is-open");
    });
  }

  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      applyViewMode(button.dataset.viewMode);
      if (menu) menu.classList.remove("is-open");
    });
  });

  applyViewMode(localStorage.getItem(VIEW_MODE_KEY) || "pc");
}

function updateClock() {
  setText("system-clock", formatTimestamp(new Date().toISOString()));
}

function buildStories() {
  return Array.isArray(appState.engine?.liveFamilies)
    ? appState.engine.liveFamilies
    : [];
}

function buildDashboardStories() {
  const families = (Array.isArray(appState.engine?.familyMap) ? appState.engine.familyMap : [])
    .filter((family) => !family.loose);

  return families.map((family) => {
    const parent = family.parent;

    return {
      id: `family:${family.id}`,
      source: "family",
      key: `family:${family.id}`,
      symbol: parent.symbol,
      timeframe: parent.timeframe,
      direction: family.direction || parent.direction,
      chapterCode: family.familyChapter,
      chapterName: `${family.familyChapterName} (${family.memberCount} child${family.memberCount === 1 ? "" : "ren"})`,
      role: "parent",
      state: family.state || parent.state,
      latestClue: family.latestClue || parent.latestClue || "family update",
      anchorTime: parent.anchorTime,
      ohlc: parent.ohlc || null,
      note: `${family.memberCount} child${family.memberCount === 1 ? "" : "ren"} attached under this family head.`,
      updatedAt: family.updatedAt || parent.updatedAt,
      attention: getChapterRank(family.familyChapter)
    };
  });
}

function sortStories(stories) {
  const sortValue = document.getElementById("story-sort")?.value || "attention";
  const sorted = [...stories];

  if (sortValue === "latest") {
    return sorted.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  if (sortValue === "chapter") {
    return sorted.sort((a, b) => a.chapterCode.localeCompare(b.chapterCode));
  }

  if (sortValue === "symbol") {
    return sorted.sort((a, b) => `${a.symbol}${a.timeframe}`.localeCompare(`${b.symbol}${b.timeframe}`));
  }

  return sorted.sort((a, b) => b.attention - a.attention || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function roleClass(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replaceAll("/", "-")
    .replaceAll(" ", "-")
    .replaceAll("_", "-");
}

function isOpenClue(story) {
  return String(story.chapterCode || "?").includes("?");
}

function renderStoryCard(story) {
  const ohlc = story.ohlc || {};
  const hasOhlc = ["open", "high", "low", "close"].some((key) => ohlc[key] !== null && ohlc[key] !== undefined);
  const hasVolume = story.volume !== null && story.volume !== undefined;

  return `
    <article class="story-card panel role-${escapeHtml(roleClass(story.role))}">
      <div class="story-card-head">
        <div>
          <p class="chapter-code">Chapter ${escapeHtml(story.chapterCode)}</p>
          <h3>${escapeHtml(story.symbol)} ${escapeHtml(story.timeframe)}</h3>
        </div>
        <span class="role-pill">${escapeHtml(humanize(story.role))}</span>
      </div>
      <p class="story-name">${escapeHtml(story.chapterName)}</p>
      <div class="story-details">
        <div><span>State</span><strong>${escapeHtml(story.state)}</strong></div>
        <div><span>Latest clue</span><strong>${escapeHtml(humanize(story.latestClue))}</strong></div>
        <div><span>Direction</span><strong>${escapeHtml(humanize(story.direction))}</strong></div>
        <div><span>Anchor time</span><strong>${escapeHtml(formatTimestamp(story.anchorTime))}</strong></div>
        <div><span>Updated</span><strong>${escapeHtml(formatTimestamp(story.updatedAt))}</strong></div>
      </div>
      ${hasOhlc ? `<p class="ohlc-line">O ${escapeHtml(ohlc.open)} / H ${escapeHtml(ohlc.high)} / L ${escapeHtml(ohlc.low)} / C ${escapeHtml(ohlc.close)}</p>` : ""}
      ${hasVolume ? `<p class="ohlc-line">Volume ${escapeHtml(story.volume)}</p>` : ""}
      <p class="story-note">${escapeHtml(story.note)}</p>
    </article>
  `;
}

function renderDashboard() {
  const allStories = buildStories();
  const stories = sortStories(buildDashboardStories());
  const grid = document.getElementById("story-grid");

  setText("metric-stories", stories.length);
  setText("metric-history-clues", appState.clues.length);
  setText("metric-raw-alerts", appState.raw.count || 0);
  setText("metric-open-clues", allStories.filter(isOpenClue).length);

  if (!grid) return;

  if (!stories.length) {
    grid.classList.add("empty-state");
    grid.textContent = "No live families yet.";
    return;
  }

  grid.classList.remove("empty-state");
  grid.innerHTML = stories.map(renderStoryCard).join("");
}

function renderOpenClues() {
  const grid = document.getElementById("open-clue-grid");
  if (!grid) return;

  const openClues = buildStories()
    .filter(isOpenClue)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  if (!openClues.length) {
    grid.classList.add("empty-state");
    grid.textContent = "No open clues right now.";
    return;
  }

  grid.classList.remove("empty-state");
  grid.innerHTML = openClues.map(renderStoryCard).join("");
}

function getCollapsedFamilies() {
  try {
    const raw = JSON.parse(localStorage.getItem(TFC_COLLAPSE_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch (error) {
    return new Set();
  }
}

function saveCollapsedFamilies(collapsed) {
  localStorage.setItem(TFC_COLLAPSE_KEY, JSON.stringify(Array.from(collapsed)));
}

function getTfcViewMode() {
  const value = localStorage.getItem(TFC_VIEW_KEY);
  return value === "tree" ? "tree" : "cards";
}

function roleLabel(role) {
  if (role === "close_child") return "close child";
  if (role === "extended_child") return "extended child";
  if (role === "orphan") return "unattached";
  return humanize(role);
}

function getChapterRank(code) {
  return { LB: 6, LC: 6, L: 5, "L?": 3, C: 4, B: 4, "?": 1 }[code] || 1;
}

function deriveFamilyChapter(parent, members) {
  const memberChapters = members.map((item) => item.chapterCode).filter((code) => code && !code.includes("?"));
  const candidates = [parent.chapterCode, ...memberChapters].filter(Boolean);
  return candidates.sort((a, b) => getChapterRank(b) - getChapterRank(a))[0] || "?";
}

function buildFamilies(stories) {
  const parents = stories.filter((story) => story.role === "parent");
  const children = stories.filter((story) => ["close_child", "extended_child", "child"].includes(story.role));
  const unattached = stories.filter((story) => story.role === "orphan" || story.role === "unknown");
  const families = parents.map((parent) => ({ id: parent.key, parent, members: [], loose: false }));
  const familyByParentId = new Map(families.map((family) => [family.id, family]));

  for (const child of children) {
    const family = familyByParentId.get(child.parentClueId);
    if (family) {
      family.members.push(child);
    } else {
      unattached.push(child);
    }
  }

  if (unattached.length) {
    families.push({
      id: "unattached",
      parent: { key: "unattached", symbol: "Unattached", timeframe: "", chapterCode: "?", chapterName: "Waiting for family", state: "open clues", role: "orphan" },
      members: unattached,
      loose: true
    });
  }

  return families.map((family) => ({
    ...family,
    familyChapter: family.loose ? "?" : deriveFamilyChapter(family.parent, family.members),
    closeCount: family.members.filter((member) => member.role === "close_child" || member.role === "child").length,
    extendedCount: family.members.filter((member) => member.role === "extended_child").length,
    openCount: family.members.filter((member) => member.chapterCode.includes("?")).length
  })).sort((a, b) => getChapterRank(b.familyChapter) - getChapterRank(a.familyChapter) || b.members.length - a.members.length);
}

function renderFamilyMember(member, options = {}) {
  const chapterCode = options.chapterCode || member.chapterCode || "?";

  return "<article class=\"family-member role-" + escapeHtml(roleClass(member.role)) + "\">" +
    "<div><strong>" + escapeHtml(member.symbol) + " " + escapeHtml(member.timeframe) + " · Chapter " + escapeHtml(chapterCode) + "</strong>" +
    "<p>" + escapeHtml(roleLabel(member.role)) + " · " + escapeHtml(member.state) + " · " + escapeHtml(humanize(member.direction)) + "</p></div>" +
    "<span class=\"role-pill\">" + escapeHtml(formatTimestamp(member.anchorTime)) + "</span></article>";
}

function renderFamilyCard(family, isCollapsed) {
  const parent = family.parent;
  const familySizeClass = family.members.length >= 4 ? "family-large" : family.members.length >= 2 ? "family-medium" : "family-small";
  const membersHtml = family.members.length ? family.members.map(renderFamilyMember).join("") : "<p class=\"empty-state\">No children in this family yet.</p>";
  const parentHtml = family.loose ? "" : renderFamilyMember(parent, { chapterCode: family.familyChapter });
  const openAttr = isCollapsed ? "" : " open";
  const childLabel = family.memberCount === 1 ? "child" : "children";

  return "<article class=\"family-card " + familySizeClass + (family.loose ? " family-loose" : "") + "\"><details data-family-id=\"" + escapeHtml(family.id) + "\"" + openAttr + "><summary>" +
    "<div><p class=\"chapter-code\">Family Chapter " + escapeHtml(family.familyChapter) + "</p>" +
    "<h3>" + escapeHtml(parent.symbol) + " " + escapeHtml(parent.timeframe) + " " + (family.loose ? "Holding Area" : "Family") + "</h3>" +
    "<p>" + escapeHtml(family.state) + " · " + escapeHtml(family.familyChapterName) + "</p></div>" +
    "<div class=\"family-stats\" aria-label=\"Family counts\"><span>" + escapeHtml(String(family.memberCount)) + " " + escapeHtml(childLabel) + "</span>" +
    "<span>" + escapeHtml(String(family.closeCount)) + " close</span><span>" + escapeHtml(String(family.extendedCount)) + " extended</span>" +
    "<span>" + escapeHtml(String(family.openCount)) + " open</span></div></summary>" +
    "<div class=\"family-members\">" + parentHtml + membersHtml + "</div></details></article>";
}

function renderFamilyTree(family) {
  const parent = family.parent;
  const closeMembers = family.members.filter((member) => ["close_child", "child"].includes(member.role));
  const extendedMembers = family.members.filter((member) => member.role === "extended_child");
  const otherMembers = family.members.filter((member) => !["close_child", "child", "extended_child"].includes(member.role));

  const branches = family.loose
    ? [{ key: "open", label: "Open Clues", role: "orphan", members: family.members }]
    : [
        { key: "close", label: "Close Children", role: "close_child", members: closeMembers },
        { key: "extended", label: "Extended Children", role: "extended_child", members: extendedMembers },
        { key: "other", label: "Other Clues", role: "orphan", members: otherMembers }
      ].filter((branch) => branch.members.length > 0);

  const branchesHtml = branches.length
    ? branches.map((branch) => {
      const leaves = branch.members.map((member) => {
        return "<div class=\"tree-node tree-leaf role-" + escapeHtml(roleClass(member.role)) + "\"><span class=\"node-chapter\">" + escapeHtml(member.chapterCode) + "</span>" +
          "<div><strong>" + escapeHtml(member.symbol) + " " + escapeHtml(member.timeframe) + "</strong>" +
          "<p>" + escapeHtml(roleLabel(member.role)) + " · " + escapeHtml(member.state) + " · " + escapeHtml(humanize(member.direction)) + "</p></div></div>";
      }).join("");

      return "<section class=\"tree-branch\">" +
        "<div class=\"tree-node tree-branch-head role-" + escapeHtml(roleClass(branch.role)) + "\"><span class=\"node-chapter\">" + escapeHtml(branch.members.length) + "</span>" +
        "<div><strong>" + escapeHtml(branch.label) + "</strong><p>" + escapeHtml(branch.members.length) + " clue" + (branch.members.length === 1 ? "" : "s") + "</p></div></div>" +
        "<div class=\"tree-leaves\">" + leaves + "</div></section>";
    }).join("")
    : "<p class=\"empty-state\">No child clues yet.</p>";

  return "<article class=\"tree-family top-fork" + (family.loose ? " family-loose" : "") + "\">" +
    "<div class=\"tree-root-wrap\"><div class=\"tree-node tree-root\"><span class=\"node-chapter\">" + escapeHtml(family.familyChapter) + "</span>" +
    "<div><strong>" + escapeHtml(parent.symbol) + " " + escapeHtml(parent.timeframe) + " " + (family.loose ? "Holding Area" : "Parent") + "</strong>" +
    "<p>" + escapeHtml(family.state) + " · " + escapeHtml(family.familyChapterName) + "</p></div></div></div>" +
    "<div class=\"tree-branches\">" + branchesHtml + "</div></article>";
}

function renderTfc() {
  const fallbackStories = buildStories();
  const families = Array.isArray(appState.engine?.familyMap)
    ? appState.engine.familyMap.filter((family) => family.loose || family.parent)
    : buildFamilies(fallbackStories);
  const familyMap = document.getElementById("family-map");
  const viewMode = getTfcViewMode();
  const collapsed = getCollapsedFamilies();

  document.querySelectorAll("[data-tfc-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tfcView === viewMode);
  });

  if (!familyMap) return;

  if (!families.length) {
    familyMap.classList.add("empty-state");
    familyMap.textContent = "No family map yet.";
    return;
  }

  familyMap.classList.remove("empty-state", "family-map-tree", "family-map-cards");
  familyMap.classList.add(viewMode === "tree" ? "family-map-tree" : "family-map-cards");
  familyMap.innerHTML = families.map((family) => viewMode === "tree" ? renderFamilyTree(family) : renderFamilyCard(family, collapsed.has(family.id))).join("");

  if (viewMode === "cards") {
    familyMap.querySelectorAll("details[data-family-id]").forEach((details) => {
      details.addEventListener("toggle", () => {
        const familyId = details.dataset.familyId;
        const next = getCollapsedFamilies();

        if (details.open) {
          next.delete(familyId);
        } else {
          next.add(familyId);
        }

        saveCollapsedFamilies(next);
      });
    });
  }
}

function setupTfcViewControls() {
  document.querySelectorAll("[data-tfc-view]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem(TFC_VIEW_KEY, button.dataset.tfcView === "tree" ? "tree" : "cards");
      renderTfc();
    });
  });
}

function renderHistoryClues() {
  const list = document.getElementById("history-clue-list");
  if (!list) return;

  if (!appState.clues.length) {
    list.classList.add("empty-state");
    list.textContent = "No history clues saved yet.";
    return;
  }

  list.classList.remove("empty-state");
  list.innerHTML = appState.clues.map((clue) => `
    <article class="note-card">
      <div class="note-card-head">
        <h3>${escapeHtml(clue.symbol)} ${escapeHtml(clue.timeframe)}</h3>
        <span class="role-pill">${escapeHtml(humanize(clue.role))}</span>
      </div>
      <p>${escapeHtml(humanize(clue.clueType))} · Chapter ${escapeHtml(clue.chapterHint && clue.chapterHint !== "unknown" ? clue.chapterHint : "?")}</p>
      ${clue.chapterDetectionReason ? `<p class="muted">Chapter: ${escapeHtml(clue.chapterDetectionReason)}</p>` : ""}
      <p class="muted">OB time: ${escapeHtml(formatTimestamp(clue.obTime))}</p>
      <p class="ohlc-line">O ${escapeHtml(clue.ohlc?.open ?? "-")} / H ${escapeHtml(clue.ohlc?.high ?? "-")} / L ${escapeHtml(clue.ohlc?.low ?? "-")} / C ${escapeHtml(clue.ohlc?.close ?? "-")}</p>
      ${clue.roleDetectionReason ? `<p class="muted">Detected: ${escapeHtml(clue.roleDetectionReason)}</p>` : ""}
      ${clue.note ? `<p class="story-note">${escapeHtml(clue.note)}</p>` : ""}
    </article>
  `).join("");
}

function renderTeachingNotes() {
  const list = document.getElementById("teaching-note-list");
  if (!list) return;

  if (!appState.teachingNotes.length) {
    list.classList.add("empty-state");
    list.textContent = "No teaching notes saved in this browser yet.";
    return;
  }

  list.classList.remove("empty-state");
  list.innerHTML = appState.teachingNotes.map((note) => `
    <article class="note-card">
      <div class="note-card-head">
        <h3>${escapeHtml(note.target || "Unattached teaching")}</h3>
        <span class="role-pill">${escapeHtml(formatTimestamp(note.createdAt))}</span>
      </div>
      <p>${escapeHtml(note.explanation)}</p>
    </article>
  `).join("");
}

function renderRawAlerts() {
  setText("raw-latest", appState.raw.latest ? safeJson(appState.raw.latest.payload) : "Waiting for webhook...");
  const list = document.getElementById("raw-history");
  const items = appState.raw.items || [];

  if (!list) return;

  if (!items.length) {
    list.classList.add("empty-state");
    list.textContent = "No raw alerts yet.";
    return;
  }

  list.classList.remove("empty-state");
  list.innerHTML = items.slice(0, 40).map((item, index) => `
    <article class="raw-card">
      <div class="note-card-head">
        <h3>#${index + 1} ${escapeHtml(item.payload?.event || "raw alert")}</h3>
        <span class="role-pill">${escapeHtml(formatTimestamp(item.receivedAt))}</span>
      </div>
      <p class="muted">${escapeHtml(item.payload?.symbol || "unknown")} ${escapeHtml(item.payload?.timeframe || "unknown")}</p>
      <pre class="json-box small-json">${escapeHtml(safeJson(item.payload))}</pre>
    </article>
  `).join("");
}

function renderAlertBanner() {
  const latestEvent = appState.engine?.latestEvent?.normalized?.event_raw;

  if (latestEvent) {
    setText("story-alert", `Latest clue: ${latestEvent}`);
  } else {
    setText("story-alert", "Waiting for market clues.");
  }
}

function renderAll() {
  renderAlertBanner();
  renderDashboard();
  renderOpenClues();
  renderTfc();
  renderHistoryClues();
  renderTeachingNotes();
  renderRawAlerts();
}

async function loadState() {
  const res = await fetch("/state");
  appState.engine = await res.json();
}

async function loadRawEvents() {
  const res = await fetch("/api/raw-events");
  appState.raw = await res.json();
}

async function loadHistoryClues() {
  const res = await fetch("/api/history-clues");
  const data = await res.json();
  appState.clues = data.items || [];
}

async function loadAll() {
  try {
    await Promise.all([loadState(), loadRawEvents(), loadHistoryClues()]);
    setText("connection-status", "Backend connected. Market story state refreshed.");
    renderAll();
  } catch (error) {
    console.error("Failed to load V2 state:", error);
    setText("connection-status", `Backend fetch failed: ${error.message}`);
  }
}

function setupHistoryForm() {
  const form = document.getElementById("history-clue-form");
  const status = document.getElementById("history-form-status");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (status) status.textContent = "Saving clue...";

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/history-clues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to save clue");
      }

      form.reset();
      if (status) status.textContent = "History clue saved.";
      await loadAll();
    } catch (error) {
      console.error("Failed to save history clue:", error);
      if (status) status.textContent = `Failed: ${error.message}`;
    }
  });
}

function setupArchiveResetControl() {
  const button = document.getElementById("archive-reset-btn");
  const status = document.getElementById("archive-reset-status");
  if (!button) return;

  button.addEventListener("click", async () => {
    const pin = window.prompt("Enter archive reset PIN to continue:");

    if (pin === null) {
      if (status) status.textContent = "Cancelled.";
      return;
    }

    if (status) status.textContent = "Archiving and resetting active state...";
    button.disabled = true;

    try {
      const res = await fetch("/archive-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Archive reset failed");
      }

      if (status) {
        const preservedCount = Array.isArray(data.preservedSetupKeys) ? data.preservedSetupKeys.length : 0;
        status.textContent = "Archived and reset. " + preservedCount + " protected setup(s) preserved.";
      }

      await loadAll();
    } catch (error) {
      console.error("Archive reset failed:", error);
      if (status) status.textContent = "Failed: " + error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function setupTeachingForm() {
  const form = document.getElementById("teaching-form");
  const status = document.getElementById("teaching-status");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const note = {
      id: `teaching_${Date.now()}`,
      createdAt: new Date().toISOString(),
      target: String(formData.get("target") || "").trim(),
      explanation: String(formData.get("explanation") || "").trim()
    };

    if (!note.explanation) {
      if (status) status.textContent = "Write an explanation first.";
      return;
    }

    appState.teachingNotes.unshift(note);
    localStorage.setItem(TEACHING_NOTES_KEY, JSON.stringify(appState.teachingNotes));
    form.reset();
    if (status) status.textContent = "Teaching note saved locally.";
    renderTeachingNotes();
  });
}

const storySort = document.getElementById("story-sort");
if (storySort) storySort.addEventListener("change", renderDashboard);

setupPageNavigation();
setupViewModeControls();
setupTfcViewControls();
setupHistoryForm();
setupArchiveResetControl();
setupTeachingForm();
updateClock();
loadAll();
setInterval(updateClock, 1000);
setInterval(loadAll, 3000);
