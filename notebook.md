# Co-Trader Engine V2 Working Notebook

## Standing Memory Rule

Markdown is project memory. Important implementation steps, tests, rule decisions, and future patch notes must be recorded in `.md` files, especially `.codex-notes/v2/v2-journal.md`, before a work item is considered finished.

## Implemented Patch - OB Reaction History

Implemented cleanup:

- keep `reactionHistory: []` on each OB
- when a repeated matched tap starts a fresh `reactionWatch`, move the previous `reactionWatch` into `reactionHistory` first
- keep the newest `reactionWatch` as the active/current cycle
- preserve prior max-window results, liquidity-engineering observations, and older reaction cycles after repeated taps

Boundary:

- do not infer direction or change respected/invalidated logic while adding this

## 2026-04-28 - OB Box Tap Matching Patch

Implemented boundary:

- this patch only gives the engine physical OB box memory and tap overlap matching
- it does not redesign family logic, add AI, rank OB priority, decide bullish/bearish direction, or change trade execution logic
- `zone_created`, `bullish_ob`, and `bearish_ob` normalize to `ob_created` for storage
- stored OB boxes are frozen from their original OHLC and original bar time
- stored OB boxes use `direction: "unknown"` in the new matching layer
- `Demand_ob_tap` and `Supply_ob_tap` are treated as tap alerts only; their direction is ignored for OB matching

Tap matching rule:

```text
tap.high >= ob.low AND tap.low <= ob.high
```

Stored tap outcomes:

- `matched_tap` when exactly one active same-symbol/same-timeframe OB box overlaps
- `multi_zone_tap` when multiple active same-symbol/same-timeframe OB boxes overlap
- `unmatched_tap` when no active same-symbol/same-timeframe OB box overlaps

UI/API note:

- `/state` now exposes `obBoxes` and `tapMatches`
- the dashboard shows a compact OB Boxes and Tap Matches readout
- Chart Lab candle storage remains separate through `candle_details` and `/api/candles`

## 2026-04-24 - Live Raw Alert Reality Check

The live raw alert stream exposed that the current local story engine is still far behind the actual market flow.

Observed problem:

- with 81 raw alerts, the UI is still collapsing down to roughly one family / one story
- this is not believable from the live flow
- expected behavior is closer to multiple family trees, multiple running stories, and many more chapter formations

Main lesson:

- planning from local manual history clues was not enough
- the engine now needs to be shaped against real raw alerts, not mainly against handcrafted history entries
- local replay should mimic real webhook traffic as closely as possible

New working direction:

- use larger live-like raw alert storage and replay
- increase retained raw alerts from 100 to a higher cap such as 300 or 500
- fire local replay through `curl` / webhook-style payloads instead of depending mainly on History Clues
- treat the raw live stream as the primary truth for engine design and debugging

Current strategic concern:

- the family model is too eager to collapse alerts into one umbrella
- the engine is not producing enough parallel families / stories from the raw stream
- chapter formation is still too weak compared with what the raw sequence should be revealing

Collaboration rule locked:

- before implementing major story/chapter/family logic, align the exact rule in words first
- after implementation, write the agreed rule and outcome into notes/journal

Open discussion topics to refine next:

- what should define a new family in live mode
- when parallel same-symbol families should be allowed instead of merged
- how many simultaneous family trees should realistically exist from one raw stream
- how live replay tooling should work for 300-500 alerts
- what chapter resolver logic is still too strict or too shallow

## 2026-04-24 - Parent Window Model

High-priority concept:

- *__parent lifecycle__* must become a first-class engine idea and we need to come back to it again

Agreed discussion direction:

