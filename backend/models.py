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
    type = Column(String, nullable=False)
    raw_distance_m = Column(Float)
    raw_duration_s = Column(Integer)
    raw_gpx = Column(Text)
    cleaned_gpx = Column(Text)
    cleaned_distance_m = Column(Float)
    moving_time_s = Column(Integer)
    elevation_gain_m = Column(Float)
    avg_moving_pace = Column(Float)
    processed_at = Column(DateTime)
    segments = relationship("ActivitySegment", back_populates="activity", cascade="all, delete-orphan")

class ActivitySegment(Base):
    __tablename__ = "activity_segments"

    id = Column(Integer, primary_key=True)
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=False)
    km_index = Column(Integer, nullable=False)
    pace = Column(Float)
    elevation_change_m = Column(Float)
    grade_adjusted_pace = Column(Float)
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
