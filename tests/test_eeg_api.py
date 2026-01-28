# tests/test_eeg_api.py
from tests.conftest import fetchall


def test_eeg_batch_returns_0_when_empty(client_and_db):
    client, _ = client_and_db
    sid = client.post("/api/session/start", json={"participant_id": "P001"}).json()["session_id"]

    r = client.post(f"/api/session/{sid}/eeg/batch", json={"participant_id": "P001", "rows": []})
    assert r.status_code == 200
    assert r.json()["inserted"] == 0


def test_eeg_batch_404_if_session_missing(client_and_db):
    client, _ = client_and_db
    r = client.post("/api/session/99999/eeg/batch", json={"participant_id": "P001", "rows": [{"t_app": 1}]})
    assert r.status_code == 404
    assert r.json()["detail"] == "session not found"


def test_eeg_batch_accepts_int_sentence_id(client_and_db):
    client, db_path = client_and_db
    sid = client.post("/api/session/start", json={"participant_id": "P001"}).json()["session_id"]

    rows = [
        {"t_app": 111, "t_device": None, "paragraph_id": 11, "sentence_id": 1,
         "PO3": 0.1, "PO4": 0.2, "C3": 0.3, "C4": 0.4, "CP3": 0.5, "CP4": 0.6, "F5": 0.7, "F6": 0.8},
        {"t_app": 222, "t_device": 999, "paragraph_id": 11, "sentence_id": 1,
         "PO3": 1.1, "PO4": 1.2, "C3": 1.3, "C4": 1.4, "CP3": 1.5, "CP4": 1.6, "F5": 1.7, "F6": 1.8},
    ]

    r = client.post(f"/api/session/{sid}/eeg/batch", json={"participant_id": "P001", "rows": rows})
    assert r.status_code == 200
    assert r.json()["inserted"] == 2

    db_rows = fetchall(db_path, "SELECT * FROM eeg_rows WHERE session_id=? ORDER BY id", (sid,))
    assert len(db_rows) == 2
    assert db_rows[0]["sentence_id"] == 1
    assert db_rows[1]["t_device"] == 999
