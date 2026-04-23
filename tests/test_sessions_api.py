# tests/test_sessions_api.py
from tests.conftest import fetchone


def test_start_session_success(client_and_db):
    client, db_path = client_and_db

    r = client.post("/api/session/start", json={"participant_id": " P001 "})
    assert r.status_code == 200
    data = r.json()

    assert isinstance(data["session_id"], int)
    assert isinstance(data["started_at_ms"], int)

    row = fetchone(db_path, "SELECT * FROM sessions WHERE id=?", (data["session_id"],))
    assert row is not None
    assert row["participant_id"] == "P001"
    assert row["started_at_ms"] == data["started_at_ms"]
    assert row["ended_at_ms"] is None


def test_start_session_blank_pid_400(client_and_db):
    client, _ = client_and_db

    r = client.post("/api/session/start", json={"participant_id": "   "})
    assert r.status_code == 400
    assert r.json()["detail"] == "participant_id is required"


def test_finish_session_404_if_missing(client_and_db):
    client, _ = client_and_db

    r = client.post("/api/session/99999/finish")
    assert r.status_code == 404
    assert r.json()["detail"] == "session not found"


def test_finish_session_sets_ended_at(client_and_db):
    client, db_path = client_and_db

    start = client.post("/api/session/start", json={"participant_id": "P001"}).json()
    sid = start["session_id"]

    r = client.post(f"/api/session/{sid}/finish")
    assert r.status_code == 200
    ended = r.json()["ended_at_ms"]
    assert isinstance(ended, int)
    assert ended >= start["started_at_ms"]

    row = fetchone(db_path, "SELECT ended_at_ms FROM sessions WHERE id=?", (sid,))
    assert row["ended_at_ms"] == ended
