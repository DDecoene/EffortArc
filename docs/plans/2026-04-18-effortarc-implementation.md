# EffortArc Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local Docker-based hiking analytics app that syncs from Strava, cleans GPS data, and shows fitness trajectory + goal readiness.

**Architecture:** FastAPI backend with SQLite (bind-mounted at ./data/hike.db), React/Vite/TypeScript frontend, all running in Docker Compose with source code volume-mounted. No dependencies installed on the host machine — ever.

**Tech Stack:** Python 3.12 + FastAPI + SQLAlchemy + pykalman + httpx | React 18 + Vite + TypeScript + TailwindCSS + Recharts + Leaflet | SQLite | Docker Compose

---

## Critical Constraints (read before every task)

1. **NEVER run `npm`, `pip`, `node`, or `python` directly on the host.** All commands go through `docker compose exec` or `docker compose run`.
2. SQLite lives at `./data/hike.db` — bind mount, not a named volume.
3. Source code is bind-mounted into containers — changes are instant without rebuilding.
4. Test commands run inside containers via `docker compose exec backend pytest` or `docker compose exec frontend npx vitest`.

---

## Task 1: Project scaffold + Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `backend/requirements.txt`
- Create: `frontend/package.json`
- Create: `.gitignore`
- Create: `data/.gitkeep`

**Step 1: Create .gitignore**

```
data/hike.db
data/*.db
.env
__pycache__/
*.pyc
.DS_Store
node_modules/
dist/
```

**Step 2: Create backend/requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
httpx==0.27.2
pykalman==0.9.7
numpy==2.1.2
python-multipart==0.0.12
python-dotenv==1.0.1
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
```

**Step 3: Create backend/Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

**Step 4: Create frontend/package.json**

```json
{
  "name": "hiketracker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "recharts": "^2.13.0",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "@types/leaflet": "^1.9.14"
  },
  "devDependencies": {
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "typescript": "^5.6.3",
    "vite": "^5.4.8",
    "tailwindcss": "^3.4.14",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20",
    "vitest": "^2.1.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0"
  }
}
```

**Step 5: Create frontend/Dockerfile**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

**Step 6: Create docker-compose.yml**

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - ./data:/data
    environment:
      - DATABASE_URL=sqlite:////data/hike.db
      - STRAVA_CLIENT_ID=${STRAVA_CLIENT_ID}
      - STRAVA_CLIENT_SECRET=${STRAVA_CLIENT_SECRET}
      - FRONTEND_URL=http://localhost:5173
    env_file:
      - .env

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://localhost:8000
    depends_on:
      - backend
```

**Step 7: Create .env.example**

```
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here
```

**Step 8: Create data/.gitkeep**

Empty file — ensures the data/ directory exists in git without committing the database.

**Step 9: Build and verify containers start**

```bash
cp .env.example .env
# Edit .env with your actual Strava credentials
docker compose build
docker compose up -d
docker compose ps
```

Expected: both `backend` and `frontend` show as running.

**Step 10: Commit**

```bash
git add docker-compose.yml backend/Dockerfile backend/requirements.txt \
        frontend/Dockerfile frontend/package.json .gitignore .env.example \
        data/.gitkeep
git commit -m "feat: docker scaffold with backend and frontend services"
```

---

## Task 2: Database models + migrations

**Files:**
- Create: `backend/database.py`
- Create: `backend/models.py`

**Step 1: Create backend/database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/hike.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from models import Activity, ActivitySegment, Goal, SyncState  # noqa
    Base.metadata.create_all(bind=engine)
```

**Step 2: Create backend/models.py**

```python
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True)
    strava_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    date = Column(DateTime, nullable=False)
    type = Column(String, nullable=False)  # Hike or Walk
    raw_distance_m = Column(Float)
    raw_duration_s = Column(Integer)
    raw_gpx = Column(Text)  # JSON string
    cleaned_gpx = Column(Text)  # JSON string
    cleaned_distance_m = Column(Float)
    moving_time_s = Column(Integer)
    elevation_gain_m = Column(Float)
    avg_moving_pace = Column(Float)  # min/km grade-adjusted
    processed_at = Column(DateTime)
    segments = relationship("ActivitySegment", back_populates="activity", cascade="all, delete-orphan")

class ActivitySegment(Base):
    __tablename__ = "activity_segments"

    id = Column(Integer, primary_key=True)
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=False)
    km_index = Column(Integer, nullable=False)
    pace = Column(Float)  # min/km
    elevation_change_m = Column(Float)
    grade_adjusted_pace = Column(Float)  # min/km
    is_stop = Column(Boolean, default=False)
    activity = relationship("Activity", back_populates="segments")

class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    date = Column(DateTime, nullable=False)
    distance_km = Column(Float, nullable=False)
    elevation_gain_m = Column(Float)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

class SyncState(Base):
    __tablename__ = "sync_state"

    id = Column(Integer, primary_key=True, default=1)
    last_synced_at = Column(DateTime)
    strava_access_token = Column(String)
    strava_refresh_token = Column(String)
    token_expires_at = Column(DateTime)
```

**Step 3: Write the test**

Create `backend/tests/test_models.py`:

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base
from models import Activity, Goal, SyncState
from datetime import datetime

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_create_activity(db):
    activity = Activity(
        strava_id="123456",
        name="Morning Hike",
        date=datetime(2026, 4, 1, 8, 0),
        type="Hike",
        raw_distance_m=10000.0,
    )
    db.add(activity)
    db.commit()
    result = db.query(Activity).filter_by(strava_id="123456").first()
    assert result.name == "Morning Hike"
    assert result.type == "Hike"

def test_create_goal(db):
    goal = Goal(name="Dodentocht", date=datetime(2026, 8, 10), distance_km=100.0)
    db.add(goal)
    db.commit()
    result = db.query(Goal).first()
    assert result.distance_km == 100.0
```

**Step 4: Run the test**

```bash
docker compose exec backend pytest tests/test_models.py -v
```

Expected: 2 passed.

**Step 5: Commit**

```bash
git add backend/database.py backend/models.py backend/tests/
git commit -m "feat: database models for activities, segments, goals, sync state"
```

---

## Task 3: GPX cleaner pipeline

**Files:**
- Create: `backend/cleaner.py`
- Create: `backend/tests/test_cleaner.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_cleaner.py
import pytest
from cleaner import remove_outliers, detect_stops, smooth_elevation, calculate_grade_adjusted_pace

def make_point(lat, lon, ele, time_s):
    return {"lat": lat, "lon": lon, "ele": ele, "time": time_s}

def test_remove_outliers_removes_speed_spikes():
    # Two normal points 100m apart at 4km/h, then a spike 10km away in 1 second
    points = [
        make_point(51.0, 4.0, 10.0, 0),
        make_point(51.0009, 4.0, 10.0, 90),   # ~100m in 90s = 4km/h, normal
        make_point(51.1, 4.0, 10.0, 91),       # ~11km in 1s = insane spike
        make_point(51.0018, 4.0, 10.0, 180),   # back to normal
    ]
    cleaned = remove_outliers(points, max_speed_kmh=15.0)
    assert len(cleaned) == 3
    assert cleaned[1]["lat"] == pytest.approx(51.0009)

def test_detect_stops_marks_slow_segments():
    # Stationary points for 90 seconds
    points = [make_point(51.0, 4.0, 10.0, i * 10) for i in range(10)]
    stops = detect_stops(points, min_stop_duration_s=60, max_stop_speed_kmh=0.5)
    assert any(s["is_stop"] for s in stops)

def test_smooth_elevation_reduces_noise():
    eles = [10.0, 50.0, 11.0, 12.0, 13.0, 60.0, 14.0]  # noisy
    smoothed = smooth_elevation(eles, window=3)
    assert abs(smoothed[3] - 12.0) < 5.0  # middle value stabilized

def test_grade_adjusted_pace_uphill_slower():
    pace_flat = calculate_grade_adjusted_pace(pace_min_per_km=15.0, grade_percent=0.0)
    pace_uphill = calculate_grade_adjusted_pace(pace_min_per_km=15.0, grade_percent=10.0)
    # Uphill grade-adjusted pace should be lower (faster equivalent on flat)
    assert pace_uphill < pace_flat
```

