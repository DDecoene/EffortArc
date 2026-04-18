import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base
from models import Activity, Goal, SyncState
from datetime import datetime

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_create_activity(db):
    activity = Activity(
        strava_id="123456",
        name="Morning Hike",
        date=datetime(2026, 4, 1, 8, 0),
        type="Hike",
        raw_distance_m=10000.0,
    )
    db.add(activity)
    db.commit()
    result = db.query(Activity).filter_by(strava_id="123456").first()
    assert result.name == "Morning Hike"
    assert result.type == "Hike"

def test_create_goal(db):
    goal = Goal(name="Dodentocht", date=datetime(2026, 8, 10), distance_km=100.0)
    db.add(goal)
    db.commit()
    result = db.query(Goal).first()
    assert result.distance_km == 100.0
