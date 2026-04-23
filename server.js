const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

const parser = require("./src/parser");
const state = require("./src/state");
const logic = require("./src/logic");
const ARCHIVE_RESET_PIN = "1234";
const HISTORY_CLUES_FILE = path.join(__dirname, "data", "history-clues.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function readHistoryClues() {
  try {
    if (!fs.existsSync(HISTORY_CLUES_FILE)) {
      return [];
    }

    const parsed = JSON.parse(fs.readFileSync(HISTORY_CLUES_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("[HISTORY CLUES READ ERROR]", error.message);
    return [];
  }
}

function writeHistoryClues(items) {
  fs.mkdirSync(path.dirname(HISTORY_CLUES_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_CLUES_FILE, JSON.stringify(items, null, 2));
}


function normalizeTimeframe(value) {
  return String(value || "").trim().toLowerCase();
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasUsableRange(ohlc) {
  return Number.isFinite(ohlc?.high) && Number.isFinite(ohlc?.low);
}

function detectHistoryClueRole(input, existingItems) {
  const timeframe = normalizeTimeframe(input.timeframe);
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const direction = String(input.direction || "unknown").trim();
  const inputTime = getClueTimeMs(input);

  if (timeframe === "15m") {
    return {
      role: "parent",
      reason: "15M OB is treated as parent context in V2.",
      parentClueId: null
    };
  }

  if (timeframe !== "3m") {
    return {
      role: "unknown",
      reason: "Only 15M parent and 3M child-family detection is active in V2 right now.",
      parentClueId: null
    };
  }

  if (!hasUsableRange(input.ohlc)) {
    return {
      role: "unknown",
      reason: "3M child-family detection needs high and low values.",
      parentClueId: null
    };
  }

  const parentCandidates = existingItems
    .filter((item) => {
      const sameSymbol = String(item.symbol || "").trim().toUpperCase() === symbol;
      const sameDirection = direction === "unknown" || String(item.direction || "unknown") === direction;
      const beforeClue = !inputTime || getClueTimeMs(item) <= inputTime;

      return (
        sameSymbol &&
        sameDirection &&
        beforeClue &&
        normalizeTimeframe(item.timeframe) === "15m" &&
        item.role === "parent" &&
        hasUsableRange(item.ohlc)
      );
    })
    .sort((a, b) => getClueTimeMs(b) - getClueTimeMs(a));

  if (!parentCandidates.length) {
    return {
      role: "orphan",
      reason: "No same-direction 15M parent family exists before this 3M clue, so it is unattached for now.",
      parentClueId: null
    };
  }

  const containingParent = parentCandidates.find((parent) => {
    return input.ohlc.high <= parent.ohlc.high && input.ohlc.low >= parent.ohlc.low;
  });

  if (containingParent) {
    return {
      role: "close_child",
      reason: "3M clue range is contained inside a saved same-direction 15M parent OB range.",
      parentClueId: containingParent.id
    };
  }

  const nearestParent = parentCandidates[0];

  return {
    role: "extended_child",
    reason: "3M clue is outside the parent OB range, but it still belongs to the nearest same-direction 15M parent family.",
    parentClueId: nearestParent.id
  };
}


function refreshHistoryClueRoles(items) {
  const chronological = [...items].sort((a, b) => getClueTimeMs(a) - getClueTimeMs(b));
  const refreshedById = new Map();

  for (const item of chronological) {
    const priorItems = [...refreshedById.values()];
    const roleDetection = detectHistoryClueRole(item, priorItems);

    refreshedById.set(item.id, {
      ...item,
      role: roleDetection.role,
      roleDetectionReason: roleDetection.reason,
      parentClueId: roleDetection.parentClueId
    });
  }

  return items.map((item) => refreshedById.get(item.id) || item);
}

function getClueTimeMs(item) {
  const value = item?.obTime || item?.createdAt || item?.updatedAt;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameMarketContext(a, b) {
  return (
    String(a.symbol || "").trim().toUpperCase() === String(b.symbol || "").trim().toUpperCase() &&
    normalizeTimeframe(a.timeframe) === normalizeTimeframe(b.timeframe) &&
    String(a.direction || "unknown") === String(b.direction || "unknown") &&
    String(a.role || "unknown") === String(b.role || "unknown") &&
    String(a.parentClueId || "") === String(b.parentClueId || "")
  );
}

function humanize(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function getChapterRank(code) {
  return { LB: 6, LC: 6, L: 5, "L?": 3, C: 4, B: 4, "?": 1 }[code] || 1;
}

function deriveFamilyChapter(parent, members) {
  const memberChapters = members
    .map((item) => item.chapterCode)
    .filter((code) => code && !String(code).includes("?"));
  const candidates = [parent.chapterCode, ...memberChapters].filter(Boolean);
  return candidates.sort((a, b) => getChapterRank(b) - getChapterRank(a))[0] || "?";
}

function chapterNameForHint(hint) {
  if (hint === "B") return "BOS continuation";
  if (hint === "C") return "CHoCH reversal";
  if (hint === "L") return "Liquidity Engineering";
  return "unknown";
}

function withChapter(item, hint, reason) {
  return {
    ...item,
    chapterHint: hint,
    chapterName: chapterNameForHint(hint),
    chapterDetectionReason: reason
  };
}

function resolveHistoryChapters(items) {
  const byId = new Map(items.map((item) => [item.id, { ...item }]));
  const chronological = [...items].sort((a, b) => getClueTimeMs(a) - getClueTimeMs(b));

  for (const clue of chronological) {
    const clueType = String(clue.clueType || "");
    const chapterHint = clueType === "choch_formed" ? "C" : clueType === "bos_formed" ? "B" : null;

    if (!chapterHint) continue;

    const anchor = [...chronological]
      .filter((candidate) => {
        return (
          candidate.id !== clue.id &&
          getClueTimeMs(candidate) <= getClueTimeMs(clue) &&
          candidate.clueType === "ob_created" &&
          sameMarketContext(candidate, clue)
        );
      })
      .pop();

    if (!anchor) continue;

    const reason =
      chapterHint === "C"
        ? "CHoCH appeared after a matching OB clue, so the sequence resolves as Chapter C."
        : "BOS appeared after a matching OB clue, so the sequence resolves as Chapter B.";

    byId.set(anchor.id, withChapter(byId.get(anchor.id), chapterHint, reason));
    byId.set(clue.id, withChapter(byId.get(clue.id), chapterHint, reason));
  }

  const familyChildGroups = new Map();

  for (const clue of chronological) {
    if (clue.clueType !== "ob_created") continue;
    if (!["close_child", "extended_child"].includes(clue.role)) continue;
    if (!clue.parentClueId) continue;

    const key = [
      String(clue.symbol || "").trim().toUpperCase(),
      String(clue.direction || "unknown"),
      String(clue.parentClueId || "none")
    ].join("|");

    if (!familyChildGroups.has(key)) familyChildGroups.set(key, []);
    familyChildGroups.get(key).push(clue);
  }

  for (const group of familyChildGroups.values()) {
    if (group.length < 3) continue;

    const parentId = group[0].parentClueId;
    const parent = byId.get(parentId);
    if (!parent) continue;

    const hasStructureReveal = chronological.some((clue) => {
      return (
        ["choch_formed", "bos_formed"].includes(clue.clueType) &&
        String(clue.parentClueId || "") === String(parentId) &&
        String(clue.direction || "unknown") === String(group[0].direction || "unknown") &&
        getClueTimeMs(clue) >= getClueTimeMs(group[0]) &&
        getClueTimeMs(clue) <= getClueTimeMs(group[group.length - 1])
      );
    });

    if (hasStructureReveal) continue;

    const currentParent = byId.get(parentId);
    if (!currentParent || (currentParent.chapterHint && currentParent.chapterHint !== "unknown" && currentParent.chapterHint !== "L")) {
      continue;
    }

    const reason =
      "Three lower-timeframe children formed under this parent family without CHoCH/BOS, so the parent/family resolves as Chapter L. Child chapters remain independent.";

    byId.set(parentId, withChapter(currentParent, "L", reason));
  }

  return items.map((item) => byId.get(item.id) || item);
}

function getNormalizedEventTime(normalized = {}, raw = {}) {
  return (
    normalized?.times?.timestamp ||
    normalized?.times?.bar_time ||
    normalized?.times?.alert_time ||
    normalized?.times?.received_at ||
    raw?.received_at ||
    null
  );
}

function getLiveEventTimeMs(item) {
  const value = getNormalizedEventTime(item?.normalized, item?.raw);
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasFiniteRange(ohlc) {
  return Number.isFinite(ohlc?.high) && Number.isFinite(ohlc?.low);
}

function getRangeMid(ohlc) {
  if (!hasFiniteRange(ohlc)) return null;
  return (ohlc.high + ohlc.low) / 2;
}

function getPriceTolerance(a, b) {
  const mids = [getRangeMid(a), getRangeMid(b)].filter(Number.isFinite);
  const reference = mids.length ? mids.reduce((sum, value) => sum + value, 0) / mids.length : 1;
  return Math.max(0.00005, Math.abs(reference) * 0.0001);
}

function rangesCloseEnough(a, b) {
  if (!hasFiniteRange(a) || !hasFiniteRange(b)) {
    return false;
  }

  const tolerance = getPriceTolerance(a, b);
  const highsClose = Math.abs(a.high - b.high) <= tolerance;
  const lowsClose = Math.abs(a.low - b.low) <= tolerance;
  const overlaps = a.low <= b.high + tolerance && a.high >= b.low - tolerance;

  return (highsClose && lowsClose) || overlaps;
}

function getEventDisplayState(event) {
  if (event.event_type === "ob_created") {
    return "order block created";
  }

  if (event.event_type === "ob_tap") {
    return "order block tapped";
  }

  if (event.structure_type === "choch") {
    return "CHoCH detected";
  }

  if (event.structure_type === "bos") {
    return "BOS detected";
  }

  return humanize(event.event_type || event.event_family || "waiting");
}

function normalizeLiveEvent(item, index) {
  const normalized = item?.normalized || {};
  const price = normalized.price || {};

  return {
    id: item?.raw?.received_at
      ? `evt_${item.raw.received_at}_${index}`
      : `evt_${index}`,
    symbol: String(normalized.symbol || "").trim().toUpperCase() || "UNKNOWN",
    timeframe: normalizeTimeframe(normalized.timeframe),
    direction: String(normalized.direction || "unknown").trim(),
    event_raw: String(normalized.event_raw || "").trim(),
    event_family: String(normalized.event_family || "unknown").trim(),
    event_type: String(normalized.event_type || "unknown").trim(),
    structure_type: normalized.structure_type || null,
    zone_type: normalized.zone_type || null,
    ohlc: {
      open: numberOrNull(price.open),
      high: numberOrNull(price.high),
      low: numberOrNull(price.low),
      close: numberOrNull(price.close)
    },
    volume: numberOrNull(normalized.volume),
    timestamp: getNormalizedEventTime(normalized, item?.raw || {}),
    updatedAt: getNormalizedEventTime(normalized, item?.raw || {}),
    raw: item?.raw?.payload || null
  };
}

function findBestFamilyMatch(families, event) {
  const candidates = families.filter((family) => {
    return family.symbol === event.symbol && family.timeframe === event.timeframe;
  });

  if (!candidates.length) {
    return null;
  }

  const rangeMatches = candidates
    .filter((family) => rangesCloseEnough(family.anchorOhlc, event.ohlc))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  if (rangeMatches.length) {
    return rangeMatches[0];
  }

  if (event.event_type !== "ob_created" && candidates.length === 1) {
    return candidates[0];
  }

  return null;
}

function deriveFamilyChapterCode(family) {
  const latestEvent = family.events[family.events.length - 1] || null;

  if (latestEvent?.structure_type === "choch") return "C";
  if (latestEvent?.structure_type === "bos") return "B";
  if (latestEvent?.event_type === "ob_tap" && family.tapCount >= 2) return "L?";
  return "?";
}

function deriveFamilyChapterName(code) {
  if (code === "C") return "CHoCH reversal";
  if (code === "B") return "BOS continuation";
  if (code === "L?") return "Liquidity engineering watch";
  return "Open market clue";
}

function buildLiveFamiliesFromHistory(history) {
  const liveEvents = (Array.isArray(history) ? history : [])
    .map(normalizeLiveEvent)
    .filter((event) => event.symbol && event.timeframe && event.timeframe !== "unknown")
    .sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));

  const families = [];

  for (const event of liveEvents) {
    const match = findBestFamilyMatch(families, event);

    if (match) {
      match.events.push(event);
      match.updatedAt = event.updatedAt || match.updatedAt;
      match.latestClue = event.event_raw || event.event_type || match.latestClue;
      match.direction = event.direction || match.direction;
      match.state = getEventDisplayState(event);
      match.volume = event.volume ?? match.volume ?? null;

      if (!hasFiniteRange(match.anchorOhlc) && hasFiniteRange(event.ohlc)) {
        match.anchorOhlc = { ...event.ohlc };
      }

      if (event.event_type === "ob_created" && hasFiniteRange(event.ohlc)) {
        match.anchorOhlc = { ...event.ohlc };
        match.anchorTime = event.timestamp || match.anchorTime;
      }

      if (event.event_type === "ob_tap") {
        match.tapCount += 1;
      }

      if (event.structure_type) {
        match.structureTypes.add(event.structure_type);
      }

      continue;
    }

    const familyId = `live_${event.symbol}_${event.timeframe}_${families.length + 1}`;

    families.push({
      id: familyId,
      symbol: event.symbol,
      timeframe: event.timeframe,
      direction: event.direction || "unknown",
      anchorOhlc: hasFiniteRange(event.ohlc) ? { ...event.ohlc } : { ...event.ohlc },
      anchorTime: event.timestamp || event.updatedAt || null,
      updatedAt: event.updatedAt || null,
      latestClue: event.event_raw || event.event_type || "event",
      state: getEventDisplayState(event),
      volume: event.volume ?? null,
      tapCount: event.event_type === "ob_tap" ? 1 : 0,
      structureTypes: new Set(event.structure_type ? [event.structure_type] : []),
      events: [event]
    });
  }

  return families
    .map((family) => {
      const chapterCode = deriveFamilyChapterCode(family);
      const latestEvent = family.events[family.events.length - 1] || null;

      return {
        id: family.id,
        source: "live_family",
        key: family.id,
        symbol: family.symbol,
        timeframe: family.timeframe,
        direction: latestEvent?.direction || family.direction || "unknown",
        chapterCode,
        chapterName: deriveFamilyChapterName(chapterCode),
        role:
          family.timeframe === "15m"
            ? "parent"
            : family.timeframe === "3m"
              ? "child"
              : "unknown",
        state: family.state,
        latestClue: latestEvent?.event_raw || family.latestClue,
        anchorTime: family.anchorTime,
        ohlc: family.anchorOhlc || null,
        volume: family.volume ?? null,
        note:
          family.tapCount >= 2
            ? `${family.tapCount} taps recorded inside one live family.`
            : `${family.events.length} normalized event${family.events.length === 1 ? "" : "s"} in this live family.`,
        updatedAt: family.updatedAt,
        attention: getChapterRank(chapterCode),
        eventCount: family.events.length,
        tapCount: family.tapCount,
        eventTrail: family.events.map((event) => ({
          event_raw: event.event_raw,
          event_type: event.event_type,
          structure_type: event.structure_type,
          timestamp: event.timestamp,
          direction: event.direction,
          volume: event.volume,
          ohlc: event.ohlc
        }))
      };
    })
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function findParentFamilyForChild(parents, child) {
  const candidates = parents.filter((parent) => parent.symbol === child.symbol);
  const close = candidates.filter((parent) => rangesCloseEnough(parent.ohlc, child.ohlc));

  if (close.length) {
    return close.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return null;
}

function buildFamilyMapFromLiveFamilies(liveFamilies) {
  const parents = liveFamilies
    .filter((family) => family.timeframe === "15m")
    .map((family) => ({
      id: family.id,
      parent: family,
      members: [],
      loose: false
    }));
  const parentById = new Map(parents.map((family) => [family.id, family]));
  const looseMembers = [];

  for (const family of liveFamilies.filter((item) => item.timeframe !== "15m")) {
    const parent = family.timeframe === "3m" ? findParentFamilyForChild(parents.map((item) => item.parent), family) : null;

    if (parent) {
      parentById.get(parent.id)?.members.push({
        ...family,
        parentClueId: parent.id,
        role: rangesCloseEnough(parent.ohlc, family.ohlc) ? "close_child" : "extended_child"
      });
    } else {
      looseMembers.push({
        ...family,
        role: family.timeframe === "3m" ? "orphan" : family.role || "unknown"
      });
    }
  }

  const mapped = parents.map((family) => {
    const familyEvents = [family.parent, ...family.members].filter(Boolean);
    const latestMember =
      familyEvents.sort(
        (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
      )[0] || family.parent;
    const closeCount = family.members.filter(
      (member) => member.role === "close_child" || member.role === "child"
    ).length;
    const extendedCount = family.members.filter(
      (member) => member.role === "extended_child"
    ).length;
    const openCount = family.members.filter((member) =>
      String(member.chapterCode || "?").includes("?")
    ).length;

    return {
      ...family,
      familyChapter: family.parent.chapterCode || "?",
      familyChapterName: family.parent.chapterName || "Open market clue",
      latestClue:
        latestMember.latestClue || family.parent.latestClue || "family update",
      state: latestMember.state || family.parent.state || "waiting",
      direction: latestMember.direction || family.parent.direction || "unknown",
      updatedAt: latestMember.updatedAt || family.parent.updatedAt || null,
      memberCount: family.members.length,
      totalCount: family.members.length + 1,
      closeCount,
      extendedCount,
      openCount
    };
  });

  if (looseMembers.length) {
    mapped.push({
      id: "unattached",
      parent: {
        key: "unattached",
        symbol: "Unattached",
        timeframe: "",
        chapterCode: "?",
        chapterName: "Waiting for family",
        state: "open clues",
        role: "orphan"
      },
      members: looseMembers,
      loose: true,
      familyChapter: "?",
      familyChapterName: "Waiting for family",
      latestClue:
        looseMembers[0]?.latestClue || looseMembers[0]?.state || "open clue",
      state: "open clues",
      direction: looseMembers[0]?.direction || "unknown",
      updatedAt: looseMembers[0]?.updatedAt || null,
      memberCount: looseMembers.length,
      totalCount: looseMembers.length,
      closeCount: 0,
      extendedCount: 0,
      openCount: looseMembers.filter((member) => String(member.chapterCode || "?").includes("?")).length
    });
  }

  return mapped.sort((a, b) => getChapterRank(b.familyChapter) - getChapterRank(a.familyChapter) || b.members.length - a.members.length);
}

function hasMinimalWebhookFields(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    typeof payload.event === "string" &&
    typeof payload.symbol === "string" &&
    typeof payload.timeframe === "string" &&
    typeof payload.timestamp === "string"
  );
}

app.post("/webhook", (req, res) => {
  // 🔥 1. ALWAYS capture raw FIRST (no conditions)
  state.addRawEvent(req.body);

  try {
    const parsed = parser.parse(req.body);

    console.log("[PARSED EVENT]", JSON.stringify(parsed, null, 2));

    if (parsed.normalized.event_type === "ob_tap") {
      state.trackLiquidityEngineeringObTap(
        parsed.normalized.symbol,
        parsed.normalized.timeframe,
        parsed.normalized.direction,
        parsed.normalized.times.timestamp || parsed.raw.received_at
      );
    }

    state.refreshAllLiquidityEngineeringStates();

    state.addEvent(parsed);
    const eventType = parsed.normalized.event_type;
    const symbol = parsed.normalized.symbol;
    const timeframe = parsed.normalized.timeframe;
    const direction = parsed.normalized.direction;
    const currentSetup = state.getSetup(symbol, timeframe, direction);
    const currentStage = currentSetup?.stage || null;

    const nextState = logic.getNextState(eventType, currentStage);

    if (nextState) {
      state.updateSetup(symbol, timeframe, direction, eventType, nextState);

      const eligibility = state.evaluateEligibility();
      state.setSetupEligibility(symbol, timeframe, direction, eligibility);
    } else {
      console.log(`[STATE] No mapping for event type: ${eventType}`);
    }

    state.processNotificationTriggers();
  } catch (error) {
    // ❗ IMPORTANT: DO NOT FAIL REQUEST
    console.log("[PARSER ERROR - NON BLOCKING]", error.message);
  }

  // 🔥 2. ALWAYS respond success
  res.status(200).json({
    ok: true,
    message: "Webhook received successfully"
  });
});

app.get("/state", (req, res) => {
  state.refreshAllLiquidityEngineeringStates();
  state.refreshAllSetupDerivedLayers();
  state.processNotificationTriggers();

  const currentState = state.getState();
  const reactions = state.getReactions();
  const liveFamilies = buildLiveFamiliesFromHistory(currentState.history);
  const familyMap = buildFamilyMapFromLiveFamilies(liveFamilies);

  res.json({
    ...currentState,
    reactions,
    liveFamilies,
    familyMap
  });
});

app.get("/api/raw-events", (req, res) => {
  state.refreshAllLiquidityEngineeringStates();
  state.refreshAllSetupDerivedLayers();
  state.processNotificationTriggers();

  const currentState = state.getState();

  res.json({
    count: currentState.rawEvents.length,
    latest: currentState.latestRawEvent,
    items: currentState.rawEvents
  });
});

app.get("/api/history-clues", (req, res) => {
  const items = resolveHistoryChapters(refreshHistoryClueRoles(readHistoryClues()));

  res.json({
    count: items.length,
    items
  });
});

app.post("/api/history-clues", (req, res) => {
  try {
    const body = req.body || {};
    const requiredFields = ["symbol", "timeframe", "clueType", "obTime"];
    const missing = requiredFields.filter((field) => !String(body[field] || "").trim());

    if (missing.length) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: " + missing.join(", ")
      });
    }

    const items = readHistoryClues();
    const nowIso = new Date().toISOString();
    const symbol = String(body.symbol || "").trim().toUpperCase();
    const timeframe = String(body.timeframe || "").trim();
    const ohlc = {
      open: numberOrNull(body.open),
      high: numberOrNull(body.high),
      low: numberOrNull(body.low),
      close: numberOrNull(body.close)
    };
    const roleDetection = detectHistoryClueRole(
      {
        symbol,
        timeframe,
        direction: String(body.direction || "unknown").trim(),
        obTime: String(body.obTime || "").trim(),
        ohlc
      },
      items
    );

    const clue = {
      id: "clue_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8),
      createdAt: nowIso,
      updatedAt: nowIso,
      symbol,
      timeframe,
      clueType: String(body.clueType || "manual_ob").trim(),
      direction: String(body.direction || "unknown").trim(),
      role: roleDetection.role,
      roleDetectionReason: roleDetection.reason,
      parentClueId: roleDetection.parentClueId,
      chapterHint: "unknown",
      chapterDetectionReason: "Chapter identity is inferred later from sequence, not manually selected from a single clue.",
      obTime: String(body.obTime || "").trim(),
      ohlc,
      note: String(body.note || "").trim()
    };

    items.unshift(clue);
    writeHistoryClues(items);

    const resolvedItems = resolveHistoryChapters(refreshHistoryClueRoles(items));

    res.status(201).json({
      ok: true,
      clue: resolvedItems.find((item) => item.id === clue.id) || clue
    });
  } catch (error) {
    console.error("[HISTORY CLUES WRITE ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/setup-scoring", (req, res) => {
  try {
    const { symbol, timeframe, direction, context_profile, scores } = req.body;

    if (!symbol || !timeframe || !direction) {
      return res.status(400).json({
        ok: false,
        error: "Missing setup identity (symbol, timeframe, direction)"
      });
    }

    if (!context_profile) {
      return res.status(400).json({
        ok: false,
        error: "Missing context_profile"
      });
    }

    if (!scores) {
      return res.status(400).json({
        ok: false,
        error: "Missing scores object"
      });
    }

    const result = state.applySetupScoring(
      symbol,
      timeframe,
      direction,
      context_profile,
      scores
    );

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error
      });
    }

    state.processNotificationTriggers();

    res.status(200).json({
      ok: true,
      message: "Scoring applied successfully",
      key: result.key,
      scoring: result.scoring
    });
  } catch (error) {
    console.error("[SCORING ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/risk/update", (req, res) => {
  try {
    const { settings, runtime } = req.body || {};

    const updatedRisk = state.updateRiskState({ settings, runtime });
    state.processNotificationTriggers();

    res.status(200).json({
      ok: true,
      message: "Risk state updated successfully",
      risk: updatedRisk
    });
  } catch (error) {
    console.error("[RISK UPDATE ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/notifications/settings", (req, res) => {
  try {
    const updatedSettings = state.updateNotificationSettings(req.body || {});
    state.processNotificationTriggers({ initializeOnly: true });

    res.status(200).json({
      ok: true,
      message: "Notification settings updated successfully",
      notificationSettings: state.getPublicNotificationSettings(updatedSettings)
    });
  } catch (error) {
    console.error("[NOTIFICATION SETTINGS ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/controls/update", (req, res) => {
  try {
    const updatedControls = state.updateControls(req.body || {});
    state.processNotificationTriggers({ initializeOnly: true });

    res.status(200).json({
      ok: true,
      message: "Controls updated successfully",
      controls: updatedControls
    });
  } catch (error) {
    console.error("[CONTROLS UPDATE ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/notifications/test", (req, res) => {
  try {
    const notification = state.addNotification({
      type: "telegram_test",
      priority: "critical",
      message: "Co-Trader Engine test notification.",
      metadata: {
        source: "manual_test"
      }
    });

    res.status(200).json({
      ok: true,
      message: "Test notification created",
      notification
    });
  } catch (error) {
    console.error("[NOTIFICATION TEST ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/archive-reset", (req, res) => {
  try {
    const { pin } = req.body || {};

    if (pin !== ARCHIVE_RESET_PIN) {
      return res.status(403).json({
        ok: false,
        error: "Invalid archive reset PIN"
      });
    }

    const archiveResult = state.archiveCurrentState();

    if (!archiveResult.ok) {
      return res.status(500).json({
        ok: false,
        error: "Failed to archive current state"
      });
    }

    const resetResult = state.resetActiveState();

    if (!resetResult.ok) {
      return res.status(500).json({
        ok: false,
        error: "Failed to reset active state"
      });
    }

    res.status(200).json({
      ok: true,
      message: "Current state archived and active state reset",
      archiveFile: archiveResult.archiveFile,
      preservedSetupKeys: resetResult.preservedSetupKeys || []
    });
  } catch (error) {
    console.error("[ARCHIVE RESET ERROR]", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.listen(4000, "0.0.0.0", () => {
  console.log("Server running on port 4000");
});
