# Insights Reimagined Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reimagine the Progress page with per-sport goal-anchored insights, commute-aware cycling metrics, and a unified weekly training recommendation.

**Architecture:** Add `commute` boolean to Activity model via Alembic migration, wipe and backfill activities from Strava (Sep 2025 onward), rewrite the insights engine to be per-sport and goal-aware, then replace the Progress page with a 3-tier layout (urgent CTA → sport status cards → charts).

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic (backend), React/TypeScript/Recharts/Tailwind (frontend), Docker Compose for running everything.

---

### Task 1: Add `commute` column via Alembic migration

**Files:**
- Create: `backend/alembic/versions/003_add_commute_to_activities.py`
- Modify: `backend/models.py`

**Step 1: Write the migration**

```python
# backend/alembic/versions/003_add_commute_to_activities.py
"""Add commute flag to activities

Revision ID: 003
Revises: 002
Create Date: 2026-04-29
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("activities") as batch_op:
        batch_op.add_column(sa.Column("commute", sa.Boolean, nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("activities") as batch_op:
        batch_op.drop_column("commute")
```

**Step 2: Add `commute` field to the Activity model**

In `backend/models.py`, add after `processed_at`:
```python
commute = Column(Boolean, nullable=False, default=False)
```

**Step 3: Run the migration**

```bash
docker compose exec backend alembic upgrade head
```

Expected: `Running upgrade 002 -> 003, Add commute flag to activities`

**Step 4: Commit**

```bash
git add backend/alembic/versions/003_add_commute_to_activities.py backend/models.py
git commit -m "feat: add commute boolean to activities table"
```

---

### Task 2: Store commute flag during sync

**Files:**
- Modify: `backend/strava.py` (fetch returns commute field)
- Modify: `backend/main.py` (sync endpoint stores commute)

**Step 1: Write a test for commute flag storage**

In `backend/tests/test_strava.py`, add:
```python
def test_sport_category_cycling():
    from strava import sport_category
    assert sport_category("Ride") == "cycling"
    assert sport_category("EBikeRide") == "cycling"
```

Run: `docker compose exec backend pytest tests/test_strava.py -v`
Expected: PASS (this tests existing behavior, verifying the test harness works before we add more)

**Step 2: Verify commute comes through in Strava response**

In `backend/strava.py`, the `fetch_new_activities` function returns raw Strava dicts. Strava includes `commute: true/false` in every activity object. No change needed here — the field is already present in `act_data`.

**Step 3: Store commute in sync endpoint**

In `backend/main.py`, in the `sync_activities` endpoint, add `commute` to the Activity constructor:

```python
activity = Activity(
    strava_id=str(act_data["id"]),
    name=act_data["name"],
    date=datetime.fromisoformat(act_data["start_date"].replace("Z", "+00:00")).replace(tzinfo=None),
    type=act_data["type"],
    commute=bool(act_data.get("commute", False)),  # ADD THIS LINE
    raw_distance_m=act_data.get("distance"),
    raw_duration_s=act_data.get("elapsed_time"),
    raw_gpx=json.dumps(raw_points),
    cleaned_gpx=json.dumps(cleaned["cleaned_points"]),
    cleaned_distance_m=cleaned["cleaned_distance_m"],
    moving_time_s=act_data.get("moving_time") or cleaned["moving_time_s"],
    elevation_gain_m=cleaned["elevation_gain_m"],
    avg_moving_pace=cleaned["avg_moving_pace"],
    processed_at=datetime.utcnow(),
)
```

**Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: store commute flag from Strava during sync"
```

---

### Task 3: Backfill endpoint

**Files:**
- Modify: `backend/strava.py` (add paginated backfill fetch)
- Modify: `backend/main.py` (add `/sync/backfill` endpoint)

**Step 1: Add paginated backfill fetch to strava.py**

Add after `fetch_new_activities`:

```python
async def fetch_all_activities_since(state: SyncState, db: Session, since: datetime) -> list:
    """Fetch all Strava activities since a given date, handling pagination."""
    await refresh_token_if_needed(state, db)
    all_activities = []
    page = 1
    after_ts = int(since.timestamp())

    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                f"{STRAVA_API_BASE}/athlete/activities",
                headers={"Authorization": f"Bearer {state.strava_access_token}"},
                params={"per_page": 100, "page": page, "after": after_ts},
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            all_activities.extend(batch)
            page += 1

    return [a for a in all_activities if a.get("type") in SUPPORTED_TYPES]