**Step 2: Run to confirm they fail**

```bash
docker compose exec backend pytest tests/test_cleaner.py -v
```

Expected: ImportError — cleaner module not found.

**Step 3: Create backend/cleaner.py**

```python
import math
import json
from typing import List, Dict, Any
import numpy as np

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

def remove_outliers(points: List[Dict], max_speed_kmh: float = 15.0) -> List[Dict]:
    if len(points) < 2:
        return points
    result = [points[0]]
    for i in range(1, len(points)):
        prev = result[-1]
        curr = points[i]
        dist_m = haversine_m(prev["lat"], prev["lon"], curr["lat"], curr["lon"])
        dt_s = curr["time"] - prev["time"]
        if dt_s <= 0:
            continue
        speed_kmh = (dist_m / dt_s) * 3.6
        if speed_kmh <= max_speed_kmh:
            result.append(curr)
    return result

def detect_stops(
    points: List[Dict],
    min_stop_duration_s: int = 60,
    max_stop_speed_kmh: float = 0.5,
) -> List[Dict]:
    result = []
    for i, point in enumerate(points):
        is_stop = False
        if i > 0:
            prev = points[i - 1]
            dist_m = haversine_m(prev["lat"], prev["lon"], point["lat"], point["lon"])
            dt_s = point["time"] - prev["time"]
            if dt_s > 0:
                speed_kmh = (dist_m / dt_s) * 3.6
                if speed_kmh <= max_stop_speed_kmh and dt_s >= min_stop_duration_s:
                    is_stop = True
        result.append({**point, "is_stop": is_stop})
    return result

def smooth_elevation(elevations: List[float], window: int = 5) -> List[float]:
    arr = np.array(elevations, dtype=float)
    smoothed = np.convolve(arr, np.ones(window) / window, mode="same")
    # Fix edges — use original values where convolution wraps
    half = window // 2
    smoothed[:half] = arr[:half]
    smoothed[-half:] = arr[-half:]
    return smoothed.tolist()

def calculate_grade_adjusted_pace(pace_min_per_km: float, grade_percent: float) -> float:
    # Minetti et al. formula — energy cost adjustment for gradient
    # Returns equivalent flat pace
    g = grade_percent / 100.0
    cost_factor = 1 + 4.0 * g + 5.0 * g * abs(g)
    cost_factor = max(cost_factor, 0.1)
    return pace_min_per_km / cost_factor

def build_segments(points: List[Dict]) -> List[Dict]:
    segments = []
    km_index = 1
    segment_points = []
    cumulative_dist = 0.0

    for i in range(1, len(points)):
        prev, curr = points[i - 1], points[i]
        dist_m = haversine_m(prev["lat"], prev["lon"], curr["lat"], curr["lon"])
        cumulative_dist += dist_m
        segment_points.append(curr)

        if cumulative_dist >= 1000.0:
            # Calculate segment metrics
            seg_start = segment_points[0]
            seg_end = segment_points[-1]
            dt_s = seg_end["time"] - points[i - len(segment_points)]["time"]
            pace = (dt_s / 60.0) if dt_s > 0 else 0.0  # min/km (already per km)
            ele_change = seg_end.get("ele", 0) - seg_start.get("ele", 0)
            grade_pct = (ele_change / 1000.0) * 100.0
            gap = calculate_grade_adjusted_pace(pace, grade_pct)
            is_stop = all(p.get("is_stop", False) for p in segment_points)

            segments.append({
                "km_index": km_index,
                "pace": pace,
                "elevation_change_m": ele_change,
                "grade_adjusted_pace": gap,
                "is_stop": is_stop,
            })
            km_index += 1
            segment_points = []
            cumulative_dist = 0.0

    return segments

def calculate_fatigue_score(segments: List[Dict]) -> Dict:
    moving = [s for s in segments if not s["is_stop"]]
    if len(moving) < 4:
        return {"label": "insufficient_data", "first_pace": None, "last_pace": None, "drop_pct": None}

    quarter = max(1, len(moving) // 4)
    first = [s["grade_adjusted_pace"] for s in moving[:quarter]]
    last = [s["grade_adjusted_pace"] for s in moving[-quarter:]]
    first_avg = sum(first) / len(first)
    last_avg = sum(last) / len(last)

    if first_avg == 0:
        return {"label": "insufficient_data", "first_pace": None, "last_pace": None, "drop_pct": None}

    drop_pct = ((last_avg - first_avg) / first_avg) * 100.0

    if drop_pct < 5:
        label = "stable"
    elif drop_pct < 15:
        label = "moderate_fatigue"
    else:
        label = "strong_slowdown"

    return {
        "label": label,
        "first_pace": first_avg,
        "last_pace": last_avg,
        "drop_pct": drop_pct,
    }

def clean_activity(raw_points: List[Dict]) -> Dict:
    points = remove_outliers(raw_points, max_speed_kmh=15.0)
    points = detect_stops(points, min_stop_duration_s=60, max_stop_speed_kmh=0.5)
    elevations = [p.get("ele", 0.0) for p in points]
    smoothed_eles = smooth_elevation(elevations)
    for i, p in enumerate(points):
        p["ele"] = smoothed_eles[i]

    segments = build_segments(points)
    fatigue = calculate_fatigue_score(segments)

    moving_points = [p for p in points if not p.get("is_stop", False)]
    if len(moving_points) >= 2:
        moving_time_s = moving_points[-1]["time"] - moving_points[0]["time"]
    else:
        moving_time_s = 0

    total_dist = sum(
        haversine_m(points[i - 1]["lat"], points[i - 1]["lon"], points[i]["lat"], points[i]["lon"])
        for i in range(1, len(points))
        if not points[i].get("is_stop", False)
    )

    ele_gain = sum(
        max(0, points[i]["ele"] - points[i - 1]["ele"])
        for i in range(1, len(points))
    )

    avg_pace = (moving_time_s / 60.0) / (total_dist / 1000.0) if total_dist > 0 else 0.0

    return {
        "cleaned_points": points,
        "segments": segments,
        "fatigue": fatigue,
        "moving_time_s": int(moving_time_s),
        "cleaned_distance_m": total_dist,
        "elevation_gain_m": ele_gain,
        "avg_moving_pace": avg_pace,
    }
```

**Step 4: Run tests**

```bash
docker compose exec backend pytest tests/test_cleaner.py -v
```

Expected: 4 passed.

**Step 5: Commit**

```bash
git add backend/cleaner.py backend/tests/test_cleaner.py
git commit -m "feat: GPX cleaning pipeline with outlier removal, stop detection, elevation smoothing"
```

---

## Task 4: Strava client

