# tests/test_db_schema.py
import sqlite3


def test_schema_tables_exist(client_and_db):
    _, db_path = client_and_db
    conn = sqlite3.connect(db_path)
    try:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert "sessions" in tables
        assert "label_events" in tables
        assert "eeg_rows" in tables
    finally:
        conn.close()


def test_schema_has_channel_columns(client_and_db):
    _, db_path = client_and_db
    conn = sqlite3.connect(db_path)
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(eeg_rows)").fetchall()]
        for ch in ["PO3", "PO4", "C3", "C4", "CP3", "CP4", "F5", "F6"]:
            assert ch in cols
    finally:
        conn.close()