- `15m ob_created` opens a parent
- parent direction matters from birth because it defines which `3m` children are confluence and which are retracement behavior
- that parent stays active only for a live window
- a `15m` structural break closes that parent immediately
- structural break here means either `15m BOS` or `15m CHoCH`
- structural-break direction also matters because it changes the current market phase
- once the parent closes, new `3m` clues stop attaching to that parent
- after closure and before the next `15m ob_created`, incoming `3m` clues are `orphans`
- this orphan zone is expected and normal while the market pulls back and prepares the next parent
- once the next `15m ob_created` appears, a new parent opens and new `3m` clues can begin attaching under it

Important implementation boundary for this phase:

- for now, child assignment in this lifecycle uses only `3m ob_created`
- do not mix `3m BOS` or `3m CHoCH` into this parent lifecycle yet because that is its own `3m` lifecycle
- do not mix OB tap logic into parent assignment yet
- do not use retroactive best-fit reassignment yet
- first stabilize the parent open/close lifecycle honestly

Why closed parents still matter:

- closed parents should remain visible in the UI
- after structural break, the next period is often retracement behavior
- the next `3m` clues after closure may become important because traders will be watching for which child later helps drive price back
- OB tap behavior belongs to a later phase, but this context should stay visible and preserved in notes

Future persistence note:

- Family Map needs its own persistent memory layer so parent families remain visible even after `Archive & Reset Active`
- archive/reset should not wipe the historical parent tree view we still want to study later
- this should be designed deliberately as a separate family-history memory, not accidentally tied only to current active runtime state
- build this later, not now

## 2026-04-24 - Future OB Tap And Family Archive Notes

Locked future note:

- when price later taps an `orphan`, that orphan becomes actionable
- at that point it should disappear from the live `Family Map`
- it should not simply vanish; it should move into a future archive view for later review

Future page direction:

- create a dedicated `Family Archive` page
- families or clue structures that leave the live `Family Map` should go there
- this archive page is where post-analysis should happen with AI support

Future AI analysis purpose:

- analyze how the family performed after it left the live map
- compare what the family was expected to do vs what actually happened
- inspect where the family logic was strong
- inspect where the family logic was weak
- identify what to strengthen in both the engine and the market-reading model
- treat it like post-trade analysis, but focused on technical engine behavior plus market behavior

Important scope note:

- this is for a later OB-tap/archive phase
- do not implement it yet

## 2026-04-24 - Tree View / Granddad Notes

Future tree-view direction:

- `Tree View` should move closer to a real navigable family tree, not just grouped role cards
- the page should support pan/drag in all directions like a map
- the page should support zoom in/out
- touch should use pinch gesture
- mouse should use wheel scroll for zoom
- keep `Card View` for readable detail, but let `Tree View` become the spatial family structure view

Generation rows:

- `granddad` is the higher context row above parent
- `parent` sits on its own aligned row
- `child` sits on the row below parent
- in tree view, parents should sit on the same line horizontally

Granddad placeholder:

- for now, granddad can use `?` as a placeholder head
- this is only to reserve the higher-level layout shape before real granddad logic is active

Orphan placement:

- orphan belongs in the same child-layer space as the other children
- orphan does not need a line to a parent
- do not hard-fix orphan placement yet
- let orphan remain flexible / floating for now because Akram already has a later idea for how orphan should be treated
- do not over-design orphan placement before that later orphan/granddad logic is defined

Important scope note:

- these are layout and navigation notes to remember before coding
- do not lock orphan into a rigid final position yet

## 2026-04-26 - Chart Lab Viewport Lesson

Current Chart Lab direction:

- Chart Lab should feel closer to TradingView than a static SVG preview
- the chart space needs drag/pan, mouse-wheel zoom, and pinch zoom like the Family Tree map
- the first repair copied the Family Tree-style viewport idea into Chart Lab: `chart-viewport` as the interaction surface and `chart-world` / chart layers as the moved content
- this proved the interaction model can work, but it exposed a deeper charting issue

Important lesson:

- moving the whole SVG makes candles, grid, price labels, and time labels drift together
- moving only the candle layer keeps axes visually fixed, but the axis values become stale because they still describe the original full dataset range
- candles can also visually conflict with the fixed price/time axis zones unless the chart is treated as a real plot viewport

