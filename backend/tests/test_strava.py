import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime


@pytest.mark.asyncio
async def test_refresh_token_updates_sync_state():
    from strava import refresh_token_if_needed
    mock_db = MagicMock()
    mock_state = MagicMock()
    mock_state.token_expires_at = datetime(2020, 1, 1)  # expired
    mock_state.strava_refresh_token = "old_refresh"

    with patch("strava.httpx.AsyncClient") as mock_client:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "access_token": "new_access",
            "refresh_token": "new_refresh",
            "expires_at": 9999999999,
        }
        mock_resp.raise_for_status = MagicMock()
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_resp)

        await refresh_token_if_needed(mock_state, mock_db)
        assert mock_state.strava_access_token == "new_access"


@pytest.mark.asyncio
async def test_fetch_activities_filters_hike_walk():
    from strava import fetch_new_activities
    mock_db = MagicMock()
    mock_state = MagicMock()
    mock_state.token_expires_at = datetime(2099, 1, 1)
    mock_state.strava_access_token = "valid_token"
    mock_state.last_synced_at = None

    activities = [
        {"id": 1, "type": "Hike", "name": "Morning hike", "distance": 10000,
         "elapsed_time": 7200, "moving_time": 6800, "start_date": "2026-04-01T08:00:00Z"},
        {"id": 2, "type": "Run", "name": "Morning run", "distance": 5000,
         "elapsed_time": 1800, "moving_time": 1800, "start_date": "2026-04-02T08:00:00Z"},
        {"id": 3, "type": "Walk", "name": "Evening walk", "distance": 6000,
         "elapsed_time": 4800, "moving_time": 4600, "start_date": "2026-04-03T08:00:00Z"},
    ]

    with patch("strava.httpx.AsyncClient") as mock_client:
        mock_resp = MagicMock()
        mock_resp.json.return_value = activities
        mock_resp.raise_for_status = MagicMock()
        mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_resp)

        result = await fetch_new_activities(mock_state, mock_db)
        assert len(result) == 2
        assert all(a["type"] in ("Hike", "Walk") for a in result)
