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
