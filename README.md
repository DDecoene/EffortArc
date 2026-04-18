# HikeTracker

Hiking analytics app. Syncs from Strava, cleans GPS data, and shows fitness trajectory + goal readiness.

## Setup

### 1. Get Strava API credentials

1. Go to https://www.strava.com/settings/api
2. Create an application:
   - App name: HikeTracker (local)
   - Category: Other
   - Authorization Callback Domain: `localhost`
3. Copy your **Client ID** and **Client Secret**

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET
```

### 3. Start the app

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

### 4. Connect Strava

1. Open http://localhost:5173/dashboard
2. Click **Connect Strava**
3. Authorize the app
4. Click **Sync Now** to pull your hiking history

## Development

All commands run inside Docker — nothing is installed on your machine.

```bash
# Start services
docker compose up

# Run backend tests
docker compose exec backend pytest -v

# View backend logs
docker compose logs backend -f

# Open a shell in the backend container
docker compose exec backend bash
```

## Data

Your activity data is stored in `./data/hike.db`. This file is gitignored.
To reset all data: `rm data/hike.db` then restart.

## Teardown

```bash
# Stop containers (data preserved)
docker compose down

# Stop and remove containers + images (data preserved)
docker compose down --rmi all

# Full reset including data
docker compose down --rmi all && rm data/hike.db
```
