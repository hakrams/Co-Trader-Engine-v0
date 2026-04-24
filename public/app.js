const VIEW_MODE_KEY = "coTraderV2ViewMode";
const TEACHING_NOTES_KEY = "coTraderV2TeachingNotes";
const TFC_VIEW_KEY = "coTraderV2TfcView";
const TFC_COLLAPSE_KEY = "coTraderV2TfcCollapsed";
const TREE_NODE_LAYOUT_KEY = "coTraderV2TreeNodeLayout";
const TREE_LAYOUT_API = "/api/tree-layout";

let appState = {
  engine: null,
  raw: { count: 0, latest: null, items: [] },
  clues: [],
  teachingNotes: JSON.parse(localStorage.getItem(TEACHING_NOTES_KEY) || "[]")
};

const treeViewportState = {
  x: 48,
  y: 32,
  scale: 1,
  autoFitted: false,
  nodeOffsets: JSON.parse(localStorage.getItem(TREE_NODE_LAYOUT_KEY) || "{}"),
  layoutUpdatedAt: null,
  layoutDirty: false,
  saving: false,
  nodesLocked: true,
  nodeDragId: null,
  nodeDragKind: null,
  nodeDragPointerId: null,
  nodeDragStartX: 0,
  nodeDragStartY: 0,
  nodeDragInitialOffsetX: 0,
  nodeDragInitialOffsetY: 0,
  nodeDragTargets: [],
  pointers: new Map(),
  pinchDistance: null,
  pinchScale: 1,
  pinchMidX: 0,
  pinchMidY: 0,
  dragPointerId: null,
  dragStartX: 0,
  dragStartY: 0,
  startX: 0,
  startY: 0
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

function readinessStage(state) {
  const normalized = String(state || "").trim().toLowerCase();

  if (normalized.includes("tapped")) {
    return "actionable";
  }

  if (normalized.includes("bos") || normalized.includes("choch")) {
    return "attention";
  }

  if (normalized.includes("created")) {
    return "monitoring";
  }

  return "monitoring";
}

function tokenClass(prefix, value) {
  const normalized = String(value || "unknown")
    .trim()
    .toLowerCase()
    .replaceAll("?", "q")
    .replaceAll("+", "-plus-")
    .replaceAll("/", "-")
    .replaceAll(" ", "-")
    .replaceAll("_", "-");

  return `${prefix}-${normalized || "unknown"}`;
}

function isOpenClue(story) {
  return String(story.chapterCode || "?").includes("?");
}

function renderStoryCard(story) {
  const ohlc = story.ohlc || {};
  const hasOhlc = ["open", "high", "low", "close"].some((key) => ohlc[key] !== null && ohlc[key] !== undefined);
  const hasVolume = story.volume !== null && story.volume !== undefined;
  const readiness = readinessStage(story.state);

  return `
    <article class="story-card panel role-${escapeHtml(roleClass(story.role))} ${escapeHtml(tokenClass("chapter", story.chapterCode))} ${escapeHtml(tokenClass("state", story.state))} ${escapeHtml(tokenClass("readiness", readiness))}">
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
  if (role === "conflict_child") return "conflict child";
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
  const children = stories.filter((story) => ["close_child", "extended_child", "conflict_child", "child"].includes(story.role));
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
    conflictCount: family.members.filter((member) => member.role === "conflict_child").length,
    openCount: family.members.filter((member) => member.chapterCode.includes("?")).length
  })).sort((a, b) => getChapterRank(b.familyChapter) - getChapterRank(a.familyChapter) || b.members.length - a.members.length);
}

function renderFamilyMember(member, options = {}) {
  const chapterCode = options.chapterCode || member.chapterCode || "?";
  const readiness = readinessStage(member.state);

  return "<article class=\"family-member role-" + escapeHtml(roleClass(member.role)) + " " + escapeHtml(tokenClass("chapter", chapterCode)) + " " + escapeHtml(tokenClass("state", member.state)) + " " + escapeHtml(tokenClass("readiness", readiness)) + "\">" +
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
  const readiness = readinessStage(family.state);

  return "<article class=\"family-card " + familySizeClass + " " + escapeHtml(tokenClass("chapter", family.familyChapter)) + " " + escapeHtml(tokenClass("state", family.state)) + " " + escapeHtml(tokenClass("readiness", readiness)) + (family.loose ? " family-loose" : "") + "\"><details data-family-id=\"" + escapeHtml(family.id) + "\"" + openAttr + "><summary>" +
    "<div><p class=\"chapter-code\">Family Chapter " + escapeHtml(family.familyChapter) + "</p>" +
    "<h3>" + escapeHtml(parent.symbol) + " " + escapeHtml(parent.timeframe) + " " + (family.loose ? "Holding Area" : "Family") + "</h3>" +
    "<p>" + escapeHtml(family.state) + " · " + escapeHtml(family.familyChapterName) + "</p></div>" +
    "<div class=\"family-stats\" aria-label=\"Family counts\"><span>" + escapeHtml(String(family.memberCount)) + " " + escapeHtml(childLabel) + "</span>" +
    "<span>" + escapeHtml(String(family.closeCount)) + " close</span><span>" + escapeHtml(String(family.extendedCount)) + " extended</span>" +
    "<span>" + escapeHtml(String(family.conflictCount || 0)) + " conflict</span>" +
    "<span>" + escapeHtml(String(family.openCount)) + " open</span></div></summary>" +
    "<div class=\"family-members\">" + parentHtml + membersHtml + "</div></details></article>";
}

function renderFamilyTree(family) {
  const parent = family.parent;
  const closeMembers = family.members.filter((member) => ["close_child", "child"].includes(member.role));
  const extendedMembers = family.members.filter((member) => member.role === "extended_child");
  const conflictMembers = family.members.filter((member) => member.role === "conflict_child");
  const otherMembers = family.members.filter((member) => !["close_child", "child", "extended_child", "conflict_child"].includes(member.role));

  const branches = family.loose
    ? [{ key: "open", label: "Open Clues", role: "orphan", members: family.members }]
    : [
        { key: "close", label: "Close Children", role: "close_child", members: closeMembers },
        { key: "extended", label: "Extended Children", role: "extended_child", members: extendedMembers },
        { key: "conflict", label: "Conflict Children", role: "conflict_child", members: conflictMembers },
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

function renderTreeGraphNode(node) {
  return "<article id=\"" + escapeHtml(node.id) + "\" data-node-id=\"" + escapeHtml(node.id) + "\" data-node-kind=\"" + escapeHtml(node.kind) + "\" class=\"tree-graph-node tree-node role-" + escapeHtml(roleClass(node.role)) + " tree-node-kind-" + escapeHtml(node.kind) + " " + escapeHtml(tokenClass("chapter", node.chapter)) + " " + escapeHtml(tokenClass("state", node.state)) + " " + escapeHtml(tokenClass("readiness", readinessStage(node.state))) + "\" style=\"left:" + escapeHtml(String(node.x)) + "px;top:" + escapeHtml(String(node.y)) + "px;width:" + escapeHtml(String(node.width)) + "px;\">" +
    "<span class=\"node-chapter\">" + escapeHtml(node.chapter) + "</span>" +
    "<div><strong>" + escapeHtml(node.title) + "</strong><p>" + escapeHtml(node.subtitle) + "</p>" +
    (node.createdAt || node.updatedAt
      ? "<p class=\"tree-node-meta\">Created " + escapeHtml(formatTimestamp(node.createdAt)) + " · Updated " + escapeHtml(formatTimestamp(node.updatedAt)) + "</p>"
      : "") +
    "</div></article>";
}

function getTapTrail(item) {
  const events = Array.isArray(item?.eventTrail) ? item.eventTrail : [];
  return events
    .filter((event) => event && event.event_type === "ob_tap")
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
}

function buildTapInteractionSpec(targetNode, targetItem, tapNodeId) {
  const tapTrail = getTapTrail(targetItem);
  if (!tapTrail.length) {
    return null;
  }

  const visibleTrail = tapTrail.slice(-5);
  const latestTap = visibleTrail[visibleTrail.length - 1] || tapTrail[tapTrail.length - 1];

  return {
    tapNode: {
      id: tapNodeId,
      kind: "tap",
      role: "tap_node",
      chapter: "T",
      title: `OB Tap x${tapTrail.length}`,
      subtitle: `latest tap · ${formatTimestamp(latestTap?.timestamp || latestTap?.updatedAt || latestTap?.alert_time || latestTap?.bar_time)}`,
      state: "order block tapped",
      x: targetNode.x + Math.max(0, (targetNode.width - 220) / 2),
      y: 232,
      width: 220,
      createdAt: visibleTrail[0]?.timestamp || null,
      updatedAt: latestTap?.timestamp || null
    },
    edges: visibleTrail.map((tapEvent, index) => {
      const distanceFromLatest = visibleTrail.length - 1 - index;
      return {
        from: tapNodeId,
        to: targetNode.id,
        role: "tap",
        edgeType: "tap",
        tapIndex: index,
        tapTotal: visibleTrail.length,
        opacity: Math.max(0.28, 1 - distanceFromLatest * 0.18),
        timestamp: tapEvent.timestamp || null
      };
    })
  };
}

function buildTreeGraph(families) {
  const graph = {
    nodes: [],
    edges: [],
    width: 1600,
    height: 860,
    bounds: {
      minX: Infinity,
      minY: Infinity,
      maxX: 0,
      maxY: 0
    }
  };
  const parentWidth = 430;
  const childWidth = 280;
  const granddadWidth = 260;
  const rowY = {
    granddad: 56,
    parent: 180,
    child: 418,
    orphan: 682
  };
  const familyGap = 180;
  const childGap = 34;
  let familyCursor = 240;
  let orphanCursor = 160;

  function pushNode(node) {
    const offset = treeViewportState.nodeOffsets[node.id];
    if (offset) {
      node.x += Number(offset.x) || 0;
      node.y += Number(offset.y) || 0;
    }

    graph.nodes.push(node);
    graph.bounds.minX = Math.min(graph.bounds.minX, node.x);
    graph.bounds.minY = Math.min(graph.bounds.minY, node.y);
    graph.bounds.maxX = Math.max(graph.bounds.maxX, node.x + node.width);
    graph.bounds.maxY = Math.max(graph.bounds.maxY, node.y + 86);
    return node;
  }

  pushNode({
    id: "granddad-placeholder",
    kind: "granddad",
    role: "granddad",
    chapter: "?",
    title: "Granddad Layer",
    subtitle: "future higher context placeholder",
    state: "placeholder",
    x: 720,
    y: rowY.granddad,
    width: granddadWidth,
    createdAt: null,
    updatedAt: null
  });

  families.filter((family) => !family.loose).forEach((family, familyIndex) => {
    const parent = family.parent;
    const members = family.members.slice().sort((a, b) => {
      const rank = {
        close_child: 0,
        child: 0,
        extended_child: 1,
        conflict_child: 2
      };
      return (rank[a.role] ?? 3) - (rank[b.role] ?? 3);
    });

    const memberCount = Math.max(1, members.length);
    const childSpan = memberCount * childWidth + Math.max(0, memberCount - 1) * childGap;
    const clusterWidth = Math.max(parentWidth + 120, childSpan + 80);
    const parentX = familyCursor;
    const clusterX = parentX + (parentWidth - childSpan) / 2;
    const parentId = "tree-parent:" + family.id;

    const parentNode = pushNode({
      id: parentId,
      kind: "parent",
      role: "parent",
      chapter: family.familyChapter,
      title: parent.symbol + " " + parent.timeframe + " Parent",
      subtitle: parent.state + " · " + family.familyChapterName,
      state: parent.state,
      x: parentX,
      y: rowY.parent,
      width: parentWidth,
      createdAt: parent.anchorTime || null,
      updatedAt: family.updatedAt || parent.updatedAt || null
    });

    const parentTapSpec = buildTapInteractionSpec(
      parentNode,
      parent,
      "tree-tap:parent:" + family.id
    );

    if (parentTapSpec) {
      pushNode(parentTapSpec.tapNode);
      graph.edges.push(...parentTapSpec.edges);
    }

    members.forEach((member, memberIndex) => {
      const roleLaneOffset = member.role === "extended_child"
        ? 40
        : member.role === "conflict_child"
          ? 84
          : 0;
      const roleXOffset = member.role === "extended_child"
        ? 8
        : member.role === "conflict_child"
          ? 20
          : 0;
      const childX = clusterX + memberIndex * (childWidth + childGap);
      const childId = "tree-member:" + (member.id || family.id + ":" + memberIndex);

      const childNode = pushNode({
        id: childId,
        kind: "child",
        role: member.role,
        chapter: member.chapterCode,
        title: member.symbol + " " + member.timeframe,
        subtitle: roleLabel(member.role) + " · " + member.state + " · " + humanize(member.direction),
        state: member.state,
        x: childX + roleXOffset,
        y: rowY.child + roleLaneOffset,
        width: childWidth,
        createdAt: member.anchorTime || member.timestamp || null,
        updatedAt: member.updatedAt || null
      });

      graph.edges.push({
        from: parentId,
        to: childId,
        role: member.role
      });

      const memberTapSpec = buildTapInteractionSpec(
        childNode,
        member,
        "tree-tap:member:" + (member.id || family.id + ":" + memberIndex)
      );

      if (memberTapSpec) {
        pushNode(memberTapSpec.tapNode);
        graph.edges.push(...memberTapSpec.edges);
      }
    });

    familyCursor += clusterWidth + familyGap;
  });

  const looseMembers = families
    .filter((family) => family.loose)
    .flatMap((family) => family.members || []);

  looseMembers.forEach((member, index) => {
    const orphanId = "tree-orphan:" + (member.id || index);
    const orphanNode = pushNode({
      id: orphanId,
      kind: "orphan",
      role: member.role || "orphan",
      chapter: member.chapterCode,
      title: member.symbol + " " + member.timeframe,
      subtitle: roleLabel(member.role || "orphan") + " · " + member.state + " · " + humanize(member.direction),
      state: member.state,
      x: orphanCursor,
      y: rowY.orphan + (index % 2) * 34,
      width: childWidth,
      createdAt: member.anchorTime || member.timestamp || null,
      updatedAt: member.updatedAt || null
    });

    const orphanTapSpec = buildTapInteractionSpec(
      orphanNode,
      member,
      "tree-tap:orphan:" + (member.id || index)
    );

    if (orphanTapSpec) {
      pushNode(orphanTapSpec.tapNode);
      graph.edges.push(...orphanTapSpec.edges);
    }
    orphanCursor += childWidth + childGap;
  });

  const bounds = graph.bounds;
  if (Number.isFinite(bounds.minX)) {
    graph.width = Math.max(graph.width, bounds.maxX + 220);
    graph.height = Math.max(looseMembers.length ? 1020 : 780, bounds.maxY + 180);
  }
  return graph;
}

function renderTreeWorkspace(families) {
  const graph = buildTreeGraph(families);
  const nodesHtml = graph.nodes.map(renderTreeGraphNode).join("");
  const edgesHtml = graph.edges.map((edge) => {
    if (edge.edgeType === "tap") {
      return "<path class=\"tree-edge tree-edge-tap\" data-edge-type=\"tap\" data-from=\"" + escapeHtml(edge.from) + "\" data-to=\"" + escapeHtml(edge.to) + "\" data-tap-index=\"" + escapeHtml(String(edge.tapIndex || 0)) + "\" data-tap-total=\"" + escapeHtml(String(edge.tapTotal || 1)) + "\" style=\"opacity:" + escapeHtml(String(edge.opacity ?? 1)) + ";\"></path>";
    }

    return "<line class=\"tree-edge role-" + escapeHtml(roleClass(edge.role)) + "\" data-from=\"" + escapeHtml(edge.from) + "\" data-to=\"" + escapeHtml(edge.to) + "\"></line>";
  }).join("");

  return "<div class=\"tree-map-shell\">" +
    "<div class=\"tree-map-controls\" aria-label=\"Tree navigation\">" +
      "<button type=\"button\" data-tree-zoom=\"lock\" aria-label=\"Toggle move lock\">" + (treeViewportState.nodesLocked ? "Unlock" : "Lock") + "</button>" +
      "<button type=\"button\" data-tree-zoom=\"save\" aria-label=\"Save layout\">Save</button>" +
      "<button type=\"button\" data-tree-zoom=\"in\" aria-label=\"Zoom in\">+</button>" +
      "<button type=\"button\" data-tree-zoom=\"out\" aria-label=\"Zoom out\">-</button>" +
      "<button type=\"button\" data-tree-zoom=\"reset\" aria-label=\"Reset view\">Reset</button>" +
    "</div>" +
    "<div id=\"tree-map-viewport\" class=\"tree-map-viewport\">" +
      "<div id=\"tree-map-canvas\" class=\"tree-map-canvas\" style=\"width:" + escapeHtml(String(graph.width)) + "px;height:" + escapeHtml(String(graph.height)) + "px;\">" +
        "<svg id=\"tree-map-svg\" class=\"tree-map-svg\" width=\"" + escapeHtml(String(graph.width)) + "\" height=\"" + escapeHtml(String(graph.height)) + "\" viewBox=\"0 0 " + escapeHtml(String(graph.width)) + " " + escapeHtml(String(graph.height)) + "\" preserveAspectRatio=\"xMinYMin meet\">" + edgesHtml + "</svg>" +
        "<div class=\"tree-row-label row-granddad\">Granddad</div>" +
        "<div class=\"tree-row-label row-parent\">Parents</div>" +
        "<div class=\"tree-row-label row-child\">Children</div>" +
        "<div class=\"tree-row-label row-orphan\">Orphans</div>" +
        nodesHtml +
      "</div>" +
    "</div>" +
  "</div>";
}

function clampTreeScale(value) {
  return Math.min(2.2, Math.max(0.55, value));
}

function applyTreeViewportTransform() {
  const canvas = document.getElementById("tree-map-canvas");
  if (!canvas) return;
  canvas.style.transform = `translate(${treeViewportState.x}px, ${treeViewportState.y}px) scale(${treeViewportState.scale})`;
}

async function saveTreeNodeLayout() {
  const res = await fetch(TREE_LAYOUT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodeOffsets: treeViewportState.nodeOffsets
    })
  });
  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to save tree layout.");
  }

  treeViewportState.nodeOffsets = data.nodeOffsets || {};
  treeViewportState.layoutUpdatedAt = data.updatedAt || null;
  localStorage.setItem(TREE_NODE_LAYOUT_KEY, JSON.stringify(treeViewportState.nodeOffsets));
  treeViewportState.layoutDirty = false;
}

function fitTreeViewport(preserveScale = false) {
  const viewport = document.getElementById("tree-map-viewport");
  const canvas = document.getElementById("tree-map-canvas");
  if (!viewport || !canvas) return;

  const viewportWidth = viewport.clientWidth || 1;
  const viewportHeight = viewport.clientHeight || 1;
  const canvasWidth = canvas.offsetWidth || 1;
  const canvasHeight = canvas.offsetHeight || 1;
  const padding = 72;

  if (!preserveScale) {
    const scaleX = (viewportWidth - padding * 2) / canvasWidth;
    const scaleY = (viewportHeight - padding * 2) / canvasHeight;
    treeViewportState.scale = clampTreeScale(Math.min(scaleX, scaleY, 1));
  }

  treeViewportState.x = (viewportWidth - canvasWidth * treeViewportState.scale) / 2;
  treeViewportState.y = Math.max(28, (viewportHeight - canvasHeight * treeViewportState.scale) / 2);
  applyTreeViewportTransform();
}

function resetTreeViewport() {
  treeViewportState.scale = 1;
  fitTreeViewport(false);
}

function updateTreeEdges() {
  const svg = document.getElementById("tree-map-svg");
  if (!svg) return;

  svg.querySelectorAll("line[data-from][data-to]").forEach((line) => {
    const from = document.getElementById(line.dataset.from);
    const to = document.getElementById(line.dataset.to);
    if (!from || !to) return;

    const fromX = from.offsetLeft + from.offsetWidth / 2;
    const fromY = from.offsetTop + from.offsetHeight;
    const toX = to.offsetLeft + to.offsetWidth / 2;
    const toY = to.offsetTop;

    line.setAttribute("x1", String(fromX));
    line.setAttribute("y1", String(fromY));
    line.setAttribute("x2", String(toX));
    line.setAttribute("y2", String(toY));
  });

  svg.querySelectorAll('path[data-edge-type="tap"][data-from][data-to]').forEach((path) => {
    const from = document.getElementById(path.dataset.from);
    const to = document.getElementById(path.dataset.to);
    if (!from || !to) return;

    const fromX = from.offsetLeft + from.offsetWidth / 2;
    const fromY = from.offsetTop + from.offsetHeight;
    const toX = to.offsetLeft + to.offsetWidth / 2;
    const toY = to.offsetTop;
    const tapTotal = Number(path.dataset.tapTotal) || 1;
    const tapIndex = Number(path.dataset.tapIndex) || 0;
    const center = (tapTotal - 1) / 2;
    const fanOffset = (tapIndex - center) * 22;
    const control1X = fromX + fanOffset;
    const control1Y = fromY + 48;
    const control2X = toX + fanOffset;
    const control2Y = Math.max(fromY + 72, toY - 34);

    path.setAttribute(
      "d",
      `M ${fromX} ${fromY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${toX} ${toY}`
    );
  });
}

function treeNodeBand(kind) {
  if (kind === "granddad") {
    return { min: 24, max: 132 };
  }
  if (kind === "tap") {
    return { min: 148, max: 340 };
  }
  if (kind === "parent") {
    return { min: 148, max: 308 };
  }
  if (kind === "orphan") {
    return { min: 648, max: 900 };
  }
  return { min: 380, max: 620 };
}

function getTreeDragTargets(nodeId, nodeKind) {
  const targets = [];
  const seen = new Set();

  function addTarget(id, kind) {
    if (!id || seen.has(id)) return;
    const el = document.getElementById(id);
    if (!el) return;

    const current = treeViewportState.nodeOffsets[id] || { x: 0, y: 0 };
    targets.push({
      id,
      kind,
      element: el,
      initialOffsetX: Number(current.x) || 0,
      initialOffsetY: Number(current.y) || 0
    });
    seen.add(id);
  }

  addTarget(nodeId, nodeKind);

  if (nodeKind === "parent") {
    const descendantIds = new Set([nodeId]);

    document.querySelectorAll(`#tree-map-svg line[data-from="${CSS.escape(nodeId)}"]`).forEach((line) => {
      addTarget(line.dataset.to, "child");
      descendantIds.add(line.dataset.to);
    });

    document.querySelectorAll(`#tree-map-svg path[data-edge-type="tap"]`).forEach((path) => {
      if (descendantIds.has(path.dataset.to)) {
        addTarget(path.dataset.from, "tap");
      }
    });
  }

  return targets;
}