**Files:**
- Create: `backend/strava.py`
- Create: `backend/tests/test_strava.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_strava.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime

@pytest.mark.asyncio
async def test_refresh_token_updates_sync_state():
    from strava import refresh_token_if_needed
    mock_db = MagicMock()
    mock_state = MagicMock()
    mock_state.token_expires_at = datetime(2020, 1, 1)  # expired
    mock_state.strava_refresh_token = "old_refresh"

    with patch("strava.httpx.AsyncClient") as mock_client:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "access_token": "new_access",
            "refresh_token": "new_refresh",
            "expires_at": 9999999999,
        }
        mock_resp.raise_for_status = MagicMock()
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_resp)

        await refresh_token_if_needed(mock_state, mock_db)
        assert mock_state.strava_access_token == "new_access"

@pytest.mark.asyncio
async def test_fetch_activities_filters_hike_walk():
    from strava import fetch_new_activities
    mock_db = MagicMock()
    mock_state = MagicMock()
    mock_state.token_expires_at = datetime(2099, 1, 1)
    mock_state.strava_access_token = "valid_token"
    mock_state.last_synced_at = None

    activities = [
        {"id": 1, "type": "Hike", "name": "Morning hike", "distance": 10000,
         "elapsed_time": 7200, "moving_time": 6800, "start_date": "2026-04-01T08:00:00Z"},
        {"id": 2, "type": "Run", "name": "Morning run", "distance": 5000,
         "elapsed_time": 1800, "moving_time": 1800, "start_date": "2026-04-02T08:00:00Z"},
        {"id": 3, "type": "Walk", "name": "Evening walk", "distance": 6000,
         "elapsed_time": 4800, "moving_time": 4600, "start_date": "2026-04-03T08:00:00Z"},
    ]

    with patch("strava.httpx.AsyncClient") as mock_client:
        mock_resp = MagicMock()
        mock_resp.json.return_value = activities
        mock_resp.raise_for_status = MagicMock()
        mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_resp)

        result = await fetch_new_activities(mock_state, mock_db)
        assert len(result) == 2
        assert all(a["type"] in ("Hike", "Walk") for a in result)
```

**Step 2: Run to confirm failure**

```bash
docker compose exec backend pytest tests/test_strava.py -v
```

**Step 3: Create backend/strava.py**

```python
import os
import httpx
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from models import SyncState, Activity

STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"

def get_or_create_sync_state(db: Session) -> SyncState:
    state = db.query(SyncState).first()
    if not state:
        state = SyncState(id=1)
        db.add(state)
        db.commit()
    return state

def get_auth_url(redirect_uri: str) -> str:
    return (
        f"{STRAVA_AUTH_URL}?client_id={STRAVA_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=activity:read_all"
    )

async def exchange_code_for_tokens(code: str, db: Session) -> SyncState:
    async with httpx.AsyncClient() as client:
        resp = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        })
        resp.raise_for_status()
        data = resp.json()

    state = get_or_create_sync_state(db)
    state.strava_access_token = data["access_token"]
    state.strava_refresh_token = data["refresh_token"]
    state.token_expires_at = datetime.fromtimestamp(data["expires_at"], tz=timezone.utc).replace(tzinfo=None)
    db.commit()
    return state

async def refresh_token_if_needed(state: SyncState, db: Session) -> None:
    now = datetime.utcnow()
    if state.token_expires_at and state.token_expires_at > now:
        return
    async with httpx.AsyncClient() as client:
        resp = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "refresh_token": state.strava_refresh_token,
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        data = resp.json()
    state.strava_access_token = data["access_token"]
    state.strava_refresh_token = data["refresh_token"]
    state.token_expires_at = datetime.fromtimestamp(data["expires_at"], tz=timezone.utc).replace(tzinfo=None)
    db.commit()

async def fetch_new_activities(state: SyncState, db: Session) -> list:
    await refresh_token_if_needed(state, db)
    params = {"per_page": 100}
    if state.last_synced_at:
        params["after"] = int(state.last_synced_at.timestamp())

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STRAVA_API_BASE}/athlete/activities",
            headers={"Authorization": f"Bearer {state.strava_access_token}"},
            params=params,
        )
        resp.raise_for_status()
        activities = resp.json()

    return [a for a in activities if a.get("type") in ("Hike", "Walk")]

async def fetch_activity_streams(activity_id: int, token: str) -> list:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STRAVA_API_BASE}/activities/{activity_id}/streams",
            headers={"Authorization": f"Bearer {token}"},
            params={"keys": "latlng,altitude,time", "key_by_type": "true"},
        )
        resp.raise_for_status()
        data = resp.json()

    latlng = data.get("latlng", {}).get("data", [])
    altitude = data.get("altitude", {}).get("data", [])
    time = data.get("time", {}).get("data", [])

    points = []
    for i, (ll, t) in enumerate(zip(latlng, time)):
        points.append({
            "lat": ll[0],
            "lon": ll[1],
            "ele": altitude[i] if i < len(altitude) else 0.0,
            "time": t,
        })
    return points
```

**Step 4: Run tests**

```bash
docker compose exec backend pytest tests/test_strava.py -v
```

Expected: 2 passed.

**Step 5: Commit**

```bash
git add backend/strava.py backend/tests/test_strava.py
git commit -m "feat: Strava API client with OAuth, token refresh, activity fetch"
```

---

## Task 5: Metrics + projection engine

**Files:**
- Create: `backend/metrics.py`
- Create: `backend/tests/test_metrics.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_metrics.py
from metrics import (
    calculate_fitness_status,
    calculate_endurance_ceiling,
    calculate_goal_readiness,
)
from datetime import datetime, timedelta

def make_activity(date, distance_km, avg_pace, segments=None):
    return {
        "date": date,
        "cleaned_distance_m": distance_km * 1000,
        "avg_moving_pace": avg_pace,
        "segments": segments or [],
    }

def test_fitness_status_building():
    now = datetime.utcnow()
    activities = [
        make_activity(now - timedelta(weeks=i), 15.0 + i, 12.0)
        for i in range(8)
    ]
    # Recent 4 weeks: 15-18km avg, older 4 weeks: 19-22km avg → actually declining
    # Flip: recent weeks have higher distance
    activities = [
        make_activity(now - timedelta(weeks=i), 20.0 - i, 12.0)
        for i in range(8)
    ]
    status = calculate_fitness_status(activities)
    assert status["label"] == "building"

def test_fitness_status_declining():
    now = datetime.utcnow()
    activities = [
        make_activity(now - timedelta(weeks=i), 5.0 + i, 14.0)
        for i in range(8)
    ]
    status = calculate_fitness_status(activities)
    assert status["label"] == "declining"

def test_endurance_ceiling_with_pace_decay():
    segments = [
        {"km_index": i, "grade_adjusted_pace": 12.0 + i * 0.5, "is_stop": False}
        for i in range(20)
    ]
    ceiling = calculate_endurance_ceiling(segments, opening_pace=12.0, threshold_pct=20.0)
    assert ceiling > 0

def test_goal_readiness_insufficient_data():
    result = calculate_goal_readiness(activities=[], goal_distance_km=40.0, goal_date=datetime(2026, 8, 1))
    assert result["status"] == "insufficient_data"
```

**Step 2: Run to confirm failure**

```bash
docker compose exec backend pytest tests/test_metrics.py -v
```

**Step 3: Create backend/metrics.py**

