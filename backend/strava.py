import os
import httpx
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from models import SyncState, Activity

STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"

HIKING_TYPES = {"Hike", "Walk"}
CYCLING_TYPES = {"Ride", "VirtualRide", "EBikeRide"}
SUPPORTED_TYPES = HIKING_TYPES | CYCLING_TYPES


def sport_category(activity_type: str) -> str:
    if activity_type in HIKING_TYPES:
        return "hiking"
    if activity_type in CYCLING_TYPES:
        return "cycling"
    return "other"


def get_or_create_sync_state(db: Session) -> SyncState:
    state = db.query(SyncState).first()
    if not state:
        state = SyncState(id=1)
        db.add(state)
        db.commit()
    return state


def get_auth_url(redirect_uri: str) -> str:
    return (
        f"{STRAVA_AUTH_URL}?client_id={STRAVA_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=activity:read_all"
    )


async def exchange_code_for_tokens(code: str, db: Session) -> SyncState:
    async with httpx.AsyncClient() as client:
        resp = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        })
        resp.raise_for_status()
        data = resp.json()

    state = get_or_create_sync_state(db)
    state.strava_access_token = data["access_token"]
    state.strava_refresh_token = data["refresh_token"]
    state.token_expires_at = datetime.fromtimestamp(data["expires_at"], tz=timezone.utc).replace(tzinfo=None)
    db.commit()
    return state


async def refresh_token_if_needed(state: SyncState, db: Session) -> None:
    now = datetime.utcnow()
    if state.token_expires_at and state.token_expires_at > now:
        return
    async with httpx.AsyncClient() as client:
        resp = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "refresh_token": state.strava_refresh_token,
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        data = resp.json()
    state.strava_access_token = data["access_token"]
    state.strava_refresh_token = data["refresh_token"]
    state.token_expires_at = datetime.fromtimestamp(data["expires_at"], tz=timezone.utc).replace(tzinfo=None)
    db.commit()


async def fetch_new_activities(state: SyncState, db: Session) -> list:
    await refresh_token_if_needed(state, db)
    params = {"per_page": 100}
    if state.last_synced_at:
        params["after"] = int(state.last_synced_at.timestamp())

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STRAVA_API_BASE}/athlete/activities",
            headers={"Authorization": f"Bearer {state.strava_access_token}"},
            params=params,
        )
        resp.raise_for_status()
        activities = resp.json()

    return [a for a in activities if a.get("type") in SUPPORTED_TYPES]


async def fetch_all_activities_since(state: SyncState, db: Session, since: datetime) -> list:
    await refresh_token_if_needed(state, db)
    all_activities = []
    page = 1
    after_ts = int(since.timestamp())

    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                f"{STRAVA_API_BASE}/athlete/activities",
                headers={"Authorization": f"Bearer {state.strava_access_token}"},
                params={"per_page": 100, "page": page, "after": after_ts},
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            all_activities.extend(batch)
            page += 1

    return [a for a in all_activities if a.get("type") in SUPPORTED_TYPES]


async def fetch_activity_streams(activity_id: int, token: str) -> list:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STRAVA_API_BASE}/activities/{activity_id}/streams",
            headers={"Authorization": f"Bearer {token}"},
            params={"keys": "latlng,altitude,time", "key_by_type": "true"},
        )
        resp.raise_for_status()
        data = resp.json()

    latlng = data.get("latlng", {}).get("data", [])
    altitude = data.get("altitude", {}).get("data", [])
    time = data.get("time", {}).get("data", [])

    return [
        {
            "lat": ll[0],
            "lon": ll[1],
            "ele": altitude[i] if i < len(altitude) else 0.0,
            "time": t,
        }
        for i, (ll, t) in enumerate(zip(latlng, time))
    ]