function setupTreeNodeDragging(viewport) {
  viewport.querySelectorAll("[data-node-id]").forEach((nodeEl) => {
    nodeEl.onpointerdown = (event) => {
      if (treeViewportState.nodesLocked) return;
      event.stopPropagation();
      nodeEl.setPointerCapture(event.pointerId);
      treeViewportState.nodeDragId = nodeEl.dataset.nodeId;
      treeViewportState.nodeDragKind = nodeEl.dataset.nodeKind;
      treeViewportState.nodeDragPointerId = event.pointerId;
      treeViewportState.nodeDragStartX = event.clientX;
      treeViewportState.nodeDragStartY = event.clientY;
      const current = treeViewportState.nodeOffsets[nodeEl.dataset.nodeId] || { x: 0, y: 0 };
      treeViewportState.nodeDragInitialOffsetX = Number(current.x) || 0;
      treeViewportState.nodeDragInitialOffsetY = Number(current.y) || 0;
      treeViewportState.nodeDragTargets = getTreeDragTargets(
        nodeEl.dataset.nodeId,
        nodeEl.dataset.nodeKind
      );
    };

    nodeEl.onpointermove = (event) => {
      if (treeViewportState.nodeDragId !== nodeEl.dataset.nodeId) return;
      if (treeViewportState.nodeDragPointerId !== event.pointerId) return;

      const canvas = document.getElementById("tree-map-canvas");
      if (!canvas) return;

      const dx = (event.clientX - treeViewportState.nodeDragStartX) / treeViewportState.scale;
      const dy = (event.clientY - treeViewportState.nodeDragStartY) / treeViewportState.scale;

      (treeViewportState.nodeDragTargets || []).forEach((target) => {
        const targetEl = target.element;
        if (!targetEl) return;

        const currentOffset = treeViewportState.nodeOffsets[target.id] || { x: 0, y: 0 };
        const baseLeft = parseFloat(targetEl.style.left) - (currentOffset.x || 0);
        const baseTop = parseFloat(targetEl.style.top) - (currentOffset.y || 0);
        const band = treeNodeBand(target.kind);
        const nextOffsetX = target.initialOffsetX + dx;
        const nextOffsetY = target.initialOffsetY + dy;
        const unclampedLeft = baseLeft + nextOffsetX;
        const unclampedTop = baseTop + nextOffsetY;
        const maxLeft = Math.max(16, canvas.offsetWidth - targetEl.offsetWidth - 16);
        const maxTop = Math.max(band.min, band.max - targetEl.offsetHeight);
        const nextLeft = Math.max(16, Math.min(maxLeft, unclampedLeft));
        const nextTop = Math.max(band.min, Math.min(maxTop, unclampedTop));

        treeViewportState.nodeOffsets[target.id] = {
          x: Math.round(nextLeft - baseLeft),
          y: Math.round(nextTop - baseTop)
        };
        targetEl.style.left = `${nextLeft}px`;
        targetEl.style.top = `${nextTop}px`;
      });

      treeViewportState.layoutDirty = true;
      updateTreeEdges();
    };

    const finishDrag = (event) => {
      if (treeViewportState.nodeDragId !== nodeEl.dataset.nodeId) return;
      if (event && treeViewportState.nodeDragPointerId !== event.pointerId) return;

      treeViewportState.nodeDragId = null;
      treeViewportState.nodeDragKind = null;
      treeViewportState.nodeDragPointerId = null;
      treeViewportState.nodeDragTargets = [];
    };

    nodeEl.onpointerup = finishDrag;
    nodeEl.onpointercancel = finishDrag;
    nodeEl.onlostpointercapture = finishDrag;
  });
}

