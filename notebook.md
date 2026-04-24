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
