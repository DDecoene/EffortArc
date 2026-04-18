from datetime import datetime, timedelta
from typing import List, Dict, Optional
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
        growth_per_week = 0.5

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