function getPointerDistance(points) {
  const [a, b] = points;
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function beginTreeDrag(pointerId, clientX, clientY) {
  treeViewportState.dragPointerId = pointerId;
  treeViewportState.dragStartX = clientX;
  treeViewportState.dragStartY = clientY;
  treeViewportState.startX = treeViewportState.x;
  treeViewportState.startY = treeViewportState.y;
}

function refreshTreeDragAnchor() {
  const remaining = Array.from(treeViewportState.pointers.entries())[0];
  if (!remaining) {
    treeViewportState.dragPointerId = null;
    return;
  }

  const [pointerId, point] = remaining;
  beginTreeDrag(pointerId, point.x, point.y);
}

function setupTreeViewport() {
  const viewport = document.getElementById("tree-map-viewport");
  const canvas = document.getElementById("tree-map-canvas");
  const controls = document.querySelector(".tree-map-controls");
  if (!viewport || !canvas) return;

  if (!treeViewportState.autoFitted) {
    fitTreeViewport(false);
    treeViewportState.autoFitted = true;
  } else {
    applyTreeViewportTransform();
  }
  requestAnimationFrame(() => {
    updateTreeEdges();
    setupTreeNodeDragging(viewport);
  });

  viewport.onwheel = (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const focusX = event.clientX - rect.left;
    const focusY = event.clientY - rect.top;
    const worldX = (focusX - treeViewportState.x) / treeViewportState.scale;
    const worldY = (focusY - treeViewportState.y) / treeViewportState.scale;
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    const nextScale = clampTreeScale(treeViewportState.scale * factor);

    treeViewportState.x = focusX - worldX * nextScale;
    treeViewportState.y = focusY - worldY * nextScale;
    treeViewportState.scale = nextScale;
    applyTreeViewportTransform();
  };

  viewport.onpointerdown = (event) => {
    if (event.target.closest(".tree-map-controls")) return;
    if (treeViewportState.nodeDragId) return;
    viewport.setPointerCapture(event.pointerId);
    treeViewportState.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (treeViewportState.pointers.size === 1) {
      beginTreeDrag(event.pointerId, event.clientX, event.clientY);
    } else if (treeViewportState.pointers.size === 2) {
      const points = Array.from(treeViewportState.pointers.values());
      treeViewportState.pinchDistance = getPointerDistance(points);
      treeViewportState.pinchScale = treeViewportState.scale;
      const rect = viewport.getBoundingClientRect();
      treeViewportState.pinchMidX = (points[0].x + points[1].x) / 2 - rect.left;
      treeViewportState.pinchMidY = (points[0].y + points[1].y) / 2 - rect.top;
    }
  };

  viewport.onpointermove = (event) => {
    if (!treeViewportState.pointers.has(event.pointerId)) return;

    treeViewportState.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (treeViewportState.pointers.size === 2) {
      const points = Array.from(treeViewportState.pointers.values());
      const distance = getPointerDistance(points);

      if (distance && treeViewportState.pinchDistance) {
        const rect = viewport.getBoundingClientRect();
        const focusX = (points[0].x + points[1].x) / 2 - rect.left;
        const focusY = (points[0].y + points[1].y) / 2 - rect.top;
        const worldX = (focusX - treeViewportState.x) / treeViewportState.scale;
        const worldY = (focusY - treeViewportState.y) / treeViewportState.scale;
        treeViewportState.scale = clampTreeScale(
          treeViewportState.pinchScale * (distance / treeViewportState.pinchDistance)
        );
        treeViewportState.x = focusX - worldX * treeViewportState.scale;
        treeViewportState.y = focusY - worldY * treeViewportState.scale;
        applyTreeViewportTransform();
      }

      return;
    }

    if (treeViewportState.dragPointerId !== event.pointerId) return;

    treeViewportState.x =
      treeViewportState.startX + (event.clientX - treeViewportState.dragStartX);
    treeViewportState.y =
      treeViewportState.startY + (event.clientY - treeViewportState.dragStartY);
    applyTreeViewportTransform();
  };

  const endPointer = (event) => {
    treeViewportState.pointers.delete(event.pointerId);

    if (treeViewportState.pointers.size < 2) {
      treeViewportState.pinchDistance = null;
    }

    if (treeViewportState.dragPointerId === event.pointerId) {
      refreshTreeDragAnchor();
    }
  };

  viewport.onpointerup = endPointer;
  viewport.onpointercancel = endPointer;
  viewport.onlostpointercapture = endPointer;

  (controls || document).querySelectorAll("[data-tree-zoom]").forEach((button) => {
    button.onclick = () => {
      const action = button.dataset.treeZoom;

      if (action === "lock") {
        treeViewportState.nodesLocked = !treeViewportState.nodesLocked;
        button.textContent = treeViewportState.nodesLocked ? "Unlock" : "Lock";
        return;
      }

      if (action === "save") {
        if (treeViewportState.saving) return;

        const originalText = button.textContent;
        treeViewportState.saving = true;
        button.textContent = "Saving";
        saveTreeNodeLayout()
          .then(() => {
            button.textContent = "Saved";
            window.setTimeout(() => {
              button.textContent = originalText;
            }, 900);
          })
          .catch((error) => {
            console.error("Failed to save tree layout:", error);
            button.textContent = "Failed";
            window.setTimeout(() => {
              button.textContent = originalText;
            }, 1100);
          })
          .finally(() => {
            treeViewportState.saving = false;
          });
        return;
      }

      if (action === "reset") {
        resetTreeViewport();
        return;
      }

      const factor = action === "in" ? 1.15 : 0.87;
      treeViewportState.scale = clampTreeScale(treeViewportState.scale * factor);
      applyTreeViewportTransform();
    };
  });

  window.onresize = () => {
    fitTreeViewport(true);
  };
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
  familyMap.innerHTML = viewMode === "tree"
    ? renderTreeWorkspace(families)
    : families.map((family) => renderFamilyCard(family, collapsed.has(family.id))).join("");

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
  } else {
    setupTreeViewport();
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

async function loadTreeLayout() {
  const res = await fetch(TREE_LAYOUT_API);
  const data = await res.json();

  if (treeViewportState.layoutDirty || treeViewportState.nodeDragId) {
    return;
  }

  treeViewportState.nodeOffsets = data.nodeOffsets || {};
  treeViewportState.layoutUpdatedAt = data.updatedAt || null;
  localStorage.setItem(TREE_NODE_LAYOUT_KEY, JSON.stringify(treeViewportState.nodeOffsets));
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
Promise.all([loadTreeLayout(), loadAll()]).catch((error) => {
  console.error("Initial load failed:", error);
});
setInterval(updateClock, 1000);
setInterval(loadAll, 3000);
