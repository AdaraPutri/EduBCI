# tests/conftest.py
import sqlite3
import pytest
from fastapi.testclient import TestClient

import backend.app as app_module


@pytest.fixture
def client_and_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test_edubci.sqlite"
    monkeypatch.setattr(app_module, "DB_PATH", str(db_path))

    # Startup event will run init_db() and create tables in this temp DB
    with TestClient(app_module.app) as client:
        yield client, str(db_path)


def fetchone(db_path: str, sql: str, params=()):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(sql, params)
        return cur.fetchone()
    finally:
        conn.close()


def fetchall(db_path: str, sql: str, params=()):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()