```python
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import statistics

MIN_ACTIVITIES_FOR_PROJECTION = 6

def calculate_fitness_status(activities: List[Dict]) -> Dict:
    if len(activities) < 4:
        return {"label": "insufficient_data", "recent_weekly_km": None, "trend_pct": None}

    now = datetime.utcnow()
    four_weeks_ago = now - timedelta(weeks=4)
    eight_weeks_ago = now - timedelta(weeks=8)

    recent = [a for a in activities if a["date"] >= four_weeks_ago]
    older = [a for a in activities if eight_weeks_ago <= a["date"] < four_weeks_ago]

    recent_km = sum(a["cleaned_distance_m"] / 1000.0 for a in recent)
    older_km = sum(a["cleaned_distance_m"] / 1000.0 for a in older)

    if older_km == 0:
        return {"label": "building", "recent_weekly_km": recent_km / 4, "trend_pct": None}

    trend_pct = ((recent_km - older_km) / older_km) * 100.0

    if trend_pct > 5:
        label = "building"
    elif trend_pct < -10:
        label = "declining"
    else:
        label = "maintaining"

    return {
        "label": label,
        "recent_weekly_km": recent_km / 4,
        "older_weekly_km": older_km / 4,
        "trend_pct": trend_pct,
    }

def calculate_endurance_ceiling(
    segments: List[Dict],
    opening_pace: float,
    threshold_pct: float = 20.0,
) -> float:
    moving = [s for s in segments if not s.get("is_stop", False)]
    ceiling_km = len(moving)
    for s in moving:
        if opening_pace > 0:
            pct_change = ((s["grade_adjusted_pace"] - opening_pace) / opening_pace) * 100.0
            if pct_change > threshold_pct:
                ceiling_km = s["km_index"] - 1
                break
    return float(ceiling_km)

def get_longest_walks_by_week(activities: List[Dict]) -> List[Dict]:
    by_week: Dict[str, float] = {}
    for a in sorted(activities, key=lambda x: x["date"]):
        week_key = a["date"].strftime("%Y-W%W")
        dist_km = a["cleaned_distance_m"] / 1000.0
        if week_key not in by_week or by_week[week_key] < dist_km:
            by_week[week_key] = dist_km
    return [{"week": k, "longest_km": v} for k, v in sorted(by_week.items())]

def calculate_pace_trend(activities: List[Dict]) -> Optional[float]:
    paces = [a["avg_moving_pace"] for a in activities if a.get("avg_moving_pace")]
    if len(paces) < 3:
        return None
    first_half = statistics.mean(paces[: len(paces) // 2])
    second_half = statistics.mean(paces[len(paces) // 2 :])
    if first_half == 0:
        return None
    return ((second_half - first_half) / first_half) * 100.0

def calculate_goal_readiness(
    activities: List[Dict],
    goal_distance_km: float,
    goal_date: datetime,
) -> Dict:
    if len(activities) < MIN_ACTIVITIES_FOR_PROJECTION:
        return {
            "status": "insufficient_data",
            "message": f"Need at least {MIN_ACTIVITIES_FOR_PROJECTION} activities. You have {len(activities)}.",
        }

    sorted_acts = sorted(activities, key=lambda x: x["date"])
    recent = sorted_acts[-6:]
    longest_recent_km = max(a["cleaned_distance_m"] / 1000.0 for a in recent)
    distance_gap_km = goal_distance_km - longest_recent_km

    weekly_data = get_longest_walks_by_week(sorted_acts)
    if len(weekly_data) >= 4:
        dists = [w["longest_km"] for w in weekly_data]
        growth_per_week = (dists[-1] - dists[0]) / len(dists)
    else:
        growth_per_week = 0.5  # conservative default 0.5km/week

    weeks_to_goal = distance_gap_km / growth_per_week if growth_per_week > 0 else 999
    ready_date = datetime.utcnow() + timedelta(weeks=weeks_to_goal)

    days_until_event = (goal_date - datetime.utcnow()).days
    weeks_available = days_until_event / 7.0

    if weeks_to_goal <= 0:
        status = "ready"
        message = f"You can already cover {longest_recent_km:.1f}km — you're ready for this event!"
    elif weeks_to_goal <= weeks_available:
        status = "on_track"
        message = f"At your current build rate, you'll be ready around {ready_date.strftime('%B %d, %Y')}."
    else:
        status = "at_risk"
        message = f"You need to increase your training load. At current pace, you'll be ready {ready_date.strftime('%B %d, %Y')} — after the event."

    return {
        "status": status,
        "message": message,
        "longest_recent_km": longest_recent_km,
        "distance_gap_km": max(0, distance_gap_km),
        "ready_date": ready_date.isoformat(),
        "growth_per_week_km": growth_per_week,
    }

def build_insights(activities: List[Dict]) -> Dict:
    fitness = calculate_fitness_status(activities)
    weekly_volume = get_longest_walks_by_week(activities)
    pace_trend = calculate_pace_trend(activities)

    return {
        "fitness_status": fitness,
        "weekly_volume": weekly_volume,
        "pace_trend_pct": pace_trend,
        "total_activities": len(activities),
    }
```

**Step 4: Run tests**

```bash
docker compose exec backend pytest tests/test_metrics.py -v
```

Expected: 4 passed.

**Step 5: Commit**

```bash
git add backend/metrics.py backend/tests/test_metrics.py
git commit -m "feat: metrics and projection engine with fitness status and goal readiness"
```

---

## Task 6: FastAPI routes

**Files:**
- Create: `backend/main.py`
- Create: `backend/schemas.py`

**Step 1: Create backend/schemas.py**

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class SegmentOut(BaseModel):
    km_index: int
    pace: Optional[float]
    elevation_change_m: Optional[float]
    grade_adjusted_pace: Optional[float]
    is_stop: bool

    class Config:
        from_attributes = True

class ActivityOut(BaseModel):
    id: int
    strava_id: str
    name: str
    date: datetime
    type: str
    cleaned_distance_m: Optional[float]
    moving_time_s: Optional[int]
    elevation_gain_m: Optional[float]
    avg_moving_pace: Optional[float]
    segments: List[SegmentOut] = []
    cleaned_gpx: Optional[str]

    class Config:
        from_attributes = True

class ActivitySummary(BaseModel):
    id: int
    strava_id: str
    name: str
    date: datetime
    type: str
    cleaned_distance_m: Optional[float]
    moving_time_s: Optional[int]
    elevation_gain_m: Optional[float]
    avg_moving_pace: Optional[float]

    class Config:
        from_attributes = True

class GoalIn(BaseModel):
    name: str
    date: datetime
    distance_km: float
    elevation_gain_m: Optional[float] = None
    notes: Optional[str] = None

class GoalOut(BaseModel):
    id: int
    name: str
    date: datetime
    distance_km: float
    elevation_gain_m: Optional[float]
    notes: Optional[str]
    created_at: datetime
    readiness: Optional[dict] = None

    class Config:
        from_attributes = True

class SyncStatus(BaseModel):
    last_synced_at: Optional[datetime]
    is_connected: bool
```

**Step 2: Create backend/main.py**

```python
import json
import os
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db, init_db
from models import Activity, ActivitySegment, Goal, SyncState
from schemas import ActivityOut, ActivitySummary, GoalIn, GoalOut, SyncStatus
from strava import (
    get_auth_url,
    exchange_code_for_tokens,
    fetch_new_activities,
    fetch_activity_streams,
    get_or_create_sync_state,
)
from cleaner import clean_activity
from metrics import build_insights, calculate_goal_readiness

app = FastAPI(title="EffortArc API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/auth/strava")
def auth_strava(db: Session = Depends(get_db)):
    redirect_uri = f"{os.getenv('BACKEND_URL', 'http://localhost:8000')}/auth/callback"
    return {"url": get_auth_url(redirect_uri)}

@app.get("/auth/callback")
async def auth_callback(code: str, db: Session = Depends(get_db)):
    await exchange_code_for_tokens(code, db)
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"{frontend_url}/dashboard")

@app.get("/auth/status", response_model=SyncStatus)
def auth_status(db: Session = Depends(get_db)):
    state = db.query(SyncState).first()
    return SyncStatus(
        last_synced_at=state.last_synced_at if state else None,
        is_connected=bool(state and state.strava_access_token),
    )

