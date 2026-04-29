# Co-Trader Engine V2

## Overview

Co-Trader Engine V2 is the active working folder for the next direction of the trading engine.

V1 has been archived separately, so this folder can be changed freely. The current codebase still contains the V1 webhook intake, parser, state persistence, decision logic, and dashboard foundation until the V2 architecture replaces or reshapes those pieces.

## Hard Memory Rule

Markdown files are the persistent memory for this project. Any meaningful implementation, test result, rule decision, future improvement, or scope boundary must be written into the relevant `.md` files before the work is considered complete.

Minimum expectation:

- update `README.md` when the rule affects project-wide behavior or future contributor instructions
- update `notebook.md` when the rule affects current working understanding or near-term planned work
- update `.codex-notes/v2/v2-journal.md` for step-by-step progress, test outcomes, decisions, and discoveries

Do not rely on chat memory alone for project continuity.

## Current Baseline

- accepts TradingView-style webhook payloads through `POST /webhook`
- captures every raw payload first, even if parsing fails
- normalizes event names, timeframe values, numeric fields, and metadata
- tracks setup progression per `symbol_timeframe`
- freezes OB boxes from zone creation alerts and matches OB taps by price-range overlap
- enforces simple sequence rules before state transitions
- generates decision output from tracked setup state
- persists engine state to `data/engine-state.json`
- exposes a browser dashboard from `public/`
- exposes raw event inspection through `GET /api/raw-events`
- exposes Chart Lab at `/chartlab` for candle/OB visual debugging
- exposes Chart Structure at `/chartstructure` for materialized MTF candle viewing

## Current Architecture

```text
TradingView
  -> /webhook
  -> parser / normalizer
  -> OB box storage / tap overlap matching
  -> state update
  -> rule validation
  -> decision mapping
  -> persisted engine state
  -> dashboard + API visibility
```

## Project Structure

```text
co-trader-engine-v2/
|-- data/
|   |-- engine-state.json
|   `-- .gitkeep
|-- public/
|   |-- index.html
|   |-- chartlab.html
|   |-- chartlab.js
|   |-- chartstructure.html
|   |-- chartstructure.js
|   |-- style.css
|   `-- app.js
|-- src/
|   |-- logic.js
|   |-- normalizer.js
|   |-- parser.js
|   `-- state.js
|-- server.js
|-- package.json
`-- README.md
```

## Core Files

- `server.js`
  Runs the Express server, serves the dashboard, accepts webhook requests, and exposes state/raw-event API routes.

- `src/parser.js`
  Validates incoming payload shape, extracts useful fields, and builds a normalized event object.

- `src/normalizer.js`
  Converts raw TradingView naming into engine-friendly event and timeframe values.

- `src/state.js`
  Stores latest event, event history, setup states, and raw payload history. Also loads and saves the engine state file.

- `src/logic.js`
  Maps normalized event types into next setup states and setup states into decisions.

- `public/index.html`
  Dashboard shell for viewing current engine status.

- `public/app.js`
  Polls engine APIs, renders state, shows raw payload visibility, and raises browser notifications on decision changes.

- `public/chartlab.js`
  Draws the Chart Lab candle/OB debug surface from stored 1m candles and engine OB state.

- `public/chartstructure.js`
  Draws the Chart Structure MTF candle surface from materialized structure-candle APIs. Structure overlays are intentionally parked for a later phase.

## Event Flow

1. A TradingView alert sends JSON to `POST /webhook`.
2. The raw payload is stored immediately.
3. The parser validates and normalizes the payload.
4. The normalized event is added to history.
5. Zone creation alerts freeze an OB box when OHLC data is available.
6. OB tap alerts are compared against active same-symbol/same-timeframe OB boxes using price overlap.
7. The rule layer checks whether the transition is allowed.
8. The setup state is updated if valid.
9. The reaction layer exposes a decision such as `monitoring` or `actionable`.
10. The dashboard and API endpoints reflect the current engine view.

## OB Box Tap Matching

This layer gives the engine physical price memory. It does not decide trades, direction, priority, or family validity.

When an OB creation event is received, the engine stores a frozen OB box with:

- id, symbol, exchange, timeframe
- original bar time and alert time
- original open, high, low, close, volume
- `source_event: "zone_created"`
- `direction: "unknown"`
- `status: "active"`

