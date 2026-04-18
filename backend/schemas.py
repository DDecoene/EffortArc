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
