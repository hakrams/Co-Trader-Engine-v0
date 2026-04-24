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