Correct next architecture:

- do not rely only on SVG transforms for the final TradingView-style behavior
- treat `chartViewport` as a data camera, not just a CSS/SVG transform
- horizontal drag should change the visible candle window / offset
- vertical drag should shift the visible price range
- wheel or pinch zoom should change candle spacing around the cursor
- every camera change should redraw candles, grid lines, price labels, and time labels from the visible window
- price axis and time axis should stay fixed in screen position, but their displayed values should be recalculated dynamically

Scope note:

- current quick interaction work is useful as a prototype
- final Chart Lab needs a renderer rewrite around visible range and camera state before it will truly feel like TradingView

## 2026-04-27 - Browser Verification Tooling

Continuity note:

- Akram is installing Playwright / Chromium so future Codex sessions can verify Chart Lab and dashboard behavior in a real browser
- use Playwright for approved browser checks such as loading `http://127.0.0.1:4000/chartlab`, catching console errors, testing wheel zoom / drag behavior, and taking screenshots
- do not assume browser verification is approved by default; ask Akram before running extra tests or making code changes, because he is trying to save credits

## 2026-04-28 - Reset Button Boundaries

Current reset split:

- `Archive & Reset Raw Alerts` archives and clears only raw alerts
- `Reset Family Map` clears live family/clue state, saved history clues, OB boxes, tap matches, and setups
- neither reset clears Chart Lab candles

Raw alert limit behavior:

- raw alerts rotate automatically at 500 stored alerts
- when the limit is reached, the current raw-alert batch is saved to `data/archive/`
- the incoming alert starts a fresh raw-alert feed
- this rotation must not wipe Family Map clues or candles

Future close/archive idea:

- per-family close should probably move a family into a review/archive layer rather than deleting it
- invalidation-style lifecycle may be useful for deciding when a family leaves the live map

## 2026-04-28 - Candle History Discussion

Current candle storage understanding:

- 1 day of 1m candles = 1,440 candles per symbol
- 3 days of 1m candles = 4,320 candles per symbol
- current stored candle cap is 5,000 candles in `data/candles.json`
- that means one symbol can hold a little over 3 days of 1m candles
- multiple symbols share the same 5,000 stored-candle cap, so history depth shrinks as more symbols are stored

Current Chart Lab loading behavior:

- Chart Lab asks `/api/candles` for the latest 500 stored 1m candles
- 500 candles is only about 8 hours and 20 minutes on 1m
- yesterday's candles may exist in storage but not appear in Chart Lab because the UI fetch window is too small
- `/api/candles` also currently caps responses at 1,000 candles, so loading a full yesterday view on 1m would need a backend/API cap change too

Future discussion:

- decide whether Chart Lab should support history range controls such as Last 500, Today, Yesterday, and Last 3 Days
- decide whether candle storage should rotate/archive like raw alerts instead of trimming older candles after the 5,000 cap
- decide whether candle storage caps should be global or per symbol

## 2026-04-28 - Current Stop Point / Handoff

Where we stopped:

- The latest work ended after the OB Story Visibility UI patch.
- No new backend trading logic was added in that patch.
- Dashboard OB cards now expose the story/clue state clearly:
  - OB range and creation time
  - status and active/archive state
  - direction remains separate from provisional direction
  - birthWatch status/count/reason
  - eye opener story status/type/direction/time
  - tap count and last tap
  - current reactionWatch status/count/tap/verdict
  - reactionHistory previous-cycle count
- Tap Matches and Eye Openers are visible as dashboard sections.
- OBs are visually grouped as Active, Liquidity Engineering, Tapped / Pending Reaction, and Invalidated / Archived.

What has been archived / preserved:

- Raw alerts now auto-archive to `data/archive/raw-events-*.json` when the 500-alert limit is reached.
- `Archive & Reset Raw Alerts` archives and clears only raw alerts.
- `Reset Family Map` clears live family-map state plus saved manual history clues, but preserves raw alerts, candles, Chart Lab data, tree layout, and settings.
- Test runs used `Reset Family Map` to clear the board before verification payloads.

Verified layers:

- BirthWatch:
  - bullish / bearish / unclear provisional direction worked
  - wrong symbol, wrong timeframe, and same OB bar-time candles were ignored
  - birthWatch stopped at exactly 3 candles
  - OB `direction` remained `unknown`
- Eye Openers:
  - CHoCH/BOS created eyeOpener records
  - prior active same-symbol/same-timeframe OBs linked
  - later OBs did not retro-link to old eye openers
  - wrong symbol and wrong timeframe did not link
  - provisionalDirection stayed untouched
- Reaction History:
  - repeated taps preserve the previous reactionWatch in `reactionHistory`
  - current reactionWatch belongs to the latest tap
  - previous reaction cycle keeps its collected candles and replacement metadata

Known skipped / future helper:

- Invalidated/archived OB exclusion in eye-opener tests still needs a tiny explicit test hook/helper, because there is no safe current endpoint to manually mark one specific OB invalidated/archived for setup.

Next safe discussion areas:

- deeper story layer after the visibility patch
- per-family close / move-to-archive behavior
- candle-history controls and candle archive rotation
- explicit test helper for marking an OB invalidated/archived during verification

## 2026-04-28 - Next Priority Note

Current priority:

- the engine/story logic is more important than Chart Lab polish right now
- Chart Lab suggestions are parked as future discussion items, not the active build focus

Parked Chart Lab ideas:

- history range controls such as Last 500, Today, Yesterday, and Last 3 Days
- wheel/drag/pinch behavior verification in a real browser
- candle storage/API cap changes if deeper chart history becomes needed

Working rule:

- before any engine code implementation, align the rule in words first
- Codex should ask for explicit approval before changing code or running heavier verification

## 2026-04-28 - Reaction Verdict Patch

Implemented with explicit build-only boundary:

- reactionWatch verdict logic now uses prior direction context only
- tap event names do not decide direction
- OB `direction` remains `unknown`
- direction basis priority is:
  - `eyeOpenerDirection` when bullish/bearish
  - `provisionalDirection` from birthWatch when bullish/bearish
  - `unknown` when neither exists
- reactionWatch stores `directionBasis`, `reason`, `status`, and `verdict`

Reaction verdicts:

- bullish basis:
  - close below OB low -> `invalidated`
  - close above OB high -> `respected`
- bearish basis:
  - close above OB high -> `invalidated`
  - close below OB low -> `respected`
- unknown basis:
  - after 3 candles -> `reaction_pending_direction`
- after at least 3 candles with no respected/invalidated verdict and candle overlap holding around the OB -> `liquidity_engineering_active`
- if liquidity engineering was already active and a later respected verdict appears -> `respected_high_priority` with `priority: high`
- at max window, overlapping/holding price stays `liquidity_engineering_active` and does not become weak

Boundaries preserved:

- no tests or payload verification were added
- no AI, trade decision, risk, breaker-block, bait/fake/real, tap matching, birthWatch, eyeOpener, reactionHistory, or family-map behavior was redesigned

## 2026-04-28 - Reaction Verdict Verification

Ran the supplied reaction verdict payload set through `/webhook` after raw archive/reset and Family Map reset.

Result:

- 32 webhook payloads returned HTTP 200
- final `/state` showed 5 OB boxes and 5 tap matches
- bullish birthWatch basis -> respected worked on EURUSD
- bullish birthWatch basis -> invalidated worked on GBPUSD
- bearish birthWatch basis -> respected worked on AUDUSD
- bearish birthWatch basis -> invalidated worked on NZDUSD
- unknown basis -> `reaction_pending_direction` worked on USDJPY
- all tested OBs kept `direction: "unknown"`
- tap event names were not used as direction basis