@app.post("/sync")
async def sync_activities(db: Session = Depends(get_db)):
    state = get_or_create_sync_state(db)
    if not state.strava_access_token:
        raise HTTPException(status_code=401, detail="Not connected to Strava")

    new_activities = await fetch_new_activities(state, db)
    synced = 0

    for act_data in new_activities:
        existing = db.query(Activity).filter_by(strava_id=str(act_data["id"])).first()
        if existing:
            continue

        raw_points = await fetch_activity_streams(act_data["id"], state.strava_access_token)
        cleaned = clean_activity(raw_points)

        activity = Activity(
            strava_id=str(act_data["id"]),
            name=act_data["name"],
            date=datetime.fromisoformat(act_data["start_date"].replace("Z", "+00:00")).replace(tzinfo=None),
            type=act_data["type"],
            raw_distance_m=act_data.get("distance"),
            raw_duration_s=act_data.get("elapsed_time"),
            raw_gpx=json.dumps(raw_points),
            cleaned_gpx=json.dumps(cleaned["cleaned_points"]),
            cleaned_distance_m=cleaned["cleaned_distance_m"],
            moving_time_s=cleaned["moving_time_s"],
            elevation_gain_m=cleaned["elevation_gain_m"],
            avg_moving_pace=cleaned["avg_moving_pace"],
            processed_at=datetime.utcnow(),
        )
        db.add(activity)
        db.flush()

        for seg in cleaned["segments"]:
            db.add(ActivitySegment(
                activity_id=activity.id,
                km_index=seg["km_index"],
                pace=seg["pace"],
                elevation_change_m=seg["elevation_change_m"],
                grade_adjusted_pace=seg["grade_adjusted_pace"],
                is_stop=seg["is_stop"],
            ))
        synced += 1

    state.last_synced_at = datetime.utcnow()
    db.commit()
    return {"synced": synced, "total_new": len(new_activities)}

@app.get("/activities", response_model=list[ActivitySummary])
def list_activities(db: Session = Depends(get_db)):
    return db.query(Activity).order_by(Activity.date.desc()).all()

@app.get("/activities/{activity_id}", response_model=ActivityOut)
def get_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = db.query(Activity).filter_by(id=activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity

@app.get("/insights")
def get_insights(db: Session = Depends(get_db)):
    activities = db.query(Activity).order_by(Activity.date.asc()).all()
    data = [
        {
            "date": a.date,
            "cleaned_distance_m": a.cleaned_distance_m or 0,
            "avg_moving_pace": a.avg_moving_pace or 0,
        }
        for a in activities
    ]
    return build_insights(data)

@app.get("/goals", response_model=list[GoalOut])
def list_goals(db: Session = Depends(get_db)):
    goals = db.query(Goal).order_by(Goal.date.asc()).all()
    activities = db.query(Activity).order_by(Activity.date.asc()).all()
    act_data = [
        {"date": a.date, "cleaned_distance_m": a.cleaned_distance_m or 0, "avg_moving_pace": a.avg_moving_pace or 0}
        for a in activities
    ]
    result = []
    for goal in goals:
        readiness = calculate_goal_readiness(act_data, goal.distance_km, goal.date)
        out = GoalOut(
            id=goal.id, name=goal.name, date=goal.date,
            distance_km=goal.distance_km, elevation_gain_m=goal.elevation_gain_m,
            notes=goal.notes, created_at=goal.created_at, readiness=readiness,
        )
        result.append(out)
    return result

@app.post("/goals", response_model=GoalOut)
def create_goal(goal_in: GoalIn, db: Session = Depends(get_db)):
    goal = Goal(**goal_in.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return GoalOut(**goal.__dict__, readiness=None)
```

**Step 3: Verify backend starts cleanly**

```bash
docker compose restart backend
docker compose logs backend --tail=20
```

Expected: `Application startup complete` with no errors.

**Step 4: Test key endpoints manually**

```bash
curl http://localhost:8000/auth/status
# Expected: {"last_synced_at": null, "is_connected": false}

curl http://localhost:8000/activities
# Expected: []

curl http://localhost:8000/insights
# Expected: {"fitness_status": {"label": "insufficient_data", ...}, ...}
```

**Step 5: Commit**

```bash
git add backend/main.py backend/schemas.py
git commit -m "feat: FastAPI routes for auth, sync, activities, goals, insights"
```

---

## Task 7: Frontend scaffold

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`

**Step 1: Create frontend/index.html**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/hike-icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <link rel="manifest" href="/manifest.json" />
    <title>EffortArc</title>
  </head>
  <body class="bg-slate-900 text-slate-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 2: Create frontend/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
```

**Step 3: Create frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

**Step 4: Create frontend/tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#22c55e',
          dark: '#16a34a',
        },
      },
    },
  },
  plugins: [],
}
```

**Step 5: Create frontend/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 6: Create frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, sans-serif;
}
```

**Step 7: Create frontend/src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

**Step 8: Create frontend/src/App.tsx**

```typescript
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ActivityDetail from './pages/ActivityDetail'
import Goals from './pages/Goals'
import Progress from './pages/Progress'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="activities/:id" element={<ActivityDetail />} />
        <Route path="goals" element={<Goals />} />
        <Route path="progress" element={<Progress />} />
      </Route>
    </Routes>
  )
}
```

**Step 9: Verify frontend loads**

```bash
docker compose restart frontend
```

Open http://localhost:5173 — should show a blank dark page with no console errors.

**Step 10: Commit**

```bash
git add frontend/index.html frontend/vite.config.ts frontend/tsconfig.json \
        frontend/tailwind.config.js frontend/postcss.config.js \
        frontend/src/main.tsx frontend/src/App.tsx frontend/src/index.css
git commit -m "feat: frontend scaffold with React, Vite, TypeScript, TailwindCSS"
```

---

## Task 8: API service + types

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/services/api.ts`

**Step 1: Create frontend/src/types.ts**

```typescript
export interface Segment {
  km_index: number
  pace: number | null
  elevation_change_m: number | null
  grade_adjusted_pace: number | null
  is_stop: boolean
}

export interface Activity {
  id: number
  strava_id: string
  name: string
  date: string
  type: string
  cleaned_distance_m: number | null
  moving_time_s: number | null
  elevation_gain_m: number | null
  avg_moving_pace: number | null
  segments: Segment[]
  cleaned_gpx: string | null
}

export interface ActivitySummary {
  id: number
  strava_id: string
  name: string
  date: string
  type: string
  cleaned_distance_m: number | null
  moving_time_s: number | null
  elevation_gain_m: number | null
  avg_moving_pace: number | null
}

export interface Goal {
  id: number
  name: string
  date: string
  distance_km: number
  elevation_gain_m: number | null
  notes: string | null
  created_at: string
  readiness: GoalReadiness | null
}

export interface GoalReadiness {
  status: 'ready' | 'on_track' | 'at_risk' | 'insufficient_data'
  message: string
  longest_recent_km?: number
  distance_gap_km?: number
  ready_date?: string
  growth_per_week_km?: number
}

export interface FitnessStatus {
  label: 'building' | 'maintaining' | 'declining' | 'insufficient_data'
  recent_weekly_km: number | null
  trend_pct: number | null
}

export interface Insights {
  fitness_status: FitnessStatus
  weekly_volume: Array<{ week: string; longest_km: number }>
  pace_trend_pct: number | null
  total_activities: number
}

export interface SyncStatus {
  last_synced_at: string | null
  is_connected: boolean
}
```

**Step 2: Create frontend/src/services/api.ts**

```typescript
import type { Activity, ActivitySummary, Goal, Insights, SyncStatus } from '../types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export const api = {
  getAuthUrl: () => request<{ url: string }>('/auth/strava'),
  getAuthStatus: () => request<SyncStatus>('/auth/status'),
  sync: () => request<{ synced: number; total_new: number }>('/sync', { method: 'POST' }),
  getActivities: () => request<ActivitySummary[]>('/activities'),
  getActivity: (id: number) => request<Activity>(`/activities/${id}`),
  getInsights: () => request<Insights>('/insights'),
  getGoals: () => request<Goal[]>('/goals'),
  createGoal: (data: { name: string; date: string; distance_km: number; elevation_gain_m?: number; notes?: string }) =>
    request<Goal>('/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}
```

**Step 3: Commit**

```bash
git add frontend/src/types.ts frontend/src/services/api.ts
git commit -m "feat: frontend types and API service layer"
```

---

## Task 9: Layout + Navigation component

