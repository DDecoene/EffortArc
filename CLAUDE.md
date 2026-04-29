# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Hiking analytics app that syncs activities from Strava, cleans GPS data, and shows fitness trajectory + goal readiness. Everything runs in Docker — no local Python or Node installs needed.

## Common Commands

```bash
# Start all services (frontend + backend)
docker compose up

# Start with a fresh build
docker compose up --build

# Run all backend tests
docker compose exec backend pytest -v

# Run a single test file
docker compose exec backend pytest tests/test_cleaner.py -v

# Run a single test by name
docker compose exec backend pytest tests/test_cleaner.py::test_function_name -v

# View backend logs live
docker compose logs backend -f

# Shell into backend container
docker compose exec backend bash

# Reset all data
docker compose down && rm data/hike.db
```

Frontend runs at http://localhost:5173, backend API at http://localhost:8000.

Frontend hot-reloads via Vite inside Docker (volume-mounted). Backend also hot-reloads (volume-mounted).

## Architecture

### Data Flow

1. **Strava OAuth** → `backend/strava.py` handles auth + token refresh + activity/stream fetching
2. **GPS Cleaning** → `backend/cleaner.py` runs on raw stream data: outlier removal → stop detection → elevation smoothing → per-km segment building → fatigue scoring
3. **Storage** → SQLite at `./data/hike.db` via SQLAlchemy. Models: `Activity`, `ActivitySegment`, `Goal`, `SyncState`
4. **Metrics** → `backend/metrics.py` computes fitness status, pace trend, weekly volume, goal readiness — all derived at query time from stored activities (no pre-computed aggregates)
5. **API** → FastAPI in `backend/main.py` exposes REST endpoints consumed by the frontend

### Key Backend Concepts

- `clean_activity()` in `cleaner.py` is the core processing function — takes raw GPS points `[{lat, lon, ele, time}, ...]`, returns cleaned points + segments + fatigue score
- Segments are 1km chunks with pace, elevation change, grade-adjusted pace, and stop classification
- `calculate_goal_readiness()` in `metrics.py` projects readiness based on recent longest walks and weekly growth rate
- `SyncState` table stores a single row with Strava tokens and last-sync timestamp

### Frontend Structure

- `src/services/api.ts` — all API calls, typed against `src/types.ts`
- `src/pages/` — route-level components (Dashboard, ActivityDetail, Progress, Goals)
- `src/components/` — shared UI (ActivityCard, FatigueIndicator, etc.)
- `VITE_API_URL` env var controls backend URL (set to `/api` in Docker, proxied by Vite)

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/strava` | Returns Strava OAuth URL |
| GET | `/auth/callback` | Handles OAuth redirect, stores tokens |
| GET | `/auth/status` | Connection + last sync time |
| POST | `/sync` | Fetches new activities from Strava, cleans + stores them |
| GET | `/activities` | List all activities (summary) |
| GET | `/activities/{id}` | Full activity detail with segments |
| GET | `/insights` | Fitness status, weekly volume, pace trend |
| GET | `/goals` | Goals with computed readiness |
| POST | `/goals` | Create a goal |

### Environment

Required in `.env`:
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

The `docker-compose.yml` may have hardcoded Cloudflare tunnel URLs in `FRONTEND_URL`/`BACKEND_URL` — these need updating when tunnels regenerate.
