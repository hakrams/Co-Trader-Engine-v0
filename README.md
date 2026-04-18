# Co-Trader Engine V1

## Overview

Co-Trader Engine V1 is a webhook-driven trading event engine that receives TradingView alerts, normalizes market-structure events, tracks setup progression per symbol and timeframe, and exposes a live browser dashboard for observability.

This version is the next practical step after the original proof-of-concept. It keeps the same event-driven architecture, but adds a more structured parsing pipeline, raw payload visibility, and file-backed state persistence so the engine can survive restarts more reliably than the earlier in-memory-only flow.

## What V1 Currently Does

- accepts TradingView-style webhook payloads through `POST /webhook`
- captures every raw payload first, even if parsing fails
- normalizes event names, timeframe values, numeric fields, and metadata
- tracks setup progression per `symbol_timeframe`
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
  -> state update
  -> rule validation
  -> decision mapping
  -> persisted engine state
  -> dashboard + API visibility
```

## Project Structure

```text
co-trader-engine-v1/
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
5. The rule layer checks whether the transition is allowed.
6. The setup state is updated if valid.
7. The reaction layer exposes a decision such as `monitoring` or `actionable`.
8. The dashboard and API endpoints reflect the current engine view.

## Current Event Mapping

### Recognized normalized event types

- `choch`
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

V1 stores engine state in:

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

## V1 Intent

V1 should be treated as the practical stabilization layer after the earlier proof-of-concept:

- more observability
- better normalization
- restart-safe file persistence
- clearer separation between raw intake and parsed engine logic

It is still not a finished production system, but it is a stronger working foundation for the next layer of engine growth.
