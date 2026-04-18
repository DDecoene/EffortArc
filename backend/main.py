import json
import os
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db, init_db
from models import Activity, ActivitySegment, Goal, SyncState
from schemas import ActivityOut, ActivitySummary, GoalIn, GoalOut, SyncStatus
from strava import (
    get_auth_url,
    exchange_code_for_tokens,
    fetch_new_activities,
    fetch_activity_streams,
    get_or_create_sync_state,
)
from cleaner import clean_activity
from metrics import build_insights, calculate_goal_readiness

app = FastAPI(title="HikeTracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/auth/strava")
def auth_strava(db: Session = Depends(get_db)):
    redirect_uri = f"{os.getenv('BACKEND_URL', 'http://localhost:8000')}/auth/callback"
    return {"url": get_auth_url(redirect_uri)}


@app.get("/auth/callback")
async def auth_callback(code: str, db: Session = Depends(get_db)):
    await exchange_code_for_tokens(code, db)
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"{frontend_url}/dashboard")


@app.get("/auth/status", response_model=SyncStatus)
def auth_status(db: Session = Depends(get_db)):
    state = db.query(SyncState).first()
    return SyncStatus(
        last_synced_at=state.last_synced_at if state else None,
        is_connected=bool(state and state.strava_access_token),
    )


@app.post("/sync")
async def sync_activities(db: Session = Depends(get_db)):
    state = get_or_create_sync_state(db)
    if not state.strava_access_token:
        raise HTTPException(status_code=401, detail="Not connected to Strava")

    new_activities = await fetch_new_activities(state, db)
    synced = 0

    for act_data in new_activities:
        existing = db.query(Activity).filter_by(strava_id=str(act_data["id"])).first()
        if existing:
            continue

        raw_points = await fetch_activity_streams(act_data["id"], state.strava_access_token)
        cleaned = clean_activity(raw_points)

        activity = Activity(
            strava_id=str(act_data["id"]),
            name=act_data["name"],
            date=datetime.fromisoformat(act_data["start_date"].replace("Z", "+00:00")).replace(tzinfo=None),
            type=act_data["type"],
            raw_distance_m=act_data.get("distance"),
            raw_duration_s=act_data.get("elapsed_time"),
            raw_gpx=json.dumps(raw_points),
            cleaned_gpx=json.dumps(cleaned["cleaned_points"]),
            cleaned_distance_m=cleaned["cleaned_distance_m"],
            moving_time_s=cleaned["moving_time_s"],
            elevation_gain_m=cleaned["elevation_gain_m"],
            avg_moving_pace=cleaned["avg_moving_pace"],
            processed_at=datetime.utcnow(),
        )
        db.add(activity)
        db.flush()

        for seg in cleaned["segments"]:
            db.add(ActivitySegment(
                activity_id=activity.id,
                km_index=seg["km_index"],
                pace=seg["pace"],
                elevation_change_m=seg["elevation_change_m"],
                grade_adjusted_pace=seg["grade_adjusted_pace"],
                is_stop=seg["is_stop"],
            ))
        synced += 1

    state.last_synced_at = datetime.utcnow()
    db.commit()
    return {"synced": synced, "total_new": len(new_activities)}


@app.get("/activities", response_model=list[ActivitySummary])
def list_activities(db: Session = Depends(get_db)):
    return db.query(Activity).order_by(Activity.date.desc()).all()


@app.get("/activities/{activity_id}", response_model=ActivityOut)
def get_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = db.query(Activity).filter_by(id=activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


@app.get("/insights")
def get_insights(db: Session = Depends(get_db)):
    activities = db.query(Activity).order_by(Activity.date.asc()).all()
    data = [
        {
            "date": a.date,
            "cleaned_distance_m": a.cleaned_distance_m or 0,
            "avg_moving_pace": a.avg_moving_pace or 0,
        }
        for a in activities
    ]
    return build_insights(data)


@app.get("/goals", response_model=list[GoalOut])
def list_goals(db: Session = Depends(get_db)):
    goals = db.query(Goal).order_by(Goal.date.asc()).all()
    activities = db.query(Activity).order_by(Activity.date.asc()).all()
    act_data = [
        {"date": a.date, "cleaned_distance_m": a.cleaned_distance_m or 0, "avg_moving_pace": a.avg_moving_pace or 0}
        for a in activities
    ]
    result = []
    for goal in goals:
        readiness = calculate_goal_readiness(act_data, goal.distance_km, goal.date)
        out = GoalOut(
            id=goal.id, name=goal.name, date=goal.date,
            distance_km=goal.distance_km, elevation_gain_m=goal.elevation_gain_m,
            notes=goal.notes, created_at=goal.created_at, readiness=readiness,
        )
        result.append(out)
    return result


@app.post("/goals", response_model=GoalOut)
def create_goal(goal_in: GoalIn, db: Session = Depends(get_db)):
    goal = Goal(**goal_in.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return GoalOut(**goal.__dict__, readiness=None)
