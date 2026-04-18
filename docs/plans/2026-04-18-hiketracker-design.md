# HikeTracker — Design Document
**Date:** 2026-04-18

## Problem

Hikers have no objective way to know their current fitness level or whether they'll be ready for a goal event. Strava provides raw data but no hiker-specific analysis. GPS data from phones and watches is noisy, making raw metrics unreliable.

## Core Value Proposition

Connect Strava once → app pulls walking/hiking history → cleans and analyzes the data → tells you your current fitness level, trajectory, and readiness for a goal event.

## Scope

- Phase 1: single-user, runs locally via Docker
- Activity types: Hike and Walk only (as tagged in Strava)
- No manual GPX upload in v1 (Strava sync covers this)
- No billing, no multi-user auth

---

## Architecture

Three Docker services via Docker Compose:

```
┌─────────────────────────────────────────────┐
│              Docker Compose                  │
│                                              │
│  ┌──────────────┐      ┌──────────────────┐  │
│  │   Frontend   │      │     Backend      │  │
│  │  React/Vite  │◄────►│  FastAPI/Python  │  │
│  │  port 5173   │      │   port 8000      │  │
│  └──────────────┘      └────────┬─────────┘  │
│                                 │            │
│                        ┌────────▼─────────┐  │
│                        │     SQLite       │  │
│                        │  ./data/hike.db  │  │
│                        └──────────────────┘  │
└─────────────────────────────────────────────┘
                          │
                    ┌─────▼──────┐
                    │ Strava API │
                    │  (OAuth)   │
                    └────────────┘
```

**Key constraint:** no node_modules or Python packages on host machine. Everything runs inside containers. Source code is volume-mounted into containers.

**Data persistence:** SQLite file stored at `./data/hike.db` (bind mount, not Docker named volume). Data survives `docker compose down` and image deletion. `./data/` is gitignored.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Charts | Recharts |
| Maps | Leaflet + OpenStreetMap |
| Backend | Python FastAPI |
| Database | SQLite (via SQLAlchemy) |
| Containerization | Docker + Docker Compose |

---

## Data Model

### `activities`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| strava_id | TEXT UNIQUE | |
| name | TEXT | |
| date | DATETIME | |
| type | TEXT | Hike or Walk |
| raw_distance_m | REAL | |
| raw_duration_s | INTEGER | |
| raw_gpx | JSON | raw GPS stream from Strava |
| cleaned_gpx | JSON | after cleaning pipeline |
| cleaned_distance_m | REAL | |
| moving_time_s | INTEGER | excludes detected stops |
| elevation_gain_m | REAL | smoothed |
| avg_moving_pace | REAL | min/km, grade-adjusted |
| processed_at | DATETIME | |

### `activity_segments`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| activity_id | INTEGER FK | |
| km_index | INTEGER | 1-based |
| pace | REAL | min/km |
| elevation_change_m | REAL | |
| grade_adjusted_pace | REAL | min/km |
| is_stop | BOOLEAN | |

### `goals`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT | e.g. "Dodentocht 100km" |
| date | DATE | event date |
| distance_km | REAL | |
| elevation_gain_m | REAL | optional |
| notes | TEXT | |
| created_at | DATETIME | |

### `sync_state`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | always 1 row |
| last_synced_at | DATETIME | |
| strava_access_token | TEXT | |
| strava_refresh_token | TEXT | |
| token_expires_at | DATETIME | |

---

## Backend Modules

### `main.py`
FastAPI app and routes only — no business logic.

| Route | Method | Description |
|-------|--------|-------------|
| `/auth/strava` | GET | Redirect to Strava OAuth |
| `/auth/callback` | GET | Handle callback, store tokens |
| `/sync` | POST | Trigger sync of new Strava activities |
| `/activities` | GET | List all processed activities |
| `/activities/{id}` | GET | Single activity with full cleaned data |
| `/insights` | GET | Fitness trajectory + projections |
| `/goals` | GET | List goals with readiness assessment |
| `/goals` | POST | Create a goal event |

### `strava.py`
- Fetch new Hike/Walk activities since last sync
- Auto-refresh expired tokens
- Download raw GPS streams per activity

### `cleaner.py`
Sequential pipeline per activity:
1. Remove GPS outliers (points implying > 15 km/h walking speed)
2. Kalman filter for position smoothing
3. Detect stops (speed < 0.5 km/h for > 60s)
4. Smooth elevation with rolling average
5. Calculate grade-adjusted pace per km segment

Both raw and cleaned data are stored — pipeline can be re-run on historical data if the algorithm improves.

### `metrics.py`
- Per-activity: distance, moving time, pace, elevation gain, fatigue score
- Fatigue score: first 25% vs last 25% of grade-adjusted pace (elevation-normalized)
- Across activities: weekly volume, longest walk progression, pace trend
- Projections: readiness assessment per goal

---

## Frontend Pages

### `/dashboard`
- Fitness trend chart (12 weeks of weekly km)
- Fitness status indicator: Building / Maintaining / Declining
- Last 5 activities summary
- Sync button

### `/activities/{id}`
- Leaflet map: cleaned track + stop markers
- Key metrics: distance, moving time, avg pace, elevation gain
- Elevation profile (area chart)
- Pace vs distance (smoothed line chart)
- Per-km segment breakdown table
- Fatigue indicator: first vs last quarter comparison

### `/goals`
- Create goal: name, date, distance, elevation
- Per goal readiness assessment:
  - Current sustainable distance estimate
  - Projected ready date
  - Required training actions

### `/progress`
- Longest walk progression over time
- Weekly volume chart
- Grade-adjusted pace trend
- "If you keep this up..." projection line

---

## Projection Model

### Fitness Level
Derived from two signals:
1. **Weekly volume trend** — last 4 weeks vs previous 4 weeks
2. **Pace decay** — grade-adjusted pace drop from first to last km on long walks

### Goal Readiness (three checks)
1. **Distance gap** — longest recent walk vs goal distance
2. **Endurance ceiling** — distance at which pace degrades > 20% from opening pace
3. **Build rate** — historical growth rate of long walk distance, extrapolated to goal date

### Honest limitations
- Requires minimum 6 activities before showing projections
- Shows "not enough data" rather than a confidently wrong number
- Projections assume consistent training — flagged clearly in UI

---

## UI/UX

- Dark mode default
- Minimalist, data-focused
- Mobile-first layout
- No animations beyond smooth transitions
- PWA: installable, caches last sync result for offline viewing
