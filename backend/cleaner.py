import math
from typing import List, Dict
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
    # First pass: mark each inter-point segment as slow or not
    is_slow = [False] * len(points)
    for i in range(1, len(points)):
        prev = points[i - 1]
        curr = points[i]
        dist_m = haversine_m(prev["lat"], prev["lon"], curr["lat"], curr["lon"])
        dt_s = curr["time"] - prev["time"]
        if dt_s > 0 and (dist_m / dt_s) * 3.6 <= max_stop_speed_kmh:
            is_slow[i] = True

    # Second pass: find runs of slow points whose cumulative duration >= threshold
    result = []
    i = 0
    while i < len(points):
        if is_slow[i]:
            # Find the end of this slow run
            run_start = i - 1  # the previous point is where slow movement began
            j = i
            while j < len(points) and is_slow[j]:
                j += 1
            run_end = j - 1
            run_duration = points[run_end]["time"] - points[max(0, run_start)]["time"]
            mark_stop = run_duration >= min_stop_duration_s
            for k in range(i, j):
                result.append({**points[k], "is_stop": mark_stop})
            i = j
        else:
            result.append({**points[i], "is_stop": False})
            i += 1
    return result


def smooth_elevation(elevations: List[float], window: int = 5) -> List[float]:
    arr = np.array(elevations, dtype=float)
    smoothed = np.convolve(arr, np.ones(window) / window, mode="same")
    half = window // 2
    smoothed[:half] = arr[:half]
    smoothed[-half:] = arr[-half:]
    return smoothed.tolist()


def calculate_grade_adjusted_pace(pace_min_per_km: float, grade_percent: float) -> float:
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
            seg_start = segment_points[0]
            seg_end = segment_points[-1]
            dt_s = seg_end["time"] - points[i - len(segment_points)]["time"]
            pace = (dt_s / 60.0) if dt_s > 0 else 0.0
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

    return {"label": label, "first_pace": first_avg, "last_pace": last_avg, "drop_pct": drop_pct}


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
    moving_time_s = (moving_points[-1]["time"] - moving_points[0]["time"]) if len(moving_points) >= 2 else 0

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
