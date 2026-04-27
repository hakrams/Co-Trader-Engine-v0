# Co-Trader Engine V2 Working Notebook

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
