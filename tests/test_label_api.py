# tests/test_label_api.py
from tests.conftest import fetchone, fetchall


def test_label_404_if_session_missing(client_and_db):
    client, _ = client_and_db

    r = client.post("/api/session/12345/label", json={
        "participant_id": "P001",
        "key_label": "neutral",
        "sentence_id": 1
    })
    assert r.status_code == 404
    assert r.json()["detail"] == "session not found"


def test_label_inserts_row(client_and_db):
    client, db_path = client_and_db

    sid = client.post("/api/session/start", json={"participant_id": "P001"}).json()["session_id"]

    payload = {
        "participant_id": "P001",
        "paragraph_id": 11,
        "paragraph_type": "neutral",
        "sentence_id": 1,
        "t_sentence_start": 1000,
        "t_sentence_end": 2000,
        "key_label": "confusion",
        "t_key_press": 2000,
    }

    r = client.post(f"/api/session/{sid}/label", json=payload)
    assert r.status_code == 200
    assert r.json()["ok"] is True

    rows = fetchall(db_path, "SELECT * FROM label_events WHERE session_id=?", (sid,))
    assert len(rows) == 1
    row = rows[0]
    assert row["participant_id"] == "P001"
    assert row["paragraph_id"] == 11
    assert row["paragraph_type"] == "neutral"
    assert row["sentence_id"] == 1
    assert row["key_label"] == "confusion"