```

**Step 2: Add `/sync/backfill` endpoint to main.py**

Add after the `/sync` endpoint:

```python
@app.post("/sync/backfill")
async def backfill_activities(
    since: str = Query("2025-09-01", description="ISO date to backfill from"),
    db: Session = Depends(get_db),
):
    from strava import fetch_all_activities_since
    state = get_or_create_sync_state(db)
    if not state.strava_access_token:
        raise HTTPException(status_code=401, detail="Not connected to Strava")

    since_dt = datetime.fromisoformat(since)

    # Clear all existing activities (Strava is source of truth)
    db.query(ActivitySegment).delete()
    db.query(Activity).delete()
    db.commit()

    all_activities = await fetch_all_activities_since(state, db, since_dt)
    synced = 0

    for act_data in all_activities:
        raw_points = await fetch_activity_streams(act_data["id"], state.strava_access_token)
        sport = sport_category(act_data["type"])
        cleaned = clean_activity(raw_points, sport=sport)

        activity = Activity(
            strava_id=str(act_data["id"]),
            name=act_data["name"],
            date=datetime.fromisoformat(act_data["start_date"].replace("Z", "+00:00")).replace(tzinfo=None),
            type=act_data["type"],
            commute=bool(act_data.get("commute", False)),
            raw_distance_m=act_data.get("distance"),
            raw_duration_s=act_data.get("elapsed_time"),
            raw_gpx=json.dumps(raw_points),
            cleaned_gpx=json.dumps(cleaned["cleaned_points"]),
            cleaned_distance_m=cleaned["cleaned_distance_m"],
            moving_time_s=act_data.get("moving_time") or cleaned["moving_time_s"],
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
    return {"synced": synced, "since": since}
```

**Step 3: Add Backfill button to the Dashboard UI**

In `frontend/src/pages/Dashboard.tsx`, add a backfill handler and button next to Sync Now:

```tsx
async function handleBackfill() {
  setSyncing(true)
  setSyncResult(null)
  try {
    const result = await api.backfill('2025-09-01')
    setSyncResult(`Backfilled ${result.synced} activities`)
    window.location.reload()
  } catch (e: any) {
    setSyncResult(e.message)
  } finally {
    setSyncing(false)
  }
}
```

Add to `frontend/src/services/api.ts`:
```typescript
backfill: async (since: string) => {
  const res = await fetch(`${API_URL}/sync/backfill?since=${since}`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
},
```

Add button in Dashboard JSX next to Sync Now:
```tsx
<button
  onClick={handleBackfill}
  disabled={syncing}
  className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
>
  {syncing ? 'Syncing...' : 'Backfill from Sep 2025'}
</button>
```

**Step 4: Test manually**

```bash
# Verify endpoint exists
curl -X POST http://localhost:8000/sync/backfill?since=2025-09-01
```

Expected: JSON with `synced` count.

**Step 5: Commit**

```bash
git add backend/strava.py backend/main.py frontend/src/pages/Dashboard.tsx frontend/src/services/api.ts
git commit -m "feat: add backfill endpoint and UI button"
```

---

### Task 4: Rewrite insights engine

**Files:**
- Modify: `backend/metrics.py` (complete rewrite)
- Modify: `backend/tests/test_metrics.py` (update tests)

**Step 1: Write tests first**

Replace `backend/tests/test_metrics.py` with:

```python
from datetime import datetime, timedelta
from metrics import build_insights, _classify_activities, _unified_recommendation

def _make_hike(date, km, pace=8.0):
    return {"date": date, "cleaned_distance_m": km * 1000, "avg_moving_pace": pace,
            "type": "Hike", "commute": False}

def _make_ride(date, km, commute=False):
    return {"date": date, "cleaned_distance_m": km * 1000, "avg_moving_pace": None,
            "type": "Ride", "commute": commute}

NOW = datetime.utcnow()

def test_classify_separates_commute_from_training():
    acts = [
        _make_ride(NOW, 15, commute=True),
        _make_ride(NOW - timedelta(days=1), 40, commute=False),
        _make_hike(NOW - timedelta(days=2), 20),
    ]
    classified = _classify_activities(acts)
    assert len(classified["hiking"]) == 1
    assert len(classified["cycling_training"]) == 1
    assert len(classified["cycling_commute"]) == 1

def test_build_insights_returns_per_sport_keys():
    acts = [_make_hike(NOW - timedelta(days=i*7), 15 + i) for i in range(8)]
    result = build_insights(acts)
    assert "hiking" in result
    assert "cycling" in result
    assert "recommendation" in result

def test_recommendation_mentions_nearest_goal():
    acts = [_make_hike(NOW - timedelta(days=i*7), 10 + i) for i in range(8)]
    goals = [{"name": "Test Hike", "sport_type": "hiking",
               "distance_km": 42, "date": NOW + timedelta(days=30)}]
    rec = _unified_recommendation(acts, goals)
    assert "Test Hike" in rec or "42" in rec

def test_cycling_commutes_excluded_from_goal_readiness():
    # 10 commute rides of 15km each should NOT make you "ready" for a 70km cycling goal
    acts = [_make_ride(NOW - timedelta(days=i), 15, commute=True) for i in range(14)]
    result = build_insights(acts)
    cycling = result["cycling"]
    # longest training ride is 0 (no non-commute rides)
    assert cycling["goal_readiness_data"]["longest_training_km"] == 0
```

Run: `docker compose exec backend pytest tests/test_metrics.py -v`
Expected: FAIL (functions don't exist yet)

**Step 2: Rewrite metrics.py**

```python
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import statistics

CYCLING_TYPES = {"Ride", "VirtualRide", "EBikeRide"}
HIKING_TYPES = {"Hike", "Walk"}
CARDIO_CROSS_CREDIT = 0.30  # cycling km → hiking endurance credit factor


def _classify_activities(activities: List[Dict]) -> Dict:
    hiking, cycling_training, cycling_commute = [], [], []
    for a in activities:
        t = a.get("type", "")
        if t in HIKING_TYPES:
            hiking.append(a)
        elif t in CYCLING_TYPES:
            if a.get("commute"):
                cycling_commute.append(a)
            else:
                cycling_training.append(a)
    return {"hiking": hiking, "cycling_training": cycling_training, "cycling_commute": cycling_commute}


def _fitness_status(activities: List[Dict]) -> Dict:
    if len(activities) < 4:
        return {"label": "insufficient_data", "recent_weekly_km": None, "trend_pct": None}
    now = datetime.utcnow()
    recent = [a for a in activities if a["date"] >= now - timedelta(weeks=4)]
    older = [a for a in activities if now - timedelta(weeks=8) <= a["date"] < now - timedelta(weeks=4)]
    recent_km = sum(a["cleaned_distance_m"] / 1000 for a in recent)
    older_km = sum(a["cleaned_distance_m"] / 1000 for a in older)
    if older_km == 0:
        return {"label": "building", "recent_weekly_km": recent_km / 4, "trend_pct": None}
    trend_pct = ((recent_km - older_km) / older_km) * 100
    label = "building" if trend_pct > 5 else "declining" if trend_pct < -10 else "maintaining"
    return {"label": label, "recent_weekly_km": recent_km / 4, "trend_pct": trend_pct}


def _weekly_longest(activities: List[Dict]) -> List[Dict]:
    by_week: Dict[str, float] = {}
    for a in sorted(activities, key=lambda x: x["date"]):
        week_key = a["date"].strftime("%Y-W%W")
        km = a["cleaned_distance_m"] / 1000
        if week_key not in by_week or by_week[week_key] < km:
            by_week[week_key] = km
    return [{"week": k, "longest_km": v} for k, v in sorted(by_week.items())]


def _pace_trend(activities: List[Dict]) -> Optional[float]:
    paces = [a["avg_moving_pace"] for a in activities if a.get("avg_moving_pace")]
    if len(paces) < 3:
        return None
    first_half = statistics.mean(paces[: len(paces) // 2])
    second_half = statistics.mean(paces[len(paces) // 2 :])
    return ((second_half - first_half) / first_half) * 100 if first_half else None


def _hiking_goal_readiness_data(hiking: List[Dict], cycling_commute: List[Dict], cycling_training: List[Dict]) -> Dict:
    """Longest recent hike + cardio credit from cycling."""
    all_cycling = cycling_commute + cycling_training
    recent_hiking = sorted(hiking, key=lambda x: x["date"])[-6:]
    longest_hike_km = max((a["cleaned_distance_m"] / 1000 for a in recent_hiking), default=0)

    # Weekly cycling km over last 4 weeks as cardio credit
    now = datetime.utcnow()
    recent_cycling_km = sum(
        a["cleaned_distance_m"] / 1000 for a in all_cycling
        if a["date"] >= now - timedelta(weeks=4)
    )
    cardio_credit_km = (recent_cycling_km / 4) * CARDIO_CROSS_CREDIT

    return {
        "longest_recent_km": longest_hike_km,
        "cardio_credit_km": round(cardio_credit_km, 1),
        "effective_km": round(longest_hike_km + cardio_credit_km, 1),
    }


def _cycling_goal_readiness_data(cycling_training: List[Dict], cycling_commute: List[Dict]) -> Dict:
    """Longest non-commute ride. Commutes shown as context only."""
    recent_training = sorted(cycling_training, key=lambda x: x["date"])[-6:]
    longest_training_km = max((a["cleaned_distance_m"] / 1000 for a in recent_training), default=0)

    now = datetime.utcnow()
    commute_weekly_km = sum(
        a["cleaned_distance_m"] / 1000 for a in cycling_commute
        if a["date"] >= now - timedelta(weeks=4)
    ) / 4

    return {
        "longest_training_km": longest_training_km,
        "commute_weekly_km": round(commute_weekly_km, 1),
    }


def _growth_per_week(weekly_data: List[Dict]) -> float:
    if len(weekly_data) < 4:
        return 0.5
    dists = [w["longest_km"] for w in weekly_data]
    return (dists[-1] - dists[0]) / len(dists)


def _unified_recommendation(activities: List[Dict], goals: List[Dict]) -> str:
    if not goals:
        return "No goals set. Add a goal to get a personalised recommendation."

    classified = _classify_activities(activities)
    now = datetime.utcnow()

    # Sort goals by days remaining, nearest first
    upcoming = sorted(
        [g for g in goals if g["date"] > now],
        key=lambda g: g["date"]
    )
    if not upcoming:
        return "All your goals are in the past. Add a new goal to get recommendations."

    parts = []
    for goal in upcoming[:2]:  # address up to 2 goals
        days = (goal["date"] - now).days
        sport = goal["sport_type"]
        distance_km = goal["distance_km"]

        if sport == "hiking":
            rd = _hiking_goal_readiness_data(
                classified["hiking"], classified["cycling_commute"], classified["cycling_training"]
            )
            effective_km = rd["effective_km"]
            gap = distance_km - effective_km
            weekly = _weekly_longest(classified["hiking"])
            growth = _growth_per_week(weekly)

            if gap <= 0:
                parts.append(f"{goal['name']} ({days}d): you're ready — keep one long hike per week.")
            else:
                target = min(effective_km + max(growth * 2, 3), distance_km)
                parts.append(
                    f"{goal['name']} in {days} days: do a {target:.0f}km hike this weekend "
                    f"(gap: {gap:.0f}km, building +{growth:.1f}km/week)."
                )
        else:  # cycling
            rd = _cycling_goal_readiness_data(classified["cycling_training"], classified["cycling_commute"])
            longest = rd["longest_training_km"]
            gap = distance_km - longest
            weekly = _weekly_longest(classified["cycling_training"])
            growth = _growth_per_week(weekly)

            if gap <= 0:
                parts.append(f"{goal['name']} ({days}d): you're ready — keep your long rides sharp.")
            else:
                target = min(longest + max(growth * 2, 5), distance_km)
                parts.append(
                    f"{goal['name']} in {days} days: plan a {target:.0f}km training ride "
                    f"(gap: {gap:.0f}km)."
                )

    return " · ".join(parts) if parts else "Keep training consistently."


def build_insights(activities: List[Dict], goals: List[Dict] = None) -> Dict:
    goals = goals or []
    classified = _classify_activities(activities)

    hiking_acts = classified["hiking"]
    cycling_all = classified["cycling_training"] + classified["cycling_commute"]

    hiking_insights = {
        "fitness_status": _fitness_status(hiking_acts),
        "weekly_volume": _weekly_longest(hiking_acts),
        "pace_trend_pct": _pace_trend(hiking_acts),
        "goal_readiness_data": _hiking_goal_readiness_data(
            classified["hiking"], classified["cycling_commute"], classified["cycling_training"]
        ),
    }

    cycling_insights = {
        "fitness_status": _fitness_status(cycling_all),
        "weekly_volume": _weekly_longest(cycling_all),
        "pace_trend_pct": None,
        "goal_readiness_data": _cycling_goal_readiness_data(
            classified["cycling_training"], classified["cycling_commute"]
        ),
    }

    return {
        "hiking": hiking_insights,
        "cycling": cycling_insights,
        "recommendation": _unified_recommendation(activities, goals),
        "total_activities": len(activities),
        # keep legacy fields for backward compat during transition
        "fitness_status": _fitness_status(activities),
        "weekly_volume": _weekly_longest(activities),
        "pace_trend_pct": _pace_trend(hiking_acts),
    }
```

**Step 3: Run tests**

```bash
docker compose exec backend pytest tests/test_metrics.py -v
```

Expected: all PASS

**Step 4: Update `/insights` endpoint in main.py to pass goals**

Replace the `get_insights` function:

```python
@app.get("/insights")
def get_insights(
    sport_type: Optional[str] = Query(None, pattern="^(hiking|cycling)$"),
    db: Session = Depends(get_db),
):
    q = db.query(Activity).order_by(Activity.date.asc())
    activities = _sport_type_filter(q, sport_type).all() if sport_type else db.query(Activity).order_by(Activity.date.asc()).all()
    goals = db.query(Goal).filter(Goal.date > datetime.utcnow()).all()

    data = [
        {
            "date": a.date,
            "cleaned_distance_m": a.cleaned_distance_m or 0,
            "avg_moving_pace": a.avg_moving_pace or 0,
            "type": a.type,
            "commute": a.commute,
        }
        for a in activities
    ]
    goal_data = [
        {"name": g.name, "sport_type": g.sport_type, "distance_km": g.distance_km, "date": g.date}
        for g in goals
    ]
    return build_insights(data, goal_data)
```

**Step 5: Run all backend tests**

```bash
docker compose exec backend pytest -v
```

Expected: all PASS

**Step 6: Commit**

```bash
git add backend/metrics.py backend/tests/test_metrics.py backend/main.py
git commit -m "feat: rewrite insights engine with per-sport, commute-aware, goal-anchored metrics"
```

---

### Task 5: Reimagine the Progress page

**Files:**
- Modify: `frontend/src/pages/Progress.tsx` (full rewrite)
- Modify: `frontend/src/hooks/useInsights.ts` (verify shape matches new API)
- Modify: `frontend/src/types.ts` (add new insight types)

**Step 1: Update types.ts**

Add to `frontend/src/types.ts`:

```typescript
export interface SportInsights {
  fitness_status: {
    label: 'building' | 'maintaining' | 'declining' | 'insufficient_data'
    recent_weekly_km: number | null
    trend_pct: number | null
  }
  weekly_volume: { week: string; longest_km: number }[]
  pace_trend_pct: number | null
  goal_readiness_data: {
    // hiking
    longest_recent_km?: number
    cardio_credit_km?: number
    effective_km?: number
    // cycling
    longest_training_km?: number
    commute_weekly_km?: number
  }
}

export interface InsightsData {
  hiking: SportInsights
  cycling: SportInsights
  recommendation: string
  total_activities: number
  // legacy
  fitness_status: { label: string; recent_weekly_km: number | null; trend_pct: number | null }
  weekly_volume: { week: string; longest_km: number }[]
  pace_trend_pct: number | null
}
```

**Step 2: Rewrite Progress.tsx**

```tsx
import { useState } from 'react'
import { useInsights } from '../hooks/useInsights'
import { useActivities } from '../hooks/useActivities'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { SportType } from '../types'
import { paceToSpeed } from '../types'

const SPORT_TABS: { label: string; value: SportType | undefined }[] = [
  { label: 'All', value: undefined },
  { label: '🥾 Hiking', value: 'hiking' },
  { label: '🚴 Cycling', value: 'cycling' },
]

const FITNESS_LABEL: Record<string, string> = {
  building: 'Building',
  maintaining: 'Maintaining',
  declining: 'Declining',
  insufficient_data: 'Not enough data',
}

const FITNESS_COLOR: Record<string, string> = {
  building: 'text-green-400',
  maintaining: 'text-blue-400',
  declining: 'text-red-400',
  insufficient_data: 'text-slate-400',
}

export default function Progress() {
  const [sport, setSport] = useState<SportType | undefined>(undefined)
  const { data: insights, loading } = useInsights(undefined) // always fetch all sports
  const { data: activities } = useActivities(sport)

  const tooltipStyle = { backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }

  const hikingInsights = insights?.hiking
  const cyclingInsights = insights?.cycling
  const recommendation = insights?.recommendation

  const paceData = [...activities]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter(a => a.avg_moving_pace)
    .map(a => ({
      date: new Date(a.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      value: paceToSpeed(a.avg_moving_pace!),
    }))

  const activeWeeklyVolume = sport === 'cycling'
    ? cyclingInsights?.weekly_volume ?? []
    : sport === 'hiking'
    ? hikingInsights?.weekly_volume ?? []
    : (hikingInsights?.weekly_volume ?? [])

  const chartColor = sport === 'cycling' ? '#f59e0b' : '#22c55e'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Progress</h2>
      </div>

      <div className="flex gap-2">
        {SPORT_TABS.map(tab => (
          <button
            key={tab.label}
            onClick={() => setSport(tab.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sport === tab.value
                ? 'bg-brand text-slate-900'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-slate-400">Loading...</p>}

      {/* Tier 1: Unified recommendation / CTA */}
      {recommendation && (
        <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-5">
          <p className="text-xs text-amber-400 uppercase tracking-wider font-medium mb-2">This week's focus</p>
          <p className="text-slate-100 text-sm leading-relaxed">{recommendation}</p>
        </div>
      )}

      {/* Tier 2: Per-sport status cards */}
      {(hikingInsights || cyclingInsights) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {hikingInsights && (
            <div className="bg-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">🥾 Hiking</span>
                <span className={`text-sm font-semibold ${FITNESS_COLOR[hikingInsights.fitness_status.label]}`}>
                  {FITNESS_LABEL[hikingInsights.fitness_status.label]}
                </span>
              </div>
              {hikingInsights.fitness_status.recent_weekly_km != null && (
                <p className="text-2xl font-bold">
                  {hikingInsights.fitness_status.recent_weekly_km.toFixed(1)}
                  <span className="text-sm text-slate-400 font-normal ml-1">km/week</span>
                </p>
              )}
              {hikingInsights.goal_readiness_data.longest_recent_km != null && (
                <div className="text-xs text-slate-400 space-y-1">
                  <div>Longest recent: <span className="text-slate-200">{hikingInsights.goal_readiness_data.longest_recent_km.toFixed(1)}km</span></div>
                  {hikingInsights.goal_readiness_data.cardio_credit_km != null && hikingInsights.goal_readiness_data.cardio_credit_km > 0 && (
                    <div>Cycling cardio credit: <span className="text-slate-200">+{hikingInsights.goal_readiness_data.cardio_credit_km.toFixed(1)}km</span></div>
                  )}
                  {hikingInsights.goal_readiness_data.effective_km != null && (
                    <div>Effective readiness: <span className="text-green-400 font-medium">{hikingInsights.goal_readiness_data.effective_km.toFixed(1)}km</span></div>
                  )}
                </div>
              )}
            </div>
          )}

          {cyclingInsights && (
            <div className="bg-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">🚴 Cycling</span>
                <span className={`text-sm font-semibold ${FITNESS_COLOR[cyclingInsights.fitness_status.label]}`}>
                  {FITNESS_LABEL[cyclingInsights.fitness_status.label]}
                </span>
              </div>
              {cyclingInsights.fitness_status.recent_weekly_km != null && (
                <p className="text-2xl font-bold">
                  {cyclingInsights.fitness_status.recent_weekly_km.toFixed(1)}
                  <span className="text-sm text-slate-400 font-normal ml-1">km/week</span>
                </p>
              )}
              {cyclingInsights.goal_readiness_data && (
                <div className="text-xs text-slate-400 space-y-1">
                  <div>Longest training ride: <span className="text-slate-200">{(cyclingInsights.goal_readiness_data.longest_training_km ?? 0).toFixed(1)}km</span></div>
                  {cyclingInsights.goal_readiness_data.commute_weekly_km != null && (
                    <div>Commute avg: <span className="text-slate-200">{cyclingInsights.goal_readiness_data.commute_weekly_km.toFixed(1)}km/week</span></div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tier 3: Charts */}
      {activeWeeklyVolume.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Longest session per week (km)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={activeWeeklyVolume}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="longest_km" stroke={chartColor} strokeWidth={2} fill="url(#volGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {paceData.length > 0 && sport !== 'cycling' && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Avg speed trend (km/h)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={paceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v?.toFixed(0)}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} km/h`, 'Speed']} />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && activities.length === 0 && (
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">No data yet. Sync your Strava activities to see progress.</p>
        </div>
      )}
    </div>
  )
}
```

**Step 3: Start dev server and verify visually**

```bash
docker compose up
```

Open http://localhost:5173/progress — verify:
- Amber CTA card at top with recommendation text
- Two sport status cards side by side
- Charts below

**Step 4: Commit**

```bash
git add frontend/src/pages/Progress.tsx frontend/src/types.ts
git commit -m "feat: reimagine Progress page with 3-tier layout"
```

---

### Task 6: Create GitHub issues and run backfill

**Step 1: Create one GitHub issue per task**

```bash
gh issue create --repo DDecoene/EffortArc --title "Add commute column via Alembic migration" \
  --body "Add commute BOOLEAN to activities table. See design doc." --milestone "v0.2.0-insights-reimagined"

gh issue create --repo DDecoene/EffortArc --title "Store commute flag during Strava sync" \
  --body "Map Strava commute field to Activity.commute on every sync." --milestone "v0.2.0-insights-reimagined"

gh issue create --repo DDecoene/EffortArc --title "Add backfill endpoint POST /sync/backfill" \
  --body "Paginated fetch from Strava since a given date. Wipes and repopulates activities. Goals preserved." --milestone "v0.2.0-insights-reimagined"

gh issue create --repo DDecoene/EffortArc --title "Rewrite insights engine (per-sport, commute-aware)" \
  --body "Classify activities by sport+commute. Per-sport fitness status. Cross-sport cardio credit for hiking. Unified recommendation string." --milestone "v0.2.0-insights-reimagined"

gh issue create --repo DDecoene/EffortArc --title "Reimagine Progress page with 3-tier layout" \
  --body "Tier 1: urgent CTA. Tier 2: per-sport status cards. Tier 3: charts." --milestone "v0.2.0-insights-reimagined"
```

**Step 2: Run backfill after implementation**

In the app UI, click "Backfill from Sep 2025". This wipes existing activity rows (goals preserved) and fetches all activities from Strava since 2025-09-01 with correct commute flags.

Verify in shell:
```bash
docker compose exec backend python3 -c "
import sys; sys.path.insert(0, '/app')
from database import SessionLocal
from models import Activity
db = SessionLocal()
total = db.query(Activity).count()
commutes = db.query(Activity).filter(Activity.commute == True).count()
print(f'Total: {total}, Commutes: {commutes}')
db.close()
"
```

Expected: total > 56, commutes > 0.