**Files:**
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/NavLink.tsx`

**Step 1: Create frontend/src/components/NavLink.tsx**

```typescript
import { NavLink as RouterNavLink } from 'react-router-dom'

interface Props {
  to: string
  label: string
  icon: string
}

export default function NavLink({ to, label, icon }: Props) {
  return (
    <RouterNavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand/20 text-brand'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
        }`
      }
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </RouterNavLink>
  )
}
```

**Step 2: Create frontend/src/components/Layout.tsx**

```typescript
import { Outlet } from 'react-router-dom'
import NavLink from './NavLink'

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col p-4 gap-1">
        <div className="px-4 py-3 mb-4">
          <h1 className="text-lg font-bold text-brand">⛰ EffortArc</h1>
        </div>
        <NavLink to="/dashboard" label="Dashboard" icon="📊" />
        <NavLink to="/progress" label="Progress" icon="📈" />
        <NavLink to="/goals" label="Goals" icon="🎯" />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
```

**Step 3: Verify in browser**

Open http://localhost:5173/dashboard — sidebar with three nav links, dark background, brand green title.

**Step 4: Commit**

```bash
git add frontend/src/components/Layout.tsx frontend/src/components/NavLink.tsx
git commit -m "feat: app layout with sidebar navigation"
```

---

## Task 10: Dashboard page

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/components/MetricCard.tsx`
- Create: `frontend/src/components/FitnessStatusBadge.tsx`
- Create: `frontend/src/hooks/useInsights.ts`
- Create: `frontend/src/hooks/useActivities.ts`

**Step 1: Create frontend/src/hooks/useInsights.ts**

```typescript
import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { Insights } from '../types'

export function useInsights() {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getInsights()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
```

**Step 2: Create frontend/src/hooks/useActivities.ts**

```typescript
import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { ActivitySummary } from '../types'

export function useActivities() {
  const [data, setData] = useState<ActivitySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getActivities()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
```

**Step 3: Create frontend/src/components/MetricCard.tsx**

```typescript
interface Props {
  label: string
  value: string
  sub?: string
}

export default function MetricCard({ label, value, sub }: Props) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 flex flex-col gap-1">
      <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-3xl font-bold text-slate-100">{value}</span>
      {sub && <span className="text-sm text-slate-500">{sub}</span>}
    </div>
  )
}
```

**Step 4: Create frontend/src/components/FitnessStatusBadge.tsx**

```typescript
const CONFIG = {
  building: { label: 'Building', color: 'bg-green-900 text-green-300', icon: '↑' },
  maintaining: { label: 'Maintaining', color: 'bg-yellow-900 text-yellow-300', icon: '→' },
  declining: { label: 'Declining', color: 'bg-red-900 text-red-300', icon: '↓' },
  insufficient_data: { label: 'Not enough data', color: 'bg-slate-700 text-slate-400', icon: '?' },
}

export default function FitnessStatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status as keyof typeof CONFIG] ?? CONFIG.insufficient_data
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}
```

**Step 5: Create frontend/src/pages/Dashboard.tsx**

```typescript
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../services/api'
import { useInsights } from '../hooks/useInsights'
import { useActivities } from '../hooks/useActivities'
import MetricCard from '../components/MetricCard'
import FitnessStatusBadge from '../components/FitnessStatusBadge'

