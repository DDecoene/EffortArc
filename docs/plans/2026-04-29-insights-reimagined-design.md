# Design: v0.2.0 Insights Reimagined

## Context

The current Progress page shows raw charts and a generic pace trend. It doesn't answer the three questions that matter: am I getting fitter, am I on track for my event, and what should I do this week? Additionally, cycling commutes pollute goal readiness metrics, and the cross-sport cardio relationship between cycling and hiking is ignored.

User has two active goals:
- **Nacht van Vlaanderen** — 42km hike, 2026-06-19
- **Campo Solar** — 70km cycling event, 2026-07-31

Activity pattern: daily cycling commute (~15km each way, Strava `commute: true`), intentional hiking sessions, occasional training/leisure rides.

---

## Backend Changes

### 1. DB Migration — add `commute` to activities

Add `commute BOOLEAN DEFAULT FALSE` to the `activities` table.

Because Strava is the source of truth, the migration will also clear all existing activity rows (goals are preserved). A full backfill from September 2025 will repopulate with correct commute flags.

### 2. Strava sync — store commute flag

In `strava.py`, map `activity["commute"]` to the `commute` column when creating Activity records. Applies to both regular sync and backfill.

### 3. Backfill endpoint — `POST /sync/backfill`

Accepts optional `since` date (defaults to 2025-09-01). Fetches all Strava activities after that date using pagination (loop until empty page). Skips activities already in DB by `strava_id`. Returns count of newly added activities.

UI: a "Backfill" button in the Dashboard sync area.

### 4. Reimagined insights engine (`metrics.py`)

**Activity classification:**
- `commute=True` + cycling type → commute ride
- `commute=False` + cycling type → training ride
- hiking/walk type → hiking activity

**Per-sport fitness status:**
Computed independently per sport using only that sport's activities. No more mixed "all sports" trend that conflates hiking km with cycling km.

**Goal readiness (per sport):**
- Hiking: uses longest hike distance in recent 6 activities. Cardio credit: weekly cycling km (commute + training) × 0.30 added as equivalent endurance. Growth rate from weekly longest hike trend.
- Cycling: uses longest *non-commute* ride distance. Commutes count toward a separate "base fitness" score shown as context, not toward distance readiness. Growth rate from weekly longest training ride trend.

**Unified weekly recommendation:**
Single prioritised action string, anchored to the nearest goal by days remaining. Logic:
1. Find the goal with fewest days remaining
2. Compute gap between current capability and goal distance
3. If gap > 0: recommend a specific long session distance for this weekend ("Do a 25km hike this weekend")
4. If gap ≤ 0: recommend maintaining ("You're ready — keep one long hike per week to stay sharp")
5. Secondary sport gets a lighter recommendation appended if its goal is also within 90 days

**New `/insights` response shape:**
```json
{
  "hiking": {
    "fitness_status": { "label": "building", "recent_weekly_km": 18.0, "trend_pct": 12.5 },
    "goal_readiness": { "status": "on_track", "message": "...", "longest_recent_km": 20.3, "distance_gap_km": 21.7, "ready_date": "..." },
    "weekly_volume": [...]
  },
  "cycling": {
    "fitness_status": { "label": "building", "recent_weekly_km": 45.0, "trend_pct": null },
    "goal_readiness": { "status": "building", "message": "...", "longest_training_km": 24.3, "distance_gap_km": 45.7, "commute_weekly_km": 150.0 },
    "weekly_volume": [...]
  },
  "recommendation": "Nacht van Vlaanderen is in 51 days — do a 25km hike this weekend. Also aim for one 35km training ride before end of May for Campo Solar.",
  "nearest_goal_days": 51,
  "pace_trend_pct": -4.2
}
```

---

## Frontend Changes

### Progress page — 3-tier layout

**Tier 1 — Urgent CTA card (full width)**
- Goal name + days remaining (large, prominent)
- The unified recommendation text
- Color: amber if >60 days, green if on track, red if at risk

**Tier 2 — Sport status row (two cards, side by side)**
- Hiking card: fitness label badge, weekly km, goal readiness status, days to Nacht van Vlaanderen
- Cycling card: fitness label badge, weekly km (split: commute / training), goal readiness, days to Campo Solar

**Tier 3 — Charts (existing, cleaned up)**
- Longest session per month (per sport, not combined)
- Speed/pace trend over time
- 8-week projection (only shown if enough data)

Sport filter tabs remain and filter all three tiers.

---

## Data Flow

```
Strava API
  → fetch_new_activities() / backfill()  [strava.py]
  → store Activity with commute flag     [models.py]
  → build_insights(activities)           [metrics.py]
    → classify by sport + commute
    → per-sport fitness_status
    → per-sport goal_readiness (with cross-sport cardio credit for hiking)
    → unified recommendation string
  → /insights endpoint                   [main.py]
  → Progress page 3-tier UI              [Progress.tsx]
```

---

## Out of Scope

- Manual commute tagging in UI (Strava flag is sufficient)
- Running or other sport types
- Elevation as a readiness factor (future)
- Push notifications or scheduled reminders
