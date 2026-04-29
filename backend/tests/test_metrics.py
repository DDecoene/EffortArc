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
    acts = [_make_ride(NOW - timedelta(days=i), 15, commute=True) for i in range(14)]
    result = build_insights(acts)
    cycling = result["cycling"]
    assert cycling["goal_readiness_data"]["longest_training_km"] == 0
