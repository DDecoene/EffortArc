from datetime import datetime, timedelta
from typing import List, Dict, Optional
import statistics

CYCLING_TYPES = {"Ride", "VirtualRide", "EBikeRide"}
HIKING_TYPES = {"Hike", "Walk"}
CARDIO_CROSS_CREDIT = 0.30

MIN_ACTIVITIES_FOR_PROJECTION = 6


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
    all_cycling = cycling_commute + cycling_training
    recent_hiking = sorted(hiking, key=lambda x: x["date"])[-6:]
    longest_hike_km = max((a["cleaned_distance_m"] / 1000 for a in recent_hiking), default=0)
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
    recent_training = sorted(cycling_training, key=lambda x: x["date"])[-6:]
    longest_training_km = max((a["cleaned_distance_m"] / 1000 for a in recent_training), default=0)
    now = datetime.utcnow()
    commute_weekly_km = sum(
        a["cleaned_distance_m"] / 1000 for a in cycling_commute
        if a["date"] >= now - timedelta(weeks=4)
    ) / 4
    # commutes build base fitness but aren't race-specific — credit at 25%
    commute_credit_km = commute_weekly_km * 0.25
    return {
        "longest_training_km": longest_training_km,
        "commute_weekly_km": round(commute_weekly_km, 1),
        "commute_credit_km": round(commute_credit_km, 1),
        "effective_km": round(longest_training_km + commute_credit_km, 1),
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
    upcoming = sorted(
        [g for g in goals if g["date"] > now],
        key=lambda g: g["date"]
    )
    if not upcoming:
        return "All your goals are in the past. Add a new goal to get recommendations."
    parts = []
    for goal in upcoming[:2]:
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
        else:
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


def calculate_endurance_ceiling(segments, opening_pace, threshold_pct=20.0):
    moving = [s for s in segments if not s.get("is_stop", False)]
    ceiling_km = len(moving)
    for s in moving:
        if opening_pace > 0:
            pct_change = ((s["grade_adjusted_pace"] - opening_pace) / opening_pace) * 100.0
            if pct_change > threshold_pct:
                ceiling_km = s["km_index"] - 1
                break
    return float(ceiling_km)


def calculate_goal_readiness(activities, goal_distance_km, goal_date):
    if len(activities) < MIN_ACTIVITIES_FOR_PROJECTION:
        return {
            "status": "insufficient_data",
            "message": f"Need at least {MIN_ACTIVITIES_FOR_PROJECTION} activities. You have {len(activities)}.",
        }
    sorted_acts = sorted(activities, key=lambda x: x["date"])
    recent = sorted_acts[-6:]
    longest_recent_km = max(a["cleaned_distance_m"] / 1000.0 for a in recent)
    distance_gap_km = goal_distance_km - longest_recent_km
    weekly_data = _weekly_longest(sorted_acts)
    growth_per_week = _growth_per_week(weekly_data)
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


# Legacy alias kept for backward compat
def calculate_fitness_status(activities: List[Dict]) -> Dict:
    return _fitness_status(activities)


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
        "fitness_status": _fitness_status(activities),
        "weekly_volume": _weekly_longest(activities),
        "pace_trend_pct": _pace_trend(hiking_acts),
    }