function formatPace(minPerKm: number | null): string {
  if (!minPerKm) return '—'
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')} /km`
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDistance(meters: number | null): string {
  if (!meters) return '—'
  return `${(meters / 1000).toFixed(1)} km`
}

export default function Dashboard() {
  const { data: insights, loading: insightsLoading } = useInsights()
  const { data: activities, loading: activitiesLoading } = useActivities()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await api.sync()
      setSyncResult(`Synced ${result.synced} new activities`)
      window.location.reload()
    } catch (e: any) {
      setSyncResult(e.message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleConnect() {
    const { url } = await api.getAuthUrl()
    window.location.href = url
  }

  const recentActivities = activities.slice(0, 5)
  const weeklyData = insights?.weekly_volume?.slice(-12) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="flex items-center gap-3">
          {syncResult && <span className="text-sm text-slate-400">{syncResult}</span>}
          <button
            onClick={handleConnect}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm transition-colors"
          >
            Connect Strava
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-slate-900 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Fitness status */}
      {insights && (
        <div className="flex items-center gap-4">
          <FitnessStatusBadge status={insights.fitness_status.label} />
          {insights.fitness_status.recent_weekly_km && (
            <span className="text-slate-400 text-sm">
              {insights.fitness_status.recent_weekly_km.toFixed(1)} km/week avg
            </span>
          )}
          <span className="text-slate-500 text-sm">
            {insights.total_activities} activities total
          </span>
        </div>
      )}

      {/* Weekly volume chart */}
      {weeklyData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Weekly Volume (km)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#22c55e' }}
              />
              <Area type="monotone" dataKey="longest_km" stroke="#22c55e" strokeWidth={2} fill="url(#volumeGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent activities */}
      <div>
        <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-3">Recent Activities</h3>
        {activitiesLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : recentActivities.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-8 text-center">
            <p className="text-slate-400">No activities yet. Connect Strava and sync to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivities.map(a => (
              <Link
                key={a.id}
                to={`/activities/${a.id}`}
                className="flex items-center justify-between bg-slate-800 hover:bg-slate-700 rounded-xl p-4 transition-colors"
              >
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-slate-400">
                    {new Date(a.date).toLocaleDateString()} · {a.type}
                  </p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-sm text-slate-400">Distance</p>
                    <p className="font-medium">{formatDistance(a.cleaned_distance_m)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Time</p>
                    <p className="font-medium">{formatDuration(a.moving_time_s)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Pace</p>
                    <p className="font-medium">{formatPace(a.avg_moving_pace)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 6: Verify in browser**

Open http://localhost:5173/dashboard. Should show header, sync buttons, empty state message if no activities.

**Step 7: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx frontend/src/components/MetricCard.tsx \
        frontend/src/components/FitnessStatusBadge.tsx \
        frontend/src/hooks/useInsights.ts frontend/src/hooks/useActivities.ts
git commit -m "feat: dashboard page with fitness status, weekly chart, recent activities"
```

---

## Task 11: Activity detail page

**Files:**
- Create: `frontend/src/pages/ActivityDetail.tsx`
- Create: `frontend/src/components/ActivityMap.tsx`
- Create: `frontend/src/components/FatigueIndicator.tsx`

**Step 1: Create frontend/src/components/ActivityMap.tsx**

```typescript
import { useEffect, useRef } from 'react'

interface Point {
  lat: number
  lon: number
  ele: number
  is_stop?: boolean
}

interface Props {
  points: Point[]
}

export default function ActivityMap({ points }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || points.length === 0) return
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
    }

    import('leaflet').then(L => {
      const map = L.map(mapRef.current!).setView([points[0].lat, points[0].lon], 13)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      const track = points.filter(p => !p.is_stop).map(p => [p.lat, p.lon] as [number, number])
      L.polyline(track, { color: '#22c55e', weight: 3 }).addTo(map)

      const stops = points.filter(p => p.is_stop)
      stops.forEach(p => {
        L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 0.8,
        }).addTo(map)
      })

      const bounds = L.latLngBounds(track)
      map.fitBounds(bounds, { padding: [20, 20] })
    })

    return () => {
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
  }, [points])

  return <div ref={mapRef} className="h-72 rounded-xl overflow-hidden" />
}
```

**Step 2: Create frontend/src/components/FatigueIndicator.tsx**

```typescript
interface Props {
  firstPace: number | null
  lastPace: number | null
  dropPct: number | null
  label: string
}

const CONFIG = {
  stable: { text: 'Stable', color: 'text-green-400', bg: 'bg-green-900/30', bar: '#22c55e' },
  moderate_fatigue: { text: 'Moderate Fatigue', color: 'text-yellow-400', bg: 'bg-yellow-900/30', bar: '#eab308' },
  strong_slowdown: { text: 'Strong Slowdown', color: 'text-red-400', bg: 'bg-red-900/30', bar: '#ef4444' },
  insufficient_data: { text: 'Not enough data', color: 'text-slate-400', bg: 'bg-slate-800', bar: '#475569' },
}

function formatPace(p: number | null): string {
  if (!p) return '—'
  const mins = Math.floor(p)
  const secs = Math.round((p - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function FatigueIndicator({ firstPace, lastPace, dropPct, label }: Props) {
  const cfg = CONFIG[label as keyof typeof CONFIG] ?? CONFIG.insufficient_data
  return (
    <div className={`rounded-xl p-5 ${cfg.bg}`}>
      <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-3">Fatigue Analysis</h3>
      <div className={`text-lg font-bold ${cfg.color} mb-3`}>{cfg.text}</div>
      <div className="flex gap-8">
        <div>
          <p className="text-xs text-slate-500">First 25%</p>
          <p className="text-xl font-mono font-bold">{formatPace(firstPace)} /km</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Last 25%</p>
          <p className="text-xl font-mono font-bold">{formatPace(lastPace)} /km</p>
        </div>
        {dropPct !== null && (
          <div>
            <p className="text-xs text-slate-500">Pace drop</p>
            <p className={`text-xl font-mono font-bold ${cfg.color}`}>+{dropPct.toFixed(1)}%</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Create frontend/src/pages/ActivityDetail.tsx**

```typescript
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api } from '../services/api'
import type { Activity } from '../types'
import MetricCard from '../components/MetricCard'
import FatigueIndicator from '../components/FatigueIndicator'
import ActivityMap from '../components/ActivityMap'

function formatPace(v: number | null) {
  if (!v) return '—'
  const m = Math.floor(v), s = Math.round((v - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}
function formatDuration(s: number | null) {
  if (!s) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function formatDistance(m: number | null) {
  if (!m) return '—'
  return `${(m / 1000).toFixed(2)} km`
}

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>()
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.getActivity(Number(id))
      .then(setActivity)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-slate-400">Loading...</p>
  if (!activity) return <p className="text-red-400">Activity not found.</p>

  const cleanedPoints: any[] = activity.cleaned_gpx ? JSON.parse(activity.cleaned_gpx) : []

  const elevationData = cleanedPoints
    .filter((_, i) => i % 5 === 0)
    .map((p, i) => ({ dist: i * 0.05, ele: p.ele }))

  const paceData = (activity.segments ?? [])
    .filter(s => !s.is_stop && s.grade_adjusted_pace)
    .map(s => ({ km: s.km_index, pace: s.grade_adjusted_pace }))

  // Infer fatigue from segments
  const moving = (activity.segments ?? []).filter(s => !s.is_stop && s.grade_adjusted_pace)
  const quarter = Math.max(1, Math.floor(moving.length / 4))
  const firstPace = moving.slice(0, quarter).reduce((a, b) => a + (b.grade_adjusted_pace ?? 0), 0) / (quarter || 1)
  const lastPace = moving.slice(-quarter).reduce((a, b) => a + (b.grade_adjusted_pace ?? 0), 0) / (quarter || 1)
  const dropPct = firstPace > 0 ? ((lastPace - firstPace) / firstPace) * 100 : null
  const fatigueLabel = dropPct === null ? 'insufficient_data'
    : dropPct < 5 ? 'stable'
    : dropPct < 15 ? 'moderate_fatigue'
    : 'strong_slowdown'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-slate-400 hover:text-slate-100">← Back</Link>
        <h2 className="text-2xl font-bold">{activity.name}</h2>
        <span className="text-slate-500 text-sm">
          {new Date(activity.date).toLocaleDateString()} · {activity.type}
        </span>
      </div>

      {/* Map */}
      {cleanedPoints.length > 0 && <ActivityMap points={cleanedPoints} />}

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Distance" value={formatDistance(activity.cleaned_distance_m)} />
        <MetricCard label="Moving Time" value={formatDuration(activity.moving_time_s)} />
        <MetricCard label="Avg Pace" value={formatPace(activity.avg_moving_pace)} sub="grade-adjusted" />
        <MetricCard label="Elevation Gain" value={activity.elevation_gain_m ? `${Math.round(activity.elevation_gain_m)}m` : '—'} />
      </div>

      {/* Elevation profile */}
      {elevationData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Elevation Profile</h3>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={elevationData}>
              <defs>
                <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="dist" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(1)}km`} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}m`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} labelStyle={{ color: '#94a3b8' }} />
              <Area type="monotone" dataKey="ele" stroke="#6366f1" strokeWidth={2} fill="url(#eleGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pace chart */}
      {paceData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Grade-Adjusted Pace per km</h3>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={paceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="km" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `km ${v}`} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v?.toFixed(0)}'`} reversed />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
              <Line type="monotone" dataKey="pace" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Fatigue */}
      <FatigueIndicator
        firstPace={firstPace || null}
        lastPace={lastPace || null}
        dropPct={dropPct}
        label={fatigueLabel}
      />

      {/* Segment table */}
      {activity.segments && activity.segments.length > 0 && (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="text-sm text-slate-400 uppercase tracking-wider">Segment Breakdown</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-5 py-2 text-left text-slate-400 font-normal">km</th>
                <th className="px-5 py-2 text-right text-slate-400 font-normal">Pace</th>
                <th className="px-5 py-2 text-right text-slate-400 font-normal">Adj. Pace</th>
                <th className="px-5 py-2 text-right text-slate-400 font-normal">Ele. Δ</th>
                <th className="px-5 py-2 text-right text-slate-400 font-normal">Stop</th>
              </tr>
            </thead>
            <tbody>
              {activity.segments.map(s => (
                <tr key={s.km_index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-5 py-2 font-mono">{s.km_index}</td>
                  <td className="px-5 py-2 text-right font-mono">{formatPace(s.pace)}</td>
                  <td className="px-5 py-2 text-right font-mono text-brand">{formatPace(s.grade_adjusted_pace)}</td>
                  <td className="px-5 py-2 text-right font-mono">{s.elevation_change_m != null ? `${Math.round(s.elevation_change_m)}m` : '—'}</td>
                  <td className="px-5 py-2 text-right">{s.is_stop ? '⏸' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Add Leaflet CSS to index.html**

Add inside `<head>` in `frontend/index.html`:
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
```

**Step 5: Commit**

```bash
git add frontend/src/pages/ActivityDetail.tsx \
        frontend/src/components/ActivityMap.tsx \
        frontend/src/components/FatigueIndicator.tsx \
        frontend/index.html
git commit -m "feat: activity detail page with map, elevation, pace, fatigue analysis"
```

---

## Task 12: Goals page

**Files:**
- Create: `frontend/src/pages/Goals.tsx`

**Step 1: Create frontend/src/pages/Goals.tsx**

```typescript
import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { Goal } from '../types'

const STATUS_CONFIG = {
  ready: { color: 'text-green-400', bg: 'bg-green-900/30', icon: '✓' },
  on_track: { color: 'text-blue-400', bg: 'bg-blue-900/30', icon: '→' },
  at_risk: { color: 'text-red-400', bg: 'bg-red-900/30', icon: '⚠' },
  insufficient_data: { color: 'text-slate-400', bg: 'bg-slate-700/30', icon: '?' },
}

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', distance_km: '', elevation_gain_m: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getGoals().then(setGoals).finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.createGoal({
        name: form.name,
        date: new Date(form.date).toISOString(),
        distance_km: Number(form.distance_km),
        elevation_gain_m: form.elevation_gain_m ? Number(form.elevation_gain_m) : undefined,
        notes: form.notes || undefined,
      })
      const updated = await api.getGoals()
      setGoals(updated)
      setShowForm(false)
      setForm({ name: '', date: '', distance_km: '', elevation_gain_m: '', notes: '' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Goals</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-slate-900 text-sm font-medium transition-colors"
        >
          + Add Goal
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="font-medium">New Goal</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Event name</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="e.g. Dodentocht 100km"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Event date</label>
              <input
                required
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Distance (km)</label>
              <input
                required
                type="number"
                value={form.distance_km}
                onChange={e => setForm(f => ({ ...f, distance_km: e.target.value }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="e.g. 40"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Elevation gain (m, optional)</label>
              <input
                type="number"
                value={form.elevation_gain_m}
                onChange={e => setForm(f => ({ ...f, elevation_gain_m: e.target.value }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="e.g. 500"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand text-slate-900 text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Goal'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : goals.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">No goals yet. Add your first goal to get a readiness assessment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const cfg = STATUS_CONFIG[goal.readiness?.status ?? 'insufficient_data']
            return (
              <div key={goal.id} className="bg-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{goal.name}</h3>
                    <p className="text-slate-400 text-sm">
                      {goal.distance_km}km · {new Date(goal.date).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.color}`}>
                    {cfg.icon} {goal.readiness?.status?.replace('_', ' ') ?? 'no data'}
                  </span>
                </div>
                {goal.readiness?.message && (
                  <p className={`text-sm ${cfg.color}`}>{goal.readiness.message}</p>
                )}
                {goal.readiness?.longest_recent_km != null && (
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-slate-400">Current max: </span>
                      <span className="font-medium">{goal.readiness.longest_recent_km.toFixed(1)}km</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Gap: </span>
                      <span className="font-medium">{goal.readiness.distance_gap_km?.toFixed(1)}km</span>
                    </div>
                    {goal.readiness.growth_per_week_km != null && (
                      <div>
                        <span className="text-slate-400">Build rate: </span>
                        <span className="font-medium">+{goal.readiness.growth_per_week_km.toFixed(1)}km/week</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Goals.tsx
git commit -m "feat: goals page with readiness assessment"
```

---

## Task 13: Progress page

**Files:**
- Create: `frontend/src/pages/Progress.tsx`

**Step 1: Create frontend/src/pages/Progress.tsx**

```typescript
import { useInsights } from '../hooks/useInsights'
import { useActivities } from '../hooks/useActivities'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

export default function Progress() {
  const { data: insights, loading } = useInsights()
  const { data: activities } = useActivities()

  if (loading) return <p className="text-slate-400">Loading...</p>

  const weeklyVolume = insights?.weekly_volume ?? []

  const longestByMonth = activities
    .reduce((acc, a) => {
      const key = new Date(a.date).toLocaleDateString('en', { year: '2-digit', month: 'short' })
      const km = (a.cleaned_distance_m ?? 0) / 1000
      if (!acc[key] || acc[key] < km) acc[key] = km
      return acc
    }, {} as Record<string, number>)

  const longestData = Object.entries(longestByMonth).map(([month, km]) => ({ month, km }))

  const paceData = [...activities]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter(a => a.avg_moving_pace)
    .map(a => ({
      date: new Date(a.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      pace: a.avg_moving_pace,
    }))

  const projectionData = (() => {
    if (weeklyVolume.length < 4) return []
    const last = weeklyVolume[weeklyVolume.length - 1]
    const growth = insights?.weekly_volume
      ? (weeklyVolume[weeklyVolume.length - 1].longest_km - weeklyVolume[0].longest_km) / weeklyVolume.length
      : 0
    return Array.from({ length: 8 }, (_, i) => ({
      week: `+${i + 1}w`,
      projected: Math.max(0, last.longest_km + (i + 1) * growth),
    }))
  })()

  const tooltipStyle = { backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Progress</h2>

      {insights?.pace_trend_pct != null && (
        <div className="bg-slate-800 rounded-xl p-5 flex items-center gap-4">
          <div>
            <p className="text-sm text-slate-400">Pace trend (overall)</p>
            <p className={`text-2xl font-bold ${insights.pace_trend_pct < 0 ? 'text-green-400' : 'text-red-400'}`}>
              {insights.pace_trend_pct > 0 ? '+' : ''}{insights.pace_trend_pct.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500">{insights.pace_trend_pct < 0 ? 'Getting faster' : 'Slowing down'}</p>
          </div>
        </div>
      )}

      {longestData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Longest Walk per Month (km)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={longestData}>
              <defs>
                <linearGradient id="longGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="km" stroke="#22c55e" strokeWidth={2} fill="url(#longGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {paceData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Grade-Adjusted Pace Trend</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={paceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} reversed tickFormatter={v => `${v?.toFixed(0)}'`} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="pace" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {projectionData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-1">Projection: Longest Walk</h3>
          <p className="text-xs text-slate-500 mb-4">If you keep this up...</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={projectionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {activities.length === 0 && (
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">No data yet. Sync your Strava activities to see progress.</p>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Progress.tsx
git commit -m "feat: progress page with pace trend, longest walk, projection chart"
```

---

## Task 14: PWA manifest + service worker

**Files:**
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/hike-icon.svg`
- Create: `frontend/public/sw.js`
- Modify: `frontend/index.html`

**Step 1: Create frontend/public/manifest.json**

```json
{
  "name": "EffortArc",
  "short_name": "EffortArc",
  "description": "Hiking analytics and training readiness",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#22c55e",
  "icons": [
    {
      "src": "/hike-icon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

**Step 2: Create frontend/public/hike-icon.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="12" fill="#0f172a"/>
  <text x="32" y="44" font-size="36" text-anchor="middle" fill="#22c55e">⛰</text>
</svg>
```

**Step 3: Create frontend/public/sw.js**

```javascript
const CACHE_NAME = 'hiketracker-v1'
const STATIC_ASSETS = ['/', '/dashboard', '/progress', '/goals']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/') || event.request.url.includes(':8000')) {
    // Network first for API calls, fall back to cache
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return response
        })
        .catch(() => caches.match(event.request))
    )
  } else {
    // Cache first for static assets
    event.respondWith(
      caches.match(event.request).then(cached => cached ?? fetch(event.request))
    )
  }
})
```

**Step 4: Register service worker in frontend/src/main.tsx**

Add before `ReactDOM.createRoot`:

```typescript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
```

**Step 5: Commit**

```bash
git add frontend/public/ frontend/src/main.tsx
git commit -m "feat: PWA manifest and service worker for offline support"
```

---

## Task 15: README + Strava setup instructions

**Files:**
- Create: `README.md`

**Step 1: Create README.md**

```markdown
# EffortArc

Hiking analytics app. Syncs from Strava, cleans GPS data, and shows fitness trajectory + goal readiness.

## Setup

### 1. Get Strava API credentials

1. Go to https://www.strava.com/settings/api
2. Create an application:
   - App name: EffortArc (local)
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: setup instructions and development guide"
```

---

## Final verification checklist

Run these in order after all tasks are complete:

```bash
# 1. All backend tests pass
docker compose exec backend pytest -v
# Expected: all green

# 2. Frontend builds without errors
docker compose exec frontend npm run build
# Expected: no TypeScript or build errors

# 3. Both services healthy
docker compose ps
# Expected: both Up

# 4. API responds
curl http://localhost:8000/auth/status
curl http://localhost:8000/activities
curl http://localhost:8000/insights
```

Then open http://localhost:5173 and verify:
- [ ] Dark sidebar with three nav items
- [ ] Dashboard loads with sync button
- [ ] Connect Strava → redirects to Strava OAuth
- [ ] After auth, sync pulls activities
- [ ] Activity list shows on dashboard
- [ ] Click activity → map + charts + fatigue
- [ ] Goals page → add a goal → see readiness
- [ ] Progress page → charts render