When a `Demand_ob_tap` or `Supply_ob_tap` event is received, the engine compares the tap candle range against active stored OB boxes for the same symbol and timeframe:

```text
tap.high >= ob.low AND tap.low <= ob.high
```

Results are stored as:

- `matched_tap` when exactly one OB overlaps
- `multi_zone_tap` when more than one OB overlaps
- `unmatched_tap` when no stored OB overlaps

Important boundary: tap direction is ignored for this matching layer. Demand and Supply tap names only mean that a tap alert happened.

## Current Event Mapping

### Recognized normalized event types

- `choch`
- `ob_created`
- `ob_tap`

### Current setup progression

- `choch` -> `waiting_for_ob_tap`
- `ob_tap` -> `ready_for_ltf`

### Current decision mapping

- `waiting_for_ob_tap` -> `monitoring`
- `ready_for_ltf` -> `actionable`

## Current Supported Raw TradingView Event Names

- `bullish_choch_detected`
- `bearish_choch_detected`
- `zone_created`
- `bullish_ob`
- `bearish_ob`
- `Demand_ob_tap`
- `Supply_ob_tap`

## API Endpoints

### `POST /webhook`

Receives TradingView-style JSON payloads.

Example:

```json
{
  "event": "bullish_choch_detected",
  "symbol": "EURUSD",
  "timeframe": "15",
  "timestamp": "2026-04-18T10:15:00Z"
}
```

Important behavior:

- the request always returns success if the server receives it
- the raw payload is always stored first
- parser errors are logged but do not fail the webhook request

### `GET /state`

Returns:

- latest parsed event
- event history
- stored OB boxes
- OB tap match results
- tracked setup states
- derived reactions

### `GET /api/raw-events`

Returns:

- raw event count
- latest raw payload
- recent raw payload history

Raw alert storage rotates automatically at 500 stored alerts. When the limit is reached, the current raw-alert batch is archived under `data/archive/` and the next incoming alert starts a fresh raw-alert feed. This rotation only affects raw alerts; it does not clear Family Map clues, OB boxes, setups, history clues, candles, or Chart Lab data.

### `GET /api/candles`

Returns stored candle details. Candle storage is retained at 5000 rows per `symbol + timeframe`.

### `GET /api/candle-symbols`

Returns the symbols and candle markets available from stored candle data.

### `GET /api/structure-candles`

Returns materialized MTF candles for Chart Structure and later structure logic. Supported materialized timeframes are:

- `3m`
- `5m`
- `15m`
- `30m`
- `1h`
- `4h`

Each materialized candle includes `status: "forming"` or `status: "closed"`. Structure logic should use only closed materialized candles; the UI may display the forming candle visually.

### `GET /api/structure-candle-symbols`

Returns the symbols, timeframes, counts, and closed/forming counts available from materialized structure candles.

### `POST /archive-reset`

Archives and clears only the raw alert feed. This endpoint is intentionally separate from Family Map reset behavior.

### `POST /family-map-reset`

Clears live Family Map clue state only:

- latest parsed event
- parsed event history
- stored OB boxes
- OB tap matches
- setup state

It also clears saved manual history clues. It preserves raw alerts, candles, Chart Lab data, tree layout, and settings.

## Local Run

### Requirements

- Node.js
- npm

### Install

```bash
npm install
```

### Start

```bash
npm start
```

The server listens on:

```text
http://localhost:4000
```

Open the dashboard in a browser after the server starts.

## Persistence

V2 currently stores engine state in:

```text
data/engine-state.json
```

That state currently includes:

- latest parsed event
- parsed event history
- per-setup state
- raw payload history
- latest raw payload

## Current Limitations

- no database yet
- no authentication
- no duplicate-alert protection yet
- event progression is still intentionally simple
- raw history rotates into archive files at the 500-alert limit
- dashboard polling is basic
- package metadata still needs cleanup in some places outside this README

## V2 Intent

V2 is the active redesign workspace. The archived V1 folder is the safety copy; this folder is where the engine, dashboard, and trading logic can now be modified directly.

Initial direction:

- preserve anything useful from the existing webhook/dashboard foundation
- remove or reshape V1 assumptions when they get in the way
- make the engine model match the new trading direction before adding more features
