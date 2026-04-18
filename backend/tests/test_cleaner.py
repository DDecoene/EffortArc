import pytest
from cleaner import remove_outliers, detect_stops, smooth_elevation, calculate_grade_adjusted_pace

def make_point(lat, lon, ele, time_s):
    return {"lat": lat, "lon": lon, "ele": ele, "time": time_s}

def test_remove_outliers_removes_speed_spikes():
    points = [
        make_point(51.0, 4.0, 10.0, 0),
        make_point(51.0009, 4.0, 10.0, 90),
        make_point(51.1, 4.0, 10.0, 91),
        make_point(51.0018, 4.0, 10.0, 180),
    ]
    cleaned = remove_outliers(points, max_speed_kmh=15.0)
    assert len(cleaned) == 3
    assert cleaned[1]["lat"] == pytest.approx(51.0009)

def test_detect_stops_marks_slow_segments():
    points = [make_point(51.0, 4.0, 10.0, i * 10) for i in range(10)]
    stops = detect_stops(points, min_stop_duration_s=60, max_stop_speed_kmh=0.5)
    assert any(s["is_stop"] for s in stops)

def test_smooth_elevation_reduces_noise():
    eles = [10.0, 50.0, 11.0, 12.0, 13.0, 60.0, 14.0]
    smoothed = smooth_elevation(eles, window=3)
    assert abs(smoothed[3] - 12.0) < 5.0

def test_grade_adjusted_pace_uphill_slower():
    pace_flat = calculate_grade_adjusted_pace(pace_min_per_km=15.0, grade_percent=0.0)
    pace_uphill = calculate_grade_adjusted_pace(pace_min_per_km=15.0, grade_percent=10.0)
    assert pace_uphill < pace_flat
