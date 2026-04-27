# Co-Trader Engine V2

## Overview

Co-Trader Engine V2 is the active working folder for the next direction of the trading engine.

V1 has been archived separately, so this folder can be changed freely. The current codebase still contains the V1 webhook intake, parser, state persistence, decision logic, and dashboard foundation until the V2 architecture replaces or reshapes those pieces.

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
- raw history is capped to a recent rolling window
- dashboard polling is basic
- package metadata still needs cleanup in some places outside this README

## V2 Intent

V2 is the active redesign workspace. The archived V1 folder is the safety copy; this folder is where the engine, dashboard, and trading logic can now be modified directly.

Initial direction:

- preserve anything useful from the existing webhook/dashboard foundation
- remove or reshape V1 assumptions when they get in the way
- make the engine model match the new trading direction before adding more features
